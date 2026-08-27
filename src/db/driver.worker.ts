// Worker (production) DB + R2 driver. This module is swapped in for
// `#/db/driver` ONLY in the production build — vite.config.ts aliases
// `#/db/driver` → this file when `command === 'build'`, so `vite build`
// (Cloudflare Worker bundle) binds to the real D1/R2 bindings. It must stay
// free of Node-only imports (no better-sqlite3, no node:fs) — native addons
// cannot run on workerd.
import { drizzle } from 'drizzle-orm/d1'

import { getCloudflareEnv } from './env.ts'
import type { Db } from './index.ts'
import * as schema from './schema.ts'

let cached: Db | null = null

export function getDriverDb(): Db {
  if (cached) return cached
  const d1 = getCloudflareEnv()?.DB
  if (!d1) {
    throw new Error(
      'D1 binding (DB) not available. This build expects Cloudflare Workers. In local dev use `pnpm dev` (Node + better-sqlite3).',
    )
  }
  cached = drizzle(d1, { schema })
  return cached
}

// ponytail: R2 binding for binary uploads (professional certificates).
// Not cached — the binding is a stateless handle; getDb() caches the drizzle
// wrapper, R2 has no such wrapper.
export function getDriverR2(): R2Bucket {
  const media = getCloudflareEnv()?.MEDIA
  if (!media) {
    throw new Error(
      'R2 binding (MEDIA) not available. This build expects Cloudflare Workers. In local dev use `pnpm dev` (filesystem-backed local bucket).',
    )
  }
  return media
}
