import { createFileRoute, redirect } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { authClient } from '#/lib/auth-client'
import { notify } from '#/lib/notifications'
import { Skeleton } from '#/components/ui/skeleton'
import {
  listPending,
  reviewProfessional,
  amIAdmin,
  getCurrentUser,
  listUsers,
  promoteToAdmin,
  countVerifiedProfessionals,
} from '#/server/professionals'
import {
  listPendingStories,
  reviewStory,
} from '#/server/audio-stories'
import type { PendingStoryRow } from '#/server/audio-stories'

// ponytail: derived list type so the optimistic setQueryData stays typed
// without exporting a DTO from the server module.
type PendingList = Awaited<ReturnType<typeof listPending>>

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
  // beforeLoad runs client-side (two server-fn round-trips); the pending
  // skeleton covers the gap instead of an SSR'd first paint.
  ssr: false,
  component: AdminPage,
})

function AdminPage() {
  const qc = useQueryClient()
  const { data: pending = [], isLoading: pendingLoading } = useQuery({
    queryKey: ['pending-professionals'],
    queryFn: () => listPending(),
  })

  const decide = useMutation({
    mutationFn: (vars: {
      professionalId: number
      status: 'verified' | 'rejected'
    }) => reviewProfessional({ data: vars }),
    onMutate: async (vars) => {
      // ponytail: optimistic removal. D1 is eventually consistent across
      // requests, so the post-mutation listPending refetch can still return
      // the just-decided row as "pending" (the original "click twice" bug).
      // Remove it from the cache now; onSuccess invalidates to reconcile.
      await qc.cancelQueries({ queryKey: ['pending-professionals'] })
      const prev = qc.getQueryData<PendingList>(['pending-professionals'])
      qc.setQueryData<PendingList>(['pending-professionals'], (old) =>
        old?.filter((p) => p.id !== vars.professionalId),
      )
      return { prev }
    },
    onError: (_e, _vars, ctx) => {
      if (ctx?.prev) {
        qc.setQueryData<PendingList>(['pending-professionals'], ctx.prev)
      }
      notify({
        type: 'error',
        title: 'No se pudo actualizar el estado',
        body: 'Inténtalo de nuevo.',
      })
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['pending-professionals'] })
      // ponytail: a verify/reject moves the verified pool size, so refresh the
      // stat too. Reject doesn't change it, but invalidating is idempotent and
      // cheaper than branching on vars.status.
      if (vars.status === 'verified') {
        qc.invalidateQueries({ queryKey: ['verified-count'] })
      }
      notify({
        type: vars.status === 'verified' ? 'success' : 'warning',
        title:
          vars.status === 'verified'
            ? 'Profesional aprobado'
            : 'Profesional rechazado',
        body:
          vars.status === 'verified'
            ? 'Ya aparece en la lista pública.'
            : 'Quedó fuera de la lista pública.',
      })
    },
  })

  const { data: users = [], isLoading: usersLoading } = useQuery({
    queryKey: ['admin-users'],
    queryFn: () => listUsers(),
  })

  // ponytail: exact verified count for the admin (the landing shows a floored
  // "Más de N" — admins need the precise number). Stale while the query loads;
  // the em-dash placeholder avoids a jarring 0 flash.
  const { data: verifiedCount } = useQuery({
    queryKey: ['verified-count'],
    queryFn: () => countVerifiedProfessionals(),
  })

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

  // ponytail: audio-story review queue. Mirrors the credential decide()
  // pattern — optimistic removal from the cache (D1 eventual consistency can
  // briefly re-serve a just-reviewed row), invalidate on success.
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
          vars.status === 'approved'
            ? 'Audio aprobado'
            : 'Audio rechazado',
        body:
          vars.status === 'approved'
            ? 'Ya aparece en Voces que acompañan.'
            : 'Quedó fuera de la lista pública.',
      })
    },
  })

  return (
    <main className="page-wrap flex min-h-[100dvh] flex-col py-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-[var(--medi-text-primary)]">
          Validaciones Pendientes
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

      {pendingLoading ? (
        <ul className="mt-6 flex flex-col gap-3 pb-6" aria-busy="true">
          {[0, 1, 2].map((i) => (
            <li key={i} className="glass-card p-4">
              <Skeleton className="h-5 w-44" />
              <Skeleton className="mt-2 h-4 w-60" />
              <Skeleton className="mt-4 h-24 w-full" />
            </li>
          ))}
        </ul>
      ) : pending.length === 0 ? (
        <p className="glass-card-soft mt-6 p-5 text-center text-[var(--medi-text-secondary)]">
          No hay registros por validar.
        </p>
      ) : (
        <ul className="mt-6 flex flex-col gap-3 pb-12">
          {pending.map((p) => (
            <li key={p.id} className="glass-card p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-lg font-semibold text-[var(--medi-text-primary)]">
                    {p.name}
                  </p>
                  <p className="text-sm text-[var(--medi-text-secondary)]">
                    {p.userEmail}
                  </p>
                  <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                    <dt className="col-span-2 mt-1 text-xs font-semibold uppercase tracking-wide text-[var(--medi-text-secondary)]">
                      Ubicación
                    </dt>
                    <dt className="text-[var(--medi-text-secondary)]">País</dt>
                    <dd>
                      {p.country === 'Venezuela'
                        ? `Venezuela — ${[p.estado, p.ciudad].filter(Boolean).join(', ')}`
                        : p.country}
                    </dd>

                    <dt className="col-span-2 mt-1 text-xs font-semibold uppercase tracking-wide text-[var(--medi-text-secondary)]">
                      Credencial
                    </dt>
                    <dt className="text-[var(--medi-text-secondary)]">
                      Nº colegiación
                    </dt>
                    <dd className="font-semibold text-[var(--medi-text-primary)]">
                      {p.certificationNumber}
                    </dd>
                    <dt className="text-[var(--medi-text-secondary)]">
                      País cred.
                    </dt>
                    <dd>{p.credentialCountry ?? '—'}</dd>
                    {p.certifyingSchool && (
                      <>
                        <dt className="text-[var(--medi-text-secondary)]">
                          Colegio
                        </dt>
                        <dd>{p.certifyingSchool}</dd>
                      </>
                    )}
                    {p.population.length > 0 && (
                      <>
                        <dt className="text-[var(--medi-text-secondary)]">
                          Atiende a
                        </dt>
                        <dd>{p.population.join(', ')}</dd>
                      </>
                    )}
                    {p.focusGroups.length > 0 && (
                      <>
                        <dt className="text-[var(--medi-text-secondary)]">
                          Población esp.
                        </dt>
                        <dd>{p.focusGroups.join(', ')}</dd>
                      </>
                    )}
                    {p.practiceAreas.length > 0 && (
                      <>
                        <dt className="text-[var(--medi-text-secondary)]">
                          Área de interv.
                        </dt>
                        <dd>{p.practiceAreas.join(', ')}</dd>
                      </>
                    )}

                    <dt className="col-span-2 mt-1 text-xs font-semibold uppercase tracking-wide text-[var(--medi-text-secondary)]">
                      Contacto
                    </dt>
                    <dt className="text-[var(--medi-text-secondary)]">
                      Modalidad
                    </dt>
                    <dd>
                      {p.modality === 'in_person'
                        ? 'Presencial'
                        : p.modality === 'remote'
                          ? 'A distancia'
                          : 'Ambas'}
                    </dd>
                    <dt className="text-[var(--medi-text-secondary)]">
                      WhatsApp
                    </dt>
                    <dd>
                      {p.whatsapp}
                      {p.whatsappCountry ? ` (${p.whatsappCountry})` : ''}
                    </dd>
                  </dl>
                </div>
              </div>
              <div className="mt-4 flex gap-2">
                <button
                  type="button"
                  onClick={() =>
                    decide.mutate({ professionalId: p.id, status: 'verified' })
                  }
                  className="min-h-12 flex-1 rounded-[var(--glass-radius-sm)] bg-green-600 px-4 py-3 text-base font-semibold text-white transition-all hover:translate-y-[-1px] hover:bg-green-700"
                >
                  Aprobar
                </button>
                <button
                  type="button"
                  onClick={() =>
                    decide.mutate({ professionalId: p.id, status: 'rejected' })
                  }
                  className="glass-card-soft min-h-12 flex-1 rounded-[var(--glass-radius-sm)] border-2 border-red-600 px-4 py-3 text-base font-semibold text-red-600 transition-all hover:translate-y-[-1px] hover:bg-red-50/60"
                >
                  Rechazar
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* ── Audios de apoyo (Voces que acompañan) ── */}
      <h2 className="mt-10 border-b border-[var(--medi-border)] pb-1 text-sm font-semibold uppercase tracking-wide text-[var(--medi-text-secondary)]">
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
        <ul className="mt-3 flex flex-col gap-3 pb-6">
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
                {Math.round(s.durationSec / 60)}:
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

      {/* ── Usuarios ── */}
      <h2 className="mt-10 border-b border-[var(--medi-border)] pb-1 text-sm font-semibold uppercase tracking-wide text-[var(--medi-text-secondary)]">
        Usuarios
      </h2>
      <p className="mt-2 text-sm text-[var(--medi-text-secondary)]">
        Promueve una cuenta a administrador. Solo para cuentas de confianza.
      </p>
      <ul className="mt-3 flex flex-col gap-2 pb-6">
        {usersLoading
          ? [0, 1, 2, 3].map((i) => (
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
            ))
          : users.map((u) => (
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
    </main>
  )
}
