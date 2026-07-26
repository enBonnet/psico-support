import { createServerFn } from '@tanstack/react-start'
import { getRequestHeaders } from '@tanstack/react-start/server'
import * as Sentry from '@sentry/tanstackstart-react'
import { and, eq, gt, lt, asc, ne } from 'drizzle-orm'
import { z } from 'zod'

import { getCloudflareEnv, getDb } from '#/db'
import { appointments, professionals, user } from '#/db/schema'
import { getAuth } from '#/lib/auth'
import { SITE_URL } from '#/lib/seo'
import {
  sendEmail,
  meetingConfirmationHtml,
  meetingCancellationHtml,
  buildIcsAttachment,
} from '#/server/email'
import {
  parseSchedule,
  parseAppointmentDurations,
  APPOINTMENT_DURATION_OPTIONS,
} from '#/server/professionals'
import type { Schedule, AppointmentDuration } from '#/server/professionals'
import { writeEvent } from '#/server/analytics'

// ponytail: scheduled video-call appointments (1.25.0). A "slot" is derived
// from a pro's weekly availabilitySchedule (the same JSON grid
// /profesional/disponibilidad manages); there is no separate slots table.
// Slots are computed at query time (generateSlots) and an `appointments` row
// only exists once a slot is booked. The meeting is a public meet.jit.si room
// with an opaque unguessable name (no JWT, no SDK). All write fns are
// session-gated (the help-seeker must have a standard user account) and read
// the request via getHeaders() — per-request isolation, never stash the request
// (gotcha #9). Mutations are wrapped in Sentry.startSpan per the server-fn
// instrumentation convention; analytics writes are fire-and-forget via
// writeEvent() (gotcha #10).

// ── Feature flag ────────────────────────────────────────────────────────────
// ponytail: server-side gate for the whole scheduling feature. A wrangler
// secret (APPOINTMENTS_ENABLED), off by default — flipping it via
// `npx wrangler secret put APPOINTMENTS_ENABLED` takes effect without redeploy.
// Truthy: 'true' / '1' (case-insensitive). Every server fn below calls this
// first and throws a Spanish 'feature disabled' error when off. Mirror with
// VITE_APPOINTMENTS_ENABLED (client, build-time) so the UI hides too — the two
// are separate knobs (a secret can't reach the client bundle; a VITE_ var is
// baked at build); set both together when toggling.
export function appointmentsEnabled(): boolean {
  const v = String(getCloudflareEnv()?.APPOINTMENTS_ENABLED ?? '').toLowerCase()
  return v === 'true' || v === '1'
}
const FEATURE_DISABLED_MSG =
  'Las videollamadas programadas aún no están disponibles.'

// ── Tunables ────────────────────────────────────────────────────────────────
// ponytail: default meeting length when a pro hasn't customized their
// appointmentDurations set (the column default is '[45]'). Per-pro overrides
// live in professionals.appointmentDurations (parsed via
// parseAppointmentDurations). Typed as the literal so it satisfies the
// AppointmentDuration union without a cast.
export const DEFAULT_DURATION_MIN = 45 as const
// How far ahead slots are offered. 14 days keeps the list short and avoids
// pros having to maintain a long-term calendar.
export const BOOKING_WINDOW_DAYS = 14
// Don't offer a slot starting less than this many minutes from now — gives the
// pro a buffer to see the booking notification before the meeting starts.
export const BOOKING_LEAD_MIN = 30

const WEEKDAY_SHORT_TO_NUM: Record<string, number> = {
  Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
}

export const WEEKDAY_LABEL_ES: Record<number, string> = {
  0: 'Domingo', 1: 'Lunes', 2: 'Martes', 3: 'Miércoles',
  4: 'Jueves', 5: 'Viernes', 6: 'Sábado',
}

// ponytail: mirror of the private tzParts in professionals.ts (which isn't
// exported). Kept local to avoid widening professionals.ts' surface. Returns
// weekday + minutes-from-midnight of `now` in the given tz via
// Intl.DateTimeFormat (supported in Workers + browsers). day=-1 on parse fail.
function tzParts(tz: string, now: Date): { day: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(now)
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? ''
  return { day: WEEKDAY_SHORT_TO_NUM[get('weekday')] ?? -1 }
}

