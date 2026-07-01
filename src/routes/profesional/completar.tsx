import { createFileRoute, redirect, Link, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { useForm } from '@tanstack/react-form'
import { useMutation } from '@tanstack/react-query'

import {
  registerStep2Schema,
  createProfessionalProfile,
  getCurrentUser,
  getMyProfessional,
  POPULATION_OPTIONS,
  FOCUS_GROUP_OPTIONS,
  PRACTICE_AREA_OPTIONS,
  VENEZUELA_ESTADOS,
  PAIS_OPTIONS,
} from '#/server/professionals'
import type { RegisterStep2Input } from '#/server/professionals'
import { VENEZUELA, ESTADO_CIUDADES } from '#/server/locations'
import {
  DIAL_CODE,
  FieldShell,
  SectionHeader,
  CertificateInput,
  SupportDocsInput,
  collectFormErrors,
  formatWhatsapp,
  inputCls,
} from '#/components/professional-form'
import type { SupportDocValue } from '#/components/professional-form'

export const Route = createFileRoute('/profesional/completar')({
  beforeLoad: async () => {
    const user = await getCurrentUser()
    if (!user) {
      throw redirect({ to: '/profesional/login' })
    }
    // ponytail: the user already has a professional profile — the "complete
    // your profile" form is redundant. Send them to their panel instead of
    // letting them re-submit. getMyProfessional hides soft-deleted rows, so
    // a deleted user still gets the form to re-register.
    const existing = await getMyProfessional()
    if (existing) throw redirect({ to: '/profesional/panel' })
  },
  // ponytail: CSR-only — auth-gated form, no crawler value. beforeLoad runs
  // client-side here (one getCurrentUser() round-trip); the pending skeleton
  // covers the gap instead of an SSR'd first paint.
  ssr: false,
  component: CompletarPage,
})

function CompletarPage() {
  const navigate = useNavigate()
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [attempted, setAttempted] = useState(false)

  const mutation = useMutation({
    mutationFn: (vars: RegisterStep2Input) =>
      createProfessionalProfile({ data: vars }),
    onSuccess: () => navigate({ to: '/profesional/panel' }),
    onError: (err: Error) => setSubmitError(err.message),
  })

  const form = useForm({
    defaultValues: {
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
        const res = registerStep2Schema.safeParse(value)
        if (res.success) return undefined
        return Object.fromEntries(
          res.error.issues.map((i) => [i.path.join('.'), i.message]),
        )
      },
    },
    onSubmit: ({ value }) => {
      const res = registerStep2Schema.safeParse(value)
      if (!res.success) {
        setAttempted(true)
        return
      }
      setSubmitError(null)
      mutation.mutate(res.data)
    },
    onSubmitInvalid: () => setAttempted(true),
  })

  return (
    <main className="page-wrap flex min-h-[100dvh] flex-col py-6">
      <Link
        to="/profesional/panel"
        className="inline-flex items-center gap-1 self-start py-2 text-base font-medium text-[var(--medi-secondary)]"
      >
        ‹ Atrás
      </Link>

      <h1 className="mt-4 text-2xl font-bold text-[var(--medi-text-primary)]">
        Completar perfil profesional
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
        {/* ── Ubicación ── */}
        <SectionHeader>Ubicación</SectionHeader>
        <form.Field name="country">
          {(field) => (
            <FieldShell label="País donde vives" errors={field.state.meta.errors}>
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
                    <FieldShell label="Estado" errors={field.state.meta.errors}>
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
                        <FieldShell label="Ciudad" errors={field.state.meta.errors}>
                          <select
                            className={inputCls}
                            value={field.state.value}
                            onChange={(e) => field.handleChange(e.target.value)}
                            onBlur={field.handleBlur}
                            disabled={!estado}
                          >
                            <option value="" disabled>
                              {estado ? 'Selecciona…' : 'Primero elige estado'}
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
          Verificamos tu <strong>número de colegiación</strong> directamente en
          el registro del colegio o universidad que te certificó. De forma
          opcional, puedes adjuntar tu <strong>título universitario</strong> o{' '}
          <strong>certificado de egreso</strong> para agilizar la revisión.
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
            <FieldShell label="¿Con quién trabajas?" errors={field.state.meta.errors}>
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
            <FieldShell label="País del WhatsApp" errors={field.state.meta.errors}>
              <select
                className={inputCls}
                value={field.state.value}
                onChange={(e) => {
                  field.handleChange(e.target.value)
                  // ponytail: re-format existing whatsapp with the new dial code.
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
                <FieldShell label="WhatsApp / teléfono" errors={field.state.meta.errors}>
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

        {submitError && (
          <p className="glass-card-soft rounded-[var(--glass-radius-sm)] px-3 py-2 text-sm text-red-700">
            {submitError}
          </p>
        )}

        <form.Subscribe selector={(s) => s.errors}>
          {(errors) => {
            const messages = collectFormErrors(errors)
            if (!attempted || messages.length === 0) return null
            return (
              <ul className="glass-card-soft flex flex-col gap-1 rounded-[var(--glass-radius-sm)] px-3 py-3 text-sm text-red-700">
                <li className="font-semibold">Revisa estos campos para enviar:</li>
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
          {mutation.isPending ? 'Enviando…' : 'Enviar registro'}
        </button>
      </form>
    </main>
  )
}
