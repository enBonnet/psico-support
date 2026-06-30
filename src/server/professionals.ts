import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import {
  eq,
  and,
  or,
  desc,
  asc,
  like,
  count,
  sql,
  ne,
  DrizzleError,
} from 'drizzle-orm'

import { getDb, getR2 } from '#/db'
import { professionals, user as userTable } from '#/db/schema'
import { getAuth, isAdminEmail } from '#/lib/auth'
import {
  PAIS_OPTIONS,
  VENEZUELA,
  VENEZUELA_ESTADOS,
} from './locations'

// ponytail: target demographics a professional serves. Multi-select, stored
// as a JSON text array. Spanish labels are the stored keys (single-language app).
export const POPULATION_OPTIONS = [
  'Niños',
  'Adolescentes',
  'Adultos',
  'Adultos mayores',
] as const
export type Population = (typeof POPULATION_OPTIONS)[number]

// ponytail: specialized populations (orthogonal to age). Optional — most pros
// hold none of these. Same JSON-array pattern + LIKE filter as population.
export const FOCUS_GROUP_OPTIONS = [
  'Oncológica',
  'Neurodivergentes',
  'Cuidadores',
  'Comunidad LGBTQ+',
] as const
export type FocusGroup = (typeof FOCUS_GROUP_OPTIONS)[number]

// ponytail: intervention areas (problem-type axis). Optional, JSON array.
export const PRACTICE_AREA_OPTIONS = [
  'Duelo',
  'Violencia (género/intrafamiliar)',
  'Adicciones',
  'Intervención en crisis',
  'Ansiedad y depresión',
] as const
export type PracticeArea = (typeof PRACTICE_AREA_OPTIONS)[number]

// ponytail: optional certificate upload (título / certificado de egreso).
// Transported through the server fn as base64 so the upload is atomic with
// the registration insert — no anonymous orphan objects in R2 if the row
// fails. Ceiling: base64 is ~33% larger than the binary; fine for ≤5MB
// certificate PDFs/images. If files grow or volume rises, switch to a
// presigned direct-to-R2 multipart route.
export const CERTIFICATE_MIME = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
] as const
export type CertificateMime = (typeof CERTIFICATE_MIME)[number]

export const CERTIFICATE_MAX_BYTES = 5 * 1024 * 1024

export const certificateSchema = z.object({
  data: z
    .string()
    // base64 chars; 5MB binary ≈ 6.7M chars, pad for the prefix-free payload.
    .max(Math.ceil((CERTIFICATE_MAX_BYTES * 4) / 3) + 1024),
  type: z.enum(CERTIFICATE_MIME),
})
export type CertificateInput = z.infer<typeof certificateSchema>

const CERT_EXT: Record<CertificateMime, string> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}

// ponytail: decode base64 → Uint8Array for R2.put. atob+charCodeAt loop is
// the stdlib path; for 5MB this is negligible CPU.
function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes
}

async function uploadCertificate(
  userId: string,
  cert: CertificateInput,
): Promise<string> {
  const ext = CERT_EXT[cert.type]
  const key = `certificates/${userId}/${crypto.randomUUID()}.${ext}`
  await getR2().put(key, base64ToBytes(cert.data), {
    httpMetadata: { contentType: cert.type },
  })
  return key
}

// ── Avatar ──────────────────────────────────────────────────────────────────
// ponytail: optional profile photo, uploaded POST-signup from the panel
// (never in registration — keeps signup frictionless). Same base64 + R2 transport
// as certificates but images-only + a tighter 2MB cap (avatars don't need 5MB).
// Public-by-intent (shown on the profile), so the /media/avatar/$ route is
// unauthed (like audio), relying on UUID-key unguessability — NOT admin-authed
// like the certificate route.
export const AVATAR_MIME = [
  'image/jpeg',
  'image/png',
  'image/webp',
] as const
export type AvatarMime = (typeof AVATAR_MIME)[number]
export const AVATAR_MAX_BYTES = 2 * 1024 * 1024
export const AVATAR_ACCEPT = '.jpg,.jpeg,image/jpeg,image/png,image/webp'
const AVATAR_EXT: Record<AvatarMime, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}
export const AVATAR_KEY_PREFIX = 'avatars/'

export const avatarSchema = z.object({
  data: z
    .string()
    // base64 chars; 2MB binary ≈ 2.7M chars, pad for the data: prefix.
    .max(Math.ceil((AVATAR_MAX_BYTES * 4) / 3) + 1024),
  type: z.enum(AVATAR_MIME),
})

// ponytail: pure helper — builds the public playback URL from a stored R2 key.
// Imported by client routes (profile + panel). Mirrors publicCertificateUrl.
export function publicAvatarUrl(avatarKey: string): string {
  const suffix = avatarKey.startsWith(AVATAR_KEY_PREFIX)
    ? avatarKey.slice(AVATAR_KEY_PREFIX.length)
    : avatarKey
  return `/media/avatar/${suffix}`
}