// ── Types ───────────────────────────────────────────────────────────────────
export type BookableSlot = {
  // UTC ms — the canonical slot start. Stable across timezones; what the
  // client sends back to createAppointment paired with durationMin.
  startMs: number
  endMs: number
  // The meeting length this slot represents. Two slots at the same startMs but
  // different durationMin are distinct offerings (a pro may offer both a
  // 15-min check-in and a 45-min session starting at 9:00).
  durationMin: AppointmentDuration
}

export type AppointmentStatus = 'booked' | 'cancelled' | 'completed'

export type AppointmentView = {
  id: number
  professionalId: number
  professionalName: string
  clientUserId: string
  clientName: string
  clientEmail: string
  startAt: number
  endAt: number
  durationMin: number
  meetingUrl: string
  status: AppointmentStatus
  clientTz: string
  proTz: string | null
  cancelReason: string | null
  createdAt: number
}

// ── Slot generation (pure) ──────────────────────────────────────────────────
// ponytail: walks the next `windowDays`, and for each day finds the pro's
// active windows (from the weekly grid), slicing them into `durationMin`-minute
// slots aligned to the window start (e.g. a 9:00–11:00 window with 45-min
// duration yields 9:00, 9:45, 10:30 — the last partial slot 11:00–11:15 is
// dropped because it exceeds the window end). Skips slots that have already
// passed (startMs < now + BOOKING_LEAD_MIN). Pure + deterministic given
// (schedule, tz, now). Returns slots sorted ascending by startMs, then by
// durationMin (shorter first when two slots share a start).
export function generateSlots(
  schedule: Schedule,
  tz: string,
  now: Date,
  durationMin: AppointmentDuration = DEFAULT_DURATION_MIN,
  windowDays = BOOKING_WINDOW_DAYS,
  leadMin = BOOKING_LEAD_MIN,
): BookableSlot[] {
  if (!schedule.length || !tz) return []
  const out: BookableSlot[] = []
  const earliestStartMs = now.getTime() + leadMin * 60_000
  try {
    for (let offset = 0; offset < windowDays; offset++) {
      const dayDate = new Date(now.getTime() + offset * 86_400_000)
      const { day } = tzParts(tz, dayDate)
      if (day < 0) continue
      // Today's active windows, sorted by start minute.
      const windows = schedule
        .filter((s) => s.d === day)
        .sort((a, b) => a.s - b.s)
      for (const w of windows) {
        // Align slots to the window start minute; step by durationMin; require
        // the full slot to fit inside [w.s, w.e).
        for (let s = w.s; s + durationMin <= w.e; s += durationMin) {
          const startMs = minuteInTzToUtcMs(tz, dayDate, s)
          if (startMs < earliestStartMs) continue
          out.push({ startMs, endMs: startMs + durationMin * 60_000, durationMin })
        }
      }
    }
  } catch {
    return []
  }
  return sortSlots(out)
}

// ponytail: multi-duration variant — slices the weekly grid for EACH chosen
// duration and concatenates. A 9:00–10:00 window with durations {15,45} yields
// 9:00(15), 9:15(15), 9:30(15), 9:45(15) AND 9:00(45) — the client picks which
// length they want at a given start. Dedupes the duration input (defensive).
// Empty/invalid durations falls back to [DEFAULT_DURATION_MIN] so a pro with a
// malformed column still sees slots.
export function generateSlotsForDurations(
  schedule: Schedule,
  tz: string,
  now: Date,
  durations: AppointmentDuration[],
  opts?: { windowDays?: number; leadMin?: number },
): BookableSlot[] {
  const valid = new Set<number>(APPOINTMENT_DURATION_OPTIONS)
  const deduped = durations.filter((d) => valid.has(d))
  const useDurations: AppointmentDuration[] = deduped.length
    ? deduped
    : [DEFAULT_DURATION_MIN]
  const out: BookableSlot[] = []
  for (const d of useDurations) {
    out.push(...generateSlots(schedule, tz, now, d, opts?.windowDays, opts?.leadMin))
  }
  return sortSlots(out)
}

function sortSlots(slots: BookableSlot[]): BookableSlot[] {
  // Sort by start, then by duration (shorter first) so the picker renders a
  // stable, predictable order.
  return slots.sort((a, b) =>
    a.startMs !== b.startMs
      ? a.startMs - b.startMs
      : a.durationMin - b.durationMin,
  )
}

