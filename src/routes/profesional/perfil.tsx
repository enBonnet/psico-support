import { createFileRoute, redirect, Link } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState, useRef } from 'react'
import { notify } from '#/lib/notifications'
import { track } from '#/lib/analytics-client'
import { Skeleton } from '#/components/ui/skeleton'
import { Button } from '#/components/ui/button'
import {
  getMyProfessional,
  getCurrentUser,
  updateMyProfile,
  listMySupportDocs,
  addMySupportDoc,
  removeMySupportDoc,
  SUPPORT_DOC_MAX,
  CERTIFICATE_MIME,
  CERTIFICATE_MAX_BYTES,
  POPULATION_OPTIONS,
  FOCUS_GROUP_OPTIONS,
  PRACTICE_AREA_OPTIONS,
  SPECIALIZED_AREA_OPTIONS,
  PAIS_OPTIONS,
  VENEZUELA_ESTADOS,
} from '#/server/professionals'
import type {
  ProfileEditInput,
  CertificateMime,
  SpecializationMode,
} from '#/server/professionals'
import { VENEZUELA, ESTADO_CIUDADES } from '#/server/locations'
import {
  FieldShell,
  SectionHeader,
  inputCls,
} from '#/components/professional-form'
import { TagSelect } from '#/components/tag-select'
import { PhoneInput } from '#/components/phone-input'
import { Switch } from '#/components/ui/switch'
import { noindexHead } from '#/lib/seo'

export const Route = createFileRoute('/profesional/perfil')({
  beforeLoad: async () => {
    const user = await getCurrentUser()
    if (!user) {
      throw redirect({ to: '/profesional/login' })
    }
  },
  // ponytail: CSR-only — auth-gated, no crawler value. Split out of the panel
  // (see panel.tsx) so the hub stays a simple menu and this big form lives on
  // its own focused screen.
  ssr: false,
  head: noindexHead,
  component: PerfilPage,
})

type MyPro = Awaited<ReturnType<typeof getMyProfessional>>

function PerfilPage() {
  const { data: me, isLoading } = useQuery({
    queryKey: ['my-professional'],
    queryFn: () => getMyProfessional(),
  })

  return (
    <main className="page-wrap flex min-h-[100dvh] flex-col py-6">
      <Link
        to="/profesional/panel"
        className="inline-flex items-center gap-1 self-start py-2 text-base font-medium text-[var(--medi-secondary)]"
        aria-label="Volver al panel"
      >
        ‹ Panel
      </Link>

      <h1 className="text-2xl font-bold text-[var(--medi-text-primary)]">
        Perfil profesional
      </h1>
      <div className="section-underline mt-2" />
      <p className="mt-3 text-sm text-[var(--medi-text-secondary)]">
        Estos datos aparecen en el directorio. Cambiar tu número de
        colegiación reinicia la verificación.
      </p>

      {isLoading && (
        <div className="mt-4 flex flex-col gap-3" aria-busy="true">
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-4 w-40" />
          <Skeleton className="mt-6 h-48 w-full" />
        </div>
      )}

      {me && (
        <>
          <ProfileSection me={me} />
          <MySupportDocsSection />
        </>
      )}
    </main>
  )
}

