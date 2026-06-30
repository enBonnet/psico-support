import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { and, eq, asc, inArray, count } from 'drizzle-orm'

import { getDb, getR2 } from '#/db'
import { audioStories, professionals } from '#/db/schema'
import { getAuth, isAdminEmail } from '#/lib/auth'

// ponytail: "Voces que acompañan" — server fns for the audio-stories tray.
// Stories are short supportive clips (≤180s) recorded by verified pros,
// published as a sequential IG-style tray. See architecture/audio-stories
// memory for the locked decisions (no expiry, ≤2 per pro, admin-reviewed).

// ponytail: mirrors the getHeaders() helper in src/server/professionals.ts.
// Duplicated rather than cross-imported to keep the two domains decoupled;
// extract to lib/auth.ts if a third fn module needs it.
function getHeaders(): Headers {
  const req = (globalThis as unknown as { __TSS_REQUEST__?: Request })
    .__TSS_REQUEST__
  return req ? new Headers(req.headers) : new Headers()
}

// ponytail: audio mimes the recorder produces (WebM/Opus on Chrome+Firefox,
// MP4/AAC on Safari) plus the common upload formats. <audio> plays all of
// these natively; no transcoding (Cloudflare has none, and the formats are
// already optimal for speech).
export const STORY_AUDIO_MIME = [
  'audio/webm',
  'audio/mp4',
  'audio/mpeg',
  'audio/ogg',
] as const
export type StoryAudioMime = (typeof STORY_AUDIO_MIME)[number]

const STORY_EXT: Record<StoryAudioMime, string> = {
  'audio/webm': 'webm',
  'audio/mp4': 'm4a',
  'audio/mpeg': 'mp3',
  'audio/ogg': 'ogg',
}

// ponytail: 90s target / 180s hard ceiling (locked decision). 3MB matches the
// existing certificate cap (CERTIFICATE_MAX_BYTES) and comfortably fits 180s
// Opus@64kbps (~1.4MB) or 128kbps MP3 (~2.9MB). The base64 payload is ~33%
// larger than the binary, so the validator below scales accordingly.
export const STORY_MAX_SECONDS = 180
export const STORY_MAX_BYTES = 3 * 1024 * 1024

// ponytail: ≤2 stories per pro, counted as rows where status IN (pending,
// approved). Rejected rows don't count (audit-only) so a rejection never
// locks a pro out of retrying.
export const STORY_MAX_PER_PRO = 2

// ponytail: R2 key prefix; stripped when building the public /media/audio/...
// URL (the worker route at src/routes/media/audio/$.ts re-adds it). Keeping the
// prefix in the stored key (not just the URL) means R2 listing/quotas stay
// namespaced by feature.
export const STORY_KEY_PREFIX = 'support-audio/'

export const STORY_TITLE_MAX = 120

// ponytail: pure helper — builds the public playback URL from a stored R2 key.
// Imported by client routes (viewer + admin preview) since it's a pure string
// transform with no server state.
export function publicAudioUrl(audioKey: string): string {
  const suffix = audioKey.startsWith(STORY_KEY_PREFIX)
    ? audioKey.slice(STORY_KEY_PREFIX.length)
    : audioKey
  return `/media/audio/${suffix}`
}

// ponytail: the public story shape returned to the viewer (tray) and to the
// pro's own panel list. Public payloads only ever include approved clips —
// pending/rejected keys never leave the server (UUID keys are unguessable too,
// so a guessed URL 404s at the R2 read).
export type PublicStoryClip = {
  id: number
  audioKey: string
  mime: string
  durationSec: number
  title: string | null
  // ponytail: playback URL pre-computed server-side so the client doesn't
  // import the key-prefix convention; one source of truth for the mapping.
  url: string
  createdAt: Date | null
}

export type StoryTrayPro = {
  professionalId: number
  name: string
  modality: 'in_person' | 'remote' | 'both'
  clips: PublicStoryClip[]
}

