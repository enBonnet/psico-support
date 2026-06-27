import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useRef, useState } from 'react'
import { useForm } from '@tanstack/react-form'
import { useMutation } from '@tanstack/react-query'
import { Camera } from 'lucide-react'

import {
  registerProfessional,
  registerSchema,
  registerStep1Schema,
  registerStep2Schema,
  COLEGIO_OPTIONS,
  VENEZUELA_ESTADOS,
  PAIS_OPTIONS,
} from '#/server/professionals'
import { VENEZUELA, ESTADO_CIUDADES } from '#/server/locations'
import type { RegisterInput } from '#/server/professionals'

export const Route = createFileRoute('/profesional/registro')({
  component: RegisterPage,
})

const inputCls = 'glass-input h-12 w-full px-3 text-base'

// ponytail: country -> dial code for WhatsApp formatting. Only the
// countries we actually list in PAIS_OPTIONS. "Otro" falls back to
// raw digits (no country prefix assumed).
const DIAL_CODE: Record<string, string> = {
  Venezuela: '+58',
  Argentina: '+54',
  Bolivia: '+591',
  Brasil: '+55',
  Canadá: '+1',
  Chile: '+56',
  Colombia: '+57',
  'Costa Rica': '+506',
  Cuba: '+53',
  Ecuador: '+593',
  'El Salvador': '+503',
  'Estados Unidos': '+1',
  Guatemala: '+502',
  Honduras: '+504',
  México: '+52',
  Nicaragua: '+505',
  Panamá: '+507',
  Paraguay: '+595',
  Perú: '+51',
  'Puerto Rico': '+1',
  'República Dominicana': '+1',
  Uruguay: '+598',
  Otro: '',
}

// Cédula: V/E + optional dash + up to 8 digits. "v12345678" -> "V-12345678".
function formatCedula(raw: string): string {
  const clean = raw.toUpperCase().replace(/[^VE\d]/g, '')
  const letter = clean[0] ?? ''
  const digits = clean.slice(1).replace(/\D/g, '').slice(0, 8)
  if (!letter) return digits
  return digits ? `${letter}-${digits}` : letter
}

// FPV: digits only, max 12.
function formatFpv(raw: string): string {
  return raw.replace(/\D/g, '').slice(0, 12)
}

