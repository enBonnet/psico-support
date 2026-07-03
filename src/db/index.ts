import { drizzle } from 'drizzle-orm/d1'

import * as schema from './schema.ts'

type CloudflareEnv = {
  DB: D1Database
  MEDIA: R2Bucket
  EMAIL: SendEmail
  ANALYTICS: AnalyticsEngineDataset
}

let _env: CloudflareEnv | null = null

// ponytail: set by the custom server entry on each request so server fns
// can reach the D1/R2 bindings without threading env through every call.
export function setCloudflareEnv(env: CloudflareEnv) {
  _env = env
}

export function getCloudflareEnv(): CloudflareEnv | null {
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

// ponytail: D1 queries can fail transiently because the Durable Object hosting
// the DB occasionally resets ("Internal error while starting up D1 DB storage
// caused object to be reset", "Network connection lost", "storage operation
// exceeded timeout", etc.). Cloudflare's own docs state "a handful of errors
// every several hours is not unexpected" and that callers should retry. D1
// auto-retries reads up to 2× internally, but that's not always enough for
// landing-cold-load paths. This wrapper adds a few more retries with jittered
// backoff. Ceiling: if it ever grows, pull @cloudflare/actors and use its
// Retryable (it bundles a proper exponential-with-jitter strategy).
const TRANSIENT_D1_MARKERS = [
  'storage caused object to be reset',
  'object to be reset',
  'Network connection lost',
  'storage operation exceeded timeout',
  'exceeded its memory limit',
  'D1_ERROR',
]

export function isTransientD1Error(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err)
  return TRANSIENT_D1_MARKERS.some((m) => msg.includes(m))
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

// ponytail: R2 binding for binary uploads (professional certificates).
// Not cached — the binding is a stateless handle,getDb() caches the drizzle
// wrapper, R2 has no such wrapper.
export function getR2(): R2Bucket {
  const env = getCloudflareEnv()
  if (!env?.MEDIA) {
    throw new Error(
      'R2 binding (MEDIA) not available. Run via `npm run dev` (wrangler) or deploy to Cloudflare.',
    )
  }
  return env.MEDIA
}

// ponytail: Cloudflare Email Service binding for transactional mail. Like
// getR2(), not cached — the binding is a stateless handle. Throws a dev-facing
// error when missing so the failure is obvious in local dev. Sender domain
// must be onboarded in the dashboard (Compute > Email Service > Email Sending
// > Onboard Domain) — NOT via `wrangler email sending enable`, which 403s
// even with the right scope. See wrangler.jsonc send_email ponytail.
export function getEmailBinding(): SendEmail {
  const env = getCloudflareEnv()
  if (!env?.EMAIL) {
    throw new Error(
      'Email binding (EMAIL) not available. Run via `npm run dev` (wrangler) or deploy to Cloudflare.',
    )
  }
  return env.EMAIL
}

// ponytail: Analytics Engine binding for product analytics. Like getR2()/
// getEmailBinding(): a stateless handle, not cached. Returns void on
// writeDataPoint() (fire-and-forget — never await). In dev, the binding is
// absent and writes silently no-op via the track() server fn guard; this
// throws only when called directly (e.g. SSR funnel events) to make a missing
// binding obvious. See src/server/analytics.ts for the catalog + track fn.
export function getAnalytics(): AnalyticsEngineDataset {
  const env = getCloudflareEnv()
  if (!env?.ANALYTICS) {
    throw new Error(
      'Analytics binding (ANALYTICS) not available. Run via `npm run dev` (wrangler) or deploy to Cloudflare.',
    )
  }
  return env.ANALYTICS
}
