import { Link, useMatchRoute } from '@tanstack/react-router'
import { Home, LifeBuoy, User } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

// ponytail: chromeless routes are auth/onboarding flows where a tab bar is a
// distraction. The bar mounts globally in __root.tsx and hides itself here,
// so adding/removing a flow needs no root wiring change.
const CHROMELESS = [
  '/signup',
  '/profesional/login',
  '/profesional/registro',
  '/profesional/completar',
]

function useShowTabs(pathname: string) {
  return !CHROMELESS.some((p) => pathname === p || pathname.startsWith(`${p}/`))
}

interface TabDef {
  to: string
  label: string
  icon: LucideIcon
  // ponytail: index '/' must match exactly, otherwise /ayuda would also
  // highlight Inicio (no nested-tab relationship). Others match by prefix.
  exact?: boolean
}

const TABS: readonly TabDef[] = [
  { to: '/', label: 'Inicio', icon: Home, exact: true },
  { to: '/ayuda', label: 'Ayuda', icon: LifeBuoy },
  { to: '/cuenta', label: 'Cuenta', icon: User },
] as const

export function BottomTabs({ pathname }: { pathname: string }) {
  const matchRoute = useMatchRoute()
  if (!useShowTabs(pathname)) return null

  return (
    <nav className="glass-bar bottom-tabs" aria-label="Navegación principal">
      {TABS.map((t) => {
        const active = !!matchRoute({
          to: t.to,
          fuzzy: !t.exact,
        })
        const Icon = t.icon
        return (
          <Link
            key={t.to}
            to={t.to}
            data-active={active}
            aria-current={active ? 'page' : undefined}
            className="bottom-tab"
          >
            <Icon aria-hidden="true" />
            <span>{t.label}</span>
          </Link>
        )
      })}
    </nav>
  )
}
