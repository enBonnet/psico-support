import {
  createFileRoute,
  redirect,
  Link,
  useNavigate,
} from '@tanstack/react-router'
import { useRef, useState } from 'react'
import { useForm } from '@tanstack/react-form'
import { useMutation, useQueryClient } from '@tanstack/react-query'

import {
  registerProfessional,
  registerSchema,
  registerStep1Schema,
  registerStep2Schema,
  getCurrentUser,
  POPULATION_OPTIONS,
  FOCUS_GROUP_OPTIONS,
  PRACTICE_AREA_OPTIONS,
  VENEZUELA_ESTADOS,
  PAIS_OPTIONS,
} from '#/server/professionals'
import { VENEZUELA, ESTADO_CIUDADES } from '#/server/locations'
import type { RegisterInput } from '#/server/professionals'
import {
  DIAL_CODE,
  FieldShell,
  SectionHeader,
  CertificateInput,
  SupportDocsInput,
  formatWhatsapp,
  inputCls,
} from '#/components/professional-form'
import type { SupportDocValue } from '#/components/professional-form'
import { authClient } from '#/lib/auth-client'
import { notify } from '#/lib/notifications'

export const Route = createFileRoute('/profesional/registro')({
  beforeLoad: async () => {
    // ponytail: an authenticated user already has an account, so the
    // account-creation step of this form is redundant. Send them to the
    // role-aware hub (a pro lands on their panel, a basic user on /cuenta).
    const user = await getCurrentUser()
    if (user) throw redirect({ to: '/cuenta' })
  },
  // ponytail: CSR-only — multi-step professional registration form, no
  // crawler value. Server fns + auth still work via the worker RPC.
  ssr: false,
  component: RegisterPage,
})

// ponytail: step 1 fields; everything else belongs to step 2. Keeps the
// error summary scoped to what's visible so users aren't told to fix a
// field they can't see.
const STEP1_FIELDS = ['name', 'email', 'password']

function collectStepErrors(
  errors: unknown,
  step: 1 | 2,
): { path: string; message: string }[] {
  const step1Fields = new Set(STEP1_FIELDS)
  // ponytail: form.errors is an array of validator-returned objects; our
  // onChange validator returns a single {path: message} map, so flatten.
  const flat: Record<string, unknown> = {}
  if (Array.isArray(errors)) {
    for (const e of errors) {
      if (e && typeof e === 'object') Object.assign(flat, e)
    }
  } else if (errors && typeof errors === 'object') {
    Object.assign(flat, errors)
  }
  const out: { path: string; message: string }[] = []
  for (const [path, raw] of Object.entries(flat)) {
    const isStep1 = step1Fields.has(path)
    if (step === 1 && !isStep1) continue
    if (step === 2 && isStep1) continue
    const message =
      typeof raw === 'object' && raw !== null && 'message' in raw
        ? String((raw as { message?: unknown }).message)
        : typeof raw === 'string'
          ? raw
          : 'Inválido'
    out.push({ path, message })
  }
  return out
}