// Convert a "minutes-from-midnight in `tz` on the calendar day of `dayDate`"
// to a UTC epoch-ms. Uses Intl to find the tz's offset at that wall-clock
// instant. ponytail: Venezuela has no DST so this is trivial in the common
// case, but pros can be in other LATAM tzs (some have DST), so we resolve the
// offset for the actual instant rather than assuming a fixed -4.
function minuteInTzToUtcMs(tz: string, dayDate: Date, minutes: number): number {
  // Build a wall-clock Y/M/D in the tz, then construct a UTC date at that
  // wall-clock time, then subtract the tz offset (resolved via formatToParts
  // round-trip). Simpler: use Intl to get the parts of the target day, then
  // ask for the offset at the candidate instant.
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(dayDate)
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '0'
  const y = Number(get('year'))
  const mo = Number(get('month')) - 1
  const d = Number(get('day'))
  const h = Math.floor(minutes / 60)
  const mi = minutes % 60
  // Wall-clock instant as if it were UTC:
  const wallUtc = Date.UTC(y, mo, d, h, mi, 0)
  // The tz offset at that instant (minutes the tz is BEHIND UTC, positive):
  const off = tzOffsetMinutes(tz, new Date(wallUtc))
  return wallUtc - off * 60_000
}

// ponytail: tz offset (in minutes) of `date` in `tz`, positive when the tz is
// behind UTC. Computed by comparing the wall-clock rendered in the tz against
// the same instant rendered in UTC. Works in Workers (Intl only).
function tzOffsetMinutes(tz: string, date: Date): number {
  const tzStr = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hour12: false, year: 'numeric', month: '2-digit',
    day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(date)
  const get = (t: string) => tzStr.find((p) => p.type === t)?.value ?? '0'
  const asUtc = Date.UTC(
    Number(get('year')), Number(get('month')) - 1, Number(get('day')),
    Number(get('hour')) % 24, Number(get('minute')), Number(get('second')),
  )
  return Math.round((asUtc - date.getTime()) / 60_000)
}

// ── Jitsi meeting generation ────────────────────────────────────────────────
// ponytail: public meet.jit.si room with an opaque unguessable name. No API
// call, no secret, no JWT. The room is technically "public" but the name is
// unguessable and the link is only delivered via email + the in-app "Mis
// sesiones" list to the two participants. Ceiling: if access control beyond
// obscurity is needed, switch to JWT-secured rooms (jose + JITSI_APP_SECRET).
export function generateMeetingRoom(): string {
  // crypto.randomUUID is available in Workers + modern browsers.
  return `psico-${crypto.randomUUID()}`
}
export function meetingUrlFor(room: string): string {
  return `https://meet.jit.si/${room}`
}

// ── Helpers ─────────────────────────────────────────────────────────────────
// ponytail: per-request isolation via getRequestHeaders() (backed by
// AsyncLocalStorage). try/catch returns empty Headers outside a request
// (tests/scripts). Never assign the request to a module/global var (gotcha #9).
function getHeaders(): Headers {
  try {
    return getRequestHeaders()
  } catch {
    return new Headers()
  }
}

async function getSession() {
  try {
    return await getAuth().api.getSession({ headers: getHeaders() })
  } catch (err) {
    Sentry.captureException(err)
    return null
  }
}

// Resolve the caller's professional row id (or null if they're not a pro).
// Mirrors findMyPro in professionals.ts but returns just what we need.
async function findMyProId(userId: string): Promise<number | null> {
  const db = getDb()
  const row = await db
    .select({ id: professionals.id })
    .from(professionals)
    .where(
      and(
        eq(professionals.userId, userId),
        ne(professionals.verifiedStatus, 'deleted'),
      ),
    )
    .limit(1)
  return row.at(0)?.id ?? null
}