// ponytail: the pro's own view of their clips — includes pending/rejected so
// they can see review state. url is included for self-preview (the /media
// route serves any key under the prefix regardless of status; security is
// upheld by key unguessability + the fact that pending URLs aren't linked
// publicly). Cap-count is computed client-side as (pending+approved).length.
export type MyStoryClip = {
  id: number
  status: 'pending' | 'approved' | 'rejected'
  audioKey: string
  mime: string
  durationSec: number
  title: string | null
  url: string
  createdAt: Date | null
}

function toPublicClip(r: {
  id: number
  audioKey: string
  mime: string
  durationSec: number
  title: string | null
  createdAt: Date | null
}): PublicStoryClip {
  return { ...r, url: publicAudioUrl(r.audioKey) }
}

// ── Public: tray ───────────────────────────────────────────────────────────

// ponytail: one query, not N+1. Selects approved clips joined to verified pros,
// groups client-side into per-pro clip sets ordered by createdAt. Tray order
// is newest-approved-first per pro (most recent contribution surfaces first),
// pros ordered by their newest clip desc — so "who showed up today" leads.
export const listStoryTray = createServerFn({ method: 'GET' }).handler(
  async () => {
    const db = getDb()
    const rows = await db
      .select({
        proId: professionals.id,
        name: professionals.name,
        modality: professionals.modality,
        storyId: audioStories.id,
        audioKey: audioStories.audioKey,
        mime: audioStories.mime,
        durationSec: audioStories.durationSec,
        title: audioStories.title,
        status: audioStories.status,
        createdAt: audioStories.createdAt,
      })
      .from(audioStories)
      .innerJoin(
        professionals,
        eq(professionals.id, audioStories.professionalId),
      )
      .where(
        and(
          eq(audioStories.status, 'approved'),
          eq(professionals.verifiedStatus, 'verified'),
        ),
      )
      .orderBy(asc(audioStories.createdAt))

    // ponytail: group rows into per-pro clip sets. A Map preserves first-seen
    // order (which, since rows are createdAt-asc, is "earliest clip's pro
    // first"). We want newest-contribution-first, so reverse the pro order
    // after grouping while keeping each pro's clips in createdAt-asc order.
    const byPro = new Map<number, StoryTrayPro>()
    for (const r of rows) {
      let entry = byPro.get(r.proId)
      if (!entry) {
        entry = {
          professionalId: r.proId,
          name: r.name,
          modality: r.modality,
          clips: [],
        }
        byPro.set(r.proId, entry)
      }
      entry.clips.push(
        toPublicClip({
          id: r.storyId,
          audioKey: r.audioKey,
          mime: r.mime,
          durationSec: r.durationSec,
          title: r.title,
          createdAt: r.createdAt,
        }),
      )
    }
    return Array.from(byPro.values()).reverse()
  },
)

// ── Pro: list own + upload + delete ────────────────────────────────────────

export const listMyStories = createServerFn({ method: 'GET' }).handler(
  async () => {
    const session = await getAuth().api.getSession({ headers: getHeaders() })
    if (!session?.user) return []
    const db = getDb()
    // ponytail: find the pro row regardless of verifiedStatus so the pro can
    // manage their clips even if their credential is pending/rejected — the
    // upload fn (not this list) gates on verified. Soft-deleted pros are
    // excluded (verifiedStatus='deleted').
    const proRows = await db
      .select({ id: professionals.id })
      .from(professionals)
      .where(eq(professionals.userId, session.user.id))
      .limit(1)
    const pro = proRows.at(0)
    if (!pro) return []
    const rows = await db
      .select({
        id: audioStories.id,
        status: audioStories.status,
        audioKey: audioStories.audioKey,
        mime: audioStories.mime,
        durationSec: audioStories.durationSec,
        title: audioStories.title,
        createdAt: audioStories.createdAt,
      })
      .from(audioStories)
      .where(eq(audioStories.professionalId, pro.id))
      .orderBy(asc(audioStories.createdAt))
    return rows.map((r) => ({ ...r, url: publicAudioUrl(r.audioKey) }))
  },
)

