import { createFileRoute, Link, notFound } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { MessageCircle } from 'lucide-react'
import { notify } from '#/lib/notifications'
import { track } from '#/lib/analytics-client'
import { Skeleton } from '#/components/ui/skeleton'
import { Button } from '#/components/ui/button'
import {
  getProfessionalForAdmin,
  adminUpdateProfessional,
  reviewProfessional,
  getCurrentUser,
  publicCertificateUrl,
  POPULATION_OPTIONS,
  FOCUS_GROUP_OPTIONS,
  PRACTICE_AREA_OPTIONS,
  SPECIALIZED_AREA_OPTIONS,
  PAIS_OPTIONS,
  VENEZUELA_ESTADOS,
} from '#/server/professionals'
import type { ProfileEditInput, SpecializationMode } from '#/server/professionals'
import { VENEZUELA, ESTADO_CIUDADES } from '#/server/locations'
import { FieldShell, SectionHeader, inputCls } from '#/components/professional-form'
import { TagSelect } from '#/components/tag-select'
import { PhoneInput } from '#/components/phone-input'
import { Switch } from '#/components/ui/switch'
import { STATUS_META } from '#/components/admin-shared'

export const Route = createFileRoute('/admin/profesionales/$id')({
  // ponytail: guard + ssr + chrome all live in the parent layout route
  // (src/routes/admin.tsx). This child only declares its component.
  component: AdminProDetailPage,
})

function AdminProDetailPage() {
  const id = Number(Route.useParams().id)
  // ponytail: a non-positive/non-integer id is meaningless — treat as 404
  // (mirrors the public profile route's guard). Number('abc') === NaN; both
  // fall through. The throw happens AFTER the hook calls below — TanStack
  // Router reuses this component instance when only params change, so throwing
  // before useQuery would violate the Rules of Hooks on a param-only
  // navigation (/admin/profesionales/5 -> /abc) and crash with "Rendered fewer
  // hooks than expected" instead of the 404. Gate the query with `enabled`.
  const validId = Number.isInteger(id) && id > 0

  const { data: pro, isLoading } = useQuery({
    queryKey: ['admin-professional', id],
    queryFn: () => getProfessionalForAdmin({ data: { id } }),
    enabled: validId,
  })
  if (!validId) throw notFound()
  // ponytail: getProfessionalForAdmin returns null on miss OR soft-delete
  // (matches the list filter). notFound() → Spanish 404 via
  // defaultNotFoundComponent. Guard against the undefined-loading state first
  // so we don't 404 on the first paint.
  if (!isLoading && !pro) throw notFound()

  return (
    <>
      {/* ponytail: contextual "back to list" link. The Profesionales tab in
          the parent layout's sub-nav also covers this, but a back link is a
          familiar affordance on a deep edit page. No <main> wrapper — the
          parent layout owns it. */}
      <Link
        to="/admin/profesionales"
        className="inline-flex items-center gap-1 self-start py-2 text-base font-medium text-[var(--medi-secondary)]"
        aria-label="Volver a la lista de profesionales"
      >
        ‹ Profesionales
      </Link>

      {isLoading || !pro ? (
        <div className="mt-4 flex flex-col gap-3" aria-busy="true">
          <Skeleton className="h-6 w-64" />
          <Skeleton className="h-4 w-48" />
          <Skeleton className="mt-6 h-96 w-full" />
        </div>
      ) : (
        <ProDetail pro={pro} />
      )}
    </>
  )
}

// ponytail: the detail page. Three concerns, top-to-bottom:
//   1. Header (name, email, status badge, created date, providesService)
//   2. Read-only context (certificate + support-doc links, WhatsApp contact) —
//      copied from the list ProCard so the admin still sees the evidence while
//      editing.
//   3. Editable form (mirrors profesional/perfil.tsx's ProfileSection) +
//      status actions (mirrors the list ProActions) + a "Guardar y aprobar"
//      convenience for pending pros (the "approve with changes" one-click path).
function ProDetail({
  pro,
}: {
  pro: NonNullable<Awaited<ReturnType<typeof getProfessionalForAdmin>>>
}) {
  return (
    <>
      <ProHeader pro={pro} />
      <ProContextBlock pro={pro} />
      <AdminProfileEditSection pro={pro} />
      <AdminStatusActions pro={pro} />
    </>
  )
}