// Hydrate an appointments row into the client-facing view (joins pro + user).
async function toView(row: typeof appointments.$inferSelect): Promise<AppointmentView | null> {
  const db = getDb()
  const [proRows, clientRows] = await Promise.all([
    db
      .select({ name: professionals.name, tz: professionals.timezone })
      .from(professionals)
      .where(eq(professionals.id, row.professionalId))
      .limit(1),
    db
      .select({ name: user.name, email: user.email })
      .from(user)
      .where(eq(user.id, row.clientUserId))
      .limit(1),
  ])
  // ponytail: .at(0) is type-honest (T | undefined) without needing
  // noUncheckedIndexedAccess; rows[0] would type as always-present.
  const pro = proRows.at(0)
  const client = clientRows.at(0)
  if (!pro || !client) return null
  return {
    id: row.id,
    professionalId: row.professionalId,
    professionalName: pro.name,
    clientUserId: row.clientUserId,
    clientName: client.name,
    clientEmail: client.email,
    startAt: row.startAt.getTime(),
    endAt: row.endAt.getTime(),
    durationMin: row.durationMin,
    meetingUrl: row.meetingUrl,
    status: row.status,
    clientTz: row.clientTz,
    proTz: pro.tz,
    cancelReason: row.cancelReason,
    createdAt: row.createdAt.getTime(),
  }
}

// ── Server fns ──────────────────────────────────────────────────────────────

export const getAvailableSlots = createServerFn({ method: 'GET' })
  .validator(z.object({ proId: z.number().int().positive() }))
  .handler(async ({ data }) =>
    Sentry.startSpan({ name: 'appointments getAvailableSlots' }, async () => {
      if (!appointmentsEnabled()) throw new Error(FEATURE_DISABLED_MSG)
      const session = await getSession()
      if (!session?.user) {
        throw new Error('Debes iniciar sesión para agendar una videollamada.')
      }
      const db = getDb()
      // Load the pro and validate they offer scheduled video calls.
      const pro = await db
        .select({
          id: professionals.id,
          verifiedStatus: professionals.verifiedStatus,
          providesService: professionals.providesService,
          modality: professionals.modality,
          availabilityMode: professionals.availabilityMode,
          scheduleRaw: professionals.availabilitySchedule,
          durationsRaw: professionals.appointmentDurations,
          tz: professionals.timezone,
          country: professionals.country,
        })
        .from(professionals)
        .where(eq(professionals.id, data.proId))
        .limit(1)
      const row = pro.at(0)
      if (!row) throw new Error('Profesional no encontrado.')
      if (row.verifiedStatus !== 'verified' || !row.providesService) {
        throw new Error('Este profesional no está disponible para agendar.')
      }
      if (row.modality !== 'remote' && row.modality !== 'both') {
        throw new Error('Este profesional no ofrece videollamadas.')
      }
      const durations = parseAppointmentDurations(row.durationsRaw)
      if (row.availabilityMode !== 'scheduled') {
        // 'always' pros are reached via instant WhatsApp; 'inactive' is opted
        // out. Neither offers scheduled slots.
        return {
          slots: [] as BookableSlot[],
          durations,
          reason: row.availabilityMode,
          proTz: row.tz ?? 'America/Caracas',
        }
      }
      const tz = row.tz || 'America/Caracas'
      const schedule = parseSchedule(row.scheduleRaw)
      const now = new Date()
      const generated = generateSlotsForDurations(schedule, tz, now, durations)
      if (!generated.length) {
        return { slots: [] as BookableSlot[], durations, reason: null, proTz: tz }
      }
      // Filter out slots already booked by this pro in the window. A booked
      // (startMs, durationMin) pair hides only that exact slot — a 15-min and
      // a 45-min at the same start are distinct and the other still shows.
      const windowStart = now.getTime()
      const windowEnd = windowStart + BOOKING_WINDOW_DAYS * 86_400_000
      const booked = await db
        .select({
          startAt: appointments.startAt,
          durationMin: appointments.durationMin,
        })
        .from(appointments)
        .where(
          and(
            eq(appointments.professionalId, data.proId),
            eq(appointments.status, 'booked'),
            gt(appointments.startAt, new Date(windowStart)),
            lt(appointments.startAt, new Date(windowEnd)),
          ),
        )
      const bookedKeys = new Set(
        booked.map((b) => `${b.startAt.getTime()}:${b.durationMin}`),
      )
      const slots = generated.filter(
        (s) => !bookedKeys.has(`${s.startMs}:${s.durationMin}`),
      )
      return { slots, durations, reason: null, proTz: tz }
    }),
  )

const createAppointmentSchema = z.object({
  proId: z.number().int().positive(),
  startMs: z.number().int().positive(),
  durationMin: z.union([z.literal(15), z.literal(30), z.literal(45), z.literal(60)]),
})

