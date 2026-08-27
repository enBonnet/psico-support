// Client-safe event catalog for Analytics Engine tracking.
// ponytail: lives OUTSIDE src/server/ because client modules
// (analytics-client.ts, admin/analitica.tsx) consume the array/type as VALUES
// — importing them from src/server/analytics.ts would keep that server module
// (and its #/db import chain) in every client bundle. This module must stay
// dependency-free (no zod, no db) so both environments can load it trivially.
// The column contract lives in src/server/analytics.ts; event names here are
// the immutable contract.

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
  // directory_retry: fired when a help-seeker taps "Reintentar" after a cold-load
  // failure of listProfessionals (e.g. transient D1 DO reset, WEB-3). Gauges how
  // often the recovery state is reached in prod and whether retries help.
  'directory_retry',
  // especifica_view: /ayuda/especifica triage page mounted. The funnel entry
  // for help-seekers who know the specific area they need (duelo, trauma,
  // suicidio, etc.). Funnel:
  //   cta_click(help_especifica) → especifica_view → especifica_select →
  //   directory_view (with specialized= set) → pro_contact.
  // Compare against the general funnel (cta_click(help_now) →
  // pro_contact_help_now) to see which path converts better for sensitive areas.
  'especifica_view',
  // especifica_select: a specialized-area button tapped on the triage page.
  // param1 = the area tag (matches SPECIALIZED_AREA_OPTIONS). Lets us see
  // which areas drive the most demand (Suicidio vs Duelo vs Trauma, etc.).
  'especifica_select',
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
  // audio_play_category: a visitor opens the viewer from a category section on
  // /apoyo. param1 = category slug (matches audio_categories.slug). Lets us see
  // which categories actually drive playback (children's content vs tales vs
  // crisis, etc.) distinct from the catch-all audio_play_all.
  'audio_play_category',
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
  // --- Scheduled video-call appointments (1.25.0) ---
  // appointment_intent: a help-seeker taps "Agendar videollamada" on a pro's
  // profile (the booking-funnel entry). param1=proId. category=public (fired
  // client-side; the visitor may not be logged in yet). Lets us measure the
  // drop-off from intent → booked (a booking requires signup, so the gap is
  // expected but informative).
  'appointment_intent',
  // appointment_booked: a slot was successfully booked (server-fired from
  // createAppointment, NOT from the auth-free track() fn — booking mutates D1
  // and is therefore session-gated; the event is written via writeEvent()
  // directly with the authenticated userId as param3, mirroring how
  // pro_contact_* events get param3 enriched server-side). param1=proId,
  // param2=durationMin (e.g. "45"), param3=clientUserId.
  'appointment_booked',
  // appointment_cancelled: an appointment moved to 'cancelled' by either party
  // (server-fired from cancelAppointment). param1=proId,
  // param2=cancelledByRole ('client'|'pro'), param3=clientUserId.
  'appointment_cancelled',
  // --- Admin (admin) ---
  'admin_pro_review',
  'admin_pro_toggle_service',
  'admin_audio_review',
  'admin_user_promote',
  // admin_section_view: fired client-side from the /admin layout route
  // (src/routes/admin.tsx) whenever the admin navigates between sections.
  // param1 = the section path (e.g. '/admin/profesionales'), route = pathname.
  // Gives real visibility into which sections admins actually use vs. which
  // gather dust. Fire-and-forget (gotcha #10). The whole /admin branch is
  // admin-gated by the layout's beforeLoad, so the actorId is always a real
  // userId here.
  'admin_section_view',
  // --- Virality / PWA (public) ---
  'install_prompt_trigger',
  'install_prompt_dismiss',
  'app_installed',
  'social_share',
  // social_profile_click: a visitor taps one of the app's own social profile
  // links on /enlaces (the link-in-bio page). param1 = platform slug
  // ('instagram' | 'tiktok' | 'x'). Distinct from social_share (which is about
  // a visitor sharing the SITE outbound) and profile_social_click (a pro's
  // socials on their profile) — this measures follow-intent on the project's
  // own accounts. category=public (fired client-side, no session needed).
  'social_profile_click',
] as const

export type TrackedEvent = (typeof TRACKED_EVENTS)[number]
