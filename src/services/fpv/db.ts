import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import * as schema from '#/db/schema.ts'

export type ScriptDb = ReturnType<typeof drizzle<typeof schema>>

const STATE_DIR = '.wrangler/state/v3/d1/miniflare-D1DatabaseObject'

// Finds the wrangler-managed local D1 SQLite file (same pattern as
// scripts/seed-local.ts findLocalDb). This is NOT dev.db — it's the
// runtime DB that `ppnpm run dev` serves requests against.
function findLocalD1(): string {
  let files: string[]
  try {
    files = readdirSync(STATE_DIR)
      .filter((f) => f.endsWith('.sqlite') && !f.startsWith('metadata'))
      .map((f) => join(STATE_DIR, f))
  } catch {
    throw new Error(
      `No wrangler D1 state found at ${STATE_DIR}.\n` +
        'Run `pnpm exec wrangler d1 migrations apply psico-support-db --local` first.',
    )
  }
  if (files.length === 0) {
    throw new Error(
      `No D1 sqlite files in ${STATE_DIR}.\n` +
        'Run `pnpm exec wrangler d1 migrations apply psico-support-db --local` first.',
    )
  }
  // Largest file = the real DB; miniflare can leave stray small files.
  files.sort((a, b) => statSync(b).size - statSync(a).size)
  return files[0]
}

// Creates a Drizzle connection to the wrangler-managed local D1.
// Use this from the scraping script (Node/tsx), NOT from the Worker.
// The Worker uses getDb() in src/db/index.ts which binds to the D1 binding.
export function createScriptDb(): ScriptDb {
  const dbPath = findLocalD1()
  const sqlite = new Database(dbPath)
  sqlite.pragma('journal_mode = WAL')
  return drizzle(sqlite, { schema })
}