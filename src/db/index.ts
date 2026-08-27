import type { DrizzleD1Database } from 'drizzle-orm/d1'

// The environment split: `#/db/driver` resolves to src/db/driver.ts (Node:
// better-sqlite3 + local filesystem bucket) in dev, and is aliased to
// src/db/driver.worker.ts (D1 + R2 bindings) in the production build — see
// vite.config.ts. Everything else in this file is runtime-agnostic.
import { getDriverDb, getDriverR2 } from '#/db/driver'

import { getCloudflareEnv } from './env.ts'
import type * as schema from './schema.ts'

export { getCloudflareEnv, setCloudflareEnv } from './env.ts'
export type { CloudflareEnv } from './env.ts'

// ponytail: the shared DB type is the D1-derived async type even though dev
// runs better-sqlite3 (sync) underneath — the async type forces every call
// site to `await`, which works on both drivers. Don't "simplify" callers to
// drop the await: they'd break in prod.
export type Db = DrizzleD1Database<typeof schema>

export function getDb(): Db {
  return getDriverDb()
}

// ponytail: D1 queries can fail transiently because the Durable Object hosting
// the DB occasionally resets ("Internal error while starting up D1 DB storage
// caused object to be reset", "Network connection lost", "storage operation
// exceeded timeout", etc.). Cloudflare's own docs state "a handful of errors
// every several hours is not expected" is the threshold — callers should retry.
// D1 auto-retries reads up to 2× internally, but that's not always enough for
// landing-cold-load paths. This wrapper adds a few more retries with jittered
// backoff. Ceiling: if it ever grows, pull @cloudflare/actors and use its
// Retryable (it bundles a proper exponential-with-jitter strategy).
//
// WEB-H note: drizzle wraps the raw D1 throw in DrizzleQueryError, whose
// .message is "Failed query: <sql>\nparams: ..." — the underlying D1 error
// lives on .cause. So we walk the cause chain and also match the two formats
// a real D1 backend blip takes: "D1_ERROR: internal error; reference = ..."
// (the canonical Cloudflare transient-backend error) and the older reset
// strings. Without this, retries never fire and every transient blip surfaces
// as a thrown 500 — which is what WEB-H was for 2+ weeks.
//
// On the local better-sqlite3 driver these markers never match, so the wrapper
// is a pass-through in dev — harmless.
const TRANSIENT_D1_MARKERS = [
  'storage caused object to be reset',
  'object to be reset',
  'Network connection lost',
  'storage operation exceeded timeout',
  'exceeded its memory limit',
  'reset because its code was updated',
  // Cloudflare's canonical transient D1 backend error — always comes with a
  // reference id that support can look up. Match the prefix + body, not the id.
  'D1_ERROR: internal error',
  'internal error; reference',
]

export function isTransientD1Error(err: unknown): boolean {
  // Walk the cause chain: drizzle wraps D1 throws, Better Auth wraps drizzle,
  // etc. The marker we care about is usually on the leaf.
  const messages: string[] = []
  let cur: unknown = err
  for (let depth = 0; cur && depth < 5; depth++) {
    const msg = cur instanceof Error ? cur.message : String(cur)
    if (msg) messages.push(msg)
    cur = (cur as { cause?: unknown }).cause
  }
  const haystack = messages.join('\n')
  return TRANSIENT_D1_MARKERS.some((m) => haystack.includes(m))
}

export async function withD1Retry<T>(
  fn: () => Promise<T>,
  maxAttempts = 4,
): Promise<T> {
  let lastErr: unknown
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn()
    } catch (err) {
      lastErr = err
      if (!isTransientD1Error(err) || attempt === maxAttempts - 1) throw err
      // Jittered exponential backoff: ~[60,120,240]ms caps for 4 attempts.
      const base = 60 * Math.pow(2, attempt)
      const jitter = Math.random() * base * 0.5
      await new Promise((r) => setTimeout(r, base + jitter))
    }
  }
  throw lastErr
}

// ponytail: R2 access. The worker driver returns the real MEDIA binding; the
// Node driver returns the filesystem bucket under .local/media. Not cached at
// this level — the drivers cache what's stateful.
export function getR2(): R2Bucket {
  return getDriverR2()
}

// ponytail: Analytics Engine binding for product analytics. Returns void on
// writeDataPoint() (fire-and-forget — never await). In Node dev the binding is
// absent (the dev env registers no ANALYTICS) and writes silently no-op via
// the track() server fn guard; this throws only when called directly (e.g. SSR
// funnel events) to make a missing binding obvious in prod. See
// src/server/analytics.ts for the catalog + track fn.
export function getAnalytics(): AnalyticsEngineDataset {
  const analytics = getCloudflareEnv()?.ANALYTICS
  if (!analytics) {
    throw new Error(
      'Analytics binding (ANALYTICS) not available. Deploy to Cloudflare; in Node dev analytics intentionally no-ops.',
    )
  }
  return analytics
}
