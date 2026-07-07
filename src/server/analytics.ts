import * as Sentry from '@sentry/tanstackstart-react'
import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'

import { getCloudflareEnv, getDb } from '#/db'
import { professionals } from '#/db/schema'
import { eq, sql } from 'drizzle-orm'

// ============================================================================
// Analytics Engine — event catalog & track() server fn
// ============================================================================
// Single dataset (psico_events), fixed-position columns:
//   index1  = actorId    (anonId | userId | proId)
//   blob1   = event      (canonical name, see TRACKED_EVENTS below)
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
// their contract lives in TRACKED_EVENTS below.
// ============================================================================

/**
 * Every tracked event. Keep this in sync with the catalog in AGENTS.md (or the
 * analytics doc) — this union is the single source of truth for what a valid
 * event name is. The client helper imports this type so typos are caught at
 * compile time.
 */
export const TRACKED_EVENTS = [
  // --- Help-seeker funnel (public) ---
  'landing_view',
  'cta_click',
  'modality_select',
  'vanity_redirect',
  'directory_view',
  'directory_filter',
  'directory_search',
  'directory_clear',
  'directory_page',
  'profile_view',
  // pro_contact: param1=proId, param2=source (directory|profile), param3=userId (server-resolved)
  'pro_contact',
  // pro_contact_random: param1=proId, param2=modality, param3=userId (server-resolved).
  // Directory's "Contactar al azar" button only. The landing CTA used to fire
  // this too, but that conflated the two entry points — use pro_contact_help_now
  // for the landing so attribution stays clean (gotcha #10: immutable contract).
  'pro_contact_random',
  // pro_contact_help_now: param1=proId, param2=modality, param3=userId (server-resolved).
  // Landing's "Necesito ayuda ahora" auto-pick success. Distinct from
  // pro_contact_random so the new direct-WhatsApp funnel can be measured in
  // isolation: cta_click(help_now) → pro_contact_help_now (success) |
  // cta_click(help_now_fallback) (no pro contactable). Total WhatsApp contacts
  // across all entry points = SUM(pro_contact) + SUM(pro_contact_random)
  // + SUM(pro_contact_help_now) + SUM(pro_contact_ahora).
  'pro_contact_help_now',
  // ahora_view: /ahora route mounted (funnel entry for the share-link
  // auto-connect route). Funnel attribution in SQL:
  //   SELECT blob1, SUM(_sample_interval * double1)
  //   FROM psico_events
  //   WHERE blob1 IN ('ahora_view','pro_contact_ahora')
  //   GROUP BY blob1
  // Drop-off = ahora_view − pro_contact_ahora (includes "no pro contactable",
  // popup-blocked, and abandon).
  'ahora_view',
  // pro_contact_ahora: param1=proId, param2=modality, param3=userId (server-resolved).
  // /ahora route's WhatsApp-opened success. Kept distinct from
  // pro_contact_help_now (the landing's auto-pick) so the share-link funnel
  // can be measured in isolation from the landing funnel.
  'pro_contact_ahora',
  'profile_share',
  'profile_social_click',
  // --- Auth & professional acquisition (auth) ---
  'pro_registro_view',
  'pro_registro_step_continue',
  'pro_terms_accept',
  'pro_register_submit',
  'auth_signup',
  'auth_signin',
  'auth_signout',
  'password_reset_request',
  'password_reset_submit',
  // --- Professional panel engagement (pro) ---
  'panel_view',
  'availability_mode_change',
  'availability_save',
  'pro_profile_save',
  'pro_avatar_upload',
  'pro_avatar_remove',
  'pro_supportdoc_add',
  'pro_supportdoc_remove',
  'pro_socials_save',
  'pro_audio_submit',
  'pro_audio_delete',
  'panel_delete_account',
  // --- Voces que acompañan + autocuidado (public) ---
  'apoyo_view',
  'audio_play_all',
  'audio_play_pro',
  'audio_attribution_click',
  'audio_close',
  'recursos_tool_view',
  'autochequeo_start',
  'autochequeo_gate_response',
  'autochequeo_complete',
  'respirar_start',
  'enraizamiento_step',
  'crisis_cta_click',
  'pro_cta_click',
  // --- Admin (admin) ---
  'admin_pro_review',
  'admin_pro_toggle_service',
  'admin_audio_review',
  'admin_user_promote',
  // --- Virality / PWA (public) ---
  'install_prompt_trigger',
  'install_prompt_dismiss',
  'app_installed',
  'social_share',
] as const

export type TrackedEvent = (typeof TRACKED_EVENTS)[number]

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
 */
async function bumpContactCount(proId: string): Promise<void> {
  const id = Number(proId)
  if (!Number.isFinite(id) || id <= 0) return
  const db = getDb()
  await db
    .update(professionals)
    .set({ contactCount: sql`${professionals.contactCount} + 1` })
    .where(eq(professionals.id, id))
}

/**
 * Write a single data point to Analytics Engine. Fire-and-forget — never
 * awaited by callers (writeDataPoint returns void). Silently no-ops when the
 * binding is absent (dev without `wrangler dev`, tests) so analytics never
 * breaks app functionality. Failed writes are invisible by design (see
 * Analytics Engine gotchas: writeDataPoint can fail silently — check
 * `npx wrangler tail` for sampling/error signals).
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
      // ponytail: bump the denormalized contact counter for load-balanced
      // random picks. Best-effort like analytics itself — a missed bump only
      // slightly skews the weights, never breaks a contact (gotcha #10).
      // Same event-name gate as enrichProContactEvent so non-contact events
      // skip it. param1 is the proId on all pro_contact* events.
      if (isProContactEvent(enriched) && enriched.param1) {
        await bumpContactCount(enriched.param1).catch(() => {})
      }
      return { ok: true }
    }),
  )
