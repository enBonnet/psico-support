import { createFileRoute, redirect, Link } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { authClient } from '#/lib/auth-client'
import { notify } from '#/lib/notifications'
import {
  listPending,
  reviewProfessional,
  amIAdmin,
  getCurrentUser,
  listUsers,
  promoteToAdmin,
} from '#/server/professionals'

export const Route = createFileRoute('/admin/')({
  beforeLoad: async () => {
    // ponytail: use a server fn (reads request headers via __TSS_REQUEST__)
    // instead of authClient.getSession() — the client call does a cookieless
    // fetch during SSR, which always returned null and bounced to login.
    const user = await getCurrentUser()
    if (!user) {
      throw redirect({ to: '/profesional/login' })
    }
    const admin = await amIAdmin()
    if (!admin) {
      throw redirect({ to: '/profesional/panel' })
    }
  },
  component: AdminPage,
})

function AdminPage() {
  const qc = useQueryClient()
  const { data: pending = [] } = useQuery({
    queryKey: ['pending-professionals'],
    queryFn: () => listPending(),
  })

  const decide = useMutation({
    mutationFn: (vars: {
      professionalId: number
      status: 'verified' | 'rejected'
    }) => reviewProfessional({ data: vars }),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['pending-professionals'] })
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
    onError: () =>
      notify({
        type: 'error',
        title: 'No se pudo actualizar el estado',
        body: 'Inténtalo de nuevo.',
      }),
  })

  const { data: users = [] } = useQuery({
    queryKey: ['admin-users'],
    queryFn: () => listUsers(),
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

  return (
    <main className="page-wrap flex min-h-[100dvh] flex-col py-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-[var(--medi-text-primary)]">
          Validaciones Pendientes
        </h1>
        <button
          onClick={async () => {
            await authClient.signOut()
            window.location.href = '/profesional/login'
          }}
          className="text-sm font-medium text-[var(--medi-secondary)]"
        >
          Salir
        </button>
      </div>
      <div className="section-underline mt-2" />

      {pending.length === 0 ? (
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

      {/* ── Usuarios ── */}
      <h2 className="mt-10 border-b border-[var(--medi-border)] pb-1 text-sm font-semibold uppercase tracking-wide text-[var(--medi-text-secondary)]">
        Usuarios
      </h2>
      <p className="mt-2 text-sm text-[var(--medi-text-secondary)]">
        Promueve una cuenta a administrador. Solo para cuentas de confianza.
      </p>
      <ul className="mt-3 flex flex-col gap-2 pb-6">
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

      <footer className="mt-auto pt-6 text-center text-xs text-[var(--medi-text-secondary)]">
        <Link to="/" className="underline">
          Volver al inicio
        </Link>
      </footer>
    </main>
  )
}
