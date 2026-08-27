// Local migrator: applies drizzle/*.sql to the local dev SQLite (dev.db),
// tracking applied files in a `local_migrations` table.
//
// Why file-listing semantics (like `wrangler d1 migrations apply`) and NOT
// drizzle-kit's journal: migrations 0018–0022 are hand-written files that are
// deliberately absent from drizzle/meta/_journal.json, so `drizzle-kit
// migrate` would silently skip them. Wrangler applies by filename; this
// script mirrors that, so dev.db ends up with exactly what prod D1 gets.
//
// Usage:
//   node scripts/db-apply-local.mjs   # apply pending migrations to dev.db
//
// Invoked by scripts/db-check.mjs --fix (the `pnpm dev` preflight) and
// available standalone as `pnpm db:apply:local`.

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import Database from "better-sqlite3";

const MIGRATIONS_DIR = "drizzle";
const TRACKING_TABLE = "local_migrations";

// Keep in sync with the runtime driver (src/db/driver.ts devDbPath) — this
// script runs BEFORE dotenv in the dev chain, so the plain default is the
// documented path. drizzle-kit tooling reads the same file via
// DATABASE_URL=file:./dev.db.
function dbPath() {
  const url = process.env.DATABASE_URL;
  if (!url) return "dev.db";
  return url.startsWith("file:") ? url.slice("file:".length) : url;
}

const db = new Database(dbPath());
db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS ${TRACKING_TABLE} (
    name TEXT PRIMARY KEY,
    applied_at TEXT NOT NULL DEFAULT (datetime('now'))
  )
`);

const applied = new Set(
  db.prepare(`SELECT name FROM ${TRACKING_TABLE}`).all().map((r) => r.name),
);
const files = readdirSync(MIGRATIONS_DIR)
  .filter((f) => f.endsWith(".sql"))
  .sort();
const pending = files.filter((f) => !applied.has(f));

if (pending.length === 0) {
  console.log(
    `✓ ${dbPath()}: no pending migrations (${applied.size} already applied)`,
  );
  db.close();
  process.exit(0);
}

for (const file of pending) {
  const sql = readFileSync(join(MIGRATIONS_DIR, file), "utf8");
  // drizzle-kit's `--> statement-breakpoint` separators (one statement per
  // chunk). Each migration runs in a transaction; the tracking insert rides
  // the same transaction so a failed migration never records as applied.
  const statements = sql
    .split("--> statement-breakpoint")
    .map((s) => s.trim())
    .filter(Boolean);
  db.transaction(() => {
    for (const stmt of statements) db.exec(stmt);
    db.prepare(`INSERT INTO ${TRACKING_TABLE} (name) VALUES (?)`).run(file);
  })();
  console.log(`✓ applied ${file}`);
}

db.close();
console.log(
  `✓ ${dbPath()}: ${pending.length} migration(s) applied (${applied.size + pending.length} total)`,
);
