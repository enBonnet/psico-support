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
import { SPECIALIZED_AREA_OPTIONS } from '#/lib/professional-shared'
import type { RegisterStep2Input, SpecializationMode } from '#/server/professionals'
import { VENEZUELA, ESTADO_CIUDADES } from '#/server/locations'
import {
  FieldShell,
  SectionHeader,
  CertificateInput,
  SupportDocsInput,
  collectFormErrors,
  inputCls,
} from '#/components/professional-form'
import type { SupportDocValue } from '#/components/professional-form'
import { TagSelect } from '#/components/tag-select'
import { PhoneInput } from '#/components/phone-input'
import { Switch } from '#/components/ui/switch'
import { noindexHead } from '#/lib/seo'

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
  head: noindexHead,
  component: CompletarPage,
})

function CompletarPage() {
  const navigate = useNavigate()
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [attempted, setAttempted] = useState(false)
  // ponytail: "Atención general" toggle (see registro.tsx). Derived UI state —
  // when ON the four specialization axes are cleared and mode forced inclusive.
  // Defaults ON (most new pros are generalists first).
  const [generalAttention, setGeneralAttention] = useState(true)

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
      specializedAreas: [] as string[],
      specializationMode: 'inclusive' as SpecializationMode,
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
            <FieldShell
              label="País donde vives"
              errors={field.state.meta.errors}
              required
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
                      required
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
                              required
                            >
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
              required
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
              required
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
                placeholder="Ej. Colegio de Psicólogos"
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

        {/* ── Enfoque de atención ── */}
        {/* ponytail: see registro.tsx — "Atención general" is the friendly face
            of "no specialization preferences". When ON the four axes are
            cleared and mode forced inclusive. */}
        <SectionHeader>Enfoque de atención</SectionHeader>
        <label className="flex items-start gap-3">
          <Switch
            checked={generalAttention}
            onCheckedChange={(checked) => {
              setGeneralAttention(checked)
              if (checked) {
                form.setFieldValue('population', [])
                form.setFieldValue('focusGroups', [])
                form.setFieldValue('practiceAreas', [])
                form.setFieldValue('specializedAreas', [])
                form.setFieldValue('specializationMode', 'inclusive')
              }
            }}
            className="mt-0.5"
          />
          <span className="flex flex-col gap-0.5 text-sm">
            <span className="font-medium text-[var(--medi-text-primary)]">
              Atención general
            </span>
            <span className="text-xs text-[var(--medi-text-secondary)]">
              Acompaño a cualquier persona, sin filtros de edad, grupo o área.
              Aparezco en el directorio general y en el botón de “ayuda ahora”.
            </span>
          </span>
        </label>
        {generalAttention && (
          <p className="-mt-2 text-xs text-[var(--medi-text-secondary)]">
            No te pediremos preferencias específicas. Si en el futuro quieres
            definir enfoques, desactiva esta opción.
          </p>
        )}

        {!generalAttention && (
          <>
            <form.Field name="population">
              {(field) => (
                <TagSelect
                  label="¿Con qué edades trabajas?"
                  options={POPULATION_OPTIONS}
                  value={field.state.value}
                  onChange={(v) => field.handleChange(v)}
                  errors={field.state.meta.errors}
                />
              )}
            </form.Field>

            <form.Field name="focusGroups">
              {(field) => (
                <TagSelect
                  label="¿Con qué comunidades o poblaciones específicas?"
                  options={FOCUS_GROUP_OPTIONS}
                  value={field.state.value}
                  onChange={(v) => field.handleChange(v)}
                  errors={field.state.meta.errors}
                />
              )}
            </form.Field>

            <form.Field name="practiceAreas">
              {(field) => (
                <TagSelect
                  label="¿En qué áreas intervienes?"
                  options={PRACTICE_AREA_OPTIONS}
                  value={field.state.value}
                  onChange={(v) => field.handleChange(v)}
                  errors={field.state.meta.errors}
                />
              )}
            </form.Field>

            {/* ── Áreas específicas (sensibles) ── */}
            {/* ponytail: see registro.tsx for the rationale. The exclusive
                toggle is disabled until ≥1 tag is picked across ANY axis; the
                server double-guards the empty-exclusive case. */}
            <form.Field name="specializedAreas">
              {(field) => (
                <TagSelect
                  label="¿Acompañas en áreas específicas? (Duelo, Trauma, etc.)"
                  options={SPECIALIZED_AREA_OPTIONS}
                  value={field.state.value}
                  onChange={(v) => field.handleChange(v)}
                  errors={field.state.meta.errors}
                />
              )}
            </form.Field>

            {/*
              ponytail: subscribe to the four focus axes so the Exclusiva gate
              is reactive — form.getFieldValue inside the specializationMode
              field's render would only re-evaluate when specializationMode
              itself changes. See registro.tsx for the full rationale.
            */}
            <form.Subscribe
              selector={(s) => [
                s.values.population,
                s.values.focusGroups,
                s.values.practiceAreas,
                s.values.specializedAreas,
              ]}
            >
              {([populationV, focusGroupsV, practiceAreasV, specializedAreasV]) => {
                const hasAnyFocus =
                  populationV.length > 0 ||
                  focusGroupsV.length > 0 ||
                  practiceAreasV.length > 0 ||
                  specializedAreasV.length > 0
                return (
                  <form.Field name="specializationMode">
                    {(field) => {
                      // ponytail: exclusive needs ≥1 preference across ANY
                      // axis; gate is the whole focus, not just the sensitive
                      // axis. Server double-guards the all-empty case.
                      const exclusiveDisabled = !hasAnyFocus
                      return (
                        <FieldShell
                          label="¿Cómo quieres participar?"
                          errors={field.state.meta.errors}
                          hint={
                            exclusiveDisabled
                              ? 'Selecciona al menos una preferencia arriba (edad, grupo, área o área específica) para activar la opción Exclusiva.'
                              : undefined
                          }
                        >
                          <div className="flex flex-col gap-2">
                            <label className="flex items-start gap-2 text-sm text-[var(--medi-text-secondary)]">
                              <input
                                type="radio"
                                name="specializationMode"
                                value="inclusive"
                                checked={field.state.value === 'inclusive'}
                                onChange={() => field.handleChange('inclusive')}
                                className="mt-0.5 size-4 shrink-0 accent-[var(--medi-secondary)]"
                              />
                              <span>
                                <span className="font-medium text-[var(--medi-text-primary)]">
                                  Inclusiva
                                </span>{' '}
                                — aparezco en el directorio general y también
                                cuando alguien filtra por cualquiera de mis
                                preferencias.
                              </span>
                            </label>
                            <label
                              className={
                                'flex items-start gap-2 text-sm text-[var(--medi-text-secondary)]' +
                                (exclusiveDisabled
                                  ? ' cursor-not-allowed opacity-60'
                                  : '')
                              }
                              aria-disabled={exclusiveDisabled || undefined}
                            >
                              <input
                                type="radio"
                                name="specializationMode"
                                value="exclusive"
                                checked={field.state.value === 'exclusive'}
                                onChange={() => field.handleChange('exclusive')}
                                disabled={exclusiveDisabled}
                                className="mt-0.5 size-4 shrink-0 accent-[var(--medi-secondary)]"
                              />
                              <span>
                                <span className="font-medium text-[var(--medi-text-primary)]">
                                  Exclusiva
                                </span>{' '}
                                — solo aparezco cuando alguien filtra por una de
                                mis preferencias (edad, grupo, área o área
                                específica). No salgo en el directorio general ni
                                en el botón de “ayuda ahora” sin filtros.
                              </span>
                            </label>
                          </div>
                        </FieldShell>
                      )
                    }}
                  </form.Field>
                )
              }}
            </form.Subscribe>
          </>
        )}

        {/* ── Contacto & modalidad ── */}
        <SectionHeader>Contacto &amp; modalidad</SectionHeader>
        <form.Field name="modality">
          {(field) => (
            <FieldShell
              label="Modalidad"
              errors={field.state.meta.errors}
              required
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
                <option value="in_person">Presencial</option>
                <option value="remote">A distancia</option>
                <option value="both">Ambas</option>
              </select>
            </FieldShell>
          )}
        </form.Field>

        <form.Field name="whatsappCountry">
          {(countryField) => (
            <form.Field name="whatsapp">
              {(phoneField) => (
                <PhoneInput
                  country={countryField.state.value}
                  phone={phoneField.state.value}
                  onCountryChange={(c) => countryField.handleChange(c)}
                  onPhoneChange={(p) => phoneField.handleChange(p)}
                  countryLabel="País del WhatsApp"
                  phoneLabel="WhatsApp / teléfono"
                  phoneRequired
                />
              )}
            </form.Field>
          )}
        </form.Field>
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
