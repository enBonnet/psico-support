import { createFileRoute } from '@tanstack/react-router'
import {
  useQuery,
  useMutation,
  useQueryClient,
  keepPreviousData,
} from '@tanstack/react-query'
import { useState } from 'react'
import { useDebounced } from '#/lib/hooks/use-debounced'
import { notify } from '#/lib/notifications'
import { track } from '#/lib/analytics-client'
import { Skeleton } from '#/components/ui/skeleton'
import { getCurrentUser, listUsers, promoteToAdmin } from '#/server/professionals'
import { SectionSearch, Pager } from '#/components/admin-shared'

// =============================================================================
// /admin/usuarios — promote-to-admin
// =============================================================================
// Lifted verbatim from the old monolithic /admin/index.tsx UsersSection. Only
// structural change: the user rows are a 2-col grid on lg+ (matches the
// Profesionales list). No behavioral changes.
// =============================================================================

const PAGE_SIZE = 8

export const Route = createFileRoute('/admin/usuarios/')({
  component: UsersSection,
})

function UsersSection() {
  const qc = useQueryClient()
  const { data: adminUser } = useQuery({
    queryKey: ['me'],
    queryFn: () => getCurrentUser(),
  })
  const actorId = adminUser?.id
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
    onSuccess: (_d, userId) => {
      if (actorId) {
        track({
          event: 'admin_user_promote',
          category: 'admin',
          actorId,
          param1: userId,
        })
      }
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
    <section>
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
          ariaLabel="Buscar usuarios"
        />
      </div>
      {isLoading ? (
        <ul
          className="mt-3 grid grid-cols-1 gap-2 lg:grid-cols-2"
          aria-busy="true"
        >
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
        // ponytail: 2-col grid on lg+ to use the wide layout. Mobile stays
        // single-column.
        <ul className="mt-3 grid grid-cols-1 gap-2 lg:grid-cols-2">
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