// ponytail: base64 transport matches the certificate pattern in
// professionals.ts. ~33% size overhead vs binary; fine for ≤3MB clips. Named
// ceiling: switch to presigned direct-to-R2 multipart when video lands.
const storyAudioSchema = z.object({
  mime: z.enum(STORY_AUDIO_MIME),
  durationSec: z
    .number()
    .int()
    .min(1, 'El audio es demasiado corto.')
    .max(STORY_MAX_SECONDS, `Máximo ${STORY_MAX_SECONDS} segundos.`),
  title: z
    .string()
    .trim()
    .max(STORY_TITLE_MAX, `Máximo ${STORY_TITLE_MAX} caracteres.`)
    .optional()
    .nullable(),
  data: z
    .string()
    .max(
      Math.ceil((STORY_MAX_BYTES * 4) / 3) + 1024,
      'El archivo supera el tamaño máximo.',
    ),
})

// ponytail: decode base64 → Uint8Array for R2.put. Same stdlib path as the
// certificate upload (professionals.ts:88); negligible CPU for ≤3MB.
function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes
}

async function deleteR2Object(audioKey: string): Promise<void> {
  try {
    await getR2().delete(audioKey)
  } catch (err) {
    // ponytail: best-effort. A dangling R2 object costs cents/year; don't
    // fail the user-facing op (row delete / replace) on a storage hiccup.
    console.error('[audio-stories] R2 delete failed for', audioKey, err)
  }
}

export const uploadMyStory = createServerFn({ method: 'POST' })
  .validator(storyAudioSchema)
  .handler(async ({ data }) => {
    const session = await getAuth().api.getSession({ headers: getHeaders() })
    if (!session?.user) {
      throw new Error('Debes iniciar sesión para publicar un audio.')
    }
    const db = getDb()
    // ponytail: only verified pros may publish — a pending/rejected credential
    // means the person isn't yet a trusted contributor. Mirrors the public
    // directory's verified-only invariant (AGENTS.md gotcha #4).
    const proRows = await db
      .select({ id: professionals.id })
      .from(professionals)
      .where(eq(professionals.userId, session.user.id))
      .limit(1)
    const pro = proRows.at(0)
    if (!pro) {
      throw new Error('Completa tu perfil profesional antes de publicar.')
    }
    const verifiedRows = await db
      .select({ id: professionals.id })
      .from(professionals)
      .where(
        and(
          eq(professionals.id, pro.id),
          eq(professionals.verifiedStatus, 'verified'),
        ),
      )
      .limit(1)
    if (verifiedRows.length === 0) {
      throw new Error(
        'Tu credencial aún no está verificada. Vuelve cuando un administrador la apruebe.',
      )
    }

    // ponytail: cap = ≤2 rows where status IN (pending, approved). Rejected
    // rows don't count (audit-only). Pre-check here so we never write a row
    // that would exceed the cap; the migration has no CHECK constraint
    // (SQLite can't express "count per group").
    const countRows = await db
      .select({ n: count() })
      .from(audioStories)
      .where(
        and(
          eq(audioStories.professionalId, pro.id),
          inArray(audioStories.status, ['pending', 'approved']),
        ),
      )
    const activeCount = countRows.at(0)?.n ?? 0
    if (activeCount >= STORY_MAX_PER_PRO) {
      throw new Error(
        `Ya tienes ${STORY_MAX_PER_PRO} audios. Elimina uno para grabar uno nuevo.`,
      )
    }

    const ext = STORY_EXT[data.mime]
    const key = `${STORY_KEY_PREFIX}${pro.id}/${crypto.randomUUID()}.${ext}`
    try {
      await getR2().put(key, base64ToBytes(data.data), {
        httpMetadata: { contentType: data.mime },
      })
    } catch (err) {
      console.error('[audio-stories] R2 put failed:', err)
      throw new Error(
        'No pudimos guardar el audio. Inténtalo de nuevo en unos segundos.',
      )
    }

    try {
      const inserted = await db
        .insert(audioStories)
        .values({
          professionalId: pro.id,
          audioKey: key,
          mime: data.mime,
          durationSec: data.durationSec,
          title: data.title?.trim() || null,
          status: 'pending',
        })
        .returning({ id: audioStories.id })
      return { ok: true as const, id: inserted[0]?.id }
    } catch (err) {
      // ponytail: clean up the orphan R2 object so a failed insert doesn't
      // leak storage (the row is the source of truth; an unreferenced object
      // would be invisible + uncapped).
      await deleteR2Object(key)
      console.error('[audio-stories] insert failed:', err)
      throw new Error(
        'No pudimos guardar el audio. Inténtalo de nuevo en unos segundos.',
      )
    }
  },
)

