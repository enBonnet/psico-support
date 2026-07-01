import { createFileRoute, redirect } from '@tanstack/react-router'
import {
  useQuery,
  useMutation,
  useQueryClient,
  keepPreviousData,
} from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { Search, MessageCircle } from 'lucide-react'
import { authClient } from '#/lib/auth-client'
import { notify } from '#/lib/notifications'
import { Skeleton } from '#/components/ui/skeleton'
import { Switch } from '#/components/ui/switch'
import {
  reviewProfessional,
  amIAdmin,
  getCurrentUser,
  listUsers,
  promoteToAdmin,
  countVerifiedProfessionals,
  listAllProfessionals,
  adminSetProvidesService,
  publicCertificateUrl,
} from '#/server/professionals'
import {
  listPendingStories,
  reviewStory,
} from '#/server/audio-stories'
import type { PendingStoryRow } from '#/server/audio-stories'

// ponytail: derived list types so optimistic setQueriesData stays typed without
// exporting DTOs from the server module.
type AdminProList = Awaited<ReturnType<typeof listAllProfessionals>>
type AdminPro = AdminProList['rows'][number]

const PAGE_SIZE = 8
type StatusFilter = 'pending' | 'verified' | 'disabled' | 'rejected' | undefined

const STATUS_META: Record<
  AdminPro['verifiedStatus'],
  { label: string; badge: string }
> = {
  pending: { label: 'En revisión', badge: 'text-amber-700' },
  verified: { label: 'Verificado', badge: 'text-green-700' },
  disabled: { label: 'Suspendido', badge: 'text-red-700' },
  rejected: { label: 'Rechazado', badge: 'text-red-700' },
  // deleted rows are excluded by listAllProfessionals, but the DB enum type
  // includes 'deleted' — keep the record total to satisfy indexing.
  deleted: { label: 'Eliminado', badge: 'text-red-700' },
}

const PRO_FILTERS: { key: StatusFilter; label: string }[] = [
  { key: undefined, label: 'Todos' },
  { key: 'pending', label: 'Pendientes' },
  { key: 'verified', label: 'Verificados' },
  { key: 'disabled', label: 'Suspendidos' },
  { key: 'rejected', label: 'Rechazados' },
]

export const Route = createFileRoute('/admin/')({
  beforeLoad: async () => {
    // ponytail: use a server fn (reads request headers via __TSS_REQUEST__)
    // instead of authClient.getSession() — the client call does a cookieless
    // fetch during SSR, which always returned null and bounced to login.
    // Under CSR both calls are client→worker RPC; cookies flow on the real
    // browser request.
    const user = await getCurrentUser()
    if (!user) {
      throw redirect({ to: '/profesional/login' })
    }
    const admin = await amIAdmin()
    if (!admin) {
      throw redirect({ to: '/profesional/panel' })
    }
  },
  // ponytail: CSR-only — auth+admin-gated dashboard, no crawler value.
  ssr: false,
  component: AdminPage,
})

function AdminPage() {
  const { data: verifiedCount } = useQuery({
    queryKey: ['verified-count'],
    queryFn: () => countVerifiedProfessionals(),
  })

  return (
    <main className="page-wrap flex min-h-[100dvh] flex-col py-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-[var(--medi-text-primary)]">
          Administración
        </h1>
        <button
          onClick={async () => {
            await authClient.signOut()
            window.location.href = '/'
          }}
          className="text-sm font-medium text-[var(--medi-secondary)]"
        >
          Salir
        </button>
      </div>
      <div className="section-underline mt-2" />

      <p className="mt-2 text-sm text-[var(--medi-text-secondary)]">
        <span className="text-lg font-bold text-[var(--medi-primary)]">
          {verifiedCount ?? '—'}
        </span>{' '}
        profesionales verificados
      </p>

      <ProfessionalsAuditSection />
      <AudioStoriesSection />
      <UsersSection />
    </main>
  )
}

// ── shared search + pagination bits ─────────────────────────────────────────

// ponytail: tiny debounce so typing in the search box doesn't fire one server
// fn per keystroke. 300ms matches typical "stopped typing" cadence.
function useDebounced<T>(value: T, ms = 300): T {
  const [d, setD] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setD(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return d
}

function SectionSearch({
  value,
  onChange,
  placeholder,
}: {
  value: string
  onChange: (v: string) => void
  placeholder: string
}) {
  return (
    <div className="relative">
      <Search
        aria-hidden="true"
        className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--medi-text-secondary)]"
      />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-[var(--glass-radius-sm)] border border-[var(--medi-border)] bg-white/60 py-2 pl-9 pr-3 text-sm text-[var(--medi-text-primary)] outline-none focus:border-[var(--medi-secondary)]"
      />
    </div>
  )
}