export const createAppointment = createServerFn({ method: 'POST' })
  .validator(createAppointmentSchema)
  .handler(async ({ data }) =>
    Sentry.startSpan({ name: 'appointments createAppointment' }, async () => {
      if (!appointmentsEnabled()) throw new Error(FEATURE_DISABLED_MSG)
      const session = await getSession()
      if (!session?.user) {
        throw new Error('Debes iniciar sesión para agendar una videollamada.')
      }
      const db = getDb()

      // Load + validate the pro (must offer scheduled video calls).
      const pro = await db
        .select({
          id: professionals.id,
          name: professionals.name,
          userId: professionals.userId,
          verifiedStatus: professionals.verifiedStatus,
          providesService: professionals.providesService,
          modality: professionals.modality,
          availabilityMode: professionals.availabilityMode,
          scheduleRaw: professionals.availabilitySchedule,
          durationsRaw: professionals.appointmentDurations,
          tz: professionals.timezone,
        })
        .from(professionals)
        .where(eq(professionals.id, data.proId))
        .limit(1)
      const row = pro.at(0)
      if (!row) throw new Error('Profesional no encontrado.')
      if (
        row.verifiedStatus !== 'verified' ||
        !row.providesService ||
        (row.modality !== 'remote' && row.modality !== 'both') ||
        row.availabilityMode !== 'scheduled'
      ) {
        throw new Error('Este profesional no está disponible para agendar.')
      }
      const tz = row.tz || 'America/Caracas'
      const schedule = parseSchedule(row.scheduleRaw)
      const durations = parseAppointmentDurations(row.durationsRaw)

      // Re-derive the offered slots for the pro's configured durations and
      // confirm the requested (startMs, durationMin) pair is among them. This
      // both validates the slot (against the weekly grid + lead time) and
      // prevents booking a duration the pro never offered (e.g. a 15-min slot
      // when the pro only offers 45).
      const offered = generateSlotsForDurations(schedule, tz, new Date(), durations)
      const slot = offered.find(
        (s) => s.startMs === data.startMs && s.durationMin === data.durationMin,
      )
      if (!slot) {
        throw new Error('Ese horario ya no está disponible. Elige otro.')
      }

      // Double-book guard: reject if any active 'booked' appointment overlaps
      // [slot.startMs, slot.endMs). check-then-insert is safe at this volume
      // (D1 serializes writes per-DB); a unique index isn't used because
      // cancelled slots must be re-bookable.
      const overlap = await db
        .select({ id: appointments.id })
        .from(appointments)
        .where(
          and(
            eq(appointments.professionalId, row.id),
            eq(appointments.status, 'booked'),
            lt(appointments.startAt, new Date(slot.endMs)),
            gt(appointments.endAt, new Date(slot.startMs)),
          ),
        )
        .limit(1)
      if (overlap.length) {
        throw new Error('Ese horario acaba de ser reservado. Elige otro.')
      }

      // Don't let a client book a second overlapping active appointment with
      // the same pro (minor abuse guard; not a hard business rule).
      const ownOverlap = await db
        .select({ id: appointments.id })
        .from(appointments)
        .where(
          and(
            eq(appointments.clientUserId, session.user.id),
            eq(appointments.status, 'booked'),
            lt(appointments.startAt, new Date(slot.endMs)),
            gt(appointments.endAt, new Date(slot.startMs)),
          ),
        )
        .limit(1)
      if (ownOverlap.length) {
        throw new Error('Ya tienes una cita agendada que se superpone con esa hora.')
      }

      // Resolve the client's email for the confirmation + .ics attendee.
      const clientRows = await db
        .select({ email: user.email, name: user.name })
        .from(user)
        .where(eq(user.id, session.user.id))
        .limit(1)
      const client = clientRows.at(0)
      if (!client) throw new Error('No se encontró tu cuenta.')

      // ponytail: we don't have a per-user tz column. For MVP we default to
      // Caracas (the platform is Venezuela-focused) — the client list still
      // renders in the client's actual tz via Intl on render. Stored clientTz
      // is a hint. Ceiling: add a per-user tz column if accurate stored tz is
      // needed (e.g. for server-rendered email copy in the reader's tz).
      const clientTz = 'America/Caracas'

      const room = generateMeetingRoom()
      const meetingUrl = meetingUrlFor(room)
      const startAt = new Date(slot.startMs)
      const endAt = new Date(slot.endMs)

      const inserted = await db
        .insert(appointments)
        .values({
          professionalId: row.id,
          clientUserId: session.user.id,
          startAt,
          endAt,
          durationMin: data.durationMin,
          meetingUrl,
          meetingRoom: room,
          status: 'booked',
          clientTz,
        })
        .returning()
      const appt = inserted.at(0)
      if (!appt) throw new Error('No se pudo crear la cita.')

      // Analytics (fire-and-forget; session-gated so we know the clientUserId).
      // ponytail: written via writeEvent() directly (not the auth-free track()
      // fn) because the event is emitted from a session-gated mutation; this
      // keeps param3=clientUserId authoritative.
      writeEvent({
        event: 'appointment_booked',
        category: 'public',
        actorId: session.user.id,
        route: '/cuenta/sesiones/agendar',
        param1: String(row.id),
        param2: String(data.durationMin),
        param3: session.user.id,
      })

      // Emails (best-effort: a send failure must not fail the booking).
      const cancelUrl = `${SITE_URL}/cuenta/sesiones`
      const proWhen = formatWhen(startAt, tz)
      const proTzLabel = tzLabel(tz)
      const clientWhen = formatWhen(startAt, clientTz)
      const clientTzLabel = tzLabel(clientTz)
      try {
        // To the client (names the pro).
        const clientHtml = meetingConfirmationHtml({
          whoFor: 'client',
          counterpartName: row.name,
          whenLabel: clientWhen,
          tzLabel: clientTzLabel,
          meetingUrl,
          cancelUrl,
        })
        const clientIcs = buildIcsAttachment({
          appointmentId: appt.id,
          title: `Videollamada con ${row.name}`,
          description: `Sesión de apoyo psicológico con ${row.name} a través de PsicoAyudaVen.`,
          startAt, endAt, meetingUrl,
          organizerName: row.name,
          attendeeName: client.name,
          attendeeEmail: client.email,
        })
        const clientText = `Tu videollamada con ${row.name} está agendada para el ${clientWhen} (${clientTzLabel}). Únete aquí: ${meetingUrl}. Cancela desde ${cancelUrl}.`
        await sendEmail({
          to: client.email,
          subject: `Videollamada agendada con ${row.name}`,
          html: clientHtml,
          text: clientText,
          attachments: [clientIcs],
        })
      } catch (err) {
        // ponytail: email failure is non-fatal — the booking row is the source
        // of truth; the user sees it in "Mis sesiones". Log + continue.
        Sentry.captureException(err)
      }
      try {
        // To the pro (names the client). The pro's email lives on the user row.
        if (row.userId) {
          const proUserRows = await db
            .select({ email: user.email })
            .from(user)
            .where(eq(user.id, row.userId))
            .limit(1)
          const proUser = proUserRows.at(0)
          if (proUser?.email) {
            const proHtml = meetingConfirmationHtml({
              whoFor: 'professional',
              counterpartName: client.name,
              whenLabel: proWhen,
              tzLabel: proTzLabel,
              meetingUrl,
              cancelUrl: `${SITE_URL}/profesional/sesiones`,
            })
            const proIcs = buildIcsAttachment({
              appointmentId: appt.id,
              title: `Videollamada con ${client.name}`,
              description: `Sesión agendada con ${client.name} a través de PsicoAyudaVen.`,
              startAt, endAt, meetingUrl,
              organizerName: 'PsicoAyudaVen',
              attendeeName: client.name,
              attendeeEmail: client.email,
            })
            const proText = `Tienes una videollamada agendada con ${client.name} para el ${proWhen} (${proTzLabel}). Únete aquí: ${meetingUrl}.`
            await sendEmail({
              to: proUser.email,
              subject: `Nueva videollamada agendada con ${client.name}`,
              html: proHtml,
              text: proText,
              attachments: [proIcs],
            })
          }
        }
      } catch (err) {
        Sentry.captureException(err)
      }

      const view = await toView(appt)
      return { appointment: view }
    }),
  )

