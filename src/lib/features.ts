// ponytail: client-side feature flags. Read directly via import.meta.env
// (mirrors src/lib/sentry.ts' VITE_SENTRY_DSN pattern — NOT through @t3-oss/env,
// because these are simple booleans, not validated URLs). VITE_ vars are baked
// at build time, so flipping requires a redeploy — pair each with a server-side
// wrangler secret of the same intent and set both together when toggling.
//
// Why a separate file: importing these from one place keeps the flag names
// consistent across surfaces (profile CTA, panel card, route beforeLoad).

// ponytail: video-call scheduling (1.25.0). Server-side counterpart is the
// APPOINTMENTS_ENABLED wrangler secret (read via appointmentsEnabled() in
// src/server/appointments.ts). The server fns are the real gate; this client
// flag only hides the UI so there's no broken button when the feature is off.
const APPOINTMENTS_ENABLED =
  String(import.meta.env.VITE_APPOINTMENTS_ENABLED ?? '').toLowerCase() ===
    'true' ||
  String(import.meta.env.VITE_APPOINTMENTS_ENABLED ?? '') === '1'

export { APPOINTMENTS_ENABLED }
