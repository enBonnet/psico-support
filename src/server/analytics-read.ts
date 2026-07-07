// =============================================================================
// src/server/analytics-read.ts — admin-gated Analytics Engine read path
// =============================================================================
// In-app counterpart to scripts/analytics-dashboard.ts. Exposes ONE
// admin-gated server fn `runAnalyticsQuery` that:
//   - requires an authenticated admin session (amIAdmin)
//   - accepts ONLY a whitelisted query id + days + (optional) event(s) — NEVER
//     arbitrary SQL from the client (defense against SQL injection even though
//     sqlLiteral already escapes; the catalog is the trust boundary)
//   - resolves credentials from wrangler secrets (CF_ACCOUNT_ID /
//     CF_ANALYTICS_TOKEN); returns a friendly "no configurada" sentinel if
//     they're missing instead of throwing
//   - short-TTL in-memory cache (60s) to coalesce concurrent admin loads and
//     avoid hammering the metered SQL API on every page focus/refetch
//
// Cache safety: the cache stores only aggregate query results (no PII, no
// per-request data) and is keyed by (queryId, days, event, eventB). It does
// NOT store the request, headers, or session — so it cannot leak across
// admins (every admin sees the same aggregate). Worker isolates are
// long-lived, so a 60s TTL is a real win without staleness mattering
// (analytics is already at best ~1min delayed by the pipeline).
// =============================================================================

import * as Sentry from '@sentry/tanstackstart-react'
import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'

import { getCloudflareEnv } from '#/db'
import { getAuth, isAdminEmail } from '#/lib/auth'
import {
  TRACKED_EVENTS,
} from '#/server/analytics'
import {
  QUERY_IDS,
  clampDays,
  findQuery,
  runSql
  
  
} from '#/server/analytics-queries'
import type {AnalyticsReadEnv, QueryContext} from '#/server/analytics-queries';
import { getRequestHeaders } from '@tanstack/react-start/server'

const eventEnum = z.enum(TRACKED_EVENTS)

const queryInputSchema = z.object({
  id: z.enum(QUERY_IDS as [string, ...string[]]),
  days: z.number().int().min(1).max(90).optional(),
  event: eventEnum.optional(),
  eventB: eventEnum.optional(),
})

export type AnalyticsQueryInput = z.infer<typeof queryInputSchema>

export type AnalyticsQueryResult = {
  id: string
  columns: string[]
  /**
   * Rows from the SQL API. Typed loosely — Analytics Engine can return strings,
   * numbers, and nulls depending on the query. Kept as a concrete value union
   * (not `unknown`) so TanStack Start's server-fn serializer accepts it.
   */
  rows: Array<Record<string, string | number | boolean | null>>
  /** ms it took the upstream SQL API to respond (for the UI footer). */
  elapsedMs: number
  /** True when the result was served from cache. */
  cached: boolean
  /** Friendly error for the UI; set when credentials are missing. */
  warning?: string
}

// ponytail: in-memory TTL cache. Keyed by the canonical (id, days, event,
// eventB) tuple — same query with same params hits the same cache entry
// regardless of who asked (the data is aggregate, not per-user). 60s TTL is
// short enough that "real-time-ish" feels right, long enough to coalesce a
// refetch storm. Ceiling: if a second Worker isolate is hot, each keeps its
// own cache (cheap — entries are tiny JSON blobs); if we want to share,
// upgrade to the Cache API or a KV namespace.
type CacheEntry = { value: AnalyticsQueryResult; expiresAt: number }
const CACHE = new Map<string, CacheEntry>()
const CACHE_TTL_MS = 60_000

function cacheKey(input: Required<Pick<AnalyticsQueryInput, 'id' | 'days'>> & {
  event?: string
  eventB?: string
}): string {
  return `${input.id}|${input.days}|${input.event ?? ''}|${input.eventB ?? ''}`
}

function readCache(key: string): AnalyticsQueryResult | undefined {
  const hit = CACHE.get(key)
  if (!hit) return undefined
  if (hit.expiresAt < Date.now()) {
    CACHE.delete(key)
    return undefined
  }
  return { ...hit.value, cached: true }
}

function writeCache(key: string, value: AnalyticsQueryResult): void {
  CACHE.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS })
  // ponytail: bound the cache so a long-lived isolate doesn't grow forever.
  // 64 is comfortably more than the catalog size; LRU isn't worth the code.
  if (CACHE.size > 64) {
    const firstKey = CACHE.keys().next().value
    if (firstKey !== undefined) CACHE.delete(firstKey)
  }
}

export function clearAnalyticsCache(): void {
  CACHE.clear()
}

function resolveEnv(): AnalyticsReadEnv | null {
  const env = getCloudflareEnv()
  if (!env?.CF_ACCOUNT_ID || !env.CF_ANALYTICS_TOKEN) return null
  return {
    accountId: env.CF_ACCOUNT_ID,
    token: env.CF_ANALYTICS_TOKEN,
  }
}

/**
 * Admin-gated server fn the in-app analytics route calls. Returns either:
 *   - { rows, columns, ... } on success
 *   - { warning } when credentials aren't configured (UI shows a banner)
 * Throws on auth failure (non-admin) or upstream SQL errors (caller catches).
 */
export const runAnalyticsQuery = createServerFn({ method: 'GET' })
  .validator(queryInputSchema)
  .handler(async ({ data }) =>
    Sentry.startSpan({ name: 'analytics runAnalyticsQuery' }, async () => {
      const session = await getAuth().api.getSession({ headers: getRequestHeaders() })
      if (!session?.user || !(await isAdminEmail(session.user.email))) {
        throw new Error('Acción solo para administradores.')
      }

      const def = findQuery(data.id)
      if (!def) {
        throw new Error(`Consulta desconocida: ${data.id}`)
      }

      const days = clampDays(data.days ?? 7)
      const key = cacheKey({
        id: data.id,
        days,
        event: data.event,
        eventB: data.eventB,
      })
      const cached = readCache(key)
      if (cached) return cached

      const env = resolveEnv()
      if (!env) {
        const result: AnalyticsQueryResult = {
          id: def.id,
          columns: def.columns,
          rows: [],
          elapsedMs: 0,
          cached: false,
          warning:
            'Analítica no configurada. Faltan los secrets CF_ACCOUNT_ID y CF_ANALYTICS_TOKEN en el worker (wrangler secret put …). Mientras tanto, usa `npm run analytics:dashboard` para el dashboard local.',
        }
        // Don't cache the "not configured" sentinel — once the operator adds
        // the secrets we want the next request to actually try.
        return result
      }

      const ctx: QueryContext = {
        days,
        event: data.event,
        eventB: data.eventB,
      }
      const sql = def.sql(ctx).trim()
      const startedAt = Date.now()
      const result = await runSql(env, sql)
      const elapsedMs = Date.now() - startedAt

      if (result.errors && result.errors.length > 0) {
        throw new Error(result.errors[0]?.message ?? 'sql error')
      }

      const value: AnalyticsQueryResult = {
        id: def.id,
        columns: def.columns,
        rows: result.data ?? [],
        elapsedMs,
        cached: false,
      }
      writeCache(key, value)
      return value
    }),
  )
