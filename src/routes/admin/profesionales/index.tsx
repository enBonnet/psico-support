import { createFileRoute, Link } from '@tanstack/react-router'
import {
  useQuery,
  useMutation,
  useQueryClient,
  keepPreviousData,
} from '@tanstack/react-query'
import { useState } from 'react'
import { useDebounced } from '#/lib/hooks/use-debounced'
import { MessageCircle } from 'lucide-react'
import { notify } from '#/lib/notifications'
import { track } from '#/lib/analytics-client'
import { Skeleton } from '#/components/ui/skeleton'
import { Switch } from '#/components/ui/switch'
import {
  reviewProfessional,
  getCurrentUser,
  listAllProfessionals,
  adminSetProvidesService,
  publicCertificateUrl,
} from '#/server/professionals'
import {
  SectionSearch,
  Pager,
  STATUS_META,
} from '#/components/admin-shared'
import type { AdminPro, AdminProList } from '#/components/admin-shared'

// =============================================================================
// /admin/profesionales — credential audit
// =============================================================================
// List + search + status filter + paginated cards. Lifted verbatim from the
// old monolithic /admin/index.tsx; only structural changes are: no <main>
// wrapper (parent layout owns it), no auth guard (parent owns it), and the
// card <ul> is a 2-col grid on lg+ (matches the public directory) so desktop
// uses the wide layout. Queries / mutations / optimistic updates / tracking
// are unchanged.
// =============================================================================

const PAGE_SIZE = 8
type StatusFilter = 'pending' | 'verified' | 'disabled' | 'rejected' | undefined

const PRO_FILTERS: { key: StatusFilter; label: string }[] = [
  { key: undefined, label: 'Todos' },
  { key: 'pending', label: 'Pendientes' },
  { key: 'verified', label: 'Verificados' },
  { key: 'disabled', label: 'Suspendidos' },
  { key: 'rejected', label: 'Rechazados' },
]

export const Route = createFileRoute('/admin/profesionales/')({
  component: ProfessionalsAuditSection,
})

function ProfessionalsAuditSection() {
  const qc = useQueryClient()
  const { data: adminUser } = useQuery({
    queryKey: ['me'],
    queryFn: () => getCurrentUser(),
  })
  const actorId = adminUser?.id
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
      // ponytail: snapshot every matching list page so a server failure
      // restores the exact pre-optimization state across all filter/page
      // variants (CodeRabbit: the old optimistic write had no rollback).
      const prevSnap = qc.getQueriesData<AdminProList>({
        queryKey: ['admin-professionals'],
      })
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
      return { prevSnap }
    },
    onError: (_e, _vars, ctx) => {
      if (ctx?.prevSnap) {
        for (const [key, cached] of ctx.prevSnap) {
          qc.setQueryData(key, cached)
        }
      }
      notify({
        type: 'error',
        title: 'No se pudo actualizar el estado',
        body: 'Inténtalo de nuevo.',
      })
    },
    onSuccess: (_d, vars) => {
      if (actorId) {
        track({
          event: 'admin_pro_review',
          category: 'admin',
          actorId,
          param1: vars.status,
          param2: String(vars.id),
        })
      }
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
      const prevSnap = qc.getQueriesData<AdminProList>({
        queryKey: ['admin-professionals'],
      })
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
      return { prevSnap }
    },
    onError: (_e, _vars, ctx) => {
      if (ctx?.prevSnap) {
        for (const [key, cached] of ctx.prevSnap) {
          qc.setQueryData(key, cached)
        }
      }
      notify({
        type: 'error',
        title: 'No se pudo actualizar',
        body: 'Inténtalo de nuevo.',
      })
    },
    onSuccess: (_d, vars) => {
      if (actorId) {
        track({
          event: 'admin_pro_toggle_service',
          category: 'admin',
          actorId,
          param1: String(vars.id),
          param2: String(vars.providesService),
        })
      }
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
    <section>
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
            ariaLabel="Buscar profesionales"
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
        <ul
          className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2"
          aria-busy="true"
        >
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
        // ponytail: 2-col grid on lg+ to use the wide layout (matches the
        // public directory). Mobile stays single-column.
        <ul className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
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
  pending,
}: {
  pro: AdminPro
  onStatus: (target: 'verified' | 'rejected' | 'disabled' | 'deleted') => void
  // ponytail: disables every action button while a status mutation is in
  // flight, so two rapid clicks (or two admins) can't queue conflicting
  // transitions. ACTION_BTN carries disabled:opacity-60 for the dim.
  pending: boolean
}) {
  switch (pro.verifiedStatus) {
    case 'pending':
      return (
        <>
          <button
            type="button"
            disabled={pending}
            onClick={() => onStatus('verified')}
            className={`${ACTION_BTN} bg-green-600 !text-white hover:bg-green-700`}
          >
            Aprobar
          </button>
          <button
            type="button"
            disabled={pending}
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
            disabled={pending}
            onClick={() => onStatus('disabled')}
            className={`${ACTION_BTN} glass-card-soft border border-amber-500 text-amber-700 hover:bg-amber-50/60`}
          >
            Suspender
          </button>
          <button
            type="button"
            disabled={pending}
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
            disabled={pending}
            onClick={() => onStatus('verified')}
            className={`${ACTION_BTN} bg-green-600 !text-white hover:bg-green-700`}
          >
            Reactivar
          </button>
          <button
            type="button"
            disabled={pending}
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
            disabled={pending}
            onClick={() => onStatus('verified')}
            className={`${ACTION_BTN} bg-green-600 !text-white hover:bg-green-700`}
          >
            Aprobar
          </button>
          <button
            type="button"
            disabled={pending}
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
  // ponytail: wa.me wants digits only (no +, no spaces) — same normalization
  // as the public directory card. Pre-fills a message so the pro knows the
  // contact came through psicoayudaven.
  const waDigits = pro.whatsapp.replace(/\D/g, '')
  const waHref = `https://wa.me/${waDigits}?text=${encodeURIComponent(
    'Hola, te escribimos desde PsicoAyudaVen.',
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

      {/* ponytail: open the review/edit detail route for this pro. "Revisar"
          for pending (the action admins take most), "Editar" once verified
          (field tweaks). Lives above the status actions so it reads as the
          primary affordance. */}
      <Link
        to="/admin/profesionales/$id"
        params={{ id: String(pro.id) }}
        className="mt-4 flex min-h-11 w-full items-center justify-center rounded-[var(--glass-radius-sm)] bg-[var(--medi-primary)] px-3 py-2 text-sm font-semibold !text-white transition-all hover:translate-y-[-1px] hover:bg-[var(--medi-primary)]/90"
      >
        {pro.verifiedStatus === 'pending' ? 'Revisar y editar' : 'Editar perfil'}
      </Link>

      <div className="mt-2 flex gap-2">
        <div className="flex flex-1 gap-2">
          <ProActions pro={pro} onStatus={onStatus} pending={statusPending} />
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