// ponytail: prev/next pager. Hidden when there's a single page (no nav needed).
// page is 1-based; pages derived from total/pageSize.
function Pager({
  page,
  total,
  pageSize,
  onPageChange,
}: {
  page: number
  total: number
  pageSize: number
  onPageChange: (p: number) => void
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize))
  if (pages <= 1) return null
  const pagerBtn =
    'flex size-9 items-center justify-center rounded-[var(--glass-radius-sm)] glass-card-soft text-[var(--medi-primary)] transition-all hover:translate-y-[-1px] disabled:opacity-40 disabled:hover:translate-y-0'
  return (
    <div className="mt-3 flex items-center justify-center gap-3 text-sm text-[var(--medi-text-secondary)]">
      <button
        type="button"
        disabled={page <= 1}
        onClick={() => onPageChange(page - 1)}
        aria-label="Página anterior"
        className={pagerBtn}
      >
        ‹
      </button>
      <span>
        Página {page} de {pages}
      </span>
      <button
        type="button"
        disabled={page >= pages}
        onClick={() => onPageChange(page + 1)}
        aria-label="Página siguiente"
        className={pagerBtn}
      >
        ›
      </button>
    </div>
  )
}

// ── Profesionales: credential audit ─────────────────────────────────────────

function ProfessionalsAuditSection() {
  const qc = useQueryClient()
  const [q, setQ] = useState('')
  const [status, setStatus] = useState<StatusFilter>(undefined)
  const [page, setPage] = useState(1)
  const debouncedQ = useDebounced(q)

  const { data, isLoading } = useQuery({
    queryKey: ['admin-professionals', debouncedQ, status, page],
    queryFn: () =>
      listAllProfessionals({
        data: { q: debouncedQ || undefined, status, page, pageSize: PAGE_SIZE },
      }),
    placeholderData: keepPreviousData,
  })
  const rows = data?.rows ?? []
  const total = data?.total ?? 0

  // ponytail: optimistic status mutation. D1 is eventually consistent across
  // requests, so the post-mutation refetch can briefly re-serve the old row —
  // flip it in the cache now (across every admin-professionals page via a
  // partial-key setQueriesData), then invalidate to reconcile. Delete removes
  // the row; other transitions update verifiedStatus (+ available for dormant).
  const setStatusMut = useMutation({
    mutationFn: (vars: {
      id: number
      status: 'verified' | 'rejected' | 'disabled' | 'deleted'
    }) =>
      reviewProfessional({
        data: { professionalId: vars.id, status: vars.status },
      }),
    onMutate: async (vars) => {
      await qc.cancelQueries({ queryKey: ['admin-professionals'] })
      qc.setQueriesData<AdminProList>(
        { queryKey: ['admin-professionals'] },
        (old) => {
          if (!old) return old
          if (vars.status === 'deleted') {
            return {
              ...old,
              rows: old.rows.filter((p) => p.id !== vars.id),
              total: Math.max(0, old.total - 1),
            }
          }
          return {
            ...old,
            rows: old.rows.map((p) =>
              p.id === vars.id
                ? {
                    ...p,
                    verifiedStatus: vars.status,
                    ...(vars.status === 'disabled'
                      ? { available: false }
                      : {}),
                  }
                : p,
            ),
          }
        },
      )
    },
    onError: () =>
      notify({
        type: 'error',
        title: 'No se pudo actualizar el estado',
        body: 'Inténtalo de nuevo.',
      }),
    onSuccess: (_d, vars) => {
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
  })

  const setServiceMut = useMutation({
    mutationFn: (vars: { id: number; providesService: boolean }) =>
      adminSetProvidesService({
        data: { professionalId: vars.id, providesService: vars.providesService },
      }),
    onMutate: async (vars) => {
      await qc.cancelQueries({ queryKey: ['admin-professionals'] })
      qc.setQueriesData<AdminProList>(
        { queryKey: ['admin-professionals'] },
        (old) => {
          if (!old) return old
          return {
            ...old,
            rows: old.rows.map((p) =>
              p.id === vars.id
                ? {
                    ...p,
                    providesService: vars.providesService,
                    ...(vars.providesService ? {} : { available: false }),
                  }
                : p,
            ),
          }
        },
      )
    },
    onError: () =>
      notify({
        type: 'error',
        title: 'No se pudo actualizar',
        body: 'Inténtalo de nuevo.',
      }),
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['admin-professionals'] })
      qc.invalidateQueries({ queryKey: ['verified-count'] })
      notify({
        type: vars.providesService ? 'success' : 'warning',
        title: vars.providesService
          ? 'Presta servicio (en el directorio)'
          : 'Solo contenido (fuera del directorio)',
      })
    },
  })

  function handleStatus(pro: AdminPro, target: 'verified' | 'rejected' | 'disabled' | 'deleted') {
    if (
      target === 'deleted' &&
      !window.confirm(
        `¿Eliminar a "${pro.name}"? Desaparecerá del directorio y de esta auditoría. Podrá volver a registrarse.`,
      )
    ) {
      return
    }
    setStatusMut.mutate({ id: pro.id, status: target })
  }

  return (
    <section className="mt-8">
      <h2 className="border-b border-[var(--medi-border)] pb-1 text-sm font-semibold uppercase tracking-wide text-[var(--medi-text-secondary)]">
        Profesionales
      </h2>

      <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="sm:flex-1">
          <SectionSearch
            value={q}
            onChange={(v) => {
              setQ(v)
              setPage(1)
            }}
            placeholder="Buscar por nombre, correo o nº de colegiación"
          />
        </div>
        <div className="flex flex-wrap gap-1">
          {PRO_FILTERS.map((f) => (
            <button
              key={f.label}
              type="button"
              onClick={() => {
                setStatus(f.key)
                setPage(1)
              }}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-all hover:translate-y-[-1px] ${
                status === f.key
                  ? 'bg-[var(--medi-primary)] !text-white'
                  : 'glass-card-soft text-[var(--medi-primary)]'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <ul className="mt-4 flex flex-col gap-3" aria-busy="true">
          {[0, 1, 2].map((i) => (
            <li key={i} className="glass-card p-4">
              <Skeleton className="h-5 w-44" />
              <Skeleton className="mt-2 h-4 w-60" />
              <Skeleton className="mt-4 h-24 w-full" />
            </li>
          ))}
        </ul>
      ) : rows.length === 0 ? (
        <p className="glass-card-soft mt-4 p-5 text-center text-sm text-[var(--medi-text-secondary)]">
          No hay profesionales para mostrar.
        </p>
      ) : (
        <ul className="mt-4 flex flex-col gap-3">
          {rows.map((p) => (
            <ProCard
              key={p.id}
              pro={p}
              statusPending={setStatusMut.isPending}
              servicePending={setServiceMut.isPending}
              onStatus={(target) => handleStatus(p, target)}
              onToggleService={(id, providesService) =>
                setServiceMut.mutate({ id, providesService })
              }
            />
          ))}
        </ul>
      )}

      <Pager page={page} total={total} pageSize={PAGE_SIZE} onPageChange={setPage} />
    </section>
  )
}

const ACTION_BTN =
  'min-h-11 flex-1 rounded-[var(--glass-radius-sm)] px-3 py-2 text-sm font-semibold transition-all hover:translate-y-[-1px] disabled:opacity-60'

function ProActions({
  pro,
  onStatus,
}: {
  pro: AdminPro
  onStatus: (target: 'verified' | 'rejected' | 'disabled' | 'deleted') => void
}) {
  switch (pro.verifiedStatus) {
    case 'pending':
      return (
        <>
          <button
            type="button"
            onClick={() => onStatus('verified')}
            className={`${ACTION_BTN} bg-green-600 !text-white hover:bg-green-700`}
          >
            Aprobar
          </button>
          <button
            type="button"
            onClick={() => onStatus('rejected')}
            className={`${ACTION_BTN} glass-card-soft border-2 border-red-600 text-red-600 hover:bg-red-50/60`}
          >
            Rechazar
          </button>
        </>
      )
    case 'verified':
      return (
        <>
          <button
            type="button"
            onClick={() => onStatus('disabled')}
            className={`${ACTION_BTN} glass-card-soft border border-amber-500 text-amber-700 hover:bg-amber-50/60`}
          >
            Suspender
          </button>
          <button
            type="button"
            onClick={() => onStatus('deleted')}
            className={`${ACTION_BTN} glass-card-soft border border-red-300 text-red-700 hover:bg-red-50/60`}
          >
            Eliminar
          </button>
        </>
      )
    case 'disabled':
      return (
        <>
          <button
            type="button"
            onClick={() => onStatus('verified')}
            className={`${ACTION_BTN} bg-green-600 !text-white hover:bg-green-700`}
          >
            Reactivar
          </button>
          <button
            type="button"
            onClick={() => onStatus('deleted')}
            className={`${ACTION_BTN} glass-card-soft border border-red-300 text-red-700 hover:bg-red-50/60`}
          >
            Eliminar
          </button>
        </>
      )
    case 'rejected':
      return (
        <>
          <button
            type="button"
            onClick={() => onStatus('verified')}
            className={`${ACTION_BTN} bg-green-600 !text-white hover:bg-green-700`}
          >
            Aprobar
          </button>
          <button
            type="button"
            onClick={() => onStatus('deleted')}
            className={`${ACTION_BTN} glass-card-soft border border-red-300 text-red-700 hover:bg-red-50/60`}
          >
            Eliminar
          </button>
        </>
      )
  }
}

function ProCard({
  pro,
  statusPending,
  servicePending,
  onStatus,
  onToggleService,
}: {
  pro: AdminPro
  statusPending: boolean
  servicePending: boolean
  onStatus: (target: 'verified' | 'rejected' | 'disabled' | 'deleted') => void
  onToggleService: (id: number, providesService: boolean) => void
}) {
  const meta = STATUS_META[pro.verifiedStatus]
  const canToggleService =
    pro.verifiedStatus === 'verified' || pro.verifiedStatus === 'disabled'
  // ponytail: wa.me wants digits only (no +, no spaces) — same normalization as
  // the public directory card. Pre-fills a message so the pro knows the
  // contact came through psicoayudaven.
  const waDigits = pro.whatsapp.replace(/\D/g, '')
  const waHref = `https://wa.me/${waDigits}?text=${encodeURIComponent(
    'Hola, te escribimos desde psicoayudaven.',
  )}`
  return (
    <li className="glass-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-lg font-semibold text-[var(--medi-text-primary)]">
            {pro.name}
          </p>
          <p className="truncate text-sm text-[var(--medi-text-secondary)]">
            {pro.userEmail}
          </p>
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

      <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
        <dt className="col-span-2 mt-1 text-xs font-semibold uppercase tracking-wide text-[var(--medi-text-secondary)]">
          Ubicación
        </dt>
        <dt className="text-[var(--medi-text-secondary)]">País</dt>
        <dd>
          {pro.country === 'Venezuela'
            ? `Venezuela — ${[pro.estado, pro.ciudad].filter(Boolean).join(', ')}`
            : pro.country}
        </dd>

        <dt className="col-span-2 mt-1 text-xs font-semibold uppercase tracking-wide text-[var(--medi-text-secondary)]">
          Credencial
        </dt>
        <dt className="text-[var(--medi-text-secondary)]">Nº colegiación</dt>
        <dd className="font-semibold text-[var(--medi-text-primary)]">
          {pro.certificationNumber}
        </dd>
        <dt className="text-[var(--medi-text-secondary)]">País cred.</dt>
        <dd>{pro.credentialCountry ?? '—'}</dd>
        {pro.certifyingSchool && (
          <>
            <dt className="text-[var(--medi-text-secondary)]">Colegio</dt>
            <dd>{pro.certifyingSchool}</dd>
          </>
        )}
        {pro.population.length > 0 && (
          <>
            <dt className="text-[var(--medi-text-secondary)]">Atiende a</dt>
            <dd>{pro.population.join(', ')}</dd>
          </>
        )}
        {pro.focusGroups.length > 0 && (
          <>
            <dt className="text-[var(--medi-text-secondary)]">
              Población esp.
            </dt>
            <dd>{pro.focusGroups.join(', ')}</dd>
          </>
        )}
        {pro.practiceAreas.length > 0 && (
          <>
            <dt className="text-[var(--medi-text-secondary)]">
              Área de interv.
            </dt>
            <dd>{pro.practiceAreas.join(', ')}</dd>
          </>
        )}

        <dt className="col-span-2 mt-1 text-xs font-semibold uppercase tracking-wide text-[var(--medi-text-secondary)]">
          Contacto
        </dt>
        <dt className="text-[var(--medi-text-secondary)]">Modalidad</dt>
        <dd>
          {pro.modality === 'in_person'
            ? 'Presencial'
            : pro.modality === 'remote'
              ? 'A distancia'
              : 'Ambas'}
        </dd>
        <dt className="text-[var(--medi-text-secondary)]">WhatsApp</dt>
        <dd>
          {pro.whatsapp}
          {pro.whatsappCountry ? ` (${pro.whatsappCountry})` : ''}
        </dd>
      </dl>

      <a
        href={waHref}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-3 flex min-h-10 items-center justify-center gap-2 rounded-[var(--glass-radius-sm)] bg-green-600 px-4 py-2 text-sm font-semibold !text-white transition-all hover:translate-y-[-1px] hover:bg-green-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--medi-secondary)]"
      >
        <MessageCircle aria-hidden="true" className="size-4" />
        Contactar por WhatsApp
      </a>

      {pro.certificateKey && (
        <a
          href={publicCertificateUrl(pro.certificateKey)}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 inline-block text-sm font-semibold text-[var(--medi-secondary)] hover:underline"
        >
          Ver certificado adjunto →
        </a>
      )}

      {pro.supportDocs.length > 0 && (
        <div className="mt-2 flex flex-col gap-1">
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

      {canToggleService && (
        <label className="mt-3 flex items-center gap-2 text-sm text-[var(--medi-text-secondary)]">
          <Switch
            checked={pro.providesService}
            onCheckedChange={(c) => onToggleService(pro.id, c)}
            disabled={servicePending}
            size="sm"
          />
          Presta servicio{' '}
          <span className="text-xs">
            (si no, aporta solo audios a Voces que acompañan)
          </span>
        </label>
      )}

      <div className="mt-4 flex gap-2 disabled:opacity-60">
        <div className="flex flex-1 gap-2 opacity-100">
          <ProActions pro={pro} onStatus={onStatus} />
        </div>
      </div>
      {statusPending && (
        <p className="mt-2 text-center text-xs text-[var(--medi-text-secondary)]">
          Actualizando…
        </p>
      )}
    </li>
  )
}

// ── Audios de apoyo (Voces que acompañan) ───────────────────────────────────

function AudioStoriesSection() {
  const qc = useQueryClient()
  const { data: pendingStories = [], isLoading: storiesLoading } = useQuery({
    queryKey: ['pending-stories'],
    queryFn: () => listPendingStories(),
  })

  const decideStory = useMutation({
    mutationFn: (vars: { storyId: number; status: 'approved' | 'rejected' }) =>
      reviewStory({ data: vars }),
    onMutate: async (vars) => {
      await qc.cancelQueries({ queryKey: ['pending-stories'] })
      const prev = qc.getQueryData<PendingStoryRow[]>(['pending-stories'])
      qc.setQueryData<PendingStoryRow[]>(['pending-stories'], (old) =>
        old?.filter((s) => s.id !== vars.storyId),
      )
      return { prev }
    },
    onError: (_e, _vars, ctx) => {
      if (ctx?.prev) {
        qc.setQueryData<PendingStoryRow[]>(['pending-stories'], ctx.prev)
      }
      notify({
        type: 'error',
        title: 'No se pudo actualizar el audio',
        body: 'Inténtalo de nuevo.',
      })
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['pending-stories'] })
      qc.invalidateQueries({ queryKey: ['story-tray'] })
      notify({
        type: vars.status === 'approved' ? 'success' : 'warning',
        title:
          vars.status === 'approved' ? 'Audio aprobado' : 'Audio rechazado',
        body:
          vars.status === 'approved'
            ? 'Ya aparece en Voces que acompañan.'
            : 'Quedó fuera de la lista pública.',
      })
    },
  })

  return (
    <section className="mt-10">
      <h2 className="border-b border-[var(--medi-border)] pb-1 text-sm font-semibold uppercase tracking-wide text-[var(--medi-text-secondary)]">
        Audios de apoyo — revisión
      </h2>
      {storiesLoading ? (
        <p className="mt-2 text-sm text-[var(--medi-text-secondary)]">
          Cargando…
        </p>
      ) : pendingStories.length === 0 ? (
        <p className="glass-card-soft mt-2 p-4 text-center text-sm text-[var(--medi-text-secondary)]">
          No hay audios por revisar.
        </p>
      ) : (
        <ul className="mt-3 flex flex-col gap-3">
          {pendingStories.map((s) => (
            <li key={s.id} className="glass-card p-4">
              <p className="truncate text-sm font-semibold text-[var(--medi-text-primary)]">
                {s.proName}
              </p>
              {s.title && (
                <p className="mt-0.5 text-sm text-[var(--medi-text-secondary)]">
                  “{s.title}”
                </p>
              )}
              <p className="mt-0.5 text-xs text-[var(--medi-text-secondary)]">
                {Math.floor(s.durationSec / 60)}:
                {(s.durationSec % 60).toString().padStart(2, '0')}
              </p>
              <audio
                controls
                src={s.url}
                preload="none"
                className="mt-2 w-full"
                aria-label={`Audio de ${s.proName} para revisión`}
              />
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={() =>
                    decideStory.mutate({ storyId: s.id, status: 'approved' })
                  }
                  className="min-h-11 flex-1 rounded-[var(--glass-radius-sm)] bg-green-600 px-4 py-2 text-sm font-semibold !text-white transition-all hover:translate-y-[-1px] hover:bg-green-700"
                >
                  Aprobar
                </button>
                <button
                  type="button"
                  onClick={() =>
                    decideStory.mutate({ storyId: s.id, status: 'rejected' })
                  }
                  className="glass-card-soft min-h-11 flex-1 rounded-[var(--glass-radius-sm)] border-2 border-red-600 px-4 py-2 text-sm font-semibold text-red-600 transition-all hover:translate-y-[-1px] hover:bg-red-50/60"
                >
                  Rechazar
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

// ── Usuarios ────────────────────────────────────────────────────────────────

function UsersSection() {
  const qc = useQueryClient()
  const [q, setQ] = useState('')
  const [page, setPage] = useState(1)
  const debouncedQ = useDebounced(q)

  const { data, isLoading } = useQuery({
    queryKey: ['admin-users', debouncedQ, page],
    queryFn: () =>
      listUsers({ data: { q: debouncedQ || undefined, page, pageSize: PAGE_SIZE } }),
    placeholderData: keepPreviousData,
  })
  const users = data?.rows ?? []
  const total = data?.total ?? 0

  const promote = useMutation({
    mutationFn: (userId: string) => promoteToAdmin({ data: { userId } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-users'] })
      notify({
        type: 'success',
        title: 'Usuario promovido a admin',
        body: 'Ahora tiene acceso al panel de administración.',
      })
    },
    onError: () =>
      notify({
        type: 'error',
        title: 'No se pudo promover',
        body: 'Inténtalo de nuevo.',
      }),
  })

  return (
    <section className="mt-10">
      <h2 className="border-b border-[var(--medi-border)] pb-1 text-sm font-semibold uppercase tracking-wide text-[var(--medi-text-secondary)]">
        Usuarios
      </h2>
      <p className="mt-2 text-sm text-[var(--medi-text-secondary)]">
        Promueve una cuenta a administrador. Solo para cuentas de confianza.
      </p>
      <div className="mt-3">
        <SectionSearch
          value={q}
          onChange={(v) => {
            setQ(v)
            setPage(1)
          }}
          placeholder="Buscar por nombre o correo"
        />
      </div>
      {isLoading ? (
        <ul className="mt-3 flex flex-col gap-2" aria-busy="true">
          {[0, 1, 2].map((i) => (
            <li
              key={i}
              className="glass-card flex items-center justify-between gap-3 p-3"
            >
              <div className="flex flex-col gap-2">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-48" />
              </div>
              <Skeleton className="h-7 w-24 rounded-full" />
            </li>
          ))}
        </ul>
      ) : users.length === 0 ? (
        <p className="glass-card-soft mt-3 p-4 text-center text-sm text-[var(--medi-text-secondary)]">
          Sin resultados.
        </p>
      ) : (
        <ul className="mt-3 flex flex-col gap-2">
          {users.map((u) => (
            <li
              key={u.id}
              className="glass-card flex items-center justify-between gap-3 p-3"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-[var(--medi-text-primary)]">
                  {u.name}
                </p>
                <p className="truncate text-xs text-[var(--medi-text-secondary)]">
                  {u.email}
                </p>
              </div>
              {u.role === 'admin' ? (
                <span className="shrink-0 rounded-full bg-[var(--medi-secondary)] px-3 py-1 text-xs font-semibold text-white">
                  admin
                </span>
              ) : (
                <button
                  type="button"
                  disabled={promote.isPending}
                  onClick={() => promote.mutate(u.id)}
                  className="glass-card-soft shrink-0 rounded-[var(--glass-radius-sm)] px-3 py-2 text-xs font-semibold text-[var(--medi-secondary)] transition-all hover:translate-y-[-1px] disabled:opacity-60"
                >
                  Hacer admin
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      <Pager page={page} total={total} pageSize={PAGE_SIZE} onPageChange={setPage} />
    </section>
  )
}