function RegisterPage() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [step, setStep] = useState<1 | 2>(1)
  const stepRef = useRef(step)
  stepRef.current = step
  const [attempted, setAttempted] = useState(false)

  const mutation = useMutation({
    mutationFn: (vars: RegisterInput) => registerProfessional({ data: vars }),
    onSuccess: async (_data, vars) => {
      // ponytail: registerProfessional creates the account + pro row but does
      // NOT establish a session. Sign in on the client so the pro lands on
      // their panel instead of getting bounced to login. The form already
      // holds validated email/password in vars (same race-fix as login,
      // CHANGELOG 1.3.3: getSession round-trip + ['me'] invalidation).
      try {
        const { error: signInErr } = await authClient.signIn.email({
          email: vars.email,
          password: vars.password,
        })
        if (signInErr) throw signInErr
        await authClient.getSession()
        qc.invalidateQueries({ queryKey: ['me'] })
        qc.invalidateQueries({ queryKey: ['my-professional'] })
        notify({
          type: 'info',
          title: 'Cuenta creada — en revisión',
          body: 'Un administrador activará tu perfil. Te avisaremos cuando esté aprobado.',
        })
        await navigate({ to: '/profesional/panel' })
      } catch {
        // ponytail: account was created successfully, so login always works.
        // If the client sign-in races (transient / D1 read lag on the fresh
        // row), fall back to the login page — never strand the user.
        notify({
          type: 'warning',
          title: 'Cuenta creada — inicia sesión',
          body: 'Tu registro se guardó. Inicia sesión para entrar a tu panel.',
        })
        await navigate({ to: '/profesional/login' })
      }
    },
    onError: (err: Error) => setSubmitError(err.message),
  })

  const form = useForm({
    defaultValues: {
      name: '',
      email: '',
      password: '',
      certificationNumber: '',
      certifyingSchool: '',
      population: [] as string[],
      focusGroups: [] as string[],
      practiceAreas: [] as string[],
      modality: '',
      country: '',
      estado: '',
      ciudad: '',
      credentialCountry: '',
      whatsappCountry: '',
      whatsapp: '',
      certificate: null as { data: string; type: string } | null,
      supportDocs: [] as SupportDocValue[],
    },
    validators: {
      onChange: ({ value }) => {
        // ponytail: validate only the current step's fields so the error
        // summary and per-field errors match what's visible.
        const schema =
          stepRef.current === 1 ? registerStep1Schema : registerStep2Schema
        const res = schema.safeParse(value)
        if (res.success) return undefined
        return Object.fromEntries(
          res.error.issues.map((i) => [i.path.join('.'), i.message]),
        )
      },
    },
    onSubmit: ({ value }) => {
      if (stepRef.current === 1) {
        // ponytail: guard advance with a fresh step-1 parse; onChange may
        // have cleared errors after a field edit but we want an explicit
        // gate on "Continuar".
        const res = registerStep1Schema.safeParse(value)
        if (!res.success) {
          setAttempted(true)
          return
        }
        setAttempted(false)
        setStep(2)
        return
      }
      // ponytail: final submit validates the full object (both steps).
      const res = registerSchema.safeParse(value)
      if (!res.success) {
        setAttempted(true)
        return
      }
      setSubmitError(null)
      mutation.mutate(value as RegisterInput)
    },
    onSubmitInvalid: () => setAttempted(true),
  })

  return (
    <main className="page-wrap flex min-h-[100dvh] flex-col py-6">
      <Link
        to="/"
        className="inline-flex items-center gap-1 self-start py-2 text-base font-medium text-[var(--medi-secondary)]"
      >
        ‹ Atrás
      </Link>

      <h1 className="mt-4 text-2xl font-bold text-[var(--medi-text-primary)]">
        Registro de profesional
      </h1>
      <div className="section-underline mt-2" />
      <p className="mt-3 text-sm text-[var(--medi-text-secondary)]">
        Verificamos tus credenciales antes de publicarte. Una vez aprobado,
        activas tu disponibilidad desde el panel.
      </p>

      <form
        onSubmit={(e) => {
          e.preventDefault()
          form.handleSubmit()
        }}
        className="mt-6 flex flex-col gap-4 pb-12"
        noValidate
      >
        {step === 2 && (
          <button
            type="button"
            onClick={() => setStep(1)}
            className="self-start py-1 text-sm font-medium text-[var(--medi-secondary)]"
          >
            ‹ Volver
          </button>
        )}
        {step === 1 && (
          <>
            <form.Field name="name">
              {(field) => (
                <FieldShell
                  label="Tu nombre completo"
                  errors={field.state.meta.errors}
                >
                  <input
                    type="text"
                    autoComplete="name"
                    className={inputCls}
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                    onBlur={field.handleBlur}
                  />
                </FieldShell>
              )}
            </form.Field>

            <form.Field name="email">
              {(field) => (
                <FieldShell
                  label="Correo electrónico"
                  errors={field.state.meta.errors}
                >
                  <input
                    type="email"
                    autoComplete="email"
                    inputMode="email"
                    className={inputCls}
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                    onBlur={field.handleBlur}
                  />
                </FieldShell>
              )}
            </form.Field>

            <form.Field name="password">
              {(field) => (
                <FieldShell
                  label="Contraseña (mín. 8)"
                  errors={field.state.meta.errors}
                >
                  <input
                    type="password"
                    autoComplete="new-password"
                    className={inputCls}
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                    onBlur={field.handleBlur}
                  />
                </FieldShell>
              )}
            </form.Field>
          </>
        )}

        {step === 2 && (
          <>
            {/* ── Ubicación ── */}
            <SectionHeader>Ubicación</SectionHeader>
            <form.Field name="country">
              {(field) => (
                <FieldShell
                  label="País donde vives"
                  errors={field.state.meta.errors}
                >
                  <select
                    className={inputCls}
                    value={field.state.value}
                    onChange={(e) => {
                      field.handleChange(e.target.value)
                      // ponytail: reset estado/ciudad when country changes to avoid
                      // stale selections from a different country's map.
                      form.setFieldValue('estado', '')
                      form.setFieldValue('ciudad', '')
                    }}
                    onBlur={field.handleBlur}
                  >
                    <option value="" disabled>
                      Selecciona…
                    </option>
                    {PAIS_OPTIONS.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </FieldShell>
              )}
            </form.Field>

            <form.Subscribe selector={(s) => s.values.country}>
              {(country) =>
                country === VENEZUELA ? (
                  <>
                    <form.Field name="estado">
                      {(field) => (
                        <FieldShell
                          label="Estado"
                          errors={field.state.meta.errors}
                        >
                          <select
                            className={inputCls}
                            value={field.state.value}
                            onChange={(e) => {
                              field.handleChange(e.target.value)
                              form.setFieldValue('ciudad', '')
                            }}
                            onBlur={field.handleBlur}
                          >
                            <option value="" disabled>
                              Selecciona…
                            </option>
                            {VENEZUELA_ESTADOS.map((r) => (
                              <option key={r} value={r}>
                                {r}
                              </option>
                            ))}
                          </select>
                        </FieldShell>
                      )}
                    </form.Field>

                    <form.Subscribe selector={(s) => s.values.estado}>
                      {(estado) => (
                        <form.Field name="ciudad">
                          {(field) => (
                            <FieldShell
                              label="Ciudad"
                              errors={field.state.meta.errors}
                            >
                              <select
                                className={inputCls}
                                value={field.state.value}
                                onChange={(e) =>
                                  field.handleChange(e.target.value)
                                }
                                onBlur={field.handleBlur}
                                disabled={!estado}
                              >
                                <option value="" disabled>
                                  {estado
                                    ? 'Selecciona…'
                                    : 'Primero elige estado'}
                                </option>
                                {estado &&
                                  ESTADO_CIUDADES[estado].map((c) => (
                                    <option key={c} value={c}>
                                      {c}
                                    </option>
                                  ))}
                              </select>
                            </FieldShell>
                          )}
                        </form.Field>
                      )}
                    </form.Subscribe>
                  </>
                ) : null
              }
            </form.Subscribe>

            {/* ── Credencial profesional ── */}
            <SectionHeader>Credencial profesional</SectionHeader>
            <p className="text-sm text-[var(--medi-text-secondary)]">
              Verificamos tu <strong>número de colegiación</strong> directamente
              en el registro del colegio o universidad que te certificó. De forma
              opcional, puedes adjuntar tu <strong>título universitario</strong>{' '}
              o <strong>certificado de egreso</strong> para agilizar la revisión.
            </p>
            <form.Field name="credentialCountry">
              {(field) => (
                <FieldShell
                  label="País del colegio o certificación"
                  errors={field.state.meta.errors}
                >
                  <select
                    className={inputCls}
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                    onBlur={field.handleBlur}
                  >
                    <option value="" disabled>
                      Selecciona…
                    </option>
                    {PAIS_OPTIONS.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </FieldShell>
              )}
            </form.Field>

            <form.Field name="certificationNumber">
              {(field) => (
                <FieldShell
                  label="Número de colegiación"
                  errors={field.state.meta.errors}
                >
                  <input
                    type="text"
                    autoCapitalize="none"
                    autoCorrect="off"
                    className={inputCls}
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                    onBlur={field.handleBlur}
                    placeholder="Ej. 12345"
                  />
                </FieldShell>
              )}
            </form.Field>

            <form.Field name="certifyingSchool">
              {(field) => (
                <FieldShell
                  label="Colegio / institución (opcional)"
                  errors={field.state.meta.errors}
                >
                  <input
                    type="text"
                    autoCapitalize="words"
                    className={inputCls}
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                    onBlur={field.handleBlur}
                    placeholder="Ej. Colegio de Psicólogos de Venezuela"
                  />
                </FieldShell>
              )}
            </form.Field>

            <form.Field name="certificate">
              {(field) => (
                <FieldShell
                  label="Título o certificado de egreso (opcional)"
                  errors={field.state.meta.errors}
                >
                  <CertificateInput
                    value={field.state.value}
                    onChange={(v) => field.handleChange(v)}
                  />
                </FieldShell>
              )}
            </form.Field>

            <form.Field name="supportDocs">
              {(field) => (
                <FieldShell
                  label="Documentos adicionales (opcional)"
                  errors={field.state.meta.errors}
                >
                  <SupportDocsInput
                    value={field.state.value}
                    onChange={(v) => field.handleChange(v)}
                  />
                </FieldShell>
              )}
            </form.Field>

            <form.Field name="population">
              {(field) => (
                <FieldShell
                  label="¿Con quién trabajas?"
                  errors={field.state.meta.errors}
                >
                  <div className="flex flex-wrap gap-2">
                    {POPULATION_OPTIONS.map((opt) => {
                      const selected = field.state.value.includes(opt)
                      return (
                        <button
                          key={opt}
                          type="button"
                          aria-pressed={selected}
                          onClick={() =>
                            field.handleChange(
                              selected
                                ? field.state.value.filter((v: string) => v !== opt)
                                : [...field.state.value, opt],
                            )
                          }
                          className={
                            'min-h-11 rounded-[var(--glass-radius-sm)] border px-4 py-2 text-sm font-medium transition-all ' +
                            (selected
                              ? 'border-[var(--medi-secondary)] bg-[var(--medi-secondary)] text-white'
                              : 'border-[var(--medi-border)] text-[var(--medi-text-secondary)] hover:translate-y-[-1px]')
                          }
                        >
                          {opt}
                        </button>
                      )
                    })}
                  </div>
                </FieldShell>
              )}
            </form.Field>

            <form.Field name="focusGroups">
              {(field) => (
                <FieldShell
                  label="¿Con qué poblaciones específicas trabajas? (opcional)"
                  errors={field.state.meta.errors}
                >
                  <div className="flex flex-wrap gap-2">
                    {FOCUS_GROUP_OPTIONS.map((opt) => {
                      const selected = field.state.value.includes(opt)
                      return (
                        <button
                          key={opt}
                          type="button"
                          aria-pressed={selected}
                          onClick={() =>
                            field.handleChange(
                              selected
                                ? field.state.value.filter(
                                    (v: string) => v !== opt,
                                  )
                                : [...field.state.value, opt],
                            )
                          }
                          className={
                            'min-h-11 rounded-[var(--glass-radius-sm)] border px-4 py-2 text-sm font-medium transition-all ' +
                            (selected
                              ? 'border-[var(--medi-secondary)] bg-[var(--medi-secondary)] text-white'
                              : 'border-[var(--medi-border)] text-[var(--medi-text-secondary)] hover:translate-y-[-1px]')
                          }
                        >
                          {opt}
                        </button>
                      )
                    })}
                  </div>
                </FieldShell>
              )}
            </form.Field>

            <form.Field name="practiceAreas">
              {(field) => (
                <FieldShell
                  label="¿En qué áreas intervienes? (opcional)"
                  errors={field.state.meta.errors}
                >
                  <div className="flex flex-wrap gap-2">
                    {PRACTICE_AREA_OPTIONS.map((opt) => {
                      const selected = field.state.value.includes(opt)
                      return (
                        <button
                          key={opt}
                          type="button"
                          aria-pressed={selected}
                          onClick={() =>
                            field.handleChange(
                              selected
                                ? field.state.value.filter(
                                    (v: string) => v !== opt,
                                  )
                                : [...field.state.value, opt],
                            )
                          }
                          className={
                            'min-h-11 rounded-[var(--glass-radius-sm)] border px-4 py-2 text-sm font-medium transition-all ' +
                            (selected
                              ? 'border-[var(--medi-secondary)] bg-[var(--medi-secondary)] text-white'
                              : 'border-[var(--medi-border)] text-[var(--medi-text-secondary)] hover:translate-y-[-1px]')
                          }
                        >
                          {opt}
                        </button>
                      )
                    })}
                  </div>
                </FieldShell>
              )}
            </form.Field>

            {/* ── Contacto & modalidad ── */}
            <SectionHeader>Contacto &amp; modalidad</SectionHeader>
            <form.Field name="modality">
              {(field) => (
                <FieldShell label="Modalidad" errors={field.state.meta.errors}>
                  <select
                    className={inputCls}
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                    onBlur={field.handleBlur}
                  >
                    <option value="" disabled>
                      Selecciona…
                    </option>
                    <option value="in_person">Presencial</option>
                    <option value="remote">A distancia</option>
                    <option value="both">Ambas</option>
                  </select>
                </FieldShell>
              )}
            </form.Field>

            <form.Field name="whatsappCountry">
              {(field) => (
                <FieldShell
                  label="País del WhatsApp"
                  errors={field.state.meta.errors}
                >
                  <select
                    className={inputCls}
                    value={field.state.value}
                    onChange={(e) => {
                      field.handleChange(e.target.value)
                      // ponytail: re-format existing whatsapp with the new
                      // dial code so the prefix follows the selector.
                      const current = form.getFieldValue('whatsapp')
                      form.setFieldValue(
                        'whatsapp',
                        formatWhatsapp(current, e.target.value),
                      )
                    }}
                    onBlur={field.handleBlur}
                  >
                    <option value="" disabled>
                      Selecciona…
                    </option>
                    {PAIS_OPTIONS.map((c) => (
                      <option key={c} value={c}>
                        {c} ({DIAL_CODE[c] ?? '+'})
                      </option>
                    ))}
                  </select>
                </FieldShell>
              )}
            </form.Field>

            <form.Subscribe selector={(s) => s.values.whatsappCountry}>
              {(whatsappCountry) => (
                <form.Field name="whatsapp">
                  {(field) => (
                    <FieldShell
                      label="WhatsApp / teléfono"
                      errors={field.state.meta.errors}
                    >
                      <input
                        type="tel"
                        inputMode="tel"
                        autoCapitalize="none"
                        className={inputCls}
                        value={field.state.value}
                        onChange={(e) =>
                          field.handleChange(
                            formatWhatsapp(e.target.value, whatsappCountry),
                          )
                        }
                        onBlur={field.handleBlur}
                      />
                    </FieldShell>
                  )}
                </form.Field>
              )}
            </form.Subscribe>
          </>
        )}

        {submitError && (
          <p className="glass-card-soft rounded-[var(--glass-radius-sm)] px-3 py-2 text-sm text-red-700">
            {submitError}
          </p>
        )}

        <form.Subscribe selector={(s) => s.errors}>
          {(errors) => {
            const messages = collectStepErrors(errors, step)
            if (!attempted || messages.length === 0) return null
            return (
              <ul className="glass-card-soft flex flex-col gap-1 rounded-[var(--glass-radius-sm)] px-3 py-3 text-sm text-red-700">
                <li className="font-semibold">
                  {step === 1
                    ? 'Revisa estos campos para continuar:'
                    : 'Revisa estos campos para enviar:'}
                </li>
                {messages.map((m) => (
                  <li key={m.path} className="pl-2">
                    • {m.message}
                  </li>
                ))}
              </ul>
            )
          }}
        </form.Subscribe>

        <button
          type="submit"
          disabled={mutation.isPending}
          className="glass-primary mt-2 flex min-h-14 items-center justify-center rounded-[var(--glass-radius-sm)] px-6 py-4 text-base font-semibold text-white transition-all hover:translate-y-[-1px] disabled:opacity-60"
        >
          {step === 1
            ? 'Continuar'
            : mutation.isPending
              ? 'Enviando…'
              : 'Enviar registro'}
        </button>

        <p className="text-center text-sm text-[var(--medi-text-secondary)]">
          ¿Ya tienes cuenta?{' '}
          <Link
            to="/profesional/login"
            className="font-semibold text-[var(--medi-secondary)]"
          >
            Inicia sesión
          </Link>
        </p>
        <p className="text-center text-sm text-[var(--medi-text-secondary)]">
          ¿Solo quieres una cuenta (no eres profesional)?{' '}
          <Link to="/signup" className="font-semibold text-[var(--medi-secondary)]">
            Crear cuenta
          </Link>
        </p>
      </form>
    </main>
  )
}

