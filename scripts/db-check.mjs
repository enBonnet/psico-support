// Preflight check: is the local miniflare D1 runtime schema applied?
//
// There are TWO local SQLite databases — don't confuse them:
//   1. dev.db (DATABASE_URL) — drizzle-kit tooling only (db:generate/push/pull/
//      studio). Introspection target for schema diffs; NOT the runtime DB.
//   2. .wrangler/state/v3/d1/miniflare-D1DatabaseObject/*.sqlite — the runtime
//      D1 that `wrangler dev` actually serves requests against. THIS is what we
//      check, because a missing runtime schema is what makes every query 500
//      with "no such table".
//
// The runtime D1 file can silently lose its schema when .wrangler/ is wiped
// (git clean, wrangler upgrade, manual delete) — wrangler dev then recreates a
// BLANK database. `wrangler d1 migrations list --local` is unreliable here: it
// reads the files in drizzle/, not the applied set on the real .sqlite, and when
// the DB is blank the d1_migrations table doesn't exist so the comparison is
// misleading.
//
// This script opens the real runtime .sqlite with better-sqlite3 (already a
// dependency — same as scripts/seed-local.ts) and queries the actual state:
//   - the `d1_migrations` table exists AND has ≥1 row (a migration was applied)
//   - the `user` table exists
// A WAL-consistent read handles committed-but-uncheckpointed pages (the previous
// raw byte-grep approach missed CREATE TABLE IF NOT EXISTS and WAL-held pages).
//
// Modes:
//   node scripts/db-check.mjs            # default: warn + exit 0 (non-blocking)
//   node scripts/db-check.mjs --strict   # exit 1 on missing schema (CI)
//   npm run db:status                    # human-readable status report
//
// Read-only: opens the plain path with { readonly: true } — never writes, never
// boots wrangler, never checkpoints. (The `file:...?mode=ro` URI form fails on
// WAL DBs in better-sqlite3; the options form is the working path.)

import { readdirSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";
import Database from "better-sqlite3";

const STATE_DIR = ".wrangler/state/v3/d1/miniflare-D1DatabaseObject";
const STRICT = process.argv.slice(2).includes("--strict");

// ANSI helpers (plain text if piped — GitHub Actions logs strip these anyway,
// but they aid local terminal scanning).
const dim = (s) => `\x1b[2m${s}\x1b[0m`;
const bold = (s) => `\x1b[1m${s}\x1b[0m`;
const red = (s) => `\x1b[31m${s}\x1b[0m`;
const green = (s) => `\x1b[32m${s}\x1b[0m`;
const yellow = (s) => `\x1b[33m${s}\x1b[0m`;
const cyan = (s) => `\x1b[36m${s}\x1b[0m`;

const FAIL = (msg) => {
  console.log(msg);
  if (STRICT) process.exit(1);
  process.exit(0);
};

// --- locate the runtime D1 file (mirror scripts/seed-local.ts findLocalDb) ---
function findLocalDb() {
  if (!existsSync(STATE_DIR)) return null;
  const files = readdirSync(STATE_DIR)
    .filter((f) => f.endsWith(".sqlite") && !f.startsWith("metadata"))
    .map((f) => join(STATE_DIR, f));
  if (files.length === 0) return null;
  // Largest file = the real DB; miniflare can leave stray small files.
  files.sort((a, b) => statSync(b).size - statSync(a).size);
  return files[0];
}

const FIX = cyan("npx wrangler d1 migrations apply psico-support-db --local");

const dbPath = findLocalDb();

// --- no runtime DB at all (wrangler dev never run, or .wrangler wiped) ---
if (!dbPath) {
  FAIL(
    `${yellow("⚠  Local D1 runtime DB not found")} ${dim(`(no .sqlite in ${STATE_DIR})`)}\n` +
      `   ${bold("The dev server will start against a BLANK database")} — every query will 500.\n` +
      `   Run ${FIX} first.`,
  );
}

// --- open read-only (WAL-consistent: better-sqlite3 applies the -wal on read) ---
let db;
let appliedCount = 0;
let hasUserTable = false;
try {
  // Plain path + { readonly: true }. The preflight must never write the runtime
  // DB. NOTE: better-sqlite3's `file:...?mode=ro` URI form FAILS on WAL-mode DBs
  // (unable to open database file) — only the plain-path + options form works.
  // readonly opens the WAL shared-memory (-shm) for a consistent read without
  // checkpointing or taking a write lock; a concurrent wrangler dev is fine.
  db = new Database(dbPath, { readonly: true });
  // sqlite_master holds every CREATE TABLE/INDEX row regardless of quoting or
  // IF NOT EXISTS — no regex fragility. Returns ["user", "d1_migrations", ...].
  const tables = new Set(
    db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'",
      )
      .all()
      .map((r) => r.name),
  );
  hasUserTable = tables.has("user");
  if (tables.has("d1_migrations")) {
    appliedCount =
      db.prepare("SELECT COUNT(*) AS n FROM d1_migrations").get()?.n ?? 0;
  }
} catch (err) {
  FAIL(
    `${red("✗  Could not read local D1")} ${dim(`(${dbPath})`)}\n` +
      `   ${bold(String(err.message))}\n` +
      `   If wrangler dev is running it may hold a lock; otherwise run ${FIX}.`,
  );
} finally {
  db?.close();
}

// --- diagnose against the real applied state ---
if (appliedCount === 0 && !hasUserTable) {
  // File exists but no schema at all — the "silent reset" failure mode.
  FAIL(
    `${red("✗  Local D1 runtime schema is MISSING")} ${dim(`(${dbPath} exists but has no tables)`)}\n` +
      `   ${bold('Every query will 500 with "no such table".')}\n` +
      `   This happens when .wrangler/ is wiped — wrangler dev recreated a blank DB.\n` +
      `   Fix: ${FIX}`,
  );
}

if (appliedCount === 0) {
  // d1_migrations empty/absent but user table somehow exists — partially applied
  // or hand-edited. The runtime contract is "migrations were applied", so flag it.
  FAIL(
    `${red("✗  Local D1 migrations not applied")} ${dim(`(user table present but d1_migrations has 0 rows)`)}\n` +
      `   The schema looks hand-built. Apply migrations so the runtime matches drizzle/:\n` +
      `   ${FIX}`,
  );
}

if (!hasUserTable) {
  // d1_migrations populated but no user table — shouldn't happen normally but
  // would mean a migration failed mid-apply. Flag loudly.
  FAIL(
    `${red("✗  Local D1 schema is PARTIAL")} ${dim(`(${appliedCount} migrations recorded but no user table)`)}\n` +
      `   A migration may have failed mid-apply. Re-run ${FIX}.`,
  );
}

// --- healthy ---
console.log(
  `${green("✓")} Local D1 schema OK ${dim(`(${appliedCount} migrations applied, ${dbPath})`)}`,
);
