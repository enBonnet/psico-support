import * as Sentry from '@sentry/tanstackstart-react'
import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'

import { getCloudflareEnv, getDb } from '#/db'
import { professionals } from '#/db/schema'
import { eq, sql } from 'drizzle-orm'

import { TRACKED_EVENTS } from '#/lib/analytics-events'

// ponytail: the catalog moved to #/lib/analytics-events (client-safe: no zod,
// no db) so client modules can import TRACKED_EVENTS/TrackedEvent without
// dragging this server module — and its #/db chain — into browser bundles.
// Re-exported here for server-side convenience; nothing in the immutable
// column contract changed.
export { TRACKED_EVENTS, type TrackedEvent } from '#/lib/analytics-events'

// ============================================================================
// Analytics Engine — event catalog & track() server fn
// ============================================================================
// Single dataset (psico_events), fixed-position columns:
//   index1  = actorId    (anonId | userId | proId)
//   blob1   = event      (canonical name — see #/lib/analytics-events)
//   blob2   = category   (public | auth | pro | admin)
//   blob3   = route      (path where it occurred, e.g. '/ayuda/profesionales')
//   blob4   = param1     (meaning depends on event — documented in the catalog)
//   blob5   = param2
//   blob6   = param3
//   double1 = count      (almost always 1 — useful for SUM in aggregations)
//   double2 = value      (duration | resultCount | pageNumber | band...)
//
// Positions are IMMUTABLE: renaming an event or shifting a param's slot breaks
// historical queries. Add new events freely; never change an existing one.
// param1/2/3 are intentionally overloaded (different meaning per event) —
// their contract lives in TRACKED_EVENTS (#/lib/analytics-events).
// ============================================================================

const eventSchema = z.enum(TRACKED_EVENTS)
const categorySchema = z.enum(['public', 'auth', 'pro', 'admin'])

// ponytail: the shape the client track() helper sends. actorId is resolved
// client-side (anonId from localStorage, or userId from session) and passed
// up here so the server fn stays auth-free — anonymous visitors can track
// without a session. route/params/value are all optional.
const trackInputSchema = z.object({
  event: eventSchema,
  category: categorySchema,
  actorId: z.string().max(128),
  route: z.string().max(256).optional(),
  param1: z.string().max(128).optional(),
  param2: z.string().max(128).optional(),
  param3: z.string().max(128).optional(),
  value: z.number().finite().optional(),
})

export type TrackInput = z.infer<typeof trackInputSchema>

/** Server-side vanity-route hit (no client mount). */
export function trackVanityRedirect(vanity: string, route: string): void {
  writeEvent({
    event: 'vanity_redirect',
    category: 'public',
    actorId: 'anonymous',
    route,
    param1: vanity,
  })
}

/** Resolve the platform user id for a professional row (analytics only). */
async function userIdForPro(proId: string): Promise<string | undefined> {
  const id = Number(proId)
  if (!Number.isFinite(id) || id <= 0) return undefined
  try {
    const db = getDb()
    const row = await db
      .select({ userId: professionals.userId })
      .from(professionals)
      .where(eq(professionals.id, id))
      .limit(1)
    return row[0]?.userId
  } catch {
    return undefined
  }
}

/** Whether an event represents a WhatsApp contact to a professional. */
function isProContactEvent(data: TrackInput): boolean {
  return (
    data.event === 'pro_contact' ||
    data.event === 'pro_contact_random' ||
    data.event === 'pro_contact_help_now' ||
    data.event === 'pro_contact_ahora'
  )
}

async function enrichProContactEvent(data: TrackInput): Promise<TrackInput> {
  if (!isProContactEvent(data)) return data
  if (!data.param1) return data
  const userId = await userIdForPro(data.param1)
  return userId ? { ...data, param3: userId } : data
}

/**
 * Increment the denormalized contact counter used by weighted-random picks.
 * Best-effort like analytics itself — callers must `.catch(() => {})` so a
 * failed bump never breaks the feature it's instrumenting (gotcha #10). Uses
 * `contact_count + 1` SQL so concurrent contacts don't clobber each other.
 *
 * Exported (not inlined in pickRandomProfessional) so the bump stays colocated
 * with the other professionals-table writes in this module. Called from inside
 * pickRandomProfessional after the pick — NOT from the auth-free track() server
 * fn, because that would let an anonymous client drive D1 writes against any
 * proId it supplies (Copilot PR #29: load-balancing poisoning vector). The
 * picker is server-controlled, so the proId here is trusted.
 */
export async function bumpContactCount(proId: number): Promise<void> {
  if (!Number.isFinite(proId) || proId <= 0) return
  const db = getDb()
  await db
    .update(professionals)
    .set({ contactCount: sql`${professionals.contactCount} + 1` })
    .where(eq(professionals.id, proId))
}

/**
 * Write a single data point to Analytics Engine. Fire-and-forget — never
 * awaited by callers (writeDataPoint returns void). Silently no-ops when the
 * binding is absent (dev without `wrangler dev`, tests) so analytics never
 * breaks app functionality. Failed writes are invisible by design (see
 * Analytics Engine gotchas: writeDataPoint can fail silently — check
 * `pnpm exec wrangler tail` for sampling/error signals).
 *
 * Keep this function synchronous and never throw — a broken analytics write
 * must not break the feature it's instrumenting.
 */
export function writeEvent(input: TrackInput): void {
  const env = getCloudflareEnv()
  // ponytail: guard lets dev/test calls no-op instead of throwing. The
  // accessor getAnalytics() throws (loud) for direct server-side use; this
  // path is the quiet fallback for the fire-and-forget client track() pipe.
  if (!env?.ANALYTICS) return
  try {
    env.ANALYTICS.writeDataPoint({
      indexes: [input.actorId],
      blobs: [
        input.event,
        input.category,
        input.route ?? '',
        input.param1 ?? '',
        input.param2 ?? '',
        input.param3 ?? '',
      ],
      doubles: [1, input.value ?? 0],
    })
  } catch {
    /* swallow — analytics must never break the feature */
  }
}

/**
 * Public, auth-free server fn the client calls to track an event. Validates
 * the catalog (Zod) so typos/garbage don't pollute the dataset, then writes.
 * The response is a static 204-ish — the client never awaits meaningfully
 * (fire-and-forget POST).
 *
 * Intentionally NOT authenticated: the help-seeker funnel is fully anonymous,
 * and gating on session would drop every pre-login event. The actorId is
 * trusted from the client (anonId or userId); spoofing it only corrupts the
 * caller's own analytics, not anyone else's.
 */
export const track = createServerFn({ method: 'POST' })
  .validator(trackInputSchema)
  .handler(async ({ data }) =>
    Sentry.startSpan({ name: 'analytics track' }, async () => {
      const env = getCloudflareEnv()
      if (!env?.ANALYTICS) return { ok: true }
      const enriched = await enrichProContactEvent(data)
      writeEvent(enriched)
      // ponytail: track() stays strictly write-only to Analytics Engine — it
      // must NEVER mutate D1. The auth-free contract (gotcha #10) means a
      // client controls param1; if we wrote to D1 here, an attacker could
      // poison any pro's contact_count and tank their pick weight. The contact
      // counter is bumped from server-controlled pick paths only
      // (see pickRandomProfessional in src/server/professionals.ts).
      return { ok: true }
    }),
  )