function ProHeader({ pro }: { pro: { name: string; userEmail: string; verifiedStatus: string; providesService: boolean; createdAt: number | Date | null } }) {
  const meta = STATUS_META[pro.verifiedStatus as keyof typeof STATUS_META]
  const created = pro.createdAt
    ? new Date(pro.createdAt).toLocaleDateString('es-VE', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      })
    : null
  return (
    <header className="mt-1">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-bold text-[var(--medi-text-primary)]">
            {pro.name}
          </h1>
          <p className="truncate text-sm text-[var(--medi-text-secondary)]">
            {pro.userEmail}
          </p>
          {created && (
            <p className="mt-0.5 text-xs text-[var(--medi-text-secondary)]">
              Registrado el {created}
            </p>
          )}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <span className={`text-xs font-semibold ${meta.badge}`}>
            {meta.label}
          </span>
          {!pro.providesService && (
            <span className="rounded-full bg-[var(--medi-primary)]/10 px-2 py-0.5 text-[10px] font-semibold text-[var(--medi-primary)]">
              Solo contenido
            </span>
          )}
        </div>
      </div>
      <div className="section-underline mt-2" />
    </header>
  )
}

// ponytail: read-only evidence block — the credential docs + WhatsApp link the
// admin uses to verify. Copied from the list ProCard so the detail page doesn't
// lose that context. Admins can VIEW but not upload/remove docs here (those
// upload fns are ownership-scoped; an admin media path is a separate change).
function ProContextBlock({
  pro,
}: {
  pro: {
    whatsapp: string
    certificateKey: string | null
    supportDocs: { url: string; name: string | null }[]
  }
}) {
  const waDigits = pro.whatsapp.replace(/\D/g, '')
  const waHref = `https://wa.me/${waDigits}?text=${encodeURIComponent(
    'Hola, te escribimos desde PsicoAyudaVen.',
  )}`
  return (
    <section className="glass-card-soft mt-4 rounded-[var(--glass-radius-sm)] p-4">
      <h2 className="text-sm font-semibold text-[var(--medi-text-primary)]">
        Verificación
      </h2>
      <div className="mt-2 flex flex-col gap-2">
        <a
          href={waHref}
          target="_blank"
          rel="noopener noreferrer"
          className="flex min-h-10 items-center justify-center gap-2 rounded-[var(--glass-radius-sm)] bg-green-600 px-4 py-2 text-sm font-semibold !text-white transition-all hover:translate-y-[-1px] hover:bg-green-700"
        >
          <MessageCircle aria-hidden="true" className="size-4" />
          Contactar por WhatsApp
        </a>
        {pro.certificateKey && (
          <a
            href={publicCertificateUrl(pro.certificateKey)}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm font-semibold text-[var(--medi-secondary)] hover:underline"
          >
            Ver certificado adjunto →
          </a>
        )}
        {pro.supportDocs.length > 0 && (
          <div className="flex flex-col gap-1">
            {pro.supportDocs.map((d, i) => (
              <a
                key={`${d.url}-${i}`}
                href={d.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm font-medium text-[var(--medi-secondary)] hover:underline"
              >
                📎 {d.name ?? 'Documento adicional'}
              </a>
            ))}
          </div>
        )}
        {!pro.certificateKey && pro.supportDocs.length === 0 && (
          <p className="text-xs text-[var(--medi-text-secondary)]">
            Sin documentos adjuntos.
          </p>
        )}
      </div>
    </section>
  )
}

// ponytail: admin editable form. Plain controlled state (no TanStack Form),
// matching profesional/perfil.tsx's ProfileSection — the server validates via
// adminEditSchema (profileEditSchema + professionalId) and surfaces a single
// error toast. Markup mirrors ProfileSection so the field set + layout can't
// drift from the pro's own edit screen. Deliberate divergence from
// updateMyProfile: NO auto-demotion to 'pending' on credential change (the
// admin is the reviewer). Surfaced here: specializedAreas + specializationMode
// (returned by the server but hidden on the list card).
function AdminProfileEditSection({
  pro,
}: {
  pro: NonNullable<Awaited<ReturnType<typeof getProfessionalForAdmin>>>
}) {
  const qc = useQueryClient()
  const { data: adminUser } = useQuery({
    queryKey: ['me'],
    queryFn: () => getCurrentUser(),
  })
  const actorId = adminUser?.id
  const [name, setName] = useState(pro.name)
  const [certificationNumber, setCertificationNumber] = useState(
    pro.certificationNumber,
  )
  const [certifyingSchool, setCertifyingSchool] = useState(
    pro.certifyingSchool ?? '',
  )
  const [population, setPopulation] = useState<string[]>(pro.population)
  const [focusGroups, setFocusGroups] = useState<string[]>(pro.focusGroups)
  const [practiceAreas, setPracticeAreas] = useState<string[]>(pro.practiceAreas)
  const [specializedAreas, setSpecializedAreas] = useState<string[]>(
    pro.specializedAreas,
  )
  const [specializationMode, setSpecializationMode] =
    useState<SpecializationMode>(pro.specializationMode)
  // ponytail: "Atención general" toggle (see perfil.tsx). Derived from the
  // loaded profile — a pro is general when all four axes are empty. Driving it
  // from explicit state lets the admin flip it; the arrays remain the source of
  // truth for save + dirty-check.
  const [generalAttention, setGeneralAttention] = useState(
    pro.population.length === 0 &&
      pro.focusGroups.length === 0 &&
      pro.practiceAreas.length === 0 &&
      pro.specializedAreas.length === 0,
  )
  const [modality, setModality] = useState(pro.modality)
  const [country, setCountry] = useState(pro.country)
  const [estado, setEstado] = useState(pro.estado ?? '')
  const [ciudad, setCiudad] = useState(pro.ciudad ?? '')
  const [credentialCountry, setCredentialCountry] = useState(
    pro.credentialCountry ?? '',
  )
  const [whatsappCountry, setWhatsappCountry] = useState(
    pro.whatsappCountry ?? '',
  )
  const [whatsapp, setWhatsapp] = useState(pro.whatsapp)

  const save = useMutation({
    mutationFn: (vars: ProfileEditInput & { professionalId: number }) =>
      adminUpdateProfessional({ data: vars }),
    onSuccess: (_d, vars) => {
      // ponytail: re-seed local state from the NORMALIZED payload. useState
      // initializers run only on mount, so the refetched `pro` (after the
      // invalidate below) does NOT flow back into these fields on its own.
      // Without this, server-side trims/coercions leave the form "dirty": e.g.
      // the admin types "  Ana  ", the server stores "Ana", the refetched
      // pro.name is "Ana", but local state is still "  Ana  " → dirty stays
      // true and "Guardar cambios" stays enabled after a successful save.
      // Mirror buildPayload()'s normalization + proEditableFields' trim of
      // certificationNumber (buildPayload doesn't trim it; the server does).
      setName(vars.name)
      setCertificationNumber(vars.certificationNumber.trim())
      setCertifyingSchool(vars.certifyingSchool ?? '')
      setPopulation(vars.population)
      setFocusGroups(vars.focusGroups)
      setPracticeAreas(vars.practiceAreas)
      setSpecializedAreas(vars.specializedAreas)
      setSpecializationMode(vars.specializationMode)
      setModality(vars.modality)
      setCountry(vars.country)
      setEstado(vars.estado ?? '')
      setCiudad(vars.ciudad ?? '')
      setCredentialCountry(vars.credentialCountry ?? '')
      setWhatsappCountry(vars.whatsappCountry ?? '')
      setWhatsapp(vars.whatsapp)
      // invalidate both the detail row + the list (card summary updates).
      qc.invalidateQueries({ queryKey: ['admin-professional', pro.id] })
      qc.invalidateQueries({ queryKey: ['admin-professionals'] })
      notify({ type: 'success', title: 'Perfil actualizado' })
    },
    onError: (err: Error) =>
      notify({ type: 'error', title: 'No se pudo guardar', body: err.message }),
  })

  const setStatusMut = useMutation({
    mutationFn: (vars: {
      status: 'verified' | 'rejected' | 'disabled' | 'deleted'
    }) => reviewProfessional({ data: { professionalId: pro.id, status: vars.status } }),
    onSuccess: (_d, vars) => {
      if (actorId) {
        track({
          event: 'admin_pro_review',
          category: 'admin',
          actorId,
          param1: vars.status,
          param2: String(pro.id),
        })
      }
      qc.invalidateQueries({ queryKey: ['admin-professional', pro.id] })
      qc.invalidateQueries({ queryKey: ['admin-professionals'] })
      qc.invalidateQueries({ queryKey: ['verified-count'] })
      const M = {
        verified: { type: 'success', title: 'Profesional aprobado' },
        rejected: { type: 'warning', title: 'Profesional rechazado' },
        disabled: { type: 'warning', title: 'Profesional suspendido' },
        deleted: { type: 'warning', title: 'Profesional eliminado' },
      } as const
      notify(M[vars.status])
    },
    onError: () =>
      notify({
        type: 'error',
        title: 'No se pudo actualizar el estado',
        body: 'Inténtalo de nuevo.',
      }),
  })

  // ponytail: dirty-gate the Save button so a no-op open doesn't write. Tag
  // arrays compared by joined string (order-stable within a session). Mirrors
  // perfil.tsx exactly.
  const dirty =
    name !== pro.name ||
    certificationNumber !== pro.certificationNumber ||
    (certifyingSchool || '') !== (pro.certifyingSchool ?? '') ||
    population.join(',') !== pro.population.join(',') ||
    focusGroups.join(',') !== pro.focusGroups.join(',') ||
    practiceAreas.join(',') !== pro.practiceAreas.join(',') ||
    specializedAreas.join(',') !== pro.specializedAreas.join(',') ||
    specializationMode !== pro.specializationMode ||
    modality !== pro.modality ||
    country !== pro.country ||
    estado !== (pro.estado ?? '') ||
    ciudad !== (pro.ciudad ?? '') ||
    credentialCountry !== (pro.credentialCountry ?? '') ||
    whatsappCountry !== (pro.whatsappCountry ?? '') ||
    whatsapp !== pro.whatsapp

  function buildPayload() {
    // ponytail: estado/ciudad are only meaningful for Venezuela; nulled
    // otherwise so the payload matches profileEditSchema's output shape. The
    // exclusive-with-no-focus coercion mirrors perfil.tsx + proEditableFields.
    // Cast as ProfileEditInput — the local state is typed string[] (looser
    // than the schema's string-literal unions), but the <select>/<TagSelect>
    // only ever emit valid members, and the server re-validates. Same pattern
    // as perfil.tsx's submit().
    return {
      name: name.trim(),
      certificationNumber,
      certifyingSchool: certifyingSchool.trim() || null,
      population,
      focusGroups,
      practiceAreas,
      specializedAreas,
      specializationMode:
        population.length === 0 &&
        focusGroups.length === 0 &&
        practiceAreas.length === 0 &&
        specializedAreas.length === 0 &&
        specializationMode === 'exclusive'
          ? 'inclusive'
          : specializationMode,
      modality,
      country,
      estado: country === VENEZUELA ? estado : null,
      ciudad: country === VENEZUELA ? ciudad || null : null,
      credentialCountry: credentialCountry || null,
      whatsappCountry: whatsappCountry || null,
      whatsapp,
    } as ProfileEditInput
  }

  function submitSave() {
    save.mutate({ ...buildPayload(), professionalId: pro.id })
  }

  // ponytail: the "approve with changes" one-click path. Saves the (possibly
  // edited) fields, then verifies — explicitly sequential so a save failure
  // aborts before the accept. Only meaningful for pending/rejected pros (the
  // button is hidden otherwise). Uses mutateAsync so both steps surface errors
  // via the same try/catch.
  async function saveAndApprove() {
    try {
      await save.mutateAsync({ ...buildPayload(), professionalId: pro.id })
      await setStatusMut.mutateAsync({ status: 'verified' })
    } catch {
      // each mutation's onError already notified; nothing more to do.
    }
  }

  const ciudades = (
    ESTADO_CIUDADES as Record<string, readonly string[] | undefined>
  )[estado] ?? []
  const isPending = pro.verifiedStatus === 'pending'
  const isRejected = pro.verifiedStatus === 'rejected'
  const savePending = save.isPending || setStatusMut.isPending

  return (
    <section className="glass-card-soft mt-4 rounded-[var(--glass-radius-sm)] p-4">
      <h2 className="text-sm font-semibold text-[var(--medi-text-primary)]">
        Editar perfil
      </h2>
      <p className="mt-1 text-xs text-[var(--medi-text-secondary)]">
        Los cambios que hagas aquí aplican inmediatamente y{' '}
        <strong>no</strong> reinician la verificación (tú eres quien revisa).
      </p>

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
              Acompaña a cualquier persona, sin filtros de edad, grupo o área.
            </span>
          </span>
        </label>

        {!generalAttention && (
          <>
            <TagSelect
              label="¿Con qué edades trabaja?"
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
              label="¿En qué áreas interviene?"
              options={PRACTICE_AREA_OPTIONS}
              value={practiceAreas}
              onChange={setPracticeAreas}
            />
            <TagSelect
              label="¿Acompaña en áreas específicas? (Duelo, Trauma, etc.)"
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
                  label="¿Cómo participa?"
                  errors={[]}
                  hint={
                    exclusiveDisabled
                      ? 'Selecciona al menos una preferencia arriba para activar la opción Exclusiva.'
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
                        — aparece en el directorio general y cuando alguien
                        filtra por cualquiera de sus preferencias.
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
                        — solo aparece cuando alguien filtra por una de sus
                        preferencias.
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
        <FieldShell label="País donde vive" errors={[]} required>
          <select
            className={inputCls}
            value={country}
            onChange={(e) => {
              setCountry(e.target.value)
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
        onClick={submitSave}
        disabled={!dirty || save.isPending}
        className="glass-primary mt-3 min-h-11 w-full !text-white disabled:opacity-50"
      >
        {save.isPending ? 'Guardando…' : 'Guardar cambios'}
      </Button>

      {/* ponytail: the "approve with changes" path — save fields then verify,
          sequentially. Shown only for not-yet-verified pros. */}
      {(isPending || isRejected) && (
        <Button
          type="button"
          onClick={saveAndApprove}
          disabled={savePending}
          className="mt-2 min-h-11 w-full rounded-[var(--glass-radius-sm)] bg-green-600 !text-white transition-all hover:translate-y-[-1px] hover:bg-green-700 disabled:opacity-50"
        >
          {savePending
            ? 'Procesando…'
            : isPending
              ? 'Guardar y aprobar'
              : 'Guardar y reactivar'}
        </Button>
      )}
    </section>
  )
}

// ponytail: status actions row, mirroring the list ProActions. Kept separate
// from the edit form so save + status-flip stay distinct concerns (the edit
// fn never touches verifiedStatus; the status fn never touches profile cols).
function AdminStatusActions({
  pro,
}: {
  pro: { id: number; name: string; verifiedStatus: string }
}) {
  const qc = useQueryClient()
  const { data: adminUser } = useQuery({
    queryKey: ['me'],
    queryFn: () => getCurrentUser(),
  })
  const actorId = adminUser?.id
  const setStatusMut = useMutation({
    mutationFn: (vars: {
      status: 'verified' | 'rejected' | 'disabled' | 'deleted'
    }) => reviewProfessional({ data: { professionalId: pro.id, status: vars.status } }),
    onSuccess: (_d, vars) => {
      if (actorId) {
        track({
          event: 'admin_pro_review',
          category: 'admin',
          actorId,
          param1: vars.status,
          param2: String(pro.id),
        })
      }
      qc.invalidateQueries({ queryKey: ['admin-professional', pro.id] })
      qc.invalidateQueries({ queryKey: ['admin-professionals'] })
      qc.invalidateQueries({ queryKey: ['verified-count'] })
      const M = {
        verified: { type: 'success', title: 'Profesional aprobado' },
        rejected: { type: 'warning', title: 'Profesional rechazado' },
        disabled: { type: 'warning', title: 'Profesional suspendido' },
        deleted: { type: 'warning', title: 'Profesional eliminado' },
      } as const
      notify(M[vars.status])
    },
    onError: () =>
      notify({
        type: 'error',
        title: 'No se pudo actualizar el estado',
        body: 'Inténtalo de nuevo.',
      }),
  })

  function onStatus(target: 'verified' | 'rejected' | 'disabled' | 'deleted') {
    // ponytail: match the list route's confirmation — name the pro and state
    // the consequences (directory + audit removal, can re-register). Deletion
    // is the destructive action on this page; the detail view has pro.name
    // so the admin gets the same information in both places.
    if (
      target === 'deleted' &&
      !window.confirm(
        `¿Eliminar a "${pro.name}"? Desaparecerá del directorio y de esta auditoría. Podrá volver a registrarse.`,
      )
    ) {
      return
    }
    setStatusMut.mutate({ status: target })
  }

  const ACTION_BTN =
    'min-h-11 flex-1 rounded-[var(--glass-radius-sm)] px-3 py-2 text-sm font-semibold transition-all hover:translate-y-[-1px] disabled:opacity-60'

  let actions: { label: string; target: 'verified' | 'rejected' | 'disabled' | 'deleted'; cls: string }[] = []
  if (pro.verifiedStatus === 'pending') {
    actions = [
      { label: 'Aprobar', target: 'verified', cls: `${ACTION_BTN} bg-green-600 !text-white hover:bg-green-700` },
      { label: 'Rechazar', target: 'rejected', cls: `${ACTION_BTN} glass-card-soft border-2 border-red-600 text-red-600 hover:bg-red-50/60` },
    ]
  } else if (pro.verifiedStatus === 'verified') {
    actions = [
      { label: 'Suspender', target: 'disabled', cls: `${ACTION_BTN} glass-card-soft border border-amber-500 text-amber-700 hover:bg-amber-50/60` },
      { label: 'Eliminar', target: 'deleted', cls: `${ACTION_BTN} glass-card-soft border border-red-300 text-red-700 hover:bg-red-50/60` },
    ]
  } else if (pro.verifiedStatus === 'disabled') {
    actions = [
      { label: 'Reactivar', target: 'verified', cls: `${ACTION_BTN} bg-green-600 !text-white hover:bg-green-700` },
      { label: 'Eliminar', target: 'deleted', cls: `${ACTION_BTN} glass-card-soft border border-red-300 text-red-700 hover:bg-red-50/60` },
    ]
  } else if (pro.verifiedStatus === 'rejected') {
    actions = [
      { label: 'Aprobar', target: 'verified', cls: `${ACTION_BTN} bg-green-600 !text-white hover:bg-green-700` },
      { label: 'Eliminar', target: 'deleted', cls: `${ACTION_BTN} glass-card-soft border border-red-300 text-red-700 hover:bg-red-50/60` },
    ]
  }

  if (actions.length === 0) return null

  return (
    <section className="glass-card-soft mt-4 rounded-[var(--glass-radius-sm)] p-4">
      <h2 className="text-sm font-semibold text-[var(--medi-text-primary)]">
        Estado
      </h2>
      <div className="mt-3 flex gap-2 disabled:opacity-60">
        {actions.map((a) => (
          <button
            key={a.target}
            type="button"
            onClick={() => onStatus(a.target)}
            disabled={setStatusMut.isPending}
            className={a.cls}
          >
            {a.label}
          </button>
        ))}
      </div>
      {setStatusMut.isPending && (
        <p className="mt-2 text-center text-xs text-[var(--medi-text-secondary)]">
          Actualizando…
        </p>
      )}
    </section>
  )
}
