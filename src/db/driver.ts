// Node (local dev) DB + R2 driver. This is the DEFAULT resolution of
// `#/db/driver` (tsconfig `#/*` paths) — what `vite dev` runs against since
// local development dropped the Cloudflare plugin (workerd/miniflare). The
// production build aliases `#/db/driver` → driver.worker.ts (see
// vite.config.ts), so this module — and better-sqlite3, a native addon that
// cannot run on workerd — never enters the worker bundle.
//
// NEVER import better-sqlite3 outside this file (and scripts/, which run on
// plain Node via tsx). The worker graph must stay native-free.
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'

import { setCloudflareEnv } from './env.ts'
import type { CloudflareEnv } from './env.ts'
import type { Db } from './index.ts'
import * as schema from './schema.ts'

// ── dev env registration ────────────────────────────────────────────────────
// ponytail: same register-at-module-load idiom as src/lib/seo-server.ts.
// Server fns read config (MAILGUN_*, APPOINTMENTS_ENABLED, CF_*) through
// getCloudflareEnv(); in Node dev nobody calls setCloudflareEnv per-request
// (that's the worker entry's job), so we register a vars-only env from
// process.env here — .env.local is loaded by the `dotenv -e .env.local` in
// the dev script before vite starts. Bindings (DB/MEDIA/ANALYTICS) are
// deliberately absent: SQL comes from better-sqlite3 below, blobs from
// LocalR2Bucket, and leaving ANALYTICS undefined keeps the analytics pipe on
// its existing no-op-without-binding path (gotcha #10).
function devEnvFromProcess(): CloudflareEnv {
  return {
    MAILGUN_API_KEY: process.env.MAILGUN_API_KEY,
    MAILGUN_SENDING_KEY: process.env.MAILGUN_SENDING_KEY,
    MAILGUN_DOMAIN: process.env.MAILGUN_DOMAIN,
    MAILGUN_FROM_EMAIL: process.env.MAILGUN_FROM_EMAIL,
    MAILGUN_REGION: process.env.MAILGUN_REGION,
    CF_ACCOUNT_ID: process.env.CF_ACCOUNT_ID,
    CF_ANALYTICS_TOKEN: process.env.CF_ANALYTICS_TOKEN,
    APPOINTMENTS_ENABLED: process.env.APPOINTMENTS_ENABLED,
  }
}
setCloudflareEnv(devEnvFromProcess())

// ── local SQLite (dev.db) ───────────────────────────────────────────────────
// One local DB for everything: drizzle-kit tooling (db:generate/push/studio
// via DATABASE_URL=file:./dev.db) AND the dev runtime — the old
// two-databases split (dev.db + .wrangler miniflare state) is gone. The file
// is gitignored; `pnpm dev` auto-applies migrations via scripts/db-check.mjs
// --fix → scripts/db-apply-local.mjs.
function devDbPath(): string {
  const url = process.env.DATABASE_URL
  if (!url) return 'dev.db'
  return url.startsWith('file:') ? url.slice('file:'.length) : url
}

let cached: Db | null = null

export function getDriverDb(): Db {
  if (cached) return cached
  // ponytail: the drizzle instance is created with the better-sqlite3
  // (synchronous) driver but typed as the shared D1-derived async `Db` —
  // every call site already `await`s (the async type enforces it), and
  // awaiting a sync result is fine. This cast is the contract: server fns
  // must keep awaiting so the same code runs unchanged on D1 in prod.
  const sqlite = new Database(devDbPath())
  sqlite.pragma('journal_mode = WAL')
  cached = drizzle(sqlite, { schema }) as unknown as Db
  return cached
}

// ── local R2 (filesystem bucket under .local/media) ─────────────────────────
// ponytail: the app's whole R2 surface is put/get/delete with
// httpMetadata.contentType (certificates, avatars, audio stories — see
// src/server/{professionals,audio-stories}.ts and src/routes/media/*), so a
// filesystem bucket with .meta.json sidecars covers dev. Keys keep the exact
// prod shape (the DB stores them), files just land on disk instead. Ceiling:
// if R2 features beyond this surface are adopted (ranges, listings, custom
// metadata), extend the shim or run the prod build via
// `pnpm build && pnpm exec wrangler dev`.
type R2HttpMetadata = { contentType?: string }

class LocalR2Bucket {
  constructor(private readonly root: string) {}

  private pathFor(key: string): string {
    // Double guard: callers already reject '..', the shim must never escape
    // its root even if a new call site forgets.
    if (!key || key.includes('..')) {
      throw new Error(`LocalR2Bucket: invalid key ${JSON.stringify(key)}`)
    }
    return resolve(join(this.root, key))
  }

  async put(
    key: string,
    value: Uint8Array,
    options?: { httpMetadata?: R2HttpMetadata },
  ): Promise<null> {
    const filePath = this.pathFor(key)
    mkdirSync(dirname(filePath), { recursive: true })
    writeFileSync(filePath, value)
    if (options?.httpMetadata) {
      writeFileSync(`${filePath}.meta.json`, JSON.stringify(options.httpMetadata))
    }
    return null
  }

  async get(
    key: string,
  ): Promise<{ body: ReadableStream; httpMetadata?: R2HttpMetadata } | null> {
    const filePath = this.pathFor(key)
    if (!existsSync(filePath)) return null
    let httpMetadata: R2HttpMetadata | undefined
    try {
      httpMetadata = JSON.parse(readFileSync(`${filePath}.meta.json`, 'utf8'))
    } catch {
      // no sidecar (or corrupt) — serve without content type, same as R2
    }
    const body = new Blob([readFileSync(filePath)]).stream()
    return { body, httpMetadata }
  }

  async delete(key: string): Promise<void> {
    const filePath = this.pathFor(key)
    rmSync(filePath, { force: true })
    rmSync(`${filePath}.meta.json`, { force: true })
  }
}

let r2: R2Bucket | null = null

export function getDriverR2(): R2Bucket {
  if (!r2) r2 = new LocalR2Bucket('.local/media') as unknown as R2Bucket
  return r2
}
