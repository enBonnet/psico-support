// =============================================================================
// scripts/pull-prod-sanitized.mjs — pull prod D1 into local dev, PII-scrubbed
// =============================================================================
// Rebuilds the local dev.db in one command with REALISTIC data (real pros
// across all verifiedStatus/modality states, real audio categories) — no PII,
// no daily hand-rebuild. Use after deleting dev.db or any local wipe.
//
//   pnpm run db:pull-prod                    # default password: password123
//   pnpm run db:pull-prod -- --password foo
//   pnpm run db:pull-prod -- --dry-run       # export + full report against a
//                                            # THROWAWAY db; dev.db untouched
//
// What it does (4 phases):
//   1. Export prod D1 via `wrangler d1 export --remote` to a gitignored file
//      (prod tooling — wrangler is still the deploy/prod CLI).
//   2. Reset the local dev.db (DROP all tables) and load the prod dump.
//      (wrangler's export has no BEGIN/COMMIT and no DELETE, so it is NOT
//      idempotent — we wipe first to avoid UNIQUE violations on re-run.)
//   3. Sanitize PII via targeted UPDATEs (load-then-update, not regex on SQL —
//      type-safe and column-aware). See SANITIZATION table below.
//   4. Verify + report row counts and preserved admin logins.
//
// Sanitization:
//   user.email              → preserve 4 admin emails; rest → <local>@example.com
//   account.password        → single known scrypt hash (Better Auth format)
//   account.{access,refresh,id}_token → NULL
//   session                 → DELETE all (stale + token/ip/user-agent PII)
//   verification            → DELETE all (reset tokens)
//   professionals.whatsapp  → +CC 555NNNNNNN (keep country code, fake subscriber)
//   professionals.certificate_key → NULL
//   professional_documents.doc_key, audio_stories.audio_key → 'local-stub'
//     (NOT NULL columns; media routes 404 on the stub — correct for missing R2)
//   follow_ups.{phone,phone_country,name,notes} → '' / NULL (clinical PII)
//   appointments.{meeting_url,meeting_room,client_tz} → '' (NOT NULL)
//
// NOT pulled: R2 binaries (avatars/audio/certs/docs). Local avatars show the
// initials fallback; audio players are inert. D1 data only.
//
// Safety:
//   - Raw prod SQL (.tmp/prod-raw.sql) is deleted in a finally block — never
//     persists on disk, .tmp/ is gitignored.
//   - Fail-loud: every sanitize UPDATE's changes count is checked; aborts if a
//     table that should have rows got 0 changes (catches a broken pull early).
//   - --dry-run is truly non-destructive: the whole load+sanitize pipeline
//     runs against a throwaway database under .tmp/ (deleted afterwards), so
//     dev.db is never touched. The report reflects exactly what a real run
//     would do.
//
// Requires: wrangler OAuth (already authenticated for --remote) + better-sqlite3
// (devDependency, same as seed-local.ts / reset-local-passwords.ts).
// =============================================================================

import { execFileSync } from "node:child_process";
import { randomBytes, scryptSync } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  rmSync,
  statSync,
  readFileSync,
} from "node:fs";
import { join } from "node:path";
import Database from "better-sqlite3";

// --- config ---
const DB_NAME = "psico-support-db";
const DB_PATH = "dev.db";
const TMP_DIR = ".tmp";
const RAW_SQL = join(TMP_DIR, "prod-raw.sql");

// Admin emails preserved verbatim so /admin is testable. Source: prod
// `SELECT email FROM user WHERE role='admin'`. Update here if the admin set
// changes — these are the only real addresses that survive sanitization.
const ADMIN_EMAILS = new Set([
  "ender@enbonnet.com",
  "mariangelamanga17@gmail.com",
  "isiairs@gmail.com",
  "devimeo@gmail.com",
]);

// --- arg parsing ---
const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const pwFlag = args.indexOf("--password");
const PASSWORD = pwFlag >= 0 && args[pwFlag + 1] ? args[pwFlag + 1] : "password123";

// Set once the (unsanitized!) prod dump has been loaded into the real dev.db.
// If the run dies after this point — sanitize guard, Ctrl-C between phases,
// anything — dev.db holds RAW PROD PII, and the catch block must say so.
let loadedProdIntoDevDb = false;

// ANSI helpers
const c = {
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  cyan: (s) => `\x1b[36m${s}\x1b[0m`,
};