export const getMyAppointmentsClient = createServerFn({ method: 'GET' }).handler(
  async () =>
    Sentry.startSpan({ name: 'appointments getMyAppointmentsClient' }, async () => {
      if (!appointmentsEnabled()) throw new Error(FEATURE_DISABLED_MSG)
      const session = await getSession()
      if (!session?.user) throw new Error('Debes iniciar sesión.')
      const db = getDb()
      // ponytail: lazily mark past 'booked' rows as 'completed' on read so the
      // upcoming/past split is correct without a cron. Done as a single UPDATE
      // scoped to this user; cheap and idempotent.
      await db
        .update(appointments)
        .set({ status: 'completed' })
        .where(
          and(
            eq(appointments.clientUserId, session.user.id),
            eq(appointments.status, 'booked'),
            lt(appointments.endAt, new Date()),
          ),
        )
      const rows = await db
        .select()
        .from(appointments)
        .where(eq(appointments.clientUserId, session.user.id))
        .orderBy(asc(appointments.startAt))
        .limit(50)
      const views = await Promise.all(rows.map(toView))
      return { appointments: views.filter((v): v is AppointmentView => v !== null) }
    }),
)

export const getMyAppointmentsPro = createServerFn({ method: 'GET' }).handler(
  async () =>
    Sentry.startSpan({ name: 'appointments getMyAppointmentsPro' }, async () => {
      if (!appointmentsEnabled()) throw new Error(FEATURE_DISABLED_MSG)
      const session = await getSession()
      if (!session?.user) throw new Error('Debes iniciar sesión.')
      const proId = await findMyProId(session.user.id)
      if (!proId) throw new Error('No tienes perfil profesional.')
      const db = getDb()
      await db
        .update(appointments)
        .set({ status: 'completed' })
        .where(
          and(
            eq(appointments.professionalId, proId),
            eq(appointments.status, 'booked'),
            lt(appointments.endAt, new Date()),
          ),
        )
      const rows = await db
        .select()
        .from(appointments)
        .where(eq(appointments.professionalId, proId))
        .orderBy(asc(appointments.startAt))
        .limit(50)
      const views = await Promise.all(rows.map(toView))
      return { appointments: views.filter((v): v is AppointmentView => v !== null) }
    }),
)