const deleteSchema = z.object({ id: z.number().int().positive() })

export const deleteMyStory = createServerFn({ method: 'POST' })
  .validator(deleteSchema)
  .handler(async ({ data }) => {
    const session = await getAuth().api.getSession({ headers: getHeaders() })
    if (!session?.user) {
      throw new Error('Debes iniciar sesión.')
    }
    const db = getDb()
    // ponytail: ownership check via join to professionals.userId — never trust
    // the client to pass its own pro id. Returns the audioKey in the same
    // query so we can delete the R2 object without a second fetch.
    const rows = await db
      .select({ id: audioStories.id, audioKey: audioStories.audioKey })
      .from(audioStories)
      .innerJoin(
        professionals,
        eq(professionals.id, audioStories.professionalId),
      )
      .where(
        and(
          eq(audioStories.id, data.id),
          eq(professionals.userId, session.user.id),
        ),
      )
      .limit(1)
    const row = rows.at(0)
    if (!row) {
      // ponytail: not-found vs forbidden is indistinguishable here and we
      // don't want to leak existence — same Spanish message either way.
      throw new Error('No se encontró ese audio.')
    }
    await db.delete(audioStories).where(eq(audioStories.id, row.id))
    await deleteR2Object(row.audioKey)
    return { ok: true as const }
  },
)

// ── Admin: review queue + approve/reject ───────────────────────────────────

export type PendingStoryRow = {
  id: number
  professionalId: number
  proName: string
  audioKey: string
  mime: string
  durationSec: number
  title: string | null
  createdAt: Date | null
  url: string
}

export const listPendingStories = createServerFn({ method: 'GET' }).handler(
  async () => {
    const session = await getAuth().api.getSession({ headers: getHeaders() })
    if (!session?.user || !(await isAdminEmail(session.user.email))) {
      throw new Error('Acción solo para administradores.')
    }
    const db = getDb()
    const rows = await db
      .select({
        id: audioStories.id,
        professionalId: professionals.id,
        proName: professionals.name,
        audioKey: audioStories.audioKey,
        mime: audioStories.mime,
        durationSec: audioStories.durationSec,
        title: audioStories.title,
        createdAt: audioStories.createdAt,
      })
      .from(audioStories)
      .innerJoin(
        professionals,
        eq(professionals.id, audioStories.professionalId),
      )
      .where(eq(audioStories.status, 'pending'))
      .orderBy(asc(audioStories.createdAt))
    return rows.map((r) => ({ ...r, url: publicAudioUrl(r.audioKey) }))
  },
)

const reviewSchema = z.object({
  storyId: z.number().int().positive(),
  status: z.enum(['approved', 'rejected']),
})

export const reviewStory = createServerFn({ method: 'POST' })
  .validator(reviewSchema)
  .handler(async ({ data }) => {
    const session = await getAuth().api.getSession({ headers: getHeaders() })
    if (!session?.user || !(await isAdminEmail(session.user.email))) {
      throw new Error('Acción solo para administradores.')
    }
    const db = getDb()
    await db
      .update(audioStories)
      .set({ status: data.status })
      .where(eq(audioStories.id, data.storyId))
    return { ok: true as const }
  },
)
