import { drizzle } from 'drizzle-orm/d1'

import * as schema from './schema.ts'

export type CloudflareEnv = {
  DB: D1Database
  MEDIA: R2Bucket
  ANALYTICS: AnalyticsEngineDataset
  // ponytail: Mailgun REST API credentials (transactional mail — see
  // src/server/email.ts). Plain env vars, NOT a Cloudflare binding, so local
  // dev needs zero Cloudflare auth (the old send_email binding with
  // `remote: true` forced a remote proxy session + workers.dev subdomain).
  // Set in .env.local for dev; `wrangler secret put` for prod.
  MAILGUN_API_KEY?: string
  MAILGUN_SENDING_KEY?: string
  MAILGUN_DOMAIN?: string
  MAILGUN_FROM_EMAIL?: string
  // ponytail: wrangler secrets (not bindings) for the Analytics Engine SQL
  // REST API read path (src/server/analytics-read.ts). Optional — the admin
  // analytics route shows a "no configurada" banner when absent. Set with
  // `pnpm exec wrangler secret put CF_ACCOUNT_ID` / `CF_ANALYTICS_TOKEN`.
  CF_ACCOUNT_ID?: string
  CF_ANALYTICS_TOKEN?: string
  // ponytail: server-side feature flag for video-call scheduling (1.25.0).
  // A wrangler secret (NOT a binding) so flipping it takes effect without
  // redeploy. Truthy values: 'true' / '1'. Off by default — every appointment
  // server fn checks appointmentsEnabled() first and rejects when off. Mirror
  // with VITE_APPOINTMENTS_ENABLED (build-time) so the client CTA/cards hide
  // too; the two are intentionally separate knobs (a secret can't reach the
  // client bundle, a VITE_ var is baked at build) — set both together.
  APPOINTMENTS_ENABLED?: string
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
      'D1 binding (DB) not available. Run via `pnpm run dev` (wrangler) or deploy to Cloudflare.',
    )
  }
  cached = drizzle(env.DB, { schema })
  return cached
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

// ponytail: R2 binding for binary uploads (professional certificates).
// Not cached — the binding is a stateless handle,getDb() caches the drizzle
// wrapper, R2 has no such wrapper.
export function getR2(): R2Bucket {
  const env = getCloudflareEnv()
  if (!env?.MEDIA) {
    throw new Error(
      'R2 binding (MEDIA) not available. Run via `pnpm run dev` (wrangler) or deploy to Cloudflare.',
    )
  }
  return env.MEDIA
}

// ponytail: Analytics Engine binding for product analytics. Like getR2():
// a stateless handle, not cached. Returns void on
// writeDataPoint() (fire-and-forget — never await). In dev, the binding is
// absent and writes silently no-op via the track() server fn guard; this
// throws only when called directly (e.g. SSR funnel events) to make a missing
// binding obvious. See src/server/analytics.ts for the catalog + track fn.
export function getAnalytics(): AnalyticsEngineDataset {
  const env = getCloudflareEnv()
  if (!env?.ANALYTICS) {
    throw new Error(
      'Analytics binding (ANALYTICS) not available. Run via `pnpm run dev` (wrangler) or deploy to Cloudflare.',
    )
  }
  return env.ANALYTICS
}
