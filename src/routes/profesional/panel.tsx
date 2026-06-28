import { createFileRoute, redirect, Link } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { authClient } from '#/lib/auth-client'
import { notify } from '#/lib/notifications'
import {
  getMyProfessional,
  setAvailability,
  amIAdmin,
  getCurrentUser,
} from '#/server/professionals'

export const Route = createFileRoute('/profesional/panel')({
  beforeLoad: async () => {
    const user = await getCurrentUser()
    if (!user) {
      throw redirect({ to: '/profesional/login' })
    }
  },
  component: PanelPage,
})

function PanelPage() {
  const qc = useQueryClient()
  const { data: me } = useQuery({
    queryKey: ['my-professional'],
    queryFn: () => getMyProfessional(),
  })
  const { data: isAdmin } = useQuery({
    queryKey: ['my-admin'],
    queryFn: () => amIAdmin(),
  })

  const toggle = useMutation({
    mutationFn: (available: boolean) =>
      setAvailability({ data: { available } }),
    onMutate: (available) => {
      qc.setQueryData(['my-professional'], (old: typeof me | undefined) =>
        old ? { ...old, available } : old,
      )
    },
    onSuccess: (_data, available) => {
      qc.setQueryData(['my-professional'], (old: typeof me | undefined) =>
        old ? { ...old, available } : old,
      )
      notify({
        type: 'success',
        title: available
          ? 'Ahora estás visible para pacientes'
          : 'Pasaste a fuera de turno',
        body: available
          ? 'Los pacientes pueden contactarte de inmediato.'
          : 'Ya no apareces en la lista.',
      })
    },
    onError: () =>
      notify({
        type: 'error',
        title: 'No se pudo cambiar tu disponibilidad',
        body: 'Inténtalo de nuevo en unos segundos.',
      }),
  })

  const available = me?.available ?? false
  const verified = me?.verifiedStatus === 'verified'

  return (
    <main className="page-wrap flex min-h-[100dvh] flex-col py-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-[var(--medi-text-primary)]">
          Mi Panel
        </h1>
        <div className="flex items-center gap-3">
          {isAdmin && (
            <Link
              to="/admin"
              className="text-sm font-semibold text-[var(--medi-secondary)]"
            >
              Admin
            </Link>
          )}
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
      </div>
      <div className="section-underline mt-2" />
      {!me && (
        <p className="glass-card-soft mt-6 rounded-[var(--glass-radius-sm)] p-4 text-sm text-[var(--medi-text-secondary)]">
          No tienes un registro profesional todavía.{' '}
          <Link
            to="/profesional/registro"
            className="font-semibold text-[var(--medi-secondary)]"
          >
            Regístrate aquí.
          </Link>
        </p>
      )}

      {me && (
        <>
          <p className="mt-4 text-sm">
            <span className="font-semibold">{me.name}</span> ·{' '}
            <span className="text-[var(--medi-text-secondary)]">
              {me.modality === 'in_person'
                ? 'Presencial'
                : me.modality === 'remote'
                  ? 'A distancia'
                  : 'Presencial y a distancia'}
            </span>
          </p>
          <p className="mt-2 text-sm">
            Estado de verificación:{' '}
            {me.verifiedStatus === 'verified' ? (
              <span className="font-semibold text-green-700">Verificado</span>
            ) : me.verifiedStatus === 'pending' ? (
              <span className="font-semibold text-amber-700">En revisión</span>
            ) : (
              <span className="font-semibold text-red-700">Rechazado</span>
            )}
          </p>

          {!verified && (
            <p className="glass-card-soft mt-4 rounded-[var(--glass-radius-sm)] bg-amber-50/60 px-3 py-2 text-sm text-amber-800">
              Tu credencial está en revisión. El interruptor se activará cuando
              un administrador apruebe tu registro.
            </p>
          )}

          <div
            className={`glass-card mt-10 p-8 text-center transition-colors ${
              available
                ? 'bg-green-600/30 text-green-900'
                : 'text-[var(--medi-text-secondary)]'
            }`}
          >
            <p className="text-lg font-semibold">
              {available ? 'Estás Visible para Pacientes' : 'Fuera de Turno'}
            </p>
            <button
              type="button"
              disabled={!verified || toggle.isPending}
              onClick={() => toggle.mutate(!available)}
              className="glass-pill mt-6 inline-flex h-16 w-32 items-center justify-center rounded-full bg-white/90 text-base font-bold text-[var(--medi-primary)] transition-all hover:translate-y-[-1px] disabled:opacity-50"
              aria-pressed={available}
            >
              {available ? 'ON' : 'OFF'}
            </button>
            <p className="mt-4 text-sm opacity-90">
              {available
                ? 'Los pacientes pueden contactarte ahora.'
                : 'Nadie te verá en la lista.'}
            </p>
          </div>
        </>
      )}
      <footer className="mt-auto pt-10 text-center text-xs text-[var(--medi-text-secondary)]">
        <Link to="/" className="underline">
          Volver al inicio
        </Link>
      </footer>
    </main>
  )
}
