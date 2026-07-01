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
  inArray,
  DrizzleError,
} from 'drizzle-orm'

import { getDb, getR2 } from '#/db'
import {
  professionals,
  professionalDocuments,
  user as userTable,
} from '#/db/schema'
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

// ── Support documents (additional certificates / support docs) ──────────────
// ponytail: extra optional docs a pro attaches beyond the single título
// (certificateKey) — additional certificates, board credentials, specializations.
// N per pro (capped), stored as their own table keyed by professionalId. Same
// base64 → R2 transport + same PDF/image mimes as the main certificate. The cap
// is enforced in app code (no SQLite CHECK for "count per group", like audios).
export const SUPPORT_DOC_KEY_PREFIX = 'support-docs/'
export const SUPPORT_DOC_MAX = 6

// ponytail: reuse the certificate mime set + size cap — these are the same kind
// of credential document, just additional ones.
export const supportDocSchema = certificateSchema.extend({
  name: z.string().trim().max(180).optional(),
})
export type SupportDocInput = z.infer<typeof supportDocSchema>

// ponytail: pure helper — builds the playback URL from a stored R2 key. Mirrors
// publicCertificateUrl. The /media/document/$ route re-adds the prefix and is
// owner-or-admin gated (unlike the admin-only certificate route, the pro sees
// their own docs from the panel).
export function publicSupportDocUrl(docKey: string): string {
  const suffix = docKey.startsWith(SUPPORT_DOC_KEY_PREFIX)
    ? docKey.slice(SUPPORT_DOC_KEY_PREFIX.length)
    : docKey
  return `/media/document/${suffix}`
}

// ponytail: upload one support doc to R2. Keyed by professionalId (matches the
// table FK + the audio-stories keying convention), not userId. Returns the row
// fields the insert needs.
async function uploadSupportDoc(
  proId: number,
  doc: SupportDocInput,
): Promise<{ docKey: string; mime: string; name: string | null }> {
  const ext = CERT_EXT[doc.type]
  const key = `${SUPPORT_DOC_KEY_PREFIX}${proId}/${crypto.randomUUID()}.${ext}`
  await getR2().put(key, base64ToBytes(doc.data), {
    httpMetadata: { contentType: doc.type },
  })
  return { docKey: key, mime: doc.type, name: doc.name?.trim() || null }
}

// ponytail: upload + insert N support docs for a pro. Best-effort per doc (a
// single R2/DB hiccup skips that doc, never blocks registration) — same
// philosophy as the main certificate upload. Unused on the panel path (the
// panel uploads one-at-a-time via addMySupportDoc).
async function persistSupportDocs(
  proId: number,
  docs: SupportDocInput[] | undefined,
): Promise<void> {
  if (!docs || docs.length === 0) return
  const db = getDb()
  const rows: { docKey: string; mime: string; name: string | null }[] = []
  for (const doc of docs.slice(0, SUPPORT_DOC_MAX)) {
    try {
      rows.push(await uploadSupportDoc(proId, doc))
    } catch (err) {
      console.error('[supportDocs] upload failed for one doc:', err)
    }
  }
  if (rows.length === 0) return
  try {
    await db.insert(professionalDocuments).values(
      rows.map((r) => ({
        professionalId: proId,
        docKey: r.docKey,
        mime: r.mime,
        name: r.name,
      })),
    )
  } catch (err) {
    // ponytail: clean up the orphan R2 objects so a failed bulk insert doesn't
    // leak storage (the rows are the source of truth).
    for (const r of rows) {
      try {
        await getR2().delete(r.docKey)
      } catch {
        /* best-effort */
      }
    }
    console.error('[supportDocs] insert failed:', err)
  }
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

// ── Availability schedule (F1) ───────────────────────────────────────────────
// ponytail: recurring weekly availability as a JSON array of {d, s, e} slots.
// d = weekday 0(Sun)..6(Sat) matching JS getDay() in the pro's tz; s/e = minutes
// from midnight (e exclusive). The schedule is the source of truth; availability
// is derived at view time via isActiveNow (shared by the SSR profile + the CSR
// directory badge) — no cron. Plain text column like population; parsed on read.
export type ScheduleSlot = { d: number; s: number; e: number }
export type Schedule = ScheduleSlot[]

const WEEKDAY_SHORT_TO_NUM: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
}
// ponytail: Spanish weekday labels (Mon-first for display). d=0 is Domingo.
export const WEEKDAY_LABEL_ES: Record<number, string> = {
  0: 'Dom',
  1: 'Lun',
  2: 'Mar',
  3: 'Mié',
  4: 'Jue',
  5: 'Vie',
  6: 'Sáb',
}
// Mon-first order, used to group/merge consecutive days in formatScheduleHuman.
const WEEKDAY_ORDER_MON_FIRST = [1, 2, 3, 4, 5, 6, 0]

