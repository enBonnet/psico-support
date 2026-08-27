// Client-safe professional constants. Imported as VALUES by client routes and
// components (directory filters, triage, avatar URLs), so this module must
// stay dependency-free — importing them from src/server/professionals.ts kept
// that server module's whole `#/db` import chain alive inside browser bundles.
// The server module re-exports these names for internal/schema use; single
// source of truth lives HERE.

// ponytail: sensitive specialized areas — the "áreas específicas" axis. These
// are areas where the help-seeker's need is delicate (suicide, trauma, duelo,
// neurodivergencia, etc.) and where pros can opt into an EXCLUSIVE visibility
// mode: hidden from default directory browse + random pick, surfaced only when
// a help-seeker filters by one of these areas (the /ayuda/especifica triage).
// JSON array + LIKE filter.
export const SPECIALIZED_AREA_OPTIONS = [
  'Duelo',
  'Personas Cuidadoras',
  'Personas Neurodivergentes',
  'Oncológica',
  'Diversidad funcional',
  'Suicidio',
  'Acompañamiento y fortalecimiento laboral',
  'Trauma y Estrés post Traumático',
] as const
export type SpecializedArea = (typeof SPECIALIZED_AREA_OPTIONS)[number]

// R2 key prefix for public avatars; stripped when building /media/avatar/...
// URLs (the worker route at src/routes/media/avatar/$.ts re-adds it). Mirrors
// the audio key-prefix convention (STORY_KEY_PREFIX) in audio-stories.ts.
export const AVATAR_KEY_PREFIX = 'avatars/'

// ponytail: pure helper — builds the public playback URL from a stored R2 key.
// Used by client routes (profile + tray) and admin surfaces alike. Mirrors
// publicCertificateUrl in src/server/professionals.ts (that one stays there:
// it consumes admin-only certificate keys and has no client callers).
export function publicAvatarUrl(avatarKey: string): string {
  const suffix = avatarKey.startsWith(AVATAR_KEY_PREFIX)
    ? avatarKey.slice(AVATAR_KEY_PREFIX.length)
    : avatarKey
  return `/media/avatar/${suffix}`
}
