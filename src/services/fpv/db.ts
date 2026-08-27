import { existsSync } from 'node:fs'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import * as schema from '#/db/schema.ts'

export type ScriptDb = ReturnType<typeof drizzle<typeof schema>>

const DB_PATH = 'dev.db'

// Finds the local dev SQLite (dev.db at the repo root — the single local
// database; see scripts/db-check.mjs). Throws with a self-heal hint when
// missing instead of silently creating an empty file.
function findLocalD1(): string {
  if (!existsSync(DB_PATH)) {
    throw new Error(
      `No local DB found at ${DB_PATH}.\n` +
        'Run `pnpm db:apply:local` (or just `pnpm dev`) to create it first.',
    )
  }
  return DB_PATH
}

// Creates a Drizzle connection to the local dev DB.
// Use this from the scraping script (Node/tsx), NOT from the app runtime.
// The app runtime uses getDb() in src/db/index.ts, which resolves to
// src/db/driver.ts (better-sqlite3) in dev and driver.worker.ts (D1) in prod.
export function createScriptDb(): ScriptDb {
  const dbPath = findLocalD1()
  const sqlite = new Database(dbPath)
  sqlite.pragma('journal_mode = WAL')
  return drizzle(sqlite, { schema })
}
