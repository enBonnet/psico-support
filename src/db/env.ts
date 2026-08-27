// Per-request Cloudflare env holder. Split out of index.ts so the dev and
// worker drivers can both read/write it without an import cycle with
// index.ts (which owns the shared `Db` type + retry helpers).
//
// The DB/MEDIA/ANALYTICS bindings are OPTIONAL here: the worker entry always
// provides them (wrangler.jsonc), but in Node dev (src/db/driver.ts) the
// registered env carries only the plain vars (MAILGUN_*, APPOINTMENTS_ENABLED,
// CF_*) — dev serves SQL from better-sqlite3 and blobs from the local
// filesystem bucket, never from these bindings. Consumers must null-check
// before use; the guards in analytics.ts already do (analytics no-ops in dev).

export type CloudflareEnv = {
  DB?: D1Database
  MEDIA?: R2Bucket
  ANALYTICS?: AnalyticsEngineDataset
  // ponytail: Mailgun REST API credentials (transactional mail — see
  // src/server/email.ts). Plain env vars, NOT a Cloudflare binding, so local
  // dev needs zero Cloudflare auth (the old send_email binding with
  // `remote: true` forced a remote proxy session + workers.dev subdomain).
  // Set in .env.local for dev; `wrangler secret put` for prod.
  MAILGUN_API_KEY?: string
  MAILGUN_SENDING_KEY?: string
  MAILGUN_DOMAIN?: string
  MAILGUN_FROM_EMAIL?: string
  // ponytail: Mailgun API region — 'us' (default) or 'eu'. Picks the API base
  // in sendEmail(); the domain must live in the matching region.
  MAILGUN_REGION?: string
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
// In Node dev, src/db/driver.ts registers a vars-only env at module load.
export function setCloudflareEnv(env: CloudflareEnv) {
  _env = env
}

export function getCloudflareEnv(): CloudflareEnv | null {
  return _env
}
