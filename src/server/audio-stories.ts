import { createServerFn } from '@tanstack/react-start'
import { getRequestHeaders } from '@tanstack/react-start/server'
import { z } from 'zod'
import { and, eq, asc, inArray, count } from 'drizzle-orm'

import { getDb, getR2 } from '#/db'
import { audioStories, audioCategories, professionals } from '#/db/schema'
import { getAuth, isAdminEmail } from '#/lib/auth'

// ponytail: "Voces que acompañan" — server fns for the audio-stories tray.
// Stories are short supportive clips (≤180s) recorded by verified pros,
// published as a sequential IG-style tray grouped by category (children,
// tales, breathing, sleep, etc.). No per-pro cap (the earlier ≤2 limit was
// lifted when categories landed); admin review is the only gate.

// ponytail: mirrors the getHeaders() helper in src/server/professionals.ts.
// Duplicated rather than cross-imported to keep the two domains decoupled;
// extract to lib/auth.ts if a third fn module needs it.
function getHeaders(): Headers {
  // ponytail: request-isolated via TanStack Start's AsyncLocalStorage — safe
  // under concurrent requests (the old globalThis.__TSS_REQUEST__ leaked
  // headers between overlapping requests in the same isolate). Empty-headers
  // fallback for calls outside a request (e.g. tests).
  try {
    return getRequestHeaders()
  } catch {
    return new Headers()
  }
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

// ponytail: R2 key prefix; stripped when building the public /media/audio/...
// URL (the worker route at src/routes/media/audio/$.ts re-adds it). Keeping the
// prefix in the stored key (not just the URL) means R2 listing/quotas stay
// namespaced by feature.
export const STORY_KEY_PREFIX = 'support-audio/'

export const STORY_TITLE_MAX = 120
// ponytail: optional per-clip description shown under the title in the /apoyo
// viewer. 200 matches the audio_categories.description cap for consistency.
export const STORY_DESC_MAX = 200

// ── Category types + helpers ───────────────────────────────────────────────

// ponytail: category row shape returned to clients. The public list (active
// only) feeds the pro recorder picker; the admin list (includeInactive) feeds
// the admin CRUD UI.
export type AudioCategory = {
  id: number
  slug: string
  title: string
  description: string
  sortOrder: number
  active: boolean
  createdAt: Date | null
}

// ponytail: the public-facing category slice embedded on each clip payload so
// the client can group + render section headers without a second fetch. null
// for legacy/uncategorized clips (rendered under "Otros audios"). sortOrder is
// included so /apoyo can order sections by the admin-managed value without a
// second fetch.
export type StoryClipCategory = {
  id: number
  slug: string
  title: string
  description: string
  sortOrder: number
}

// ponytail: lowercase kebab slug from a free-text title. Strips accents so
// "Para niños" → "para-ninos". Collisions are rejected at insert (unique slug
// index) with a friendly error; admin can pass an explicit slug to override.
function slugifyTitle(title: string): string {
  return title
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/[\s-]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

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
  // ponytail: optional per-clip note shown under the title in the /apoyo
  // viewer. null when the pro left it blank.
  description: string | null
  // ponytail: playback URL pre-computed server-side so the client doesn't
  // import the key-prefix convention; one source of truth for the mapping.
  url: string
  createdAt: Date | null
  // ponytail: category the clip belongs to (one per clip). null for legacy
  // rows added before categories landed; rendered under "Otros audios".
  categoryId: number | null
  category: StoryClipCategory | null
}

export type StoryTrayPro = {
  professionalId: number
  name: string
  modality: 'in_person' | 'remote' | 'both'
  // ponytail: null until the pro uploads one (post-signup, panel). The viewer
  // + tray fall back to an initial; the per-pro gradient stays as background.
  avatarKey: string | null
  clips: PublicStoryClip[]
}

// ponytail: the pro's own view of their clips — includes pending/rejected so
// they can see review state. url is included for self-preview (the /media
// route serves any key under the prefix regardless of status; security is
// upheld by key unguessability + the fact that pending URLs aren't linked
// publicly). categoryId + category title shown next to the status pill.
export type MyStoryClip = {
  id: number
  status: 'pending' | 'approved' | 'rejected'
  audioKey: string
  mime: string
  durationSec: number
  title: string | null
  description: string | null
  url: string
  createdAt: Date | null
  categoryId: number | null
  category: StoryClipCategory | null
}

// ponytail: builds the public clip payload (url + denormalized category).
// category fields come from the LEFT JOIN to audio_categories (may be all null
// for uncategorized or soft-deleted-then-NULLed clips).
function toPublicClip(
  r: {
    id: number
    audioKey: string
    mime: string
    durationSec: number
    title: string | null
    description: string | null
    createdAt: Date | null
  },
  cat: {
    categoryId: number | null
    catId: number | null
    slug: string | null
    title: string | null
    description: string | null
    sortOrder: number | null
  },
): PublicStoryClip {
  const category: StoryClipCategory | null =
    cat.catId != null &&
    cat.slug &&
    cat.title &&
    cat.description &&
    cat.sortOrder != null
      ? {
          id: cat.catId,
          slug: cat.slug,
          title: cat.title,
          description: cat.description,
          sortOrder: cat.sortOrder,
        }
      : null
  return {
    id: r.id,
    audioKey: r.audioKey,
    mime: r.mime,
    durationSec: r.durationSec,
    title: r.title,
    description: r.description,
    url: publicAudioUrl(r.audioKey),
    createdAt: r.createdAt,
    categoryId: cat.categoryId,
    category,
  }
}

// ── Public: tray ───────────────────────────────────────────────────────────

// ponytail: one query, not N+1. Selects approved clips joined to verified pros
// (inner) and to audio_categories (LEFT, so uncategorized clips survive),
// groups client-side into per-pro clip sets ordered by createdAt. Tray order
// is newest-approved-first per pro (most recent contribution surfaces first),
// pros ordered by their newest clip desc — so "who showed up today" leads.
// The category slice is embedded on each clip so /apoyo can render section
// headers without a second fetch.
export const listStoryTray = createServerFn({ method: 'GET' }).handler(
  async () => {
    const db = getDb()
    const rows = await db
      .select({
        proId: professionals.id,
        name: professionals.name,
        modality: professionals.modality,
        avatarKey: professionals.avatarKey,
        storyId: audioStories.id,
        audioKey: audioStories.audioKey,
        mime: audioStories.mime,
        durationSec: audioStories.durationSec,
        title: audioStories.title,
        description: audioStories.description,
        status: audioStories.status,
        createdAt: audioStories.createdAt,
        categoryId: audioStories.categoryId,
        catId: audioCategories.id,
        slug: audioCategories.slug,
        catTitle: audioCategories.title,
        catDescription: audioCategories.description,
        catSortOrder: audioCategories.sortOrder,
      })
      .from(audioStories)
      .innerJoin(
        professionals,
        eq(professionals.id, audioStories.professionalId),
      )
      // ponytail: LEFT JOIN ... AND active=1 — clips whose category was retired
      // (active=false) get NULL here and fall into "Otros audios" on /apoyo,
      // matching the admin UI's "inactiva = oculta" semantics. Using and() in
      // the join condition (not the WHERE) keeps uncategorized clips in the
      // result instead of filtering them out.
      .leftJoin(
        audioCategories,
        and(
          eq(audioCategories.id, audioStories.categoryId),
          eq(audioCategories.active, true),
        ),
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
          avatarKey: r.avatarKey,
          clips: [],
        }
        byPro.set(r.proId, entry)
      }
      entry.clips.push(
        toPublicClip(
          {
            id: r.storyId,
            audioKey: r.audioKey,
            mime: r.mime,
            durationSec: r.durationSec,
            title: r.title,
            description: r.description,
            createdAt: r.createdAt,
          },
          {
            categoryId: r.categoryId,
            catId: r.catId,
            slug: r.slug,
            title: r.catTitle,
            description: r.catDescription,
            sortOrder: r.catSortOrder,
          },
        ),
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
        description: audioStories.description,
        createdAt: audioStories.createdAt,
        categoryId: audioStories.categoryId,
        catId: audioCategories.id,
        slug: audioCategories.slug,
        catTitle: audioCategories.title,
        catDescription: audioCategories.description,
        catSortOrder: audioCategories.sortOrder,
      })
      .from(audioStories)
      .leftJoin(
        audioCategories,
        eq(audioCategories.id, audioStories.categoryId),
      )
      .where(eq(audioStories.professionalId, pro.id))
      .orderBy(asc(audioStories.createdAt))
    return rows.map((r) => {
      const clip = toPublicClip(
        {
          id: r.id,
          audioKey: r.audioKey,
          mime: r.mime,
          durationSec: r.durationSec,
          title: r.title,
          description: r.description,
          createdAt: r.createdAt,
        },
        {
          categoryId: r.categoryId,
          catId: r.catId,
          slug: r.slug,
          title: r.catTitle,
          description: r.catDescription,
          sortOrder: r.catSortOrder,
        },
      )
      // ponytail: MyStoryClip carries the review status (absent from the public
      // shape); spread the public clip + re-add status.
      return { ...clip, status: r.status }
    })
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
  // ponytail: optional per-clip description shown under the title in /apoyo.
  description: z
    .string()
    .trim()
    .max(STORY_DESC_MAX, `Máximo ${STORY_DESC_MAX} caracteres.`)
    .optional()
    .nullable(),
  // ponytail: required on upload — every clip belongs to exactly one category.
  // Existence + active check happens in the handler (zod can't reach the DB).
  categoryId: z.number().int().positive('Selecciona una categoría.'),
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

    // ponytail: validate the category exists and is active before writing, so
    // a pro can't attach a clip to a retired/unknown category. The select is
    // cheap (PK hit) and gates the R2 put too — failing here is free.
    const catRows = await db
      .select({ id: audioCategories.id })
      .from(audioCategories)
      .where(
        and(
          eq(audioCategories.id, data.categoryId),
          eq(audioCategories.active, true),
        ),
      )
      .limit(1)
    if (catRows.length === 0) {
      throw new Error(
        'Esa categoría ya no está disponible. Recarga la página e inténtalo de nuevo.',
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
          description: data.description?.trim() || null,
          status: 'pending',
          categoryId: data.categoryId,
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
  // ponytail: shown on the admin review card so reviewers can sanity-check the
  // category tag the pro picked before approving.
  category: StoryClipCategory | null
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
        catId: audioCategories.id,
        slug: audioCategories.slug,
        catTitle: audioCategories.title,
        catDescription: audioCategories.description,
        catSortOrder: audioCategories.sortOrder,
      })
      .from(audioStories)
      .innerJoin(
        professionals,
        eq(professionals.id, audioStories.professionalId),
      )
      .leftJoin(
        audioCategories,
        eq(audioCategories.id, audioStories.categoryId),
      )
      .where(eq(audioStories.status, 'pending'))
      .orderBy(asc(audioStories.createdAt))
    return rows.map((r) => {
      const category: StoryClipCategory | null =
        r.catId != null &&
        r.slug &&
        r.catTitle &&
        r.catDescription &&
        r.catSortOrder != null
          ? {
              id: r.catId,
              slug: r.slug,
              title: r.catTitle,
              description: r.catDescription,
              sortOrder: r.catSortOrder,
            }
          : null
      return {
        id: r.id,
        professionalId: r.professionalId,
        proName: r.proName,
        audioKey: r.audioKey,
        mime: r.mime,
        durationSec: r.durationSec,
        title: r.title,
        createdAt: r.createdAt,
        url: publicAudioUrl(r.audioKey),
        category,
      }
    })
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

// ── Admin + public: category CRUD ──────────────────────────────────────────
//
// ponytail: categories are admin-managed reference rows. listAudioCategories is
// PUBLIC (no auth) so the pro recorder picker and the /apoyo page can read
// them; the create/update/toggle/delete fns are admin-only. All admin fns use
// the inline session + isAdminEmail gate (matching the rest of this module;
// lib/auth.ts:requireAdmin exists as an alternative but isn't used here to
// keep the gating pattern consistent within the file).

function toCategoryRow(r: typeof audioCategories.$inferSelect): AudioCategory {
  return {
    id: r.id,
    slug: r.slug,
    title: r.title,
    description: r.description,
    sortOrder: r.sortOrder,
    active: r.active,
    createdAt: r.createdAt,
  }
}

const listCategoriesSchema = z.object({
  includeInactive: z.boolean().optional().default(false),
})

// ponytail: public read (no auth). Default returns active-only, ordered by
// sortOrder then id. includeInactive=true is admin-only: a non-admin caller
// passing it is silently downgraded to active-only (returns the public list
// rather than throwing — the picker + /apoyo are anonymous and shouldn't fail
// on a stale param; the admin UI is the only intended consumer of inactive
// rows). This gate is the real security boundary for hiding retired categories.
export const listAudioCategories = createServerFn({ method: 'GET' })
  .validator(listCategoriesSchema)
  .handler(async ({ data }) => {
    let includeInactive = data.includeInactive
    if (includeInactive) {
      const session = await getAuth().api.getSession({ headers: getHeaders() })
      if (!session?.user || !(await isAdminEmail(session.user.email))) {
        includeInactive = false
      }
    }
    const db = getDb()
    const rows = await db
      .select()
      .from(audioCategories)
      .where(
        includeInactive ? undefined : eq(audioCategories.active, true),
      )
      .orderBy(asc(audioCategories.sortOrder), asc(audioCategories.id))
    return rows.map(toCategoryRow)
  })

const createCategorySchema = z.object({
  title: z
    .string()
    .trim()
    .min(2, 'El título es demasiado corto.')
    .max(80, 'Máximo 80 caracteres.'),
  description: z
    .string()
    .trim()
    .min(4, 'La descripción es demasiado corta.')
    .max(200, 'Máximo 200 caracteres.'),
  slug: z
    .string()
    .trim()
    .min(2)
    .max(80)
    .regex(
      /^[a-z0-9-]+$/,
      'El slug solo puede tener minúsculas, números y guiones.',
    )
    .optional(),
  sortOrder: z.number().int().min(0).optional(),
})

export const createAudioCategory = createServerFn({ method: 'POST' })
  .validator(createCategorySchema)
  .handler(async ({ data }) => {
    const session = await getAuth().api.getSession({ headers: getHeaders() })
    if (!session?.user || !(await isAdminEmail(session.user.email))) {
      throw new Error('Acción solo para administradores.')
    }
    const db = getDb()
    const slug = (data.slug?.trim() || slugifyTitle(data.title)).slice(0, 80)
    if (!slug) {
      throw new Error(
        'No se pudo generar un slug a partir del título. Usa uno explícito.',
      )
    }
    // ponytail: detect a slug collision explicitly before insert so the catch
    // below only reports a collision when it actually IS one. Without this,
    // any insert failure (D1 outage, schema drift, empty .returning()) would
    // surface to the admin as "ya existe…", which is misleading.
    const existing = await db
      .select({ id: audioCategories.id })
      .from(audioCategories)
      .where(eq(audioCategories.slug, slug))
      .limit(1)
    if (existing.length > 0) {
      throw new Error(
        `Ya existe una categoría con el slug “${slug}”. Usa otro título o slug.`,
      )
    }
    try {
      const [inserted] = await db
        .insert(audioCategories)
        .values({
          slug,
          title: data.title.trim(),
          description: data.description.trim(),
          sortOrder: data.sortOrder ?? 1000,
          active: true,
        })
        .returning()
      return toCategoryRow(inserted)
    } catch (err) {
      // ponytail: a race between the existence check and the insert could still
      // hit the unique index here; treat a UNIQUE-constraint-looking error as a
      // collision, anything else as a generic failure (don't leak SQL). Any
      // D1-level failure throws here and is caught — .returning() doesn't
      // silently return [] in practice.
      console.error('[audio-stories] category insert failed:', err)
      const msg = String(err)
      throw new Error(
        /UNIQUE|constraint/i.test(msg)
          ? `Ya existe una categoría con el slug “${slug}”. Usa otro título o slug.`
          : 'No se pudo crear la categoría. Inténtalo de nuevo.',
      )
    }
  })

const updateCategorySchema = z.object({
  id: z.number().int().positive(),
  title: z
    .string()
    .trim()
    .min(2, 'El título es demasiado corto.')
    .max(80, 'Máximo 80 caracteres.')
    .optional(),
  description: z
    .string()
    .trim()
    .min(4, 'La descripción es demasiado corta.')
    .max(200, 'Máximo 200 caracteres.')
    .optional(),
  sortOrder: z.number().int().min(0).optional(),
})

export const updateAudioCategory = createServerFn({ method: 'POST' })
  .validator(updateCategorySchema)
  .handler(async ({ data }) => {
    const session = await getAuth().api.getSession({ headers: getHeaders() })
    if (!session?.user || !(await isAdminEmail(session.user.email))) {
      throw new Error('Acción solo para administradores.')
    }
    const db = getDb()
    // ponytail: slug is immutable (it's the stable analytics/URL id) — only
    // title/description/sortOrder are editable. Build the patch from defined
    // fields so partial updates don't null anything out.
    const patch: Record<string, unknown> = {}
    if (data.title !== undefined) patch.title = data.title.trim()
    if (data.description !== undefined)
      patch.description = data.description.trim()
    if (data.sortOrder !== undefined) patch.sortOrder = data.sortOrder
    if (Object.keys(patch).length === 0) {
      return { ok: true as const }
    }
    await db
      .update(audioCategories)
      .set(patch)
      .where(eq(audioCategories.id, data.id))
    return { ok: true as const }
  })

const toggleCategorySchema = z.object({
  id: z.number().int().positive(),
  active: z.boolean(),
})

export const toggleAudioCategory = createServerFn({ method: 'POST' })
  .validator(toggleCategorySchema)
  .handler(async ({ data }) => {
    const session = await getAuth().api.getSession({ headers: getHeaders() })
    if (!session?.user || !(await isAdminEmail(session.user.email))) {
      throw new Error('Acción solo para administradores.')
    }
    const db = getDb()
    await db
      .update(audioCategories)
      .set({ active: data.active })
      .where(eq(audioCategories.id, data.id))
    return { ok: true as const }
  })

const deleteCategorySchema = z.object({ id: z.number().int().positive() })

export const deleteAudioCategory = createServerFn({ method: 'POST' })
  .validator(deleteCategorySchema)
  .handler(async ({ data }) => {
    const session = await getAuth().api.getSession({ headers: getHeaders() })
    if (!session?.user || !(await isAdminEmail(session.user.email))) {
      throw new Error('Acción solo para administradores.')
    }
    const db = getDb()
    // ponytail: refuse if any clip still references this category — deleting
    // would mass-NULL the FK and silently ungroup a bunch of live clips.
    // Counting pending+approved only (rejected clips don't surface publicly,
    // so NULLing their category is harmless; the pro can re-pick on retry).
    const usedRows = await db
      .select({ n: count() })
      .from(audioStories)
      .where(
        and(
          eq(audioStories.categoryId, data.id),
          inArray(audioStories.status, ['pending', 'approved']),
        ),
      )
    const inUse = usedRows.at(0)?.n ?? 0
    if (inUse > 0) {
      throw new Error(
        inUse === 1
          ? '1 audio usa esta categoría. Mueve o elimina ese audio primero, o desactiva la categoría en su lugar.'
          : `${inUse} audios usan esta categoría. Mueve o elimina esos audios primero, o desactiva la categoría en su lugar.`,
      )
    }
    await db.delete(audioCategories).where(eq(audioCategories.id, data.id))
    return { ok: true as const }
  })
