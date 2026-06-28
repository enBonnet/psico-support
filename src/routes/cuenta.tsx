import { createFileRoute, Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { LifeBuoy, LogIn, LogOut, ShieldCheck, UserPlus } from 'lucide-react'
import { authClient } from '#/lib/auth-client'
import { APP_VERSION } from '#/lib/version'
import { Skeleton } from '#/components/ui/skeleton'
import {
  getMyProfessional,
  amIAdmin,
  getCurrentUser,
} from '#/server/professionals'

export const Route = createFileRoute('/cuenta')({ component: CuentaPage })

function CuentaPage() {
  const { data: me, isLoading: meLoading } = useQuery({
    queryKey: ['me'],
    queryFn: () => getCurrentUser(),
  })

  // ponytail: conditional fetches — only hit the server fns when there's a
  // session. amIAdmin/getMyProfessional no-op (return null/false) without
  // one, but this avoids the round-trip for anonymous visitors.
  const { data: pro } = useQuery({
    queryKey: ['my-professional'],
    queryFn: () => getMyProfessional(),
    enabled: !!me,
  })
  const { data: isAdmin } = useQuery({
    queryKey: ['my-admin'],
    queryFn: () => amIAdmin(),
    enabled: !!me,
  })

  async function signOut() {
    await authClient.signOut()
    window.location.href = '/'
  }

  return (
    <main className="page-wrap flex min-h-[100dvh] flex-col py-6">
      <h1 className="text-2xl font-bold text-[var(--medi-text-primary)]">
        Cuenta
      </h1>
      <div className="section-underline mt-2" />

      {!meLoading && !me && (
        <div className="mt-6 flex flex-col gap-4">
          <p className="text-sm text-[var(--medi-text-secondary)]">
            Inicia sesión para gestionar tu perfil profesional o tu
            disponibilidad.
          </p>
          <Link
            to="/profesional/login"
            className="glass-primary flex min-h-14 items-center justify-center gap-2 rounded-[var(--glass-radius-sm)] px-6 py-4 text-base font-semibold text-white transition-all hover:translate-y-[-1px]"
          >
            <LogIn className="size-5" /> Iniciar sesión
          </Link>
          <Link
            to="/signup"
            className="glass-card-soft flex min-h-14 items-center justify-center gap-2 rounded-[var(--glass-radius-sm)] px-6 py-4 text-base font-semibold text-[var(--medi-primary)] transition-all hover:translate-y-[-1px]"
          >
            <UserPlus className="size-5" /> Crear cuenta
          </Link>
        </div>
      )}

      {meLoading && (
        <div className="mt-6 flex flex-col gap-4" aria-busy="true">
          <div className="glass-card p-4">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="mt-2 h-4 w-56" />
          </div>
          <div className="glass-card flex items-center gap-3 p-4">
            <Skeleton className="size-6 shrink-0 rounded-full" />
            <div className="flex flex-col gap-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-44" />
            </div>
          </div>
        </div>
      )}

      {me && (
        <div className="mt-6 flex flex-col gap-4">
          <div className="glass-card p-4">
            <p className="truncate text-lg font-semibold text-[var(--medi-text-primary)]">
              {me.name}
            </p>
            <p className="truncate text-sm text-[var(--medi-text-secondary)]">
              {me.email}
            </p>
          </div>

          {/* ── Accesos según rol ── */}
          {pro && (
            <Link
              to="/profesional/panel"
              className="glass-card flex items-center gap-3 p-4 text-left transition-all hover:translate-y-[-1px]"
            >
              <LifeBuoy className="size-6 shrink-0 text-[var(--medi-secondary)]" />
              <span>
                <span className="block text-base font-semibold text-[var(--medi-text-primary)]">
                  Mi panel
                </span>
                <span className="block text-sm text-[var(--medi-text-secondary)]">
                  {pro.verifiedStatus === 'verified'
                    ? 'Gestionar disponibilidad'
                    : 'Ver estado de verificación'}
                </span>
              </span>
            </Link>
          )}

          {!pro && (
            <Link
              to="/profesional/completar"
              className="glass-card flex items-center gap-3 p-4 text-left transition-all hover:translate-y-[-1px]"
            >
              <LifeBuoy className="size-6 shrink-0 text-[var(--medi-secondary)]" />
              <span>
                <span className="block text-base font-semibold text-[var(--medi-text-primary)]">
                  Completar perfil profesional
                </span>
                <span className="block text-sm text-[var(--medi-text-secondary)]">
                  Si ofreces ayuda como psicólogo
                </span>
              </span>
            </Link>
          )}

          {isAdmin && (
            <Link
              to="/admin"
              className="glass-card flex items-center gap-3 p-4 text-left transition-all hover:translate-y-[-1px]"
            >
              <ShieldCheck className="size-6 shrink-0 text-[var(--medi-secondary)]" />
              <span>
                <span className="block text-base font-semibold text-[var(--medi-text-primary)]">
                  Administración
                </span>
                <span className="block text-sm text-[var(--medi-text-secondary)]">
                  Validaciones y usuarios
                </span>
              </span>
            </Link>
          )}

          <button
            type="button"
            onClick={signOut}
            className="glass-card-soft mt-2 flex min-h-12 items-center justify-center gap-2 rounded-[var(--glass-radius-sm)] px-4 py-3 text-base font-semibold text-[var(--medi-secondary)] transition-all hover:translate-y-[-1px]"
          >
            <LogOut className="size-5" /> Cerrar sesión
          </button>
        </div>
      )}

      <p className="mt-8 text-center text-xs text-[var(--medi-text-secondary)]">
        v{APP_VERSION}
      </p>
    </main>
  )
}
