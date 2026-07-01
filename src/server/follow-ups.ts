import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { and, eq, like, or, desc, count, sql } from 'drizzle-orm'

import { getDb } from '#/db'
import { followUps, professionals } from '#/db/schema'
import { getAuth } from '#/lib/auth'

// ponytail: clinical follow-up (seguimiento) server fns. Mirrors the
// ownership-scoped pattern in audio-stories.ts: every query derives the pro
// from the session via professionals.userId — a client id is NEVER trusted.
// There is intentionally no public fn and no admin fn here (per product
// decision: follow-ups are private to the pro who wrote them).

// ponytail: mirrors getHeaders() in professionals.ts / audio-stories.ts.
// Duplicated per-domain to keep them decoupled; extract to lib/auth.ts if a
// fourth fn module needs it.
function getHeaders(): Headers {
  const req = (globalThis as unknown as { __TSS_REQUEST__?: Request })
    .__TSS_REQUEST__
  return req ? new Headers(req.headers) : new Headers()
}

// ponytail: PFA-derived (WHO/NCTSN Psychological First Aid) action tags. Multi-
// select, stored as a JSON text array like professionals.population.
export const ACTION_TAKEN_OPTIONS = [
  'Escucha activa',
  'Información sobre afrontamiento',
  'Estabilización',
  'Apoyo social',
  'Derivación',
] as const
export type ActionTaken = (typeof ACTION_TAKEN_OPTIONS)[number]

export const RISK_LEVELS = ['none', 'watch', 'urgent'] as const
export type RiskLevel = (typeof RISK_LEVELS)[number]

export const FOLLOWUP_STATUSES = ['open', 'contacted', 'closed'] as const
export type FollowupStatus = (typeof FOLLOWUP_STATUSES)[number]

// ponytail: phone validation mirrors registerStep2Schema's whatsapp rule so the
// follow-up phone has the same shape as the pro's own WhatsApp.
const PHONE_REGEX = /^\+?\d[\d\s-]{7,}$/

const baseFields = {
  phone: z
    .string()
    .min(8, 'El teléfono es obligatorio')
    .regex(PHONE_REGEX, 'Formato: +58 412 1234567'),
  phoneCountry: z.string().trim().optional().nullable(),
  name: z.string().trim().max(120).optional().nullable(),
  reason: z.string().trim().max(2000).optional().nullable(),
  riskLevel: z.enum(RISK_LEVELS).default('none'),
  actionTaken: z.array(z.enum(ACTION_TAKEN_OPTIONS)).default([]),
  status: z.enum(FOLLOWUP_STATUSES).default('open'),
  notes: z.string().trim().max(8000).optional().nullable(),
  // ponytail: 'YYYY-MM-DD' from <input type="date">. Converted to a UTC-midnight
  // timestamp server-side so it's deterministic regardless of the worker's tz.
  nextContactAt: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida')
    .optional()
    .nullable(),
}

export const followUpCreateSchema = z.object(baseFields)
export const followUpUpdateSchema = z
  .object(baseFields)
  .extend({ id: z.number().int().positive() })

export type FollowUpInput = z.infer<typeof followUpCreateSchema>

// ponytail: resolve the pro id from the session, not the client. Returns null
// when the user has no pro row (the UI gates this, but the server re-checks).
async function requireMyProId(): Promise<number> {
  const session = await getAuth().api.getSession({ headers: getHeaders() })
  if (!session?.user) {
    throw new Error('Debes iniciar sesión.')
  }
  const db = getDb()
  const rows = await db
    .select({ id: professionals.id })
    .from(professionals)
    .where(eq(professionals.userId, session.user.id))
    .limit(1)
  const pro = rows.at(0)
  if (!pro) {
    throw new Error('Completa tu perfil profesional primero.')
  }
  return pro.id
}

// ponytail: 'YYYY-MM-DD' -> UTC-midnight Date, or null. Stored on the
// timestamp_ms column; the client formats the date back from the Date.
function toDate(d: string | null | undefined): Date | null {
  if (!d) return null
  return new Date(`${d}T00:00:00Z`)
}

function parseActionTaken(raw: string | null | undefined): ActionTaken[] {
  if (!raw) return []
  try {
    const v = JSON.parse(raw)
    return Array.isArray(v)
      ? v.filter((x): x is ActionTaken =>
          (ACTION_TAKEN_OPTIONS as readonly string[]).includes(x as string),
        )
      : []
  } catch {
    return []
  }
}

export type MyFollowUp = {
  id: number
  phone: string
  phoneCountry: string | null
  name: string | null
  reason: string | null
  riskLevel: RiskLevel
  actionTaken: ActionTaken[]
  status: FollowupStatus
  notes: string | null
  nextContactAt: Date | null
  createdAt: Date
  updatedAt: Date
}

function toRow(r: {
  id: number
  phone: string
  phoneCountry: string | null
  name: string | null
  reason: string | null
  riskLevel: string
  actionTakenRaw: string | null
  status: string
  notes: string | null
  nextContactAt: Date | null
  createdAt: Date
  updatedAt: Date
}): MyFollowUp {
  return {
    id: r.id,
    phone: r.phone,
    phoneCountry: r.phoneCountry,
    name: r.name,
    reason: r.reason,
    riskLevel: r.riskLevel as RiskLevel,
    actionTaken: parseActionTaken(r.actionTakenRaw),
    status: r.status as FollowupStatus,
    notes: r.notes,
    nextContactAt: r.nextContactAt,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  }
}