// ── Social handles ──────────────────────────────────────────────────────────
// ponytail: bare-handle storage. Users paste "@foo", "https://x.com/foo", or
// "x.com/foo" — normalize all to "foo". Not a full URL parser (names the
// ceiling): strips scheme+domain, leading @, and trailing path/query/hash.
// TikTok URLs carry "@", so the URL is re-built with @ on display (socialUrls).
export function normalizeHandle(
  raw: string | null | undefined,
): string | null {
  if (!raw) return null
  let h = raw.trim()
  h = h.replace(/^https?:\/\/[^/]*\//i, '') // scheme + domain + slash
  h = h.replace(/^[a-z0-9.-]+\.[a-z]{2,}\//i, '') // bare domain (x.com/)
  h = h.replace(/^@+/, '') // leading @
  h = h.replace(/[/?#].*$/, '') // path / query / hash
  return h.trim() || null
}

// ponytail: pure helper — builds absolute profile links from bare handles.
// Single source of truth for the URL shape, consumed by the profile route for
// BOTH the visible <a> links AND the schema.org sameAs array (SEO) — so the two
// can't drift. TikTok URLs use "@" (tiktok.com/@handle); X + Instagram don't.
export type SocialName = 'x' | 'instagram' | 'tiktok'

export function socialLinks(s: {
  x: string | null
  instagram: string | null
  tikTok: string | null
}): { name: SocialName; href: string }[] {
  const out: { name: SocialName; href: string }[] = []
  if (s.x) out.push({ name: 'x', href: `https://x.com/${s.x}` })
  if (s.instagram)
    out.push({ name: 'instagram', href: `https://instagram.com/${s.instagram}` })
  if (s.tikTok)
    out.push({
      name: 'tiktok',
      href: `https://www.tiktok.com/@${s.tikTok}`,
    })
  return out
}

export const socialsSchema = z.object({
  x: z.string().trim().max(50).optional().nullable(),
  instagram: z.string().trim().max(50).optional().nullable(),
  tiktok: z.string().trim().max(50).optional().nullable(),
})
export type SocialsInput = z.infer<typeof socialsSchema>

// ponytail: parse a JSON text-array column against a known option set; never
// throw on bad data. Shared by the three axes (population/focusGroups/
// practiceAreas) so unknown stored values are silently dropped on read.
function parseJsonTagArray<T extends string>(
  raw: string | null | undefined,
  options: readonly T[],
): T[] {
  if (!raw) return []
  try {
    const v = JSON.parse(raw)
    return Array.isArray(v)
      ? v.filter((x): x is T => (options as readonly string[]).includes(x as string))
      : []
  } catch {
    return []
  }
}

export function parsePopulation(raw: string | null | undefined): Population[] {
  return parseJsonTagArray(raw, POPULATION_OPTIONS)
}
export function parseFocusGroups(raw: string | null | undefined): FocusGroup[] {
  return parseJsonTagArray(raw, FOCUS_GROUP_OPTIONS)
}
export function parsePracticeAreas(
  raw: string | null | undefined,
): PracticeArea[] {
  return parseJsonTagArray(raw, PRACTICE_AREA_OPTIONS)
}

export type PublicProfessional = {
  id: number
  name: string
  modality: 'in_person' | 'remote' | 'both'
  country: string
  estado: string | null
  ciudad: string | null
  whatsapp: string
  available: boolean
  population: Population[]
  focusGroups: FocusGroup[]
  practiceAreas: PracticeArea[]
}

// ponytail: filter shape shared by the list route (search params) and the
// server fns. modality is required (the directory splits on it); the rest are
// plain optional strings — they only feed eq()/like(), never get persisted,
// so enum validation here is YAGNI (the <select> already constrains them).
// page is 1-based.
export const listSchema = z.object({
  modality: z.enum(['in_person', 'remote']),
  q: z.string().trim().optional(),
  estado: z.string().trim().optional(),
  ciudad: z.string().trim().optional(),
  population: z.string().trim().optional(),
  focusGroups: z.string().trim().optional(),
  practiceAreas: z.string().trim().optional(),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(48).default(12),
})

export const PAGE_SIZE_DEFAULT = 12

// ponytail: shared WHERE builder so listProfessionals (paginated) and
// pickRandomProfessional draw from the exact same pool for a given filter
// set — the random button never picks someone the list would filter out.
// All clauses are optional except verified + modality; undefined filters are
// simply not added (drizzle `and` with undefined is a no-op).
function buildProfessionalWhere(
  data: Pick<
    z.infer<typeof listSchema>,
    | 'modality'
    | 'q'
    | 'estado'
    | 'ciudad'
    | 'population'
    | 'focusGroups'
    | 'practiceAreas'
  >,
) {
  return and(
    eq(professionals.verifiedStatus, 'verified'),
    // ponytail: content-only pros (providesService=false) are excluded from the
    // service directory + random pick — they contribute audios, not direct
    // service. Audio eligibility is governed separately by verifiedStatus.
    eq(professionals.providesService, true),
    or(
      eq(professionals.modality, data.modality),
      eq(professionals.modality, 'both'),
    ),
    data.q ? like(professionals.name, `%${data.q}%`) : undefined,
    data.estado ? eq(professionals.estado, data.estado) : undefined,
    data.ciudad ? eq(professionals.ciudad, data.ciudad) : undefined,
    // ponytail: population is a JSON text array ('["Niños","Adultos"]').
    // LIKE '%"Niños"%' matches the tag anywhere in the serialized string.
    data.population
      ? like(professionals.population, `%"${data.population}"%`)
      : undefined,
    data.focusGroups
      ? like(professionals.focusGroups, `%"${data.focusGroups}"%`)
      : undefined,
    data.practiceAreas
      ? like(professionals.practiceAreas, `%"${data.practiceAreas}"%`)
      : undefined,
  )
}

export const listProfessionals = createServerFn({ method: 'GET' })
  .validator(listSchema)
  .handler(async ({ data }) => {
    const db = getDb()
    const where = buildProfessionalWhere(data)
    const offset = (data.page - 1) * data.pageSize

    const [rows, totalRows] = await Promise.all([
      db
        .select({
          id: professionals.id,
          name: professionals.name,
          modality: professionals.modality,
          country: professionals.country,
          estado: professionals.estado,
          ciudad: professionals.ciudad,
          whatsapp: professionals.whatsapp,
          available: professionals.available,
          populationRaw: professionals.population,
          focusGroupsRaw: professionals.focusGroups,
          practiceAreasRaw: professionals.practiceAreas,
        })
        .from(professionals)
        .where(where)
        // ponytail: float available pros to the top so patients see who's
        // reachable now first, then alphabetical by name.
        .orderBy(desc(professionals.available), asc(professionals.name))
        .limit(data.pageSize)
        .offset(offset),
      db
        .select({ n: count() })
        .from(professionals)
        .where(where),
    ])

    return {
      rows: rows.map((r) => ({
        id: r.id,
        name: r.name,
        modality: r.modality,
        country: r.country,
        estado: r.estado,
        ciudad: r.ciudad,
        whatsapp: r.whatsapp,
        available: r.available,
        population: parsePopulation(r.populationRaw),
        focusGroups: parseFocusGroups(r.focusGroupsRaw),
        practiceAreas: parsePracticeAreas(r.practiceAreasRaw),
      })),
      total: totalRows.at(0)?.n ?? 0,
    }
  })

// ponytail: single-profile fetch for the public profile page + its SSR head.
// Returns ONLY verified rows — pending/rejected are invisible to the public,
// so a shared link to an unverified/rejected pro 404s instead of leaking state.
const getOneSchema = z.object({ id: z.number().int().positive() })

export const getPublicProfessional = createServerFn({ method: 'GET' })
  .validator(getOneSchema)
  .handler(async ({ data }) => {
    const db = getDb()
    const rows = await db
      .select({
        id: professionals.id,
        name: professionals.name,
        modality: professionals.modality,
        country: professionals.country,
        estado: professionals.estado,
        ciudad: professionals.ciudad,
        whatsapp: professionals.whatsapp,
        available: professionals.available,
        populationRaw: professionals.population,
        focusGroupsRaw: professionals.focusGroups,
        practiceAreasRaw: professionals.practiceAreas,
        verifiedStatus: professionals.verifiedStatus,
        providesService: professionals.providesService,
        avatarKey: professionals.avatarKey,
        socialX: professionals.socialX,
        socialInstagram: professionals.socialInstagram,
        socialTikTok: professionals.socialTikTok,
      })
      .from(professionals)
      .where(eq(professionals.id, data.id))
      .limit(1)
    // ponytail: .at(0) is type-honest (T | undefined) without needing
    // noUncheckedIndexedAccess; rows[0] would type as always-present.
    const r = rows.at(0)
    // Content-only pros don't provide service → no public profile (404), even
    // though they're verified. They only surface via the audio tray.
    if (!r || r.verifiedStatus !== 'verified' || !r.providesService) return null
    return {
      id: r.id,
      name: r.name,
      modality: r.modality,
      country: r.country,
      estado: r.estado,
      ciudad: r.ciudad,
      whatsapp: r.whatsapp,
      available: r.available,
      population: parsePopulation(r.populationRaw),
      focusGroups: parseFocusGroups(r.focusGroupsRaw),
      practiceAreas: parsePracticeAreas(r.practiceAreasRaw),
      avatarKey: r.avatarKey,
      socialX: r.socialX,
      socialInstagram: r.socialInstagram,
      socialTikTok: r.socialTikTok,
    }
  })

// ponytail: "contact a random professional" — same filter pool as the list,
// any verified pro (NOT restricted to available=1, per product decision).
// ORDER BY RANDOM() is fine while the directory is <~1k rows; if it grows,
// switch to a count-based random offset (pick n in [0,count), LIMIT 1 OFFSET n).
export const pickRandomProfessional = createServerFn({ method: 'GET' })
  .validator(
    z.object({
      modality: z.enum(['in_person', 'remote']),
      q: z.string().trim().optional(),
      estado: z.string().trim().optional(),
      ciudad: z.string().trim().optional(),
      population: z.string().trim().optional(),
      focusGroups: z.string().trim().optional(),
      practiceAreas: z.string().trim().optional(),
    }),
  )
  .handler(async ({ data }) => {
    const db = getDb()
    const rows = await db
      .select({
        id: professionals.id,
        name: professionals.name,
        whatsapp: professionals.whatsapp,
      })
      .from(professionals)
      .where(buildProfessionalWhere(data))
      .orderBy(sql`RANDOM()`)
      .limit(1)
    // ponytail: .at(0) is type-honest (T | undefined) without needing
    // noUncheckedIndexedAccess; rows[0] would type as always-present.
    return rows.at(0) ?? null
  })

// ponytail: location is conditional. When country=Venezuela, estado and
// ciudad must come from the fixed maps. Abroad, only country is required
// (estado/ciudad are optional free text, but we keep them nullable and
// don't collect them in the form).
export const registerStep1Schema = z.object({
  name: z.string().min(2, 'Tu nombre es obligatorio'),
  email: z.string().email('Correo inválido'),
  password: z.string().min(8, 'Mínimo 8 caracteres'),
})

// ponytail: shared superRefine. credentialCountry + certificationNumber are
// the country-agnostic credential (validate via the board's registry).
// country drives location (estado/ciudad) — the two are independent: a pro
// may live in Chile but hold a Venezuelan board registration.
function refineProfessional(val: {
  credentialCountry?: string | null
  country: string
  certificationNumber?: string
  estado?: string | null
  ciudad?: string | null
  whatsappCountry?: string | null
  whatsapp: string
}, ctx: z.RefinementCtx) {
  if (!val.credentialCountry) {
    ctx.addIssue({
      code: 'custom',
      path: ['credentialCountry'],
      message: 'Selecciona el país del colegio o certificación',
    })
  }
  if (!val.certificationNumber || val.certificationNumber.trim().length < 2) {
    ctx.addIssue({
      code: 'custom',
      path: ['certificationNumber'],
      message: 'Ingresa tu número de colegiación',
    })
  }
  if (val.country === VENEZUELA) {
    if (!val.estado) {
      ctx.addIssue({
        code: 'custom',
        path: ['estado'],
        message: 'Selecciona el estado',
      })
    }
    if (!val.ciudad || val.ciudad.trim().length < 2) {
      ctx.addIssue({
        code: 'custom',
        path: ['ciudad'],
        message: 'Selecciona la ciudad',
      })
    }
  }
}

// ponytail: estado defaults to '' in the form (select placeholder), but
// z.enum().optional() only accepts undefined — empty string fails the
// enum. Preprocess '' -> null so the field is valid when the country is
// not Venezuela and estado is never shown.
const nullableWhenEmptyEstado = z.preprocess(
  (v) => (v === '' ? null : v),
  z.enum(VENEZUELA_ESTADOS).optional().nullable(),
)

// ponytail: step 2 schema validates only step-2 fields.
export const registerStep2Schema = z
  .object({
    certificationNumber: z.string().min(2, 'Ingresa tu número de colegiación'),
    certifyingSchool: z.string().max(120).optional().nullable(),
    population: z
      .array(z.enum(POPULATION_OPTIONS))
      .min(1, 'Selecciona al menos uno'),
    focusGroups: z.array(z.enum(FOCUS_GROUP_OPTIONS)),
    practiceAreas: z.array(z.enum(PRACTICE_AREA_OPTIONS)),
    modality: z.enum(['in_person', 'remote', 'both']),
    country: z.enum(PAIS_OPTIONS),
    estado: nullableWhenEmptyEstado,
    ciudad: z.string().max(80).optional().nullable(),
    credentialCountry: z.enum(PAIS_OPTIONS).optional().nullable(),
    whatsappCountry: z.string().optional().nullable(),
    whatsapp: z
      .string()
      .min(8, 'WhatsApp inválido')
      .regex(/^\+?\d[\d\s-]{7,}$/, 'Formato: +58 412 1234567'),
    certificate: certificateSchema.nullable().optional(),
  })
  .superRefine(refineProfessional)

export const registerSchema = z
  .object({
    name: z.string().min(2, 'Tu nombre es obligatorio'),
    email: z.string().email('Correo inválido'),
    password: z.string().min(8, 'Mínimo 8 caracteres'),
    certificationNumber: z.string().min(2, 'Ingresa tu número de colegiación'),
    certifyingSchool: z.string().max(120).optional().nullable(),
    population: z
      .array(z.enum(POPULATION_OPTIONS))
      .min(1, 'Selecciona al menos uno'),
    focusGroups: z.array(z.enum(FOCUS_GROUP_OPTIONS)),
    practiceAreas: z.array(z.enum(PRACTICE_AREA_OPTIONS)),
    modality: z.enum(['in_person', 'remote', 'both']),
    country: z.enum(PAIS_OPTIONS),
    estado: nullableWhenEmptyEstado,
    ciudad: z.string().max(80).optional().nullable(),
    credentialCountry: z.enum(PAIS_OPTIONS).optional().nullable(),
    whatsappCountry: z.string().optional().nullable(),
    whatsapp: z
      .string()
      .min(8, 'WhatsApp inválido')
      .regex(/^\+?\d[\d\s-]{7,}$/, 'Formato: +58 412 1234567'),
    certificate: certificateSchema.nullable().optional(),
  })
  .superRefine(refineProfessional)

export type RegisterInput = z.infer<typeof registerSchema>
export type RegisterStep2Input = z.infer<typeof registerStep2Schema>
export { PAIS_OPTIONS, VENEZUELA_ESTADOS }

// ponytail: shared insert-shape builder. registerProfessional (full one-shot
// signup) and createProfessionalProfile (logged-in user adding a pro row)
// both build the same row, so the field mapping lives in one place to avoid drift.
type ProInsertData = {
  name: string
  certificationNumber: string
  certifyingSchool?: string | null
  population: string[]
  focusGroups: string[]
  practiceAreas: string[]
  modality: 'in_person' | 'remote' | 'both'
  country: string
  estado?: string | null
  ciudad?: string | null
  credentialCountry?: string | null
  whatsappCountry?: string | null
  whatsapp: string
}

function buildProValues(data: ProInsertData, userId: string) {
  return {
    userId,
    name: data.name,
    certificationNumber: data.certificationNumber.trim(),
    certifyingSchool: data.certifyingSchool?.trim() || null,
    population: JSON.stringify(data.population),
    focusGroups: JSON.stringify(data.focusGroups),
    practiceAreas: JSON.stringify(data.practiceAreas),
    modality: data.modality,
    country: data.country,
    estado: data.country === VENEZUELA ? (data.estado ?? null) : null,
    ciudad: data.country === VENEZUELA ? (data.ciudad ?? null) : null,
    credentialCountry: data.credentialCountry ?? null,
    whatsappCountry: data.whatsappCountry ?? null,
    whatsapp: data.whatsapp,
  }
}

export const registerProfessional = createServerFn({ method: 'POST' })
  .validator(registerSchema)
  .handler(async ({ data }) => {
    // ponytail: single server fn creates the auth user + professional row.
    // All errors thrown here are user-facing Spanish messages; raw DB/SQL
    // details are logged, never returned to the client.
    const db = getDb()

    const existing = await db
      .select({ id: userTable.id })
      .from(userTable)
      .where(eq(userTable.email, data.email))
      .limit(1)
    if (existing.length > 0) {
      throw new Error('Ya existe una cuenta con ese correo. Inicia sesión.')
    }

    let userId: string | undefined
    try {
      const created = await getAuth().api.signUpEmail({
        body: {
          name: data.name,
          email: data.email,
          password: data.password,
        },
        headers: getHeaders(),
      })
      userId = created.user.id
    } catch (err) {
      // ponytail: better-auth throws APIError with code; surface friendly text.
      const msg = (err as { message?: string; code?: string }).message ?? ''
      if (/exist|already|registered|duplicat/i.test(msg)) {
        throw new Error(
          'Ya existe una cuenta con ese correo. Inicia sesión.',
        )
      }
      if (/password|weak|common/i.test(msg)) {
        throw new Error(
          'La contraseña no cumple los requisitos. Usa al menos 8 caracteres.',
        )
      }
      console.error('[registerProfessional] signUp failed:', err)
      throw new Error('No se pudo crear la cuenta. Inténtalo de nuevo.')
    }
    if (!userId) {
      throw new Error('No se pudo crear la cuenta.')
    }

    try {
      await db.insert(professionals).values(buildProValues(data, userId))
    } catch (err) {
      // ponytail: clean up the orphan auth user so a failed professional
      // insert doesn't leave a half-registered account that blocks a retry
      // with the same email.
      try {
        await db.delete(userTable).where(eq(userTable.id, userId))
      } catch {
        /* best-effort; don't mask the original error */
      }
      if (err instanceof DrizzleError && /UNIQUE/i.test(err.message)) {
        throw new Error(
          'Ya existe un registro profesional para este usuario. Si ya tienes cuenta, inicia sesión.',
        )
      }
      // ponytail: NOT NULL on a column means a migration isn't applied —
      // tell the admin instead of confusing the user with "try again".
      if (err instanceof DrizzleError && /NOT NULL/i.test(err.message)) {
        console.error(
          '[registerProfessional] insert failed (NOT NULL): a migration is likely not applied.',
          err,
        )
        throw new Error(
          'El registro no está disponible en este momento. Avísanos para que apliquemos una actualización.',
        )
      }
      // ponytail: never leak raw SQL/params to the client.
      console.error('[registerProfessional] insert failed:', err)
      throw new Error(
        'No pudimos guardar tu registro. Revisa los datos e inténtalo de nuevo. Si persiste, escríbenos.',
      )
    }
    // ponytail: optional cert upload runs AFTER the row exists so a failed
    // upload never blocks registration. Best-effort — log + carry on without
    // the cert if R2 rejects (the pro still registers via their número de
    // colegiación, which is the primary verification path).
    if (data.certificate) {
      try {
        const key = await uploadCertificate(userId, data.certificate)
        await db
          .update(professionals)
          .set({ certificateKey: key })
          .where(eq(professionals.userId, userId))
      } catch (err) {
        console.error('[registerProfessional] certificate upload failed:', err)
      }
    }
    return { ok: true, userId }
  })

// ponytail: for users who created a bare account (/signup) and later want to
// become a professional. Auth-gated: links the new pro row to the logged-in
// user. No name/email/password here — those come from the existing account.
export const createProfessionalProfile = createServerFn({ method: 'POST' })
  .validator(registerStep2Schema)
  .handler(async ({ data }) => {
    const session = await getAuth().api.getSession({ headers: getHeaders() })
    if (!session?.user) {
      throw new Error('Debes iniciar sesión para crear tu perfil profesional.')
    }
    const db = getDb()
    const existing = await db
      .select({
        id: professionals.id,
        verifiedStatus: professionals.verifiedStatus,
      })
      .from(professionals)
      .where(eq(professionals.userId, session.user.id))
      .limit(1)
    if (existing.length > 0) {
      const ex = existing[0]
      if (ex.verifiedStatus === 'deleted') {
        // ponytail: a previously deleted pro is re-registering — clear the
        // tombstoned row so the insert below doesn't trip the UNIQUE/userId
        // guard. Hard-delete + fresh insert is simpler than a partial UPDATE
        // across all the JSON tag columns.
        await db
          .delete(professionals)
          .where(eq(professionals.id, ex.id))
      } else {
        throw new Error('Ya tienes un registro profesional.')
      }
    }
    try {
      await db.insert(professionals).values(
        buildProValues({ ...data, name: session.user.name }, session.user.id),
      )
    } catch (err) {
      if (err instanceof DrizzleError && /NOT NULL/i.test(err.message)) {
        console.error(
          '[createProfessionalProfile] insert failed (NOT NULL): a migration is likely not applied.',
          err,
        )
        throw new Error(
          'El registro no está disponible en este momento. Avísanos para que apliquemos una actualización.',
        )
      }
      console.error('[createProfessionalProfile] insert failed:', err)
      throw new Error(
        'No pudimos guardar tu registro. Revisa los datos e inténtalo de nuevo.',
      )
    }
    // ponytail: same best-effort cert upload as registerProfessional (above).
    if (data.certificate) {
      try {
        const key = await uploadCertificate(session.user.id, data.certificate)
        await db
          .update(professionals)
          .set({ certificateKey: key })
          .where(eq(professionals.userId, session.user.id))
      } catch (err) {
        console.error(
          '[createProfessionalProfile] certificate upload failed:',
          err,
        )
      }
    }
    return { ok: true }
  })

const setAvailabilitySchema = z.object({
  available: z.boolean(),
})

export const setAvailability = createServerFn({ method: 'POST' })
  .validator(setAvailabilitySchema)
  .handler(async ({ data }) => {
    const session = await getAuth().api.getSession({ headers: getHeaders() })
    if (!session?.user) {
      throw new Error('Debes iniciar sesión.')
    }
    const db = getDb()
    await db
      .update(professionals)
      .set({ available: data.available })
      .where(eq(professionals.userId, session.user.id))
    return { ok: true, available: data.available }
  })

// ponytail: self-serve account deletion = SOFT delete. We tombstone the pro
// row (verifiedStatus='deleted') instead of hard-deleting it, so the admin
// keeps an audit trail and the row can be resurrected on re-registration.
// Because every public query filters verifiedStatus='verified', a deleted
// pro immediately disappears from the directory, the random pick, and the
// verified count — no extra WHERE clauses needed. We also force available=0
// defensively (it's already filtered out, but keeps the row honest). The
// auth user row is intentionally NOT removed, so the person can still log in
// and re-register later if they change their mind.
export const deleteMyProfessional = createServerFn({ method: 'POST' }).handler(
  async () => {
    const session = await getAuth().api.getSession({ headers: getHeaders() })
    if (!session?.user) {
      throw new Error('Debes iniciar sesión.')
    }
    const db = getDb()
    await db
      .update(professionals)
      .set({ verifiedStatus: 'deleted', available: false })
      .where(eq(professionals.userId, session.user.id))
    return { ok: true }
  },
)

export const amIAdmin = createServerFn({ method: 'GET' }).handler(
  async () => {
    const session = await getAuth().api.getSession({ headers: getHeaders() })
    if (!session?.user) return false
    return isAdminEmail(session.user.email)
  },
)

// ponytail: session check for route guards. authClient.getSession() called
// in beforeLoad during SSR does NOT forward the browser cookie, so every
// SSR'd protected route saw null and bounced to login. This server fn reads
// the request headers via the global __TSS_REQUEST__, which works both
// during SSR (same request context) and client navigation (browser sends
// the cookie on the fn fetch).
export const getCurrentUser = createServerFn({ method: 'GET' }).handler(
  async () => {
    const session = await getAuth().api.getSession({ headers: getHeaders() })
    return session?.user ?? null
  },
)

export const getMyProfessional = createServerFn({ method: 'GET' }).handler(
  async () => {
    const session = await getAuth().api.getSession({ headers: getHeaders() })
    if (!session?.user) {
      return null
    }
    const db = getDb()
    const rows = await db
      .select({
        id: professionals.id,
        name: professionals.name,
        verifiedStatus: professionals.verifiedStatus,
        available: professionals.available,
        providesService: professionals.providesService,
        modality: professionals.modality,
        avatarKey: professionals.avatarKey,
        socialX: professionals.socialX,
        socialInstagram: professionals.socialInstagram,
        socialTikTok: professionals.socialTikTok,
      })
      .from(professionals)
      .where(eq(professionals.userId, session.user.id))
      .limit(1)
    // ponytail: hide soft-deleted rows so a deleted user who logs back in
    // sees the "complete your profile" CTA instead of a zombie panel (which
    // would otherwise render the 'deleted' status as "Rechazado"). They can
    // re-register via /profesional/completar, which resurrects the row.
    // .at(0) is type-honest (T | undefined); rows[0] would type as always-present.
    const r = rows.at(0)
    return r && r.verifiedStatus !== 'deleted' ? r : null
  },
)

// ponytail: pro's own avatar upload (replace) + remove. Keyed by professionalId
// (not userId) so the R2 path is stable across auth-user changes. On replace,
// the previous object is deleted best-effort (a dangling jpg costs cents/year,
// not worth failing the user-facing op). Ownership is enforced by selecting on
// userId — never trust the client to pass its own pro id.
async function findMyPro(userId: string) {
  const db = getDb()
  const rows = await db
    .select({ id: professionals.id, avatarKey: professionals.avatarKey })
    .from(professionals)
    .where(eq(professionals.userId, userId))
    .limit(1)
  return rows.at(0)
}

export const uploadMyAvatar = createServerFn({ method: 'POST' })
  .validator(avatarSchema)
  .handler(async ({ data }) => {
    const session = await getAuth().api.getSession({ headers: getHeaders() })
    if (!session?.user) {
      throw new Error('Debes iniciar sesión.')
    }
    const pro = await findMyPro(session.user.id)
    if (!pro) {
      throw new Error('Completa tu perfil profesional primero.')
    }
    const ext = AVATAR_EXT[data.type]
    const key = `${AVATAR_KEY_PREFIX}${pro.id}/${crypto.randomUUID()}.${ext}`
    await getR2().put(key, base64ToBytes(data.data), {
      httpMetadata: { contentType: data.type },
    })
    await getDb()
      .update(professionals)
      .set({ avatarKey: key })
      .where(eq(professionals.id, pro.id))
    // ponytail: best-effort delete of the previous avatar object so a replace
    // doesn't orphan the old file in R2. A failure here must not fail the upload.
    if (pro.avatarKey) {
      try {
        await getR2().delete(pro.avatarKey)
      } catch (err) {
        console.error('[uploadMyAvatar] old avatar delete failed:', err)
      }
    }
    return { ok: true, avatarKey: key }
  })

export const removeMyAvatar = createServerFn({ method: 'POST' }).handler(
  async () => {
    const session = await getAuth().api.getSession({ headers: getHeaders() })
    if (!session?.user) {
      throw new Error('Debes iniciar sesión.')
    }
    const pro = await findMyPro(session.user.id)
    if (!pro) return { ok: true }
    if (pro.avatarKey) {
      await getDb()
        .update(professionals)
        .set({ avatarKey: null })
        .where(eq(professionals.id, pro.id))
      try {
        await getR2().delete(pro.avatarKey)
      } catch (err) {
        console.error('[removeMyAvatar] avatar delete failed:', err)
      }
    }
    return { ok: true }
  },
)

// ponytail: pro edits their own social handles. Normalize server-side so the
// stored form is always bare handles (no @, no URL) regardless of what the
// client sent; empty → null so a cleared field is cleanly absent, not "".
export const updateMySocials = createServerFn({ method: 'POST' })
  .validator(socialsSchema)
  .handler(async ({ data }) => {
    const session = await getAuth().api.getSession({ headers: getHeaders() })
    if (!session?.user) {
      throw new Error('Debes iniciar sesión.')
    }
    const db = getDb()
    await db
      .update(professionals)
      .set({
        socialX: normalizeHandle(data.x),
        socialInstagram: normalizeHandle(data.instagram),
        socialTikTok: normalizeHandle(data.tiktok),
      })
      .where(eq(professionals.userId, session.user.id))
    return { ok: true }
  })

const decisionSchema = z.object({
  professionalId: z.number(),
  status: z.enum(['verified', 'rejected', 'disabled', 'deleted']),
})

export const reviewProfessional = createServerFn({ method: 'POST' })
  .validator(decisionSchema)
  .handler(async ({ data }) => {
    const session = await getAuth().api.getSession({ headers: getHeaders() })
    if (!session?.user || !(await isAdminEmail(session.user.email))) {
      throw new Error('Acción solo para administradores.')
    }
    const db = getDb()
    // ponytail: disabling + deleting both force available=false so the row stays
    // honest (already filtered out of public queries by verifiedStatus, but this
    // matches the soft-delete pattern). Re-enabling (verified) leaves available
    // untouched — the pro must deliberately opt back in via the panel toggle.
    const dormant = data.status === 'disabled' || data.status === 'deleted'
    await db
      .update(professionals)
      .set(
        dormant
          ? { verifiedStatus: data.status, available: false }
          : { verifiedStatus: data.status },
      )
      .where(eq(professionals.id, data.professionalId))
    return { ok: true }
  })

// ponytail: R2 key prefix for certificates; stripped when building the
// admin-only /media/certificate/... URL (the worker route at
// src/routes/media/certificate/$.ts re-adds it). Mirrors the audio key-prefix
// convention (STORY_KEY_PREFIX) in audio-stories.ts.
export const CERT_KEY_PREFIX = 'certificates/'

// ponytail: pure helper — builds the admin playback URL from a stored R2 key.
// Imported by the admin route. The route is admin-authed, so the URL only
// resolves for logged-in admins; a non-admin GET 404s at the route handler.
export function publicCertificateUrl(certificateKey: string): string {
  const suffix = certificateKey.startsWith(CERT_KEY_PREFIX)
    ? certificateKey.slice(CERT_KEY_PREFIX.length)
    : certificateKey
  return `/media/certificate/${suffix}`
}

// ponytail: the admin's credential audit roster — every non-deleted pro with
// full credential detail, paginated + searchable. One unified list replaces the
// old split (pending queue + managed roster). The admin UI passes { q, status,
// page, pageSize }; each card shows state-appropriate actions (accept/reject/
// enable/disable/delete) + a content-only toggle + the cert link. Search hits
// name / email / colegiación so the admin can find a pro by any of those.
// Newest registration first so fresh signups surface. Mirrors the public
// listProfessionals pagination shape ({ rows, total }) for client parity.
export const adminListSchema = z.object({
  q: z.string().trim().optional(),
  status: z.enum(['pending', 'verified', 'disabled', 'rejected']).optional(),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(48).default(8),
})

export const listAllProfessionals = createServerFn({ method: 'GET' })
  .validator(adminListSchema)
  .handler(async ({ data }) => {
    const session = await getAuth().api.getSession({ headers: getHeaders() })
    if (!session?.user || !(await isAdminEmail(session.user.email))) {
      throw new Error('Acción solo para administradores.')
    }
    const db = getDb()
    // ponytail: a status filter pins to one state; otherwise exclude the
    // 'deleted' tombstone (deleted rows are gone from every public surface and
    // audit-relevant only via the DB directly).
    const baseWhere = data.status
      ? eq(professionals.verifiedStatus, data.status)
      : ne(professionals.verifiedStatus, 'deleted')
    const search = data.q
      ? or(
          like(professionals.name, `%${data.q}%`),
          like(userTable.email, `%${data.q}%`),
          like(professionals.certificationNumber, `%${data.q}%`),
        )
      : undefined
    const where = and(baseWhere, search)
    const offset = (data.page - 1) * data.pageSize

    const [rows, totalRows] = await Promise.all([
      db
        .select({
          id: professionals.id,
          name: professionals.name,
          verifiedStatus: professionals.verifiedStatus,
          available: professionals.available,
          providesService: professionals.providesService,
          certificationNumber: professionals.certificationNumber,
          certifyingSchool: professionals.certifyingSchool,
          populationRaw: professionals.population,
          focusGroupsRaw: professionals.focusGroups,
          practiceAreasRaw: professionals.practiceAreas,
          country: professionals.country,
          estado: professionals.estado,
          ciudad: professionals.ciudad,
          credentialCountry: professionals.credentialCountry,
          whatsappCountry: professionals.whatsappCountry,
          modality: professionals.modality,
          whatsapp: professionals.whatsapp,
          certificateKey: professionals.certificateKey,
          userEmail: userTable.email,
          createdAt: professionals.createdAt,
        })
        .from(professionals)
        .innerJoin(userTable, eq(userTable.id, professionals.userId))
        .where(where)
        .orderBy(desc(professionals.createdAt))
        .limit(data.pageSize)
        .offset(offset),
      db
        .select({ n: count() })
        .from(professionals)
        .innerJoin(userTable, eq(userTable.id, professionals.userId))
        .where(where),
    ])
    // ponytail: parse the JSON tag columns once, server-side, so the admin
    // client gets clean arrays.
    return {
      rows: rows.map((r) => ({
        id: r.id,
        name: r.name,
        verifiedStatus: r.verifiedStatus,
        available: r.available,
        providesService: r.providesService,
        certificationNumber: r.certificationNumber,
        certifyingSchool: r.certifyingSchool,
        population: parsePopulation(r.populationRaw),
        focusGroups: parseFocusGroups(r.focusGroupsRaw),
        practiceAreas: parsePracticeAreas(r.practiceAreasRaw),
        country: r.country,
        estado: r.estado,
        ciudad: r.ciudad,
        credentialCountry: r.credentialCountry,
        whatsappCountry: r.whatsappCountry,
        modality: r.modality,
        whatsapp: r.whatsapp,
        certificateKey: r.certificateKey,
        userEmail: r.userEmail,
        createdAt: r.createdAt,
      })),
      total: totalRows.at(0)?.n ?? 0,
    }
  })

const providesServiceSchema = z.object({
  professionalId: z.number(),
  providesService: z.boolean(),
})

// ponytail: admin toggles a pro's "content creator only" flag. Setting
// content-only (false) forces available=false too — the row is honest (already
// excluded from the directory by the providesService filter, but this keeps the
// flag consistent). Re-enabling service (true) leaves available untouched: the
// pro must opt back in via their panel toggle, mirroring reactivation.
export const adminSetProvidesService = createServerFn({ method: 'POST' })
  .validator(providesServiceSchema)
  .handler(async ({ data }) => {
    const session = await getAuth().api.getSession({ headers: getHeaders() })
    if (!session?.user || !(await isAdminEmail(session.user.email))) {
      throw new Error('Acción solo para administradores.')
    }
    const db = getDb()
    await db
      .update(professionals)
      .set(
        data.providesService
          ? { providesService: true }
          : { providesService: false, available: false },
      )
      .where(eq(professionals.id, data.professionalId))
    return { ok: true }
  })

// ponytail: single-number count for the landing hero's social proof. Cheaper
// than a full list (1 row) and public/no-auth so the SSR landing loader can
// call it freely. Excludes content-only pros — the stat implies "available to
// provide service", so counting content creators would mislead. Caller hides
// the line when n === 0.
export const countVerifiedProfessionals = createServerFn({ method: 'GET' }).handler(
  async () => {
    const db = getDb()
    const rows = await db
      .select({ n: count() })
      .from(professionals)
      .where(
        and(
          eq(professionals.verifiedStatus, 'verified'),
          eq(professionals.providesService, true),
        ),
      )
    return rows.at(0)?.n ?? 0
  },
)

// ponytail: admin-gated user management for the "promote from panel" model.
// listUsers feeds the admin UI; promoteToAdmin sets role='admin'. There is
// intentionally no demote action — promote-only means an admin can never
// accidentally lock themselves (or the last admin) out.
export const adminUsersSchema = z.object({
  q: z.string().trim().optional(),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(48).default(8),
})

export const listUsers = createServerFn({ method: 'GET' })
  .validator(adminUsersSchema)
  .handler(async ({ data }) => {
    const session = await getAuth().api.getSession({ headers: getHeaders() })
    if (!session?.user || !(await isAdminEmail(session.user.email))) {
      throw new Error('Acción solo para administradores.')
    }
    const db = getDb()
    const where = data.q
      ? or(
          like(userTable.name, `%${data.q}%`),
          like(userTable.email, `%${data.q}%`),
        )
      : undefined
    const offset = (data.page - 1) * data.pageSize
    const [rows, totalRows] = await Promise.all([
      db
        .select({
          id: userTable.id,
          name: userTable.name,
          email: userTable.email,
          role: userTable.role,
          createdAt: userTable.createdAt,
        })
        .from(userTable)
        .where(where)
        .orderBy(asc(userTable.createdAt))
        .limit(data.pageSize)
        .offset(offset),
      db.select({ n: count() }).from(userTable).where(where),
    ])
    return { rows, total: totalRows.at(0)?.n ?? 0 }
  })

const promoteSchema = z.object({ userId: z.string() })

export const promoteToAdmin = createServerFn({ method: 'POST' })
  .validator(promoteSchema)
  .handler(async ({ data }) => {
    const session = await getAuth().api.getSession({ headers: getHeaders() })
    if (!session?.user || !(await isAdminEmail(session.user.email))) {
      throw new Error('Acción solo para administradores.')
    }
    const db = getDb()
    await db
      .update(userTable)
      .set({ role: 'admin' })
      .where(eq(userTable.id, data.userId))
    return { ok: true }
  })

function getHeaders(): Headers {
  // ponytail: TanStack Start sets the incoming request on a global; auth
  // needs cookies from the Cookie header. Falls back to empty headers
  // when called outside a request (e.g. tests).
  const req = (globalThis as unknown as { __TSS_REQUEST__?: Request })
    .__TSS_REQUEST__
  return req ? new Headers(req.headers) : new Headers()
}
