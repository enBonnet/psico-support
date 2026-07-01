import { createFileRoute, redirect, Link } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState, useRef } from 'react'
import { notify } from '#/lib/notifications'
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
  PAIS_OPTIONS,
  VENEZUELA_ESTADOS,
} from '#/server/professionals'
import type {
  ProfileEditInput,
  CertificateMime,
} from '#/server/professionals'
import { VENEZUELA, ESTADO_CIUDADES } from '#/server/locations'
import {
  FieldShell,
  SectionHeader,
  inputCls,
} from '#/components/professional-form'
import { PhoneInput } from '#/components/phone-input'

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
        <FieldShell label="Nombre" errors={[]}>
          <input
            className={inputCls}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </FieldShell>

        <SectionHeader>Credencial</SectionHeader>
        <FieldShell label="País del colegio o certificación" errors={[]}>
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
        <FieldShell label="Número de colegiación" errors={[]}>
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

        <SectionHeader>Especialización</SectionHeader>
        <TagSelect
          label="¿Con quién trabajas?"
          options={POPULATION_OPTIONS}
          value={population}
          onChange={setPopulation}
        />
        <TagSelect
          label="Poblaciones específicas (opcional)"
          options={FOCUS_GROUP_OPTIONS}
          value={focusGroups}
          onChange={setFocusGroups}
        />
        <TagSelect
          label="Áreas de intervención (opcional)"
          options={PRACTICE_AREA_OPTIONS}
          value={practiceAreas}
          onChange={setPracticeAreas}
        />

        <SectionHeader>Ubicación &amp; contacto</SectionHeader>
        <FieldShell label="Modalidad" errors={[]}>
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
        <FieldShell label="País donde vives" errors={[]}>
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
            <FieldShell label="Estado" errors={[]}>
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
            <FieldShell label="Ciudad" errors={[]}>
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

// ponytail: multi-select tag buttons (mirrors completar.tsx). Plain value +
// onChange so it composes with useState (no TanStack Form generics here).
function TagSelect({
  label,
  options,
  value,
  onChange,
}: {
  label: string
  options: readonly string[]
  value: string[]
  onChange: (v: string[]) => void
}) {
  return (
    <FieldShell label={label} errors={[]}>
      <div className="flex flex-wrap gap-2">
        {options.map((opt) => {
          const selected = value.includes(opt)
          return (
            <button
              key={opt}
              type="button"
              aria-pressed={selected}
              onClick={() =>
                onChange(
                  selected ? value.filter((v) => v !== opt) : [...value, opt],
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

  const { data: docs = [] } = useQuery({
    queryKey: ['my-support-docs'],
    queryFn: () => listMySupportDocs(),
  })

  const upload = useMutation({
    mutationFn: (vars: { data: string; type: CertificateMime; name: string }) =>
      addMySupportDoc({ data: vars }),
    onSuccess: () => {
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