// ponytail: self-serve profile edit. Plain controlled state (no TanStack Form),
// matching SocialsSection's pattern — the server validates via profileEditSchema
// and surfaces a single error toast; field-level inline errors are YAGNI for
// editing already-valid data. Markup mirrors completar.tsx but on useState.
// Changing certification number/country resets verifiedStatus → 'pending'.
function ProfileSection({ me }: { me: NonNullable<MyPro> }) {
  const qc = useQueryClient()
  const { data: user } = useQuery({
    queryKey: ['me'],
    queryFn: () => getCurrentUser(),
  })
  const actorId = user?.id
  const [name, setName] = useState(me.name)
  const [certificationNumber, setCertificationNumber] = useState(
    me.certificationNumber,
  )
  const [certifyingSchool, setCertifyingSchool] = useState(
    me.certifyingSchool ?? '',
  )
  const [population, setPopulation] = useState<string[]>(me.population)
  const [focusGroups, setFocusGroups] = useState<string[]>(me.focusGroups)
  const [practiceAreas, setPracticeAreas] = useState<string[]>(
    me.practiceAreas,
  )
  const [specializedAreas, setSpecializedAreas] = useState<string[]>(
    me.specializedAreas,
  )
  const [specializationMode, setSpecializationMode] =
    useState<SpecializationMode>(me.specializationMode)
  // ponytail: "Atención general" toggle (see registro.tsx). Derived from the
  // loaded profile — a pro is general when all four specialization axes are
  // empty. Driving it from explicit state lets the user flip it; the arrays
  // remain the source of truth for save + dirty-check.
  const [generalAttention, setGeneralAttention] = useState(
    me.population.length === 0 &&
      me.focusGroups.length === 0 &&
      me.practiceAreas.length === 0 &&
      me.specializedAreas.length === 0,
  )
  const [modality, setModality] = useState(me.modality)
  const [country, setCountry] = useState(me.country)
  const [estado, setEstado] = useState(me.estado ?? '')
  const [ciudad, setCiudad] = useState(me.ciudad ?? '')
  const [credentialCountry, setCredentialCountry] = useState(
    me.credentialCountry ?? '',
  )
  const [whatsappCountry, setWhatsappCountry] = useState(
    me.whatsappCountry ?? '',
  )
  const [whatsapp, setWhatsapp] = useState(me.whatsapp)

  const save = useMutation({
    mutationFn: (vars: ProfileEditInput) => updateMyProfile({ data: vars }),
    onSuccess: (data) => {
      if (actorId) {
        track({ event: 'pro_profile_save', category: 'pro', actorId })
      }
      qc.invalidateQueries({ queryKey: ['my-professional'] })
      notify({
        type: 'success',
        title: data.rereview
          ? 'Perfil actualizado — tu credencial volvió a revisión'
          : 'Perfil actualizado',
      })
    },
    onError: (err: Error) =>
      notify({
        type: 'error',
        title: 'No se pudo guardar',
        body: err.message,
      }),
  })

  // ponytail: dirty-gate the Save button so a no-op open doesn't write. Tag
  // arrays compared by joined string (order-stable within a session).
  const dirty =
    name !== me.name ||
    certificationNumber !== me.certificationNumber ||
    (certifyingSchool || '') !== (me.certifyingSchool ?? '') ||
    population.join(',') !== me.population.join(',') ||
    focusGroups.join(',') !== me.focusGroups.join(',') ||
    practiceAreas.join(',') !== me.practiceAreas.join(',') ||
    specializedAreas.join(',') !== me.specializedAreas.join(',') ||
    specializationMode !== me.specializationMode ||
    modality !== me.modality ||
    country !== me.country ||
    estado !== (me.estado ?? '') ||
    ciudad !== (me.ciudad ?? '') ||
    credentialCountry !== (me.credentialCountry ?? '') ||
    whatsappCountry !== (me.whatsappCountry ?? '') ||
    whatsapp !== me.whatsapp

  function submit() {
    // ponytail: estado/ciudad are only meaningful for Venezuela; nulled
    // otherwise so the payload matches profileEditSchema's output shape. The
    // server re-validates, so the enum cast is safe (the <select> only emits
    // valid members).
    const payload = {
      name: name.trim(),
      certificationNumber,
      certifyingSchool: certifyingSchool.trim() || null,
      population,
      focusGroups,
      practiceAreas,
      specializedAreas,
      // ponytail: if the user cleared all specialized areas but left the mode
      // on 'exclusive', send 'inclusive' so profileEditSchema's defensive
      // coercion matches what the user sees. (The radio is disabled in that
      // state, but a stale selection could linger from a previous save.)
      specializationMode:
        specializedAreas.length === 0 && specializationMode === 'exclusive'
          ? 'inclusive'
          : specializationMode,
      modality,
      country,
      estado: country === VENEZUELA ? estado : null,
      ciudad: country === VENEZUELA ? ciudad || null : null,
      credentialCountry: credentialCountry || null,
      whatsappCountry: whatsappCountry || null,
      whatsapp,
    }
    save.mutate(payload as ProfileEditInput)
  }

  const ciudades = (
    ESTADO_CIUDADES as Record<string, readonly string[] | undefined>
  )[estado] ?? []

  return (
    <section className="glass-card-soft mt-6 rounded-[var(--glass-radius-sm)] p-4">
      <h2 className="text-sm font-semibold text-[var(--medi-text-primary)]">
        Datos del directorio
      </h2>

      <div className="mt-3 flex flex-col gap-3">
        <FieldShell label="Nombre" errors={[]} required>
          <input
            className={inputCls}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </FieldShell>

        <SectionHeader>Credencial</SectionHeader>
        <FieldShell label="País del colegio o certificación" errors={[]} required>
          <select
            className={inputCls}
            value={credentialCountry}
            onChange={(e) => setCredentialCountry(e.target.value)}
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
        <FieldShell label="Número de colegiación" errors={[]} required>
          <input
            type="text"
            autoCapitalize="none"
            className={inputCls}
            value={certificationNumber}
            onChange={(e) => setCertificationNumber(e.target.value)}
          />
        </FieldShell>
        <FieldShell label="Colegio / institución (opcional)" errors={[]}>
          <input
            type="text"
            className={inputCls}
            value={certifyingSchool}
            onChange={(e) => setCertifyingSchool(e.target.value)}
            placeholder="Ej. Colegio de Psicólogos de Venezuela"
          />
        </FieldShell>

        {/* ── Enfoque de atención ── */}
        {/* ponytail: "Atención general" toggle (see registro.tsx). When ON the
            four specialization axes are cleared and mode forced inclusive.
            Initialized from the loaded profile so an existing generalist opens
            ON. */}
        <SectionHeader>Enfoque de atención</SectionHeader>
        <label className="flex items-start gap-3">
          <Switch
            checked={generalAttention}
            onCheckedChange={(checked) => {
              setGeneralAttention(checked)
              if (checked) {
                setPopulation([])
                setFocusGroups([])
                setPracticeAreas([])
                setSpecializedAreas([])
                setSpecializationMode('inclusive')
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
            <TagSelect
              label="¿Con qué edades trabajas?"
              options={POPULATION_OPTIONS}
              value={population}
              onChange={setPopulation}
            />
            <TagSelect
              label="¿Con qué comunidades o poblaciones específicas?"
              options={FOCUS_GROUP_OPTIONS}
              value={focusGroups}
              onChange={setFocusGroups}
            />
            <TagSelect
              label="¿En qué áreas intervienes?"
              options={PRACTICE_AREA_OPTIONS}
              value={practiceAreas}
              onChange={setPracticeAreas}
            />
            {/* ponytail: sensitive specialized areas + participation mode.
                Exclusivity spans ALL four axes (see registro.tsx +
                buildProfessionalWhere): an exclusive pro surfaces only when a
                help-seeker filters by any of their selected tags. The radio is
                disabled until ≥1 axis is picked; clearing the last axis while
                'exclusive' is selected visually leaves the radio checked, but
                the submit payload coerces back to inclusive (above) and the
                server double-guards it. */}
            <TagSelect
              label="¿Acompañas en áreas específicas? (Duelo, Trauma, etc.)"
              options={SPECIALIZED_AREA_OPTIONS}
              value={specializedAreas}
              onChange={setSpecializedAreas}
            />
            {(() => {
              const hasAnyFocus =
                population.length > 0 ||
                focusGroups.length > 0 ||
                practiceAreas.length > 0 ||
                specializedAreas.length > 0
              const exclusiveDisabled = !hasAnyFocus
              return (
                <FieldShell
                  label="¿Cómo quieres participar?"
                  errors={[]}
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
                        checked={specializationMode === 'inclusive'}
                        onChange={() => setSpecializationMode('inclusive')}
                        className="mt-0.5 size-4 shrink-0 accent-[var(--medi-secondary)]"
                      />
                      <span>
                        <span className="font-medium text-[var(--medi-text-primary)]">
                          Inclusiva
                        </span>{' '}
                        — aparezco en el directorio general y también cuando
                        alguien filtra por cualquiera de mis preferencias.
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
                        checked={specializationMode === 'exclusive'}
                        onChange={() => setSpecializationMode('exclusive')}
                        disabled={exclusiveDisabled}
                        className="mt-0.5 size-4 shrink-0 accent-[var(--medi-secondary)]"
                      />
                      <span>
                        <span className="font-medium text-[var(--medi-text-primary)]">
                          Exclusiva
                        </span>{' '}
                        — solo aparezco cuando alguien filtra por una de mis
                        preferencias (edad, grupo, área o área específica). No
                        salgo en el directorio general ni en el botón de “ayuda
                        ahora” sin filtros.
                      </span>
                    </label>
                  </div>
                </FieldShell>
              )
            })()}
          </>
        )}

        <SectionHeader>Ubicación &amp; contacto</SectionHeader>
        <FieldShell label="Modalidad" errors={[]} required>
          <select
            className={inputCls}
            value={modality}
            onChange={(e) =>
              setModality(e.target.value as 'in_person' | 'remote' | 'both')
            }
          >
            <option value="in_person">Presencial</option>
            <option value="remote">A distancia</option>
            <option value="both">Ambas</option>
          </select>
        </FieldShell>
        <FieldShell label="País donde vives" errors={[]} required>
          <select
            className={inputCls}
            value={country}
            onChange={(e) => {
              setCountry(e.target.value)
              // ponytail: reset estado/ciudad on country change — the lists are
              // Venezuela-scoped; a stale value would filter to nothing.
              setEstado('')
              setCiudad('')
            }}
          >
            {PAIS_OPTIONS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </FieldShell>
        {country === VENEZUELA && (
          <>
            <FieldShell label="Estado" errors={[]} required>
              <select
                className={inputCls}
                value={estado}
                onChange={(e) => {
                  setEstado(e.target.value)
                  setCiudad('')
                }}
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
            <FieldShell label="Ciudad" errors={[]} required>
              <select
                className={inputCls}
                value={ciudad}
                onChange={(e) => setCiudad(e.target.value)}
                disabled={!estado}
              >
                <option value="" disabled>
                  {estado ? 'Selecciona…' : 'Primero elige estado'}
                </option>
                {ciudades.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </FieldShell>
          </>
        )}
        <PhoneInput
          country={whatsappCountry}
          phone={whatsapp}
          onCountryChange={setWhatsappCountry}
          onPhoneChange={setWhatsapp}
          countryLabel="País del WhatsApp"
          phoneLabel="WhatsApp / teléfono"
          phoneRequired
        />
      </div>

      <Button
        type="button"
        onClick={submit}
        disabled={!dirty || save.isPending}
        className="glass-primary mt-3 min-h-11 w-full !text-white disabled:opacity-50"
      >
        {save.isPending ? 'Guardando…' : 'Guardar perfil'}
      </Button>
    </section>
  )
}

// ponytail: additional support docs manager (repeatable). Same base64 → R2 path
// as the avatar upload; same PDF/image mimes + 5MB cap as the main certificate.
// NOT gated on verified — pending pros attach these to speed verification. The
// server re-checks the cap; a race just produces a friendly error.
const SUPPORT_DOC_MIME_SET = new Set<string>(CERTIFICATE_MIME)
const SUPPORT_DOC_ACCEPT = '.pdf,.jpg,.jpeg,image/jpeg,image/png,image/webp'

function MySupportDocsSection() {
  const qc = useQueryClient()
  const inputRef = useRef<HTMLInputElement>(null)
  const { data: user } = useQuery({
    queryKey: ['me'],
    queryFn: () => getCurrentUser(),
  })
  const actorId = user?.id

  const { data: docs = [] } = useQuery({
    queryKey: ['my-support-docs'],
    queryFn: () => listMySupportDocs(),
  })

  const upload = useMutation({
    mutationFn: (vars: { data: string; type: CertificateMime; name: string }) =>
      addMySupportDoc({ data: vars }),
    onSuccess: () => {
      if (actorId) {
        track({ event: 'pro_supportdoc_add', category: 'pro', actorId })
      }
      notify({ type: 'success', title: 'Documento guardado' })
      qc.invalidateQueries({ queryKey: ['my-support-docs'] })
    },
    onError: (err: Error) =>
      notify({
        type: 'error',
        title: 'No se pudo subir el documento',
        body: err.message,
      }),
  })

  const del = useMutation({
    mutationFn: (id: number) => removeMySupportDoc({ data: { id } }),
    onSuccess: () => {
      if (actorId) {
        track({ event: 'pro_supportdoc_remove', category: 'pro', actorId })
      }
      notify({ type: 'success', title: 'Documento eliminado' })
      qc.invalidateQueries({ queryKey: ['my-support-docs'] })
    },
    onError: () =>
      notify({
        type: 'error',
        title: 'No se pudo eliminar',
        body: 'Inténtalo de nuevo.',
      }),
  })

  async function handleFile(file: File | undefined) {
    if (!file) return
    if (!SUPPORT_DOC_MIME_SET.has(file.type)) {
      notify({
        type: 'error',
        title: 'Formato no válido',
        body: 'Solo PDF, JPG, PNG o WEBP.',
      })
      return
    }
    if (file.size > CERTIFICATE_MAX_BYTES) {
      notify({ type: 'error', title: 'Archivo muy grande', body: 'Máximo 5 MB.' })
      return
    }
    // ponytail: read as data URL, strip the "data:<mime>;base64," prefix so the
    // server gets raw b64 (same as the avatar upload + readFileAsCertificate).
    const data = await new Promise<string | null>((resolve) => {
      const reader = new FileReader()
      reader.onerror = () => resolve(null)
      reader.onload = () => {
        const result = String(reader.result ?? '')
        const comma = result.indexOf(',')
        resolve(comma >= 0 ? result.slice(comma + 1) : result)
      }
      reader.readAsDataURL(file)
    })
    if (!data) {
      notify({ type: 'error', title: 'No se pudo leer el archivo.' })
      return
    }
    upload.mutate({
      data,
      type: file.type as CertificateMime,
      name: file.name,
    })
    if (inputRef.current) inputRef.current.value = ''
  }

  const atCap = docs.length >= SUPPORT_DOC_MAX

  return (
    <section className="glass-card-soft mt-6 rounded-[var(--glass-radius-sm)] p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-[var(--medi-text-primary)]">
          Documentos de respaldo
        </h2>
        <span className="text-xs font-medium text-[var(--medi-text-secondary)]">
          {docs.length}/{SUPPORT_DOC_MAX}
        </span>
      </div>
      <p className="mt-1 text-sm text-[var(--medi-text-secondary)]">
        Certificados o credenciales adicionales que aceleren tu verificación.
      </p>

      {docs.length > 0 && (
        <ul className="mt-3 flex flex-col gap-2">
          {docs.map((d) => (
            <li
              key={d.id}
              className="flex items-center justify-between gap-2 rounded-[var(--glass-radius-sm)] border border-[var(--medi-border)] bg-white/50 p-3"
            >
              <a
                href={d.url}
                target="_blank"
                rel="noopener noreferrer"
                className="min-w-0 truncate text-sm font-medium text-[var(--medi-secondary)] hover:underline"
              >
                {d.name ?? 'Documento'}
              </a>
              <button
                type="button"
                onClick={() => del.mutate(d.id)}
                disabled={del.isPending}
                className="shrink-0 text-xs font-medium text-red-600 hover:underline disabled:opacity-60"
              >
                Quitar
              </button>
            </li>
          ))}
        </ul>
      )}

      <input
        ref={inputRef}
        type="file"
        accept={SUPPORT_DOC_ACCEPT}
        className="hidden"
        onChange={(e) => handleFile(e.target.files?.[0])}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={atCap || upload.isPending}
        className="glass-pill mt-3 rounded-[var(--glass-radius-pill)] px-3 py-1.5 text-xs font-semibold text-[var(--medi-primary)] transition-all hover:translate-y-[-1px] disabled:opacity-60"
      >
        {upload.isPending
          ? 'Subiendo…'
          : atCap
            ? 'Límite alcanzado'
            : 'Añadir documento'}
      </button>
    </section>
  )
}
