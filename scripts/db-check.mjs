// Preflight check: is the local dev SQLite (dev.db) schema applied?
//
// Local dev runs on plain Node (no wrangler/miniflare). There is ONE local
// database — dev.db at the repo root (gitignored):
//   - the dev RUNTIME DB (src/db/driver.ts opens it with better-sqlite3)
//   - AND the drizzle-kit tooling DB (DATABASE_URL=file:./dev.db)
// The old two-databases split (dev.db + .wrangler miniflare state) is gone;
// prod still runs D1, unaffected.
//
// Migrations are applied by scripts/db-apply-local.mjs (wrangler-style
// file-listing semantics over drizzle/*.sql, tracked in `local_migrations`).
//
// Modes:
//   node scripts/db-check.mjs            # default: warn + exit 0 (non-blocking)
//   node scripts/db-check.mjs --strict   # exit 1 on missing schema (CI)
//   node scripts/db-check.mjs --fix      # auto-apply migrations, then re-check
//   pnpm run db:status                   # human-readable status report
//
// --fix is what `pnpm dev` uses: instead of warning and letting the dev
// server boot against a blank DB (every query 500s with "no such table"),
// it runs db-apply-local.mjs (which creates dev.db if missing AND applies
// the schema) and re-checks. Fails loudly if the apply didn't fix it.

import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import Database from "better-sqlite3";

const ARGS = new Set(process.argv.slice(2));
const STRICT = ARGS.has("--strict");
const AUTO_FIX = ARGS.has("--fix");

const DB_PATH = "dev.db";
const FIX = "pnpm db:apply:local";

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

// --- auto-apply migrations (--fix, used by `pnpm dev`) ---
// Runs scripts/db-apply-local.mjs, which creates dev.db if missing AND
// applies every pending migration from drizzle/ (plain Node — no wrangler).
function applyMigrations() {
  console.log(`${cyan("→")} Applying local migrations ${dim("(db-apply-local.mjs)")}...`);
  const result = spawnSync("pnpm", ["run", "db:apply:local"], {
    stdio: "inherit",
  });
  if (result.status !== 0) {
    console.log(
      `${red("✗  Migration apply failed")} ${dim(`(exit ${result.status ?? "signal"})`)}\n` +
        `   Run ${cyan(FIX)} manually and check the error.`,
    );
    process.exit(1);
  }
}

// Open dev.db read-only and inspect the real schema state. db-check never
// writes — db-apply-local.mjs (spawned by --fix) owns all writing. Plain path
// + { readonly: true } is the WAL-consistent form (the `file:...?mode=ro`
// URI form fails on WAL DBs in better-sqlite3).
function checkSchema() {
  let db;
  try {
    db = new Database(DB_PATH, { readonly: true });
  } catch (err) {
    return { ok: false, error: String(err.message) };
  }
  try {
    const tables = new Set(
      db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'",
        )
        .all()
        .map((r) => r.name),
    );
    const hasUser = tables.has("user");
    const count = tables.has("local_migrations")
      ? db.prepare("SELECT COUNT(*) AS n FROM local_migrations").get()?.n ?? 0
      : 0;
    return { ok: hasUser && count > 0, hasUser, count };
  } catch (err) {
    return { ok: false, error: String(err.message) };
  } finally {
    db?.close();
  }
}

const existed = existsSync(DB_PATH);

// --- missing dev.db (fresh clone, or deleted) ---
if (!existed) {
  if (AUTO_FIX) {
    applyMigrations();
    const after = checkSchema();
    if (after.ok) {
      console.log(`${green("✓")} Local dev.db created + schema applied.`);
      process.exit(0);
    }
    console.log(
      `${red("✗  dev.db still unhealthy after applying migrations")}\n` +
        `   Run ${cyan(FIX)} manually and check the error.`,
    );
    process.exit(1);
  }
  FAIL(
    `${yellow("⚠  dev.db not found")} ${dim(`(no ${DB_PATH} at repo root)`)}\n` +
      `   ${bold("The dev server preflight will create it on the next `pnpm dev`")},\n` +
      `   or create it now with ${cyan(FIX)}.`,
  );
}

// --- diagnose against the real applied state ---
const state = checkSchema();
if (state.error) {
  FAIL(
    `${red("✗  Could not read dev.db")} ${dim(`(${DB_PATH}: ${state.error})`)}\n` +
      `   If the dev server is running it may hold a lock; otherwise run ${cyan(FIX)}.`,
  );
}

if (!state.ok) {
  // File exists but schema is missing/partial — the failure mode that 500s
  // every query with "no such table".
  if (AUTO_FIX) {
    applyMigrations();
    const after = checkSchema();
    if (after.ok) {
      console.log(`${green("✓")} Local dev.db schema applied.`);
      process.exit(0);
    }
    console.log(
      `${red("✗  dev.db still unhealthy after applying migrations")}\n` +
        `   Run ${cyan(FIX)} manually and check the error.`,
    );
    process.exit(1);
  }
  FAIL(
    `${red("✗  Local dev.db schema is MISSING or PARTIAL")} ${dim(`(user table: ${state.hasUser ? "yes" : "no"}, migrations recorded: ${state.count})`)}\n` +
      `   ${bold('Every query will 500 with "no such table".')}\n` +
      `   Fix: ${cyan(FIX)}`,
  );
}

// --- healthy ---
console.log(
  `${green("✓")} Local dev.db schema OK ${dim(`(${state.count} migrations applied, ${DB_PATH})`)}`,
);