// --- helpers ---
function findLocalDb() {
  return existsSync(DB_PATH) ? DB_PATH : null;
}

function run(cmd, cmdArgs, opts = {}) {
  return execFileSync(cmd, cmdArgs, { stdio: opts.silent ? "pipe" : "inherit", ...opts });
}

// Better Auth's exact scrypt params (mirrors scripts/reset-local-passwords.ts).
// Format `salt:hexkey` is what verifyPassword() reads. One shared salt is fine
// for local dev (these hashes never leave this machine).
function generateHash(password) {
  const salt = randomBytes(16).toString("hex");
  const key = scryptSync(password.normalize("NFKC"), salt, 64, {
    N: 16384,
    r: 16,
    p: 1,
    maxmem: 128 * 16384 * 16 * 2,
  });
  return `${salt}:${key.toString("hex")}`;
}

// Preserve the country-code prefix of a whatsapp like "+58 4144929741",
// replace the subscriber digits with a deterministic 555-prefixed fake of the
// same length. Keeps the +CC NNNN shape so display + Tel links render sanely.
function fakeWhatsapp(original) {
  if (!original || typeof original !== "string") return original;
  const m = original.match(/^(\+\d{1,3})\s*(\d+)$/);
  if (!m) return original; // unexpected shape — leave as-is, flag in report
  const [, cc, subscriber] = m;
  const fakeBody = "555" + "0".repeat(Math.max(0, subscriber.length - 3));
  return `${cc} ${fakeBody.slice(0, subscriber.length)}`;
}