const followUpSelect = {
  id: followUps.id,
  phone: followUps.phone,
  phoneCountry: followUps.phoneCountry,
  name: followUps.name,
  reason: followUps.reason,
  riskLevel: followUps.riskLevel,
  actionTakenRaw: followUps.actionTaken,
  status: followUps.status,
  notes: followUps.notes,
  nextContactAt: followUps.nextContactAt,
  createdAt: followUps.createdAt,
  updatedAt: followUps.updatedAt,
} as const

export const followUpListSchema = z.object({
  q: z.string().trim().optional(),
  status: z.enum(FOLLOWUP_STATUSES).optional(),
  riskLevel: z.enum(RISK_LEVELS).optional(),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(48).default(12),
})

// ponytail: list the caller's own entries, newest first. q LIKEs phone/name/
// reason; status + riskLevel are exact. Paginated with a total for the UI.
// Ownership is enforced by WHERE professional_id = <session pro id>.
export const listMyFollowUps = createServerFn({ method: 'GET' })
  .validator(followUpListSchema)
  .handler(async ({ data }) => {
    const proId = await requireMyProId()
    const db = getDb()
    const where = and(
      eq(followUps.professionalId, proId),
      data.status ? eq(followUps.status, data.status) : undefined,
      data.riskLevel ? eq(followUps.riskLevel, data.riskLevel) : undefined,
      data.q
        ? or(
            like(followUps.phone, `%${data.q}%`),
            like(followUps.name, `%${data.q}%`),
            like(followUps.reason, `%${data.q}%`),
          )
        : undefined,
    )
    const offset = (data.page - 1) * data.pageSize
    const [rows, totalRows] = await Promise.all([
      db
        .select(followUpSelect)
        .from(followUps)
        .where(where)
        .orderBy(desc(followUps.createdAt), desc(followUps.id))
        .limit(data.pageSize)
        .offset(offset),
      db.select({ n: count() }).from(followUps).where(where),
    ])
    return {
      rows: rows.map(toRow),
      total: totalRows.at(0)?.n ?? 0,
    }
  })

export const createMyFollowUp = createServerFn({ method: 'POST' })
  .validator(followUpCreateSchema)
  .handler(async ({ data }) => {
    const proId = await requireMyProId()
    const db = getDb()
    const inserted = await db
      .insert(followUps)
      .values({
        professionalId: proId,
        phone: data.phone.trim(),
        phoneCountry: data.phoneCountry ?? null,
        name: data.name?.trim() || null,
        reason: data.reason?.trim() || null,
        riskLevel: data.riskLevel,
        actionTaken:
          data.actionTaken.length > 0
            ? JSON.stringify(data.actionTaken)
            : null,
        status: data.status,
        notes: data.notes?.trim() || null,
        nextContactAt: toDate(data.nextContactAt),
      })
      .returning({ id: followUps.id })
    return { ok: true as const, id: inserted.at(0)?.id }
  })

export const updateMyFollowUp = createServerFn({ method: 'POST' })
  .validator(followUpUpdateSchema)
  .handler(async ({ data }) => {
    const proId = await requireMyProId()
    const db = getDb()
    // ponytail: ownership = WHERE id AND professional_id = <session pro id>.
    // A row that isn't yours simply matches 0 rows (not-found == forbidden;
    // we don't leak which).
    await db
      .update(followUps)
      .set({
        phone: data.phone.trim(),
        phoneCountry: data.phoneCountry ?? null,
        name: data.name?.trim() || null,
        reason: data.reason?.trim() || null,
        riskLevel: data.riskLevel,
        actionTaken:
          data.actionTaken.length > 0
            ? JSON.stringify(data.actionTaken)
            : null,
        status: data.status,
        notes: data.notes?.trim() || null,
        nextContactAt: toDate(data.nextContactAt),
      })
      .where(
        and(
          eq(followUps.id, data.id),
          eq(followUps.professionalId, proId),
        ),
      )
    return { ok: true as const }
  })

const deleteSchema = z.object({ id: z.number().int().positive() })

export const deleteMyFollowUp = createServerFn({ method: 'POST' })
  .validator(deleteSchema)
  .handler(async ({ data }) => {
    const proId = await requireMyProId()
    const db = getDb()
    await db
      .delete(followUps)
      .where(
        and(
          eq(followUps.id, data.id),
          eq(followUps.professionalId, proId),
        ),
      )
    return { ok: true as const }
  })

// ponytail: single-number count of this pro's open (status='open') follow-ups,
// for a panel badge. Cheap (1 row) + auth-gated.
export const countMyOpenFollowUps = createServerFn({ method: 'GET' }).handler(
  async () => {
    const proId = await requireMyProId()
    const db = getDb()
    const rows = await db
      .select({ n: sql<number>`count(*)` })
      .from(followUps)
      .where(
        and(
          eq(followUps.professionalId, proId),
          eq(followUps.status, 'open'),
        ),
      )
    return rows.at(0)?.n ?? 0
  },
)