export const getAppointmentForJoin = createServerFn({ method: 'GET' })
  .validator(z.object({ id: z.number().int().positive() }))
  .handler(async ({ data }) =>
    Sentry.startSpan({ name: 'appointments getAppointmentForJoin' }, async () => {
      if (!appointmentsEnabled()) throw new Error(FEATURE_DISABLED_MSG)
      const session = await getSession()
      if (!session?.user) throw new Error('Debes iniciar sesión.')
      const db = getDb()
      const row = await db
        .select()
        .from(appointments)
        .where(eq(appointments.id, data.id))
        .limit(1)
      const appt = row.at(0)
      if (!appt) throw new Error('Cita no encontrada.')
      // Only the client or the pro (via their pro row) may join.
      const proId = await findMyProId(session.user.id)
      const isClient = appt.clientUserId === session.user.id
      const isPro = proId !== null && appt.professionalId === proId
      if (!isClient && !isPro) {
        throw new Error('No tienes acceso a esta cita.')
      }
      if (appt.status !== 'booked') {
        throw new Error('Esta cita ya no está activa.')
      }
      return { meetingUrl: appt.meetingUrl, startAt: appt.startAt.getTime(), endAt: appt.endAt.getTime() }
    }),
  )

const cancelAppointmentSchema = z.object({
  id: z.number().int().positive(),
  reason: z.string().trim().max(500).optional(),
})

