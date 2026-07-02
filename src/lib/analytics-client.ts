import { track as trackServerFn } from '#/server/analytics'
import type { TrackedEvent } from '#/server/analytics'

// ============================================================================
// Client analytics helper — anonId + typed track()
// ============================================================================
// Pairs with src/server/analytics.ts (the catalog + track server fn). The
// client resolves an actorId (anonId from localStorage, or userId if known),
// then calls the auth-free track() server fn, which writes to Analytics Engine.
//
// Privacy notes:
//  - anonId is a random UUID in localStorage (no cookie, no fingerprint). It
//    exists only to stitch an anonymous funnel (landing → directory → contact)
//    into one journey. Clearing site data resets it.
//  - The autochequeo promises on-screen that answers never leave the device.
//    This helper is used there only for *interaction* events (start, band
//    result), never for K6 answers.
// ============================================================================

const ANON_ID_KEY = 'pav_anon_id'

/**
 * Persistent per-device anonymous ID. Generated once on first call, stored in
 * localStorage. Used as the Analytics Engine index1 so an anonymous visitor's
 * journey (landing → modality → directory → contact) can be reconstructed.
 * When the user logs in, the caller should prefer their userId — the anonId
 * remains only as a back-fill link to the pre-login funnel.
 */
export function getAnonId(): string {
  if (typeof window === 'undefined') return 'ssr'
  try {
    let id = window.localStorage.getItem(ANON_ID_KEY)
    if (!id) {
      // ponytail: crypto.randomUUID is available in all evergreen browsers over
      // https/wrangler. Fallback to a Math.random UUID for the rare insecure
      // context (older WebView).
      id =
        typeof crypto !== 'undefined' && 'randomUUID' in crypto
          ? crypto.randomUUID()
          : `a-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
      window.localStorage.setItem(ANON_ID_KEY, id)
    }
    return id
  } catch {
    // localStorage disabled (private mode / storage quota) — ephemeral fallback.
    return 'anon'
  }
}

type Category = 'public' | 'auth' | 'pro' | 'admin'

type TrackArgs = {
  event: TrackedEvent
  category: Category
  /** Route path, e.g. '/ayuda/profesionales'. Defaults to current pathname. */
  route?: string
  param1?: string
  param2?: string
  param3?: string
  value?: number
  /**
   * Override the actorId. Defaults to anonId. Pass a known userId for authed
   * users so their journey stitches across the login boundary.
   */
  actorId?: string
}

/**
 * Fire-and-forget client tracker. Never awaited, never throws, and safe to
 * call during render (it self-guards SSR). Calls the auth-free track() server
 * fn, which validates the event against the catalog and writes to Analytics
 * Engine. A failed/slow track must never block UI — the returned promise is
 * intentionally dropped by callers.
 *
 * Usage:
 *   track({ event: 'directory_filter', category: 'public', param1: 'estado', param2: 'Zulia' })
 */
export function track(args: TrackArgs): void {
  // ponytail: guard SSR — the helper can be called from component bodies that
  // SSR-render. On the server there's no window/anonId and the server fn POST
  // would be a no-op anyway; skip cleanly.
  if (typeof window === 'undefined') return
  try {
    void trackServerFn({
      data: {
        event: args.event,
        category: args.category,
        actorId: args.actorId ?? getAnonId(),
        route: args.route ?? window.location.pathname,
        param1: args.param1,
        param2: args.param2,
        param3: args.param3,
        value: args.value,
      },
    })
  } catch {
    /* swallow — analytics must never break the feature */
  }
}
