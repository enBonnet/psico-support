import { drizzle } from 'drizzle-orm/d1'

import * as schema from './schema.ts'

type CloudflareEnv = {
  DB: D1Database
  CREDENTIAL_FILES: R2Bucket
}

let _env: CloudflareEnv | null = null

// ponytail: set by the custom server entry on each request so server fns
// can reach the D1/R2 bindings without threading env through every call.
export function setCloudflareEnv(env: CloudflareEnv) {
  _env = env
}

function getCloudflareEnv(): CloudflareEnv | null {
  return _env
}

export type Db = ReturnType<typeof drizzle<typeof schema>>

let cached: Db | null = null

export function getDb(): Db {
  if (cached) return cached
  const env = getCloudflareEnv()
  if (!env?.DB) {
    throw new Error(
      'D1 binding (DB) not available. Run via `npm run dev` (wrangler) or deploy to Cloudflare.',
    )
  }
  cached = drizzle(env.DB, { schema })
  return cached
}

export function getR2(): R2Bucket | null {
  return getCloudflareEnv()?.CREDENTIAL_FILES ?? null
}