// ponytail: common American IANA timezones for the panel <select>. Default for
// unknown/Otro is America/Caracas (the platform is Venezuela-focused; VEN has no
// DST so the common case is trivial).
export const COMMON_TIMEZONES = [
  'America/Caracas',
  'America/Argentina/Buenos_Aires',
  'America/Bogota',
  'America/Santiago',
  'America/Lima',
  'America/Guayaquil',
  'America/Sao_Paulo',
  'America/Mexico_City',
  'America/Panama',
  'America/Montevideo',
  'America/La_Paz',
  'America/Asuncion',
  'America/Havana',
] as const

const COUNTRY_TIMEZONE: Record<string, string> = {
  Venezuela: 'America/Caracas',
  Argentina: 'America/Argentina/Buenos_Aires',
  Bolivia: 'America/La_Paz',
  Brasil: 'America/Sao_Paulo',
  Chile: 'America/Santiago',
  Colombia: 'America/Bogota',
  Ecuador: 'America/Guayaquil',
  Paraguay: 'America/Asuncion',
  Perú: 'America/Lima',
  Uruguay: 'America/Montevideo',
  Panamá: 'America/Panama',
  México: 'America/Mexico_City',
  Cuba: 'America/Havana',
}

export function defaultTimezoneForCountry(
  country: string | null | undefined,
): string {
  return (country && COUNTRY_TIMEZONE[country]) || 'America/Caracas'
}

// ponytail: weekday + minutes-from-midnight of `now` in the given tz, via
// Intl.DateTimeFormat (supported in Workers + browsers). hour % 24 guards the
// "24" at midnight some runtimes emit with hour12:false. Returns day=-1 on a
// tz parse failure so callers can bail.
function tzParts(
  tz: string,
  now: Date,
): { day: number; mins: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(now)
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? ''
  const day = WEEKDAY_SHORT_TO_NUM[get('weekday')] ?? -1
  const h = Number(get('hour')) % 24
  const m = Number(get('minute'))
  return { day, mins: h * 60 + m }
}

// ponytail: pure — true if `now` (default: now) falls inside any schedule slot
// in the pro's tz. Imported by the SSR profile (server) and the directory badge
// (client). Bad/empty tz or schedule → false (never falsely "online").
export function isActiveNow(
  schedule: Schedule,
  tz: string,
  now: Date = new Date(),
): boolean {
  if (!schedule.length || !tz) return false
  try {
    const { day, mins } = tzParts(tz, now)
    if (day < 0) return false
    return schedule.some((s) => s.d === day && mins >= s.s && mins < s.e)
  } catch {
    return false
  }
}

// ponytail: the next slot start strictly after `now` in the pro's tz, scanning
// the next 8 days (covers a weekly cycle + today). Used for the "Vuelve…"
// badge label. null if the schedule has no upcoming start within the window.
export function nextStartTime(
  schedule: Schedule,
  tz: string,
  now: Date = new Date(),
): { day: number; start: number } | null {
  if (!schedule.length || !tz) return null
  try {
    for (let offset = 0; offset < 8; offset++) {
      const d = new Date(now.getTime() + offset * 86_400_000)
      const { day, mins } = tzParts(tz, d)
      const slots = schedule
        .filter((s) => s.d === day)
        .sort((a, b) => a.s - b.s)
      for (const s of slots) {
        if (offset > 0 || s.s > mins) return { day, start: s.s }
      }
    }
    return null
  } catch {
    return null
  }
}

