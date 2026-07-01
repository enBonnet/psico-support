import { Link, useMatchRoute } from '@tanstack/react-router'
import { Home, LifeBuoy, User } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

// ponytail: chromeless routes are auth/onboarding flows where nav is a
// distraction. Both bars mount globally in __root.tsx and hide themselves
// here, so adding/removing a flow needs no root wiring change.
const CHROMELESS = [
  '/signup',
  '/profesional/login',
  '/profesional/registro',
  '/profesional/completar',
]

function showTabs(pathname: string) {
  return !CHROMELESS.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  )
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

// ponytail: shared active-state resolution so the bottom bar and the top bar
// never disagree on which tab is current. Returns null on chromeless routes
// so both components short-circuit identically.
function useTabs(pathname: string) {
  const matchRoute = useMatchRoute()
  if (!showTabs(pathname)) return null
  return TABS.map((t) => ({
    ...t,
    active: !!matchRoute({ to: t.to, fuzzy: !t.exact }),
  }))
}

export function BottomTabs({ pathname }: { pathname: string }) {
  const tabs = useTabs(pathname)
  if (!tabs) return null
  return (
    <nav
      className="glass-bar bottom-tabs flex md:hidden"
      aria-label="Navegación principal"
    >
      {tabs.map((t) => {
        const Icon = t.icon
        return (
          <Link
            key={t.to}
            to={t.to}
            data-active={t.active}
            aria-current={t.active ? 'page' : undefined}
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

// ponytail: desktop fallback for the mobile bottom bar. Sticky glass pill at
// the top with brand + horizontal links. Shown only at md+ (hidden md:flex);
// the bottom bar is md:hidden, so the two never coexist. Same chromeless
// hide rule applies.
export function DesktopNav({ pathname }: { pathname: string }) {
  const tabs = useTabs(pathname)
  if (!tabs) return null
  return (
    <nav
      className="top-nav mx-auto hidden md:flex"
      aria-label="Navegación principal"
    >
      <Link
        to="/"
        className="flex items-center gap-2 text-base font-bold text-[var(--medi-primary)] no-underline hover:text-[var(--medi-primary)]"
      >
        <img src="/favicon.svg" alt="" width={24} height={24} aria-hidden="true" />
        PsicoAyudaVen
      </Link>
      <div className="flex items-center gap-1">
        {tabs.map((t) => (
          <Link
            key={t.to}
            to={t.to}
            aria-current={t.active ? 'page' : undefined}
            className={`nav-link px-3 py-2 text-sm font-medium ${t.active ? 'is-active' : ''}`}
          >
            {t.label}
          </Link>
        ))}
      </div>
    </nav>
  )
}