export const cancelAppointment = createServerFn({ method: 'POST' })
  .validator(cancelAppointmentSchema)
  .handler(async ({ data }) =>
    Sentry.startSpan({ name: 'appointments cancelAppointment' }, async () => {
      if (!appointmentsEnabled()) throw new Error(FEATURE_DISABLED_MSG)
      const session = await getSession()
      if (!session?.user) throw new Error('Debes iniciar sesión.')
      const db = getDb()
      const row = await db
        .select()
        .from(appointments)
        .where(eq(appointments.id, data.id))
        .limit(1)
      const appt = row.at(0)
      if (!appt) throw new Error('Cita no encontrada.')

      const proId = await findMyProId(session.user.id)
      const isClient = appt.clientUserId === session.user.id
      const isPro = proId !== null && appt.professionalId === proId
      if (!isClient && !isPro) {
        throw new Error('No tienes acceso a esta cita.')
      }
      if (appt.status !== 'booked') {
        throw new Error('Esta cita ya no está activa.')
      }
      // Can't cancel a meeting that already ended.
      if (appt.endAt.getTime() < Date.now()) {
        throw new Error('Esta cita ya finalizó.')
      }

      const cancelledByRole: 'client' | 'pro' = isClient ? 'client' : 'pro'
      const updated = await db
        .update(appointments)
        .set({ status: 'cancelled', cancelReason: data.reason ?? null })
        .where(
          and(
            eq(appointments.id, appt.id),
            // Optimistic: only flip if still booked (guards a concurrent cancel).
            eq(appointments.status, 'booked'),
          ),
        )
        .returning()
      const updatedRow = updated.at(0)
      if (!updatedRow) {
        throw new Error('Esta cita ya no está activa.')
      }

      writeEvent({
        event: 'appointment_cancelled',
        category: 'public',
        actorId: session.user.id,
        route: isClient ? '/cuenta/sesiones' : '/profesional/sesiones',
        param1: String(appt.professionalId),
        param2: cancelledByRole,
        param3: appt.clientUserId,
      })

      // Best-effort cancellation emails to both parties.
      const [proRows, clientRows] = await Promise.all([
        db.select({ name: professionals.name, tz: professionals.timezone, userId: professionals.userId })
          .from(professionals).where(eq(professionals.id, appt.professionalId)).limit(1),
        db.select({ name: user.name, email: user.email }).from(user).where(eq(user.id, appt.clientUserId)).limit(1),
      ])
      const pro = proRows.at(0)
      const client = clientRows.at(0)
      const when = formatWhen(appt.startAt, pro?.tz ?? 'America/Caracas')
      const tzL = tzLabel(pro?.tz ?? 'America/Caracas')
      try {
        // To the client.
        if (client?.email) {
          const html = meetingCancellationHtml({
            whoFor: 'client',
            counterpartName: pro?.name ?? 'el profesional',
            whenLabel: when,
            tzLabel: tzL,
            reason: data.reason,
            bookAgainUrl: `${SITE_URL}/cuenta/sesiones/agendar/${appt.professionalId}`,
          })
          await sendEmail({
            to: client.email,
            subject: 'Videollamada cancelada',
            html,
            text: `Tu videollamada con ${pro?.name ?? 'el profesional'} del ${when} fue cancelada.`,
          })
        }
      } catch (err) {
        Sentry.captureException(err)
      }
      try {
        // To the pro.
        if (pro?.userId) {
          const proUserRows = await db.select({ email: user.email }).from(user).where(eq(user.id, pro.userId)).limit(1)
          const proUser = proUserRows.at(0)
          if (proUser?.email) {
            const html = meetingCancellationHtml({
              whoFor: 'professional',
              counterpartName: client?.name ?? 'la persona',
              whenLabel: when,
              tzLabel: tzL,
              reason: data.reason,
            })
            await sendEmail({
              to: proUser.email,
              subject: 'Videollamada cancelada',
              html,
              text: `La videollamada con ${client?.name ?? 'la persona'} del ${when} fue cancelada.`,
            })
          }
        }
      } catch (err) {
        Sentry.captureException(err)
      }

      const view = await toView(updatedRow)
      return { appointment: view }
    }),
  )

// ── Formatting helpers (Spanish, tz-aware) ──────────────────────────────────
// ponytail: rendered server-side for the email copy. The in-app lists format
// client-side via Intl with the viewer's tz. These mirror the Intl approach
// used throughout the codebase (no date lib).
function formatWhen(date: Date, tz: string): string {
  try {
    return new Intl.DateTimeFormat('es-VE', {
      timeZone: tz, weekday: 'long', day: 'numeric', month: 'long',
      hour: 'numeric', minute: '2-digit', hour12: true,
    }).format(date)
  } catch {
    return new Intl.DateTimeFormat('es-VE', {
      weekday: 'long', day: 'numeric', month: 'long',
      hour: 'numeric', minute: '2-digit', hour12: true,
    }).format(date)
  }
}

function tzLabel(tz: string): string {
  // ponytail: a human tz label for the email footer. Intl timeZoneName: short
  // yields e.g. "GMT-4"; long yields "Hora de Venezuela" where available.
  try {
    const long = new Intl.DateTimeFormat('es-VE', { timeZone: tz, timeZoneName: 'long' })
      .formatToParts(new Date())
      .find((p) => p.type === 'timeZoneName')?.value
    if (long) return `${long} (${tz})`
  } catch {
    /* fall through */
  }
  return tz
}
