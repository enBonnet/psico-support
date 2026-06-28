import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { eq, and, or, desc, asc, DrizzleError } from 'drizzle-orm'

import { getDb } from '#/db'
import { professionals, user as userTable } from '#/db/schema'
import { getAuth, isAdminEmail } from '#/lib/auth'
import {
  PAIS_OPTIONS,
  VENEZUELA,
  VENEZUELA_ESTADOS,
} from './locations'

export type PublicProfessional = {
  id: number
  name: string
  modality: 'in_person' | 'remote' | 'both'
  country: string
  estado: string | null
  ciudad: string | null
  whatsapp: string
  available: boolean
}

const listSchema = z.object({
  modality: z.enum(['in_person', 'remote']),
})

export const listProfessionals = createServerFn({ method: 'GET' })
  .validator(listSchema)
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
      })
      .from(professionals)
      .where(
        and(
          eq(professionals.verifiedStatus, 'verified'),
          or(
            eq(professionals.modality, data.modality),
            eq(professionals.modality, 'both'),
          ),
        ),
      )
      // ponytail: list all verified pros (not just on-turn), but float the
      // available ones to the top so patients see who's reachable now first.
      .orderBy(desc(professionals.available), asc(professionals.name))
    return rows
  })

// ponytail: target demographics a professional serves. Multi-select, stored
// as a JSON text array. Spanish labels are the stored keys (single-language app).
export const POPULATION_OPTIONS = [
  'Niños',
  'Adolescentes',
  'Adultos',
  'Adultos mayores',
] as const
export type Population = (typeof POPULATION_OPTIONS)[number]

// ponytail: parse the JSON population column; never throw on bad data.
function parsePopulation(raw: string | null | undefined): Population[] {
  if (!raw) return []
  try {
    const v = JSON.parse(raw)
    return Array.isArray(v)
      ? v.filter((x): x is Population =>
          (POPULATION_OPTIONS as readonly string[]).includes(x as string),
        )
      : []
  } catch {
    return []
  }
}

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
      .select({ id: professionals.id })
      .from(professionals)
      .where(eq(professionals.userId, session.user.id))
      .limit(1)
    if (existing.length > 0) {
      throw new Error('Ya tienes un registro profesional.')
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
        modality: professionals.modality,
      })
      .from(professionals)
      .where(eq(professionals.userId, session.user.id))
      .limit(1)
    return rows[0] ?? null
  },
)

const decisionSchema = z.object({
  professionalId: z.number(),
  status: z.enum(['verified', 'rejected']),
})

export const reviewProfessional = createServerFn({ method: 'POST' })
  .validator(decisionSchema)
  .handler(async ({ data }) => {
    const session = await getAuth().api.getSession({ headers: getHeaders() })
    if (!session?.user || !(await isAdminEmail(session.user.email))) {
      throw new Error('Acción solo para administradores.')
    }
    const db = getDb()
    await db
      .update(professionals)
      .set({ verifiedStatus: data.status })
      .where(eq(professionals.id, data.professionalId))
    return { ok: true }
  })

export const listPending = createServerFn({ method: 'GET' }).handler(
  async () => {
    const session = await getAuth().api.getSession({ headers: getHeaders() })
    if (!session?.user || !(await isAdminEmail(session.user.email))) {
      throw new Error('Acción solo para administradores.')
    }
    const db = getDb()
    const rows = await db
      .select({
        id: professionals.id,
        name: professionals.name,
        certificationNumber: professionals.certificationNumber,
        certifyingSchool: professionals.certifyingSchool,
        populationRaw: professionals.population,
        country: professionals.country,
        estado: professionals.estado,
        ciudad: professionals.ciudad,
        credentialCountry: professionals.credentialCountry,
        whatsappCountry: professionals.whatsappCountry,
        modality: professionals.modality,
        whatsapp: professionals.whatsapp,
        userEmail: userTable.email,
      })
      .from(professionals)
      .innerJoin(userTable, eq(userTable.id, professionals.userId))
      .where(eq(professionals.verifiedStatus, 'pending'))
    // ponytail: parse the JSON population column once, server-side, so the
    // admin client gets a clean array.
    return rows.map((r) => ({
      ...r,
      population: parsePopulation(r.populationRaw),
    }))
  },
)

export const listVerified = createServerFn({ method: 'GET' }).handler(
  async () => {
    const db = getDb()
    return db
      .select({
        id: professionals.id,
        name: professionals.name,
        verifiedStatus: professionals.verifiedStatus,
        available: professionals.available,
      })
      .from(professionals)
      .where(eq(professionals.verifiedStatus, 'verified'))
  },
)

// ponytail: admin-gated user management for the "promote from panel" model.
// listUsers feeds the admin UI; promoteToAdmin sets role='admin'. There is
// intentionally no demote action — promote-only means an admin can never
// accidentally lock themselves (or the last admin) out.
export const listUsers = createServerFn({ method: 'GET' }).handler(
  async () => {
    const session = await getAuth().api.getSession({ headers: getHeaders() })
    if (!session?.user || !(await isAdminEmail(session.user.email))) {
      throw new Error('Acción solo para administradores.')
    }
    const db = getDb()
    return db
      .select({
        id: userTable.id,
        name: userTable.name,
        email: userTable.email,
        role: userTable.role,
        createdAt: userTable.createdAt,
      })
      .from(userTable)
      .orderBy(asc(userTable.createdAt))
  },
)

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