function minToHHMM(m: number): string {
  const h = Math.floor(m / 60)
  const mm = m % 60
  return `${h}:${String(mm).padStart(2, '0')}`
}

// ponytail: formatted "Vuelve {weekday} HH:MM" for the directory badge, or null
// if there's no upcoming start within the weekly window.
export function nextStartLabel(
  schedule: Schedule,
  tz: string,
  now: Date = new Date(),
): string | null {
  const next = nextStartTime(schedule, tz, now)
  if (!next) return null
  return `Vuelve ${WEEKDAY_LABEL_ES[next.day]} ${minToHHMM(next.start)}`
}

// ponytail: human-readable blocks for the directory card / profile, e.g.
// "Lun–Vie 9:00–17:00" or "Lun 9:00–13:00, 15:00–18:00 · Vie 9:00–13:00".
// Collapses runs of consecutive days (Mon-first) that share identical ranges.
export function formatScheduleHuman(schedule: Schedule): string {
  if (!schedule.length) return ''
  const byDay = new Map<number, string[]>()
  for (const s of schedule) {
    const ranges = byDay.get(s.d) ?? []
    ranges.push(`${minToHHMM(s.s)}–${minToHHMM(s.e)}`)
    byDay.set(s.d, ranges)
  }
  const rangeOf = (d: number) =>
    (byDay.get(d) ?? []).slice().sort().join(', ')

  const out: string[] = []
  let runStart = -1
  let runEnd = -1
  let runRange = ''
  const flush = () => {
    if (runStart < 0) return
    const label =
      runStart === runEnd
        ? WEEKDAY_LABEL_ES[runStart]
        : `${WEEKDAY_LABEL_ES[runStart]}–${WEEKDAY_LABEL_ES[runEnd]}`
    out.push(`${label} ${runRange}`)
  }
  for (const d of WEEKDAY_ORDER_MON_FIRST) {
    if (!byDay.has(d)) continue
    const r = rangeOf(d)
    const follows =
      runEnd >= 0 &&
      r === runRange &&
      WEEKDAY_ORDER_MON_FIRST.indexOf(d) ===
        WEEKDAY_ORDER_MON_FIRST.indexOf(runEnd) + 1
    if (follows) {
      runEnd = d
    } else {
      flush()
      runStart = d
      runEnd = d
      runRange = r
    }
  }
  flush()
  return out.join(' · ')
}

// ponytail: parse the JSON schedule column; never throws. Drops malformed slots.
export function parseSchedule(
  raw: string | null | undefined,
): ScheduleSlot[] {
  if (!raw) return []
  try {
    const v = JSON.parse(raw)
    if (!Array.isArray(v)) return []
    return v.filter(
      (x): x is ScheduleSlot =>
        !!x &&
        typeof x === 'object' &&
        Number.isInteger(x.d) &&
        x.d >= 0 &&
        x.d <= 6 &&
        Number.isInteger(x.s) &&
        Number.isInteger(x.e) &&
        x.e > x.s &&
        x.s >= 0 &&
        x.e <= 1440,
    )
  } catch {
    return []
  }
}

export const scheduleSlotSchema = z
  .object({
    d: z.number().int().min(0).max(6),
    s: z.number().int().min(0).max(1440),
    e: z.number().int().min(1).max(1440),
  })
  .refine((s) => s.e > s.s, {
    message: 'La hora de fin debe ser mayor que la de inicio',
  })
export const scheduleSchema = z.array(scheduleSlotSchema)

export type AvailabilityMode = 'always' | 'scheduled' | 'inactive'

export const setAvailabilityModeSchema = z.object({
  mode: z.enum(['always', 'scheduled', 'inactive']),
  schedule: scheduleSchema.default([]),
  timezone: z.string().trim().optional().nullable(),
})