// =============================================================================
// main
// =============================================================================
async function main() {
  console.log(c.bold("\n  🔄 Sanitized prod pull → local dev\n"));
  console.log(`  Mode:     ${DRY_RUN ? c.yellow("DRY RUN (no writes)") : "write"}`);
  console.log(`  Password: ${c.dim("[redacted — pass via --password]")}`);
  console.log(`  Source:   ${c.cyan("prod (D1 remote)")}\n`);

  // ---- Phase 1: export prod ----
  console.log(c.bold("  Phase 1/4 — exporting prod D1…"));
  mkdirSync(TMP_DIR, { recursive: true });
  try {
    run("pnpm", [
      "exec",
      "wrangler",
      "d1",
      "export",
      DB_NAME,
      "--remote",
      "--output",
      RAW_SQL,
      "-y",
    ]);
  } catch (err) {
    throw new Error(
      "Export failed. Check wrangler auth (`pnpm exec wrangler whoami`).\n" + String(err?.message ?? err),
    );
  }
  if (!existsSync(RAW_SQL) || statSync(RAW_SQL).size === 0) {
    throw new Error("Export produced an empty file. Aborting.");
  }
  console.log(c.green("  ✓ exported") + c.dim(` (${(statSync(RAW_SQL).size / 1024).toFixed(1)} KB)\n`));

  // ---- Phase 2: reset + load the target DB ----
  // DRY RUN: every write below lands in a throwaway database under .tmp/
  // (deleted in the finally block) — dev.db is never opened for writing.
  const targetDb = DRY_RUN ? join(TMP_DIR, "dry-run.db") : DB_PATH;
  console.log(
    c.bold(`  Phase 2/4 — loading into ${DRY_RUN ? c.yellow("throwaway dry-run DB") : "local dev.db"}…`),
  );

  if (DRY_RUN) {
    // Fresh throwaway every run. db-apply-local.mjs honors DATABASE_URL, so
    // point the migrator at the throwaway to give it the same schema dev.db
    // would have had.
    rmSync(targetDb, { force: true });
    rmSync(`${targetDb}-wal`, { force: true });
    rmSync(`${targetDb}-shm`, { force: true });
    run("pnpm", ["run", "db:apply:local"], {
      env: { ...process.env, DATABASE_URL: `file:${targetDb}` },
    });
  } else {
    let dbPath = findLocalDb();

    // If dev.db is missing or has no schema, apply migrations so the schema
    // exists before we load prod data into it. Plain-Node migrator (same as
    // the `pnpm dev` preflight) — no wrangler/miniflare in local dev.
    if (!dbPath) {
      console.log(c.dim("  local DB missing — applying migrations first…"));
      run("pnpm", ["run", "db:apply:local"]);
      dbPath = findLocalDb();
    }
    if (!dbPath) throw new Error("Could not locate dev.db even after migrations.");
  }

  const db = new Database(targetDb);
  try {
    db.pragma("journal_mode = WAL");
    // Wipe all existing tables so the prod dump loads clean (export is NOT
    // idempotent — no DELETE/BEGIN, so a second load would hit UNIQUE errors).
    const tables = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%'",
      )
      .all()
      .map((r) => r.name);
    db.exec("PRAGMA foreign_keys = OFF");
    const wipe = db.transaction(() => {
      for (const t of tables) db.exec(`DROP TABLE IF EXISTS "${t}"`);
    });
    wipe();

    // Load the prod SQL. It's CREATE TABLE IF NOT EXISTS + INSERT + a
    // sqlite_sequence reset; runs in one transaction for speed + atomicity.
    const sql = readFileSync(RAW_SQL, "utf8");
    db.exec("PRAGMA defer_foreign_keys = TRUE");
    const load = db.transaction(() => db.exec(sql));
    load();
    db.exec("PRAGMA foreign_keys = ON");
    if (!DRY_RUN) loadedProdIntoDevDb = true;

    // The wipe above dropped the LOCAL migration-tracking table. Prod tracks
    // its applied migrations in `d1_migrations` (same filenames as drizzle/ —
    // wrangler.jsonc points migrations_dir there), so the dump re-creates it
    // with the authoritative list. Track ONLY those: a drizzle/*.sql prod
    // hasn't deployed yet (e.g. 0023 landing before the next CI apply) has no
    // tables in the dump and must stay PENDING — otherwise db-check.mjs
    // reports a healthy schema while runtime queries hit missing tables.
    // Remaining files are applied by the `pnpm dev` preflight (db:apply:local)
    // on next boot.
    const drizzleFiles = readdirSync("drizzle").filter((f) => f.endsWith(".sql")).sort();
    let deployedNames = null;
    try {
      deployedNames = new Set(
        db.prepare("SELECT name FROM d1_migrations").all().map((r) => r.name),
      );
    } catch {
      // No d1_migrations in the dump (very old prod?) — can't verify what's
      // deployed; fall back to tracking everything and say so loudly.
      console.log(
        c.yellow("  ⚠  no d1_migrations in the prod dump — tracking ALL drizzle files as applied (could not verify schema freshness)"),
      );
    }
    db.exec("DROP TABLE IF EXISTS d1_migrations");
    db.exec(`
      CREATE TABLE IF NOT EXISTS local_migrations (
        name TEXT PRIMARY KEY,
        applied_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
    const insertMigration = db.prepare(
      "INSERT OR IGNORE INTO local_migrations (name) VALUES (?)",
    );
    const toTrack =
      deployedNames === null
        ? drizzleFiles
        : drizzleFiles.filter((f) => deployedNames.has(f));
    const notDeployed = drizzleFiles.filter((f) => !toTrack.includes(f));
    const track = db.transaction(() => {
      for (const f of toTrack) insertMigration.run(f);
    });
    track();
    if (notDeployed.length > 0) {
      console.log(
        c.yellow(
          `  ⚠  ${notDeployed.length} migration(s) not yet deployed to prod — left PENDING (the pnpm dev preflight will apply them): ${notDeployed.join(", ")}`,
        ),
      );
    }

    const userCount = db.prepare("SELECT count(*) AS n FROM user").get()?.n ?? 0;
    if (userCount === 0) {
      throw new Error("Load produced 0 users — prod export was empty or malformed.");
    }
    console.log(c.green("  ✓ loaded") + c.dim(` (${userCount} users)\n`));

    // ---- Phase 3: sanitize ----
    console.log(c.bold("  Phase 3/4 — sanitizing PII…"));
    const report = sanitize(db, { dryRun: DRY_RUN });
    for (const line of report.lines) console.log(line);
    console.log("");

    // ---- Phase 4: verify + report ----
    console.log(c.bold("  Phase 4/4 — verifying…"));
    printSummary(db);
  } finally {
    db.close();
  }

  if (DRY_RUN) {
    console.log(
      c.yellow("\n  (dry run — nothing was written to dev.db; the load+sanitize report above came from a throwaway db, discarded below.)"),
    );
  }
  // NOTE: do NOT call process.exit() here — it would skip the .finally() that
  // deletes the raw prod SQL. Let the promise chain resolve naturally so the
  // no-PII-to-disk cleanup always runs.
}

// Returns { lines: string[] } of human-readable per-step results. Throws on a
// failed guard (a table that should have rows got 0 changes).
function sanitize(db, { dryRun }) {
  const lines = [];
  const hash = generateHash(PASSWORD);
  const now = Date.now();
  const expect = (changes, label, min = 1) => {
    if (changes < min) {
      throw new Error(
        `Sanitize guard failed: "${label}" affected ${changes} row(s) (expected ≥${min}). ` +
          "The prod pull may be incomplete — aborting before shipping a half-sanitized DB.",
      );
    }
    lines.push(`  ${c.green("✓")} ${label}: ${changes} row(s)`);
  };

  // user.email — preserve admins, anonymize the rest
  const allUsers = db.prepare("SELECT id, email FROM user").all();
  const updateEmail = db.prepare("UPDATE user SET email = ? WHERE id = ?");
  let emailChanged = 0;
  const tx = db.transaction(() => {
    for (const u of allUsers) {
      if (ADMIN_EMAILS.has(u.email)) continue;
      const localPart = (u.email ?? "").split("@")[0] || "user";
      updateEmail.run(`${localPart}@example.com`, u.id);
      emailChanged++;
    }
  });
  tx();
  // Guard against 0 only when there are non-admin users to anonymize.
  const nonAdminCount = allUsers.filter((u) => !ADMIN_EMAILS.has(u.email)).length;
  if (nonAdminCount > 0) expect(emailChanged, "user.email anonymized");
  else lines.push(`  ${c.dim("• user.email: no non-admin users to anonymize")}`);

  // account.password + tokens
  const pwRes = db
    .prepare("UPDATE account SET password = ?, access_token = NULL, refresh_token = NULL, id_token = NULL, updated_at = ?")
    .run(hash, now);
  expect(pwRes.changes, "account.password + tokens scrubbed");

  // session + verification — delete all
  const sessRes = db.prepare("DELETE FROM session").run();
  lines.push(`  ${c.green("✓")} session: deleted ${sessRes.changes} row(s)`);
  const verRes = db.prepare("DELETE FROM verification").run();
  lines.push(`  ${c.green("✓")} verification: deleted ${verRes.changes} row(s)`);

  // professionals.whatsapp — deterministic fake per row
  const pros = db.prepare("SELECT id, whatsapp FROM professionals WHERE whatsapp IS NOT NULL AND whatsapp != ''").all();
  const updWa = db.prepare("UPDATE professionals SET whatsapp = ? WHERE id = ?");
  let waChanged = 0;
  const waTx = db.transaction(() => {
    for (const p of pros) {
      const fake = fakeWhatsapp(p.whatsapp);
      if (fake !== p.whatsapp) {
        updWa.run(fake, p.id);
        waChanged++;
      }
    }
  });
  waTx();
  if (pros.length > 0) expect(waChanged, "professionals.whatsapp faked");
  else lines.push(`  ${c.dim("• professionals.whatsapp: none to fake")}`);

  // R2 keys → sentinel (NOT NULL on some columns, so can't NULL). The media
  // routes 404 on unknown keys, which is the correct behavior for missing
  // binaries — avatars show the initials fallback, audio players are inert.
  const certRes = db.prepare("UPDATE professionals SET certificate_key = NULL WHERE certificate_key IS NOT NULL").run();
  lines.push(`  ${c.green("✓")} professionals.certificate_key nulled: ${certRes.changes}`);
  // doc_key + audio_key are NOT NULL — use a sentinel that obviously isn't a real R2 key.
  const docRes = db.prepare("UPDATE professional_documents SET doc_key = 'local-stub'").run();
  lines.push(`  ${c.green("✓")} professional_documents.doc_key stubbed: ${docRes.changes}`);
  const audRes = db.prepare("UPDATE audio_stories SET audio_key = 'local-stub'").run();
  lines.push(`  ${c.green("✓")} audio_stories.audio_key stubbed: ${audRes.changes}`);

  // follow_ups clinical PII — phone is NOT NULL, use ''; the rest can NULL.
  const fuRes = db
    .prepare("UPDATE follow_ups SET phone = '', phone_country = NULL, name = NULL, notes = NULL")
    .run();
  lines.push(`  ${c.green("✓")} follow_ups clinical PII scrubbed: ${fuRes.changes}`);

  // appointments meeting metadata — all NOT NULL, use ''. (0 rows in prod as of
  // 2026-07; the UPDATE is a no-op but stays correct if that changes.)
  const apRes = db
    .prepare("UPDATE appointments SET meeting_url = '', meeting_room = '', client_tz = ''")
    .run();
  lines.push(`  ${c.green("✓")} appointments meeting metadata scrubbed: ${apRes.changes}`);

  return { lines };
}

function printSummary(db) {
  const tables = [
    "user",
    "professionals",
    "account",
    "session",
    "verification",
    "audio_stories",
    "follow_ups",
    "appointments",
  ];
  console.log(c.bold("\n  Row counts:"));
  for (const t of tables) {
    const n = db.prepare(`SELECT count(*) AS n FROM ${t}`).get()?.n ?? 0;
    console.log(`    ${t.padEnd(22)} ${n}`);
  }

  // Confirm no real email domains survived except the preserved admins.
  const remaining = db
    .prepare(
      "SELECT DISTINCT substr(email, instr(email, '@')+1) AS d FROM user WHERE email NOT LIKE '%@example.com'",
    )
    .all()
    .map((r) => r.d);
  // The only non-example.com domains should be the ones on ADMIN_EMAILS.
  const expectedAdminDomains = new Set(
    [...ADMIN_EMAILS].map((e) => e.split("@")[1]),
  );
  const unexpected = remaining.filter((d) => !expectedAdminDomains.has(d));
  if (unexpected.length === 0) {
    console.log(
      `\n  ${c.green("✓")} all non-admin emails anonymized; remaining domains: ${remaining.join(", ") || "(none)"} ${c.dim("(the preserved admins)")}`,
    );
  } else {
    console.log(
      `\n  ${c.red("✗")} UNEXPECTED non-anonymized domains: ${unexpected.join(", ")}`,
    );
  }

  // Confirm session/verification are empty.
  const sessN = db.prepare("SELECT count(*) AS n FROM session").get().n;
  const verN = db.prepare("SELECT count(*) AS n FROM verification").get().n;
  if (sessN === 0 && verN === 0) {
    console.log(`  ${c.green("✓")} session + verification emptied`);
  }

  console.log(c.bold("\n  Preserved admin logins") + c.dim(" (password: " + PASSWORD + ")"));
  for (const e of ADMIN_EMAILS) {
    const u = db.prepare("SELECT email, role FROM user WHERE email = ?").get(e);
    if (u) console.log(`    ${c.green("✓")} ${u.email} (${u.role})`);
    else console.log(`    ${c.dim("•")} ${e} (not in this prod pull)`);
  }
}

// =============================================================================
// run + always clean up the raw SQL
// =============================================================================
main()
  .catch((err) => {
    console.error(c.red(`\n  ✗ ${err.message ?? err}`));
    if (loadedProdIntoDevDb) {
      console.error(
        c.red(
          "\n  ⚠  The prod dump was already loaded into dev.db when this failure hit —\n" +
            "     dev.db now contains RAW, UN-SANITIZED PROD DATA (real emails, password\n" +
            "     hashes, whatsapp numbers). Delete it before any other use:\n" +
            "       rm dev.db dev.db-wal dev.db-shm   (then re-run this script or pnpm db:seed)",
        ),
      );
    }
    process.exitCode = 1;
  })
  .finally(() => {
    // No-PII-to-disk: delete the raw prod SQL every run, dry or not.
    if (existsSync(RAW_SQL)) {
      rmSync(RAW_SQL);
      // also remove the scratch dir if empty so it doesn't linger
      try {
        if (readdirSync(TMP_DIR).length === 0) rmSync(TMP_DIR, { recursive: true });
      } catch {
        /* best-effort */
      }
    }
    // Dry-run throwaway DB: gone, always.
    if (DRY_RUN) {
      for (const f of [join(TMP_DIR, "dry-run.db"), join(TMP_DIR, "dry-run.db-wal"), join(TMP_DIR, "dry-run.db-shm")]) {
        rmSync(f, { force: true });
      }
      try {
        if (readdirSync(TMP_DIR).length === 0) rmSync(TMP_DIR, { recursive: true });
      } catch {
        /* best-effort */
      }
    }
  });
