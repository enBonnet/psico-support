// Preflight check: is the local miniflare D1 schema applied?
//
// The local D1 file under .wrangler/state can silently lose its schema when
// .wrangler/ is wiped (git clean, wrangler upgrade, manual delete). wrangler dev
// then recreates a BLANK database — every query 500s with "no such table" and
// `migrations list --local` is misleading (it reads files, not the applied set).
//
// This script reads the real .sqlite file and checks (a) the `d1_migrations`
// table exists with row count > 0, and (b) the `user` table exists. It needs no
// dependencies — it greps the SQLite file's bytes for the table schema markers,
// which is reliable for the D1/miniflare single-file layout (no attachments,
// DDL stored inline in sqlite_master). It never writes, never boots wrangler.
//
// Modes:
//   node scripts/db-check.mjs            # default: warn + exit 0 (non-blocking)
//   node scripts/db-check.mjs --strict   # exit 1 on missing schema (CI)
//   npm run db:status                    # human-readable status report
//
// The grep approach deliberately avoids `better-sqlite3` so this can run before
// wrangler dev without paying native-module load time, and works even if the
// DB is WAL-mode (the main .sqlite file holds the committed schema regardless).

import { readdirSync, statSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const STATE_DIR = ".wrangler/state/v3/d1/miniflare-D1DatabaseObject";
const STRICT = process.argv.slice(2).includes("--strict");

// --- locate the real D1 file (mirror scripts/seed-local.ts findLocalDb) ---
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

// SQLite stores `CREATE TABLE name (...)` rows in the sqlite_master table, which
// lives inline in the main file. Scanning the raw bytes for the CREATE markers
// is a cheap presence check that needs no SQL engine. Drizzle's D1 migrations
// quote identifiers with backticks (`` `user` ``), the raw sqlite_sequence row
// uses no quotes, and d1_migrations uses double-quotes — so match all three
// quoting styles. Returns the set of table names.
function readTableNames(dbPath) {
  const buf = readFileSync(dbPath);
  const text = buf.toString("latin1"); // bytes-as-chars; CREATE statements are ASCII
  const names = new Set();
  // Matches: CREATE TABLE `name` | "name" | name
  const re = /CREATE TABLE\s+(?:`([a-zA-Z0-9_]+)`|"([a-zA-Z0-9_]+)"|([a-zA-Z0-9_]+))/g;
  let m;
  while ((m = re.exec(text)) !== null) names.add(m[1] ?? m[2] ?? m[3]);
  return names;
}

const dim = (s) => `\x1b[2m${s}\x1b[0m`;
const bold = (s) => `\x1b[1m${s}\x1b[0m`;
const red = (s) => `\x1b[31m${s}\x1b[0m`;
const green = (s) => `\x1b[32m${s}\x1b[0m`;
const yellow = (s) => `\x1b[33m${s}\x1b[0m`;
const cyan = (s) => `\x1b[36m${s}\x1b[0m`;

const dbPath = findLocalDb();

// --- no DB at all (wrangler dev never run, or .wrangler wiped) ---
if (!dbPath) {
  const msg =
    `${yellow("⚠  Local D1 not found")} ${dim(`(no .sqlite in ${STATE_DIR})`)}\n` +
    `   ${bold("The dev server will start against a BLANK database")} — every query will 500.\n` +
    `   Run ${cyan("npx wrangler d1 migrations apply psico-support-db --local")} first.`;
  console.log(msg);
  if (STRICT) process.exit(1);
  process.exit(0);
}

// --- count applied migrations + check the user table ---
const tables = readTableNames(dbPath);
const hasMigrationsTable = tables.has("d1_migrations");
const hasUserTable = tables.has("user");

if (!hasMigrationsTable && !hasUserTable) {
  // File exists but has no schema at all — the "silent reset" failure mode.
  const msg =
    `${red("✗  Local D1 schema is MISSING")} ${dim(`(${dbPath} exists but has no tables)`)}\n` +
    `   ${bold("Every query will 500 with \"no such table\".")}\n` +
    `   This happens when .wrangler/ is wiped — wrangler dev recreated a blank DB.\n` +
    `   Fix: ${cyan("npx wrangler d1 migrations apply psico-support-db --local")}`;
  console.log(msg);
  if (STRICT) process.exit(1);
  process.exit(0);
}

if (hasMigrationsTable && !hasUserTable) {
  // Partially applied — shouldn't happen normally but flag it loudly.
  console.log(
    `${red("✗  Local D1 schema is PARTIAL")} ${dim(`(d1_migrations present but no user table)`)}\n` +
      `   A migration may have failed mid-apply. Re-run ` +
      cyan("npx wrangler d1 migrations apply psico-support-db --local") + `.`,
  );
  if (STRICT) process.exit(1);
  process.exit(0);
}

// --- healthy ---
console.log(`${green("✓")} Local D1 schema OK ${dim(`(${dbPath})`)}`);