export type PublicProfessional = {
  id: number
  name: string
  modality: 'in_person' | 'remote' | 'both'
  country: string
  estado: string | null
  ciudad: string | null
  whatsapp: string
  availabilityMode: AvailabilityMode
  availabilitySchedule: ScheduleSlot[]
  timezone: string | null
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
          availabilityMode: professionals.availabilityMode,
          availabilityScheduleRaw: professionals.availabilitySchedule,
          timezone: professionals.timezone,
          populationRaw: professionals.population,
          focusGroupsRaw: professionals.focusGroups,
          practiceAreasRaw: professionals.practiceAreas,
        })
        .from(professionals)
        .where(where)
        // ponytail: alphabetical (F1) — the live "Disponible ahora" badge on each
        // card conveys current availability; online-first sorting across pages
        // would require denormalizing, which we chose not to (no cron).
        .orderBy(asc(professionals.name))
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
        availabilityMode: r.availabilityMode,
        availabilitySchedule: parseSchedule(r.availabilityScheduleRaw),
        timezone: r.timezone,
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
        availabilityMode: professionals.availabilityMode,
        availabilityScheduleRaw: professionals.availabilitySchedule,
        timezone: professionals.timezone,
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
      availabilityMode: r.availabilityMode,
      availabilitySchedule: parseSchedule(r.availabilityScheduleRaw),
      timezone: r.timezone,
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

// ponytail: step-2 field shape as a plain object (pre-refine) so both the
// registration schema and the profile-edit schema can extend it without
// re-declaring the fields (DRY — the field set is the source of truth).
const registerStep2Object = z.object({
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
  // ponytail: additional optional certificates / support docs (repeatable).
  // Same PDF/image payload as `certificate`; capped client + server side.
  supportDocs: z
    .array(supportDocSchema)
    .max(SUPPORT_DOC_MAX, `Máximo ${SUPPORT_DOC_MAX} documentos.`)
    .optional()
    .default([]),
})

// ponytail: step 2 schema validates only step-2 fields.
export const registerStep2Schema =
  registerStep2Object.superRefine(refineProfessional)

// ponytail: self-serve profile edit. Reuses the step-2 field shape + adds name
// (editable here; registration gets name from the auth user). certificate is
// omitted — credential-file changes aren't part of profile edit (the pro can
// re-upload via a separate flow if ever needed).
export const profileEditSchema = registerStep2Object
  .extend({ name: z.string().min(2, 'Tu nombre es obligatorio') })
  .omit({ certificate: true })
  .superRefine(refineProfessional)
export type ProfileEditInput = z.infer<typeof profileEditSchema>

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
    // ponytail: additional certificates / support docs. Mirrors the step-2
    // field; kept in sync manually (registerSchema is a separate object, not
    // an extend of step2Object, to preserve its name/email/password fields).
    supportDocs: z
      .array(supportDocSchema)
      .max(SUPPORT_DOC_MAX, `Máximo ${SUPPORT_DOC_MAX} documentos.`)
      .optional()
      .default([]),
  })
  .superRefine(refineProfessional)

export type RegisterInput = z.infer<typeof registerSchema>
export type RegisterStep2Input = z.infer<typeof registerStep2Schema>
export { PAIS_OPTIONS, VENEZUELA_ESTADOS }

// ponytail: the editable professional columns, shared by registration inserts
// (buildProValues) and self-serve profile edits (updateMyProfile) so the field
// mapping can't drift between them.
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