// WhatsApp: keep the country's dial code + digits, grouped for readability.
// ponytail: naive grouping by fixed lengths per country; not a full libphonenumber.
function formatWhatsapp(raw: string, country: string): string {
  const dial = DIAL_CODE[country] ?? ''
  const cleaned = raw.replace(/[^\d+]/g, '')
  // strip a leading dial code if present so we don't double it
  let digits = cleaned
  if (dial && digits.startsWith(dial.replace(/\s/g, ''))) {
    digits = digits.slice(dial.replace(/\s/g, '').length)
  } else if (digits.startsWith('+')) {
    // keep the +NN as-is (user typed international form)
    const plus = digits.indexOf('+')
    const rest = digits.slice(plus + 1).replace(/\D/g, '')
    return '+' + rest
  }
  digits = digits.replace(/\D/g, '').slice(0, 11)
  if (!digits) return dial ? dial + ' ' : ''
  return dial ? `${dial} ${digits}` : digits
}

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
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [step, setStep] = useState<1 | 2>(1)
  const stepRef = useRef(step)
  stepRef.current = step
  const [attempted, setAttempted] = useState(false)

  const mutation = useMutation({
    mutationFn: (vars: RegisterInput) => registerProfessional({ data: vars }),
    onSuccess: () => navigate({ to: '/profesional/login' }),
    onError: (err: Error) => setSubmitError(err.message),
  })

  const form = useForm({
    defaultValues: {
      name: '',
      email: '',
      password: '',
      cedula: '',
      fpvNumber: '',
      colegioRegional: '',
      modality: '',
      country: '',
      estado: '',
      ciudad: '',
      credentialCountry: '',
      whatsappCountry: '',
      whatsapp: '',
      credentialFileR2Key: '',
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
        Registro de Profesional
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
            <form.Field name="credentialCountry">
              {(field) => (
                <FieldShell
                  label="País de tu credencial"
                  errors={field.state.meta.errors}
                >
                  <select
                    className={inputCls}
                    value={field.state.value}
                    onChange={(e) => {
                      field.handleChange(e.target.value)
                      // ponytail: reset Venezuelan credential fields when
                      // the credential country changes away from Venezuela.
                      if (e.target.value !== VENEZUELA) {
                        form.setFieldValue('cedula', '')
                        form.setFieldValue('fpvNumber', '')
                        form.setFieldValue('colegioRegional', '')
                      }
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

            <form.Subscribe selector={(s) => s.values.credentialCountry}>
              {(credentialCountry) =>
                credentialCountry === VENEZUELA ? (
                  <>
                    <form.Field name="cedula">
                      {(field) => (
                        <FieldShell
                          label="Cédula (V-12345678)"
                          errors={field.state.meta.errors}
                        >
                          <input
                            type="text"
                            autoCapitalize="none"
                            className={inputCls}
                            value={field.state.value}
                            onChange={(e) =>
                              field.handleChange(formatCedula(e.target.value))
                            }
                            onBlur={field.handleBlur}
                          />
                        </FieldShell>
                      )}
                    </form.Field>

                    <form.Field name="fpvNumber">
                      {(field) => (
                        <FieldShell
                          label="Número FPV"
                          errors={field.state.meta.errors}
                        >
                          <input
                            type="text"
                            inputMode="numeric"
                            pattern="[0-9]*"
                            autoCapitalize="none"
                            className={inputCls}
                            value={field.state.value}
                            onChange={(e) =>
                              field.handleChange(formatFpv(e.target.value))
                            }
                            onBlur={field.handleBlur}
                          />
                        </FieldShell>
                      )}
                    </form.Field>

                    <form.Field name="colegioRegional">
                      {(field) => (
                        <FieldShell
                          label="Colegio regional"
                          errors={field.state.meta.errors}
                        >
                          <select
                            className={inputCls}
                            value={field.state.value}
                            onChange={(e) =>
                              field.handleChange(e.target.value)
                            }
                            onBlur={field.handleBlur}
                          >
                            <option value="" disabled>
                              Selecciona…
                            </option>
                            {COLEGIO_OPTIONS.map((c) => (
                              <option key={c} value={c}>
                                {c}
                              </option>
                            ))}
                          </select>
                        </FieldShell>
                      )}
                    </form.Field>
                  </>
                ) : null
              }
            </form.Subscribe>

            <CredentialUpload form={form} />

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
                      const current = form.getFieldValue('whatsapp') ?? ''
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
      </form>
    </main>
  )
}

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mt-4 border-b border-[var(--medi-border)] pb-1 text-sm font-semibold uppercase tracking-wide text-[var(--medi-text-secondary)]">
      {children}
    </h2>
  )
}

function FieldShell({
  label,
  errors,
  children,
}: {
  label: string
  errors: unknown[]
  children: React.ReactNode
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-sm font-medium text-[var(--medi-text-primary)]">
        {label}
      </span>
      {children}
      {errors.length > 0 && (
        <span className="text-sm text-red-600">
          {(errors[0] as { message?: string }).message ?? 'Inválido'}
        </span>
      )}
    </label>
  )
}

function CredentialUpload<TForm extends { Field: React.FC<any> }>({
  form,
}: {
  // ponytail: form type inferred loosely; field access is duck-typed here.
  form: TForm
}) {
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  return (
    <form.Field name="credentialFileR2Key">
      {(field: {
        state: { value: string; meta: { errors: unknown[] } }
        handleChange: (v: string) => void
      }) => {
        async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
          const file = e.target.files?.[0]
          if (!file) return
          setUploading(true)
          setError(null)
          try {
            const fd = new FormData()
            fd.append('file', file)
            const res = await fetch('/api/credential/upload', {
              method: 'POST',
              body: fd,
            })
            if (!res.ok) {
              const body = (await res
                .json()
                .catch(() => ({ error: 'upload_failed' }))) as { error: string }
              throw new Error(
                body.error === 'too_large'
                  ? 'La imagen supera 8MB.'
                  : 'No se pudo subir la imagen.',
              )
            }
            const json: { key: string } = await res.json()
            const { key } = json
            field.handleChange(key)
          } catch (err) {
            setError((err as Error).message)
          } finally {
            setUploading(false)
          }
        }
        const errors = field.state.meta.errors
        return (
          <FieldShell label="Credencial (foto)" errors={errors}>
            <span className="glass-card-soft flex min-h-16 cursor-pointer items-center justify-center gap-2 rounded-[var(--glass-radius-sm)] px-4 py-4 text-base text-[var(--medi-text-secondary)]">
              <Camera className="size-5" />
              {uploading
                ? 'Subiendo…'
                : field.state.value
                  ? '✓ Foto subida'
                  : 'Toca para tomar o elegir una foto'}
              <input
                type="file"
                accept="image/*"
                capture="environment"
                className="sr-only"
                onChange={onFile}
              />
            </span>
            {error && <span className="text-sm text-red-600">{error}</span>}
          </FieldShell>
        )
      }}
    </form.Field>
  )
}