function proEditableFields(data: ProInsertData) {
  return {
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

function buildProValues(data: ProInsertData, userId: string) {
  return { userId, ...proEditableFields(data) }
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
    // ponytail: resolve the numeric pro id once for the credential + support
    // doc uploads (both are post-insert, best-effort).
    const proIdRow = await db
      .select({ id: professionals.id })
      .from(professionals)
      .where(eq(professionals.userId, userId))
      .limit(1)
    const proId = proIdRow.at(0)?.id
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
    // ponytail: additional support docs (repeatable). Best-effort, same as the
    // main cert — a storage hiccup never blocks the registration.
    if (proId !== undefined) {
      await persistSupportDocs(proId, data.supportDocs)
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
    let proId: number | undefined
    try {
      const inserted = await db
        .insert(professionals)
        .values(
          buildProValues({ ...data, name: session.user.name }, session.user.id),
        )
        .returning({ id: professionals.id })
      // ponytail: capture the new pro id for the support-docs upload below.
      proId = inserted.at(0)?.id
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
    // ponytail: additional support docs (repeatable), best-effort.
    if (proId !== undefined) {
      await persistSupportDocs(proId, data.supportDocs)
    }
    return { ok: true }
  })

// ponytail: three-state availability switch (F1). 'always' = Siempre disponible
// (schedule null, available true); 'inactive' = No conectado (schedule null,
// available false); 'scheduled' = store blocks + tz and set available from
// isActiveNow so the panel reflects the correct state immediately (no cron wait
// — the live badge in the directory then tracks it on each 20s poll).
export const setAvailabilityMode = createServerFn({ method: 'POST' })
  .validator(setAvailabilityModeSchema)
  .handler(async ({ data }) => {
    const session = await getAuth().api.getSession({ headers: getHeaders() })
    if (!session?.user) {
      throw new Error('Debes iniciar sesión.')
    }
    const db = getDb()
    const mine = eq(professionals.userId, session.user.id)
    if (data.mode === 'always') {
      await db
        .update(professionals)
        .set({
          availabilityMode: 'always',
          availabilitySchedule: null,
          available: true,
        })
        .where(mine)
    } else if (data.mode === 'inactive') {
      await db
        .update(professionals)
        .set({
          availabilityMode: 'inactive',
          availabilitySchedule: null,
          available: false,
        })
        .where(mine)
    } else {
      // ponytail: tz defaults to Caracas if the client omitted it (the panel
      // <select> seeds it from country, so this is a defensive fallback).
      const tz = data.timezone?.trim() || 'America/Caracas'
      await db
        .update(professionals)
        .set({
          availabilityMode: 'scheduled',
          availabilitySchedule: JSON.stringify(data.schedule),
          timezone: tz,
          available: isActiveNow(data.schedule, tz),
        })
        .where(mine)
    }
    return { ok: true as const }
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
        // ponytail: editable fields for the panel's ProfileSection (F2). Raw
        // JSON tag columns parsed to clean arrays below.
        populationRaw: professionals.population,
        focusGroupsRaw: professionals.focusGroups,
        practiceAreasRaw: professionals.practiceAreas,
        country: professionals.country,
        estado: professionals.estado,
        ciudad: professionals.ciudad,
        whatsapp: professionals.whatsapp,
        whatsappCountry: professionals.whatsappCountry,
        certificationNumber: professionals.certificationNumber,
        credentialCountry: professionals.credentialCountry,
        certifyingSchool: professionals.certifyingSchool,
        // ponytail: availability (F1) — schedule parsed for the panel grid.
        availabilityMode: professionals.availabilityMode,
        availabilityScheduleRaw: professionals.availabilitySchedule,
        timezone: professionals.timezone,
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
    if (!r || r.verifiedStatus === 'deleted') return null
    return {
      id: r.id,
      name: r.name,
      verifiedStatus: r.verifiedStatus,
      available: r.available,
      providesService: r.providesService,
      modality: r.modality,
      avatarKey: r.avatarKey,
      socialX: r.socialX,
      socialInstagram: r.socialInstagram,
      socialTikTok: r.socialTikTok,
      population: parsePopulation(r.populationRaw),
      focusGroups: parseFocusGroups(r.focusGroupsRaw),
      practiceAreas: parsePracticeAreas(r.practiceAreasRaw),
      country: r.country,
      estado: r.estado,
      ciudad: r.ciudad,
      whatsapp: r.whatsapp,
      whatsappCountry: r.whatsappCountry,
      certificationNumber: r.certificationNumber,
      credentialCountry: r.credentialCountry,
      certifyingSchool: r.certifyingSchool,
      availabilityMode: r.availabilityMode,
      availabilitySchedule: parseSchedule(r.availabilityScheduleRaw),
      timezone: r.timezone,
    }
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

// ── Support documents: pro manages their own (additional certs / support docs)
// ponytail: list/add/remove for the panel's "Documentos de apoyo" section.
// Ownership is enforced by selecting on userId → professionals.id (never trust
// the client to pass a pro id). Unlike audio, a pending/rejected pro CAN manage
// these (the docs are FOR verification — they should be attachable pre-verify).

export type MySupportDoc = {
  id: number
  mime: string
  name: string | null
  url: string
  createdAt: Date | null
}

export const listMySupportDocs = createServerFn({ method: 'GET' }).handler(
  async () => {
    const session = await getAuth().api.getSession({ headers: getHeaders() })
    if (!session?.user) return []
    const db = getDb()
    const proRow = await db
      .select({ id: professionals.id })
      .from(professionals)
      .where(eq(professionals.userId, session.user.id))
      .limit(1)
    const pro = proRow.at(0)
    if (!pro) return []
    const rows = await db
      .select({
        id: professionalDocuments.id,
        docKey: professionalDocuments.docKey,
        mime: professionalDocuments.mime,
        name: professionalDocuments.name,
        createdAt: professionalDocuments.createdAt,
      })
      .from(professionalDocuments)
      .where(eq(professionalDocuments.professionalId, pro.id))
      .orderBy(desc(professionalDocuments.createdAt))
    // ponytail: never leak the raw R2 key; only the resolved playback URL.
    return rows.map((r) => ({
      id: r.id,
      mime: r.mime,
      name: r.name,
      url: publicSupportDocUrl(r.docKey),
      createdAt: r.createdAt,
    }))
  },
)

// ponytail: reuse the certificate payload cap; support docs are the same kind
// of file. name is the original filename (sent by the client from File.name).
const addSupportDocSchema = supportDocSchema

export const addMySupportDoc = createServerFn({ method: 'POST' })
  .validator(addSupportDocSchema)
  .handler(async ({ data }) => {
    const session = await getAuth().api.getSession({ headers: getHeaders() })
    if (!session?.user) {
      throw new Error('Debes iniciar sesión para subir un documento.')
    }
    const db = getDb()
    const proRow = await db
      .select({ id: professionals.id })
      .from(professionals)
      .where(eq(professionals.userId, session.user.id))
      .limit(1)
    const pro = proRow.at(0)
    if (!pro) {
      throw new Error('Completa tu perfil profesional antes de subir documentos.')
    }
    // ponytail: cap check pre-upload so we never write past the limit (no
    // SQLite CHECK for "count per group", same as audios).
    const countRows = await db
      .select({ n: count() })
      .from(professionalDocuments)
      .where(eq(professionalDocuments.professionalId, pro.id))
    if ((countRows.at(0)?.n ?? 0) >= SUPPORT_DOC_MAX) {
      throw new Error(
        `Ya tienes ${SUPPORT_DOC_MAX} documentos. Elimina uno para subir otro.`,
      )
    }
    const uploaded = await uploadSupportDoc(pro.id, data)
    try {
      const inserted = await db
        .insert(professionalDocuments)
        .values({
          professionalId: pro.id,
          docKey: uploaded.docKey,
          mime: uploaded.mime,
          name: uploaded.name,
        })
        .returning({ id: professionalDocuments.id })
      return { ok: true as const, id: inserted[0]?.id }
    } catch (err) {
      // ponytail: clean up the orphan R2 object on insert failure.
      try {
        await getR2().delete(uploaded.docKey)
      } catch {
        /* best-effort */
      }
      console.error('[addMySupportDoc] insert failed:', err)
      throw new Error(
        'No pudimos guardar el documento. Inténtalo de nuevo en unos segundos.',
      )
    }
  },
)

const removeSupportDocSchema = z.object({ id: z.number().int().positive() })

export const removeMySupportDoc = createServerFn({ method: 'POST' })
  .validator(removeSupportDocSchema)
  .handler(async ({ data }) => {
    const session = await getAuth().api.getSession({ headers: getHeaders() })
    if (!session?.user) {
      throw new Error('Debes iniciar sesión.')
    }
    const db = getDb()
    // ponytail: ownership via join to professionals.userId — never trust the
    // client's pro id. Returns docKey in the same query to delete the R2 object.
    const rows = await db
      .select({
        id: professionalDocuments.id,
        docKey: professionalDocuments.docKey,
      })
      .from(professionalDocuments)
      .innerJoin(
        professionals,
        eq(professionals.id, professionalDocuments.professionalId),
      )
      .where(
        and(
          eq(professionalDocuments.id, data.id),
          eq(professionals.userId, session.user.id),
        ),
      )
      .limit(1)
    const row = rows.at(0)
    if (!row) {
      throw new Error('No se encontró ese documento.')
    }
    await db
      .delete(professionalDocuments)
      .where(eq(professionalDocuments.id, row.id))
    try {
      await getR2().delete(row.docKey)
    } catch (err) {
      console.error('[removeMySupportDoc] R2 delete failed:', err)
    }
    return { ok: true as const }
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

// ponytail: self-serve profile edit for verified (or pending) pros. Validates
// with profileEditSchema (same field set as registration, minus certificate, +
// name). Changing the certification number or its country is the trust root, so
// it resets verifiedStatus to 'pending' + available=false for re-review (mirrors
// the dormant pattern in reviewProfessional) — prevents verified-bait-and-
// switch. name is also written to the auth user row so auth surfaces agree.
export const updateMyProfile = createServerFn({ method: 'POST' })
  .validator(profileEditSchema)
  .handler(async ({ data }) => {
    const session = await getAuth().api.getSession({ headers: getHeaders() })
    if (!session?.user) {
      throw new Error('Debes iniciar sesión.')
    }
    const db = getDb()
    const rows = await db
      .select({
        certificationNumber: professionals.certificationNumber,
        credentialCountry: professionals.credentialCountry,
      })
      .from(professionals)
      .where(eq(professionals.userId, session.user.id))
      .limit(1)
    const cur = rows.at(0)
    if (!cur) {
      throw new Error('Completa tu perfil profesional primero.')
    }
    const credentialChanged =
      cur.certificationNumber !== data.certificationNumber.trim() ||
      (cur.credentialCountry ?? null) !== (data.credentialCountry ?? null)
    await db
      .update(professionals)
      .set({
        ...proEditableFields(data),
        ...(credentialChanged
          ? { verifiedStatus: 'pending' as const, available: false }
          : {}),
      })
      .where(eq(professionals.userId, session.user.id))
    await db
      .update(userTable)
      .set({ name: data.name })
      .where(eq(userTable.id, session.user.id))
    return { ok: true as const, rereview: credentialChanged }
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
    // ponytail: one extra query (not N+1) for the page's support docs, grouped
    // by pro id so the admin card can link each doc alongside the main cert.
    const proIds = rows.map((r) => r.id)
    const docRows = proIds.length
      ? await db
          .select({
            proId: professionalDocuments.professionalId,
            docKey: professionalDocuments.docKey,
            name: professionalDocuments.name,
          })
          .from(professionalDocuments)
          .where(inArray(professionalDocuments.professionalId, proIds))
          .orderBy(desc(professionalDocuments.createdAt))
      : []
    const docsByPro = new Map<number, { url: string; name: string | null }[]>()
    for (const d of docRows) {
      const list = docsByPro.get(d.proId) ?? []
      list.push({ url: publicSupportDocUrl(d.docKey), name: d.name })
      docsByPro.set(d.proId, list)
    }
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
        supportDocs: docsByPro.get(r.id) ?? [],
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
