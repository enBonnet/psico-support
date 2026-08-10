import {
  createFileRoute,
  redirect,
  Link,
  Outlet,
  useLocation,
  useMatchRoute,
} from '@tanstack/react-router'
import { useEffect } from 'react'
import type { LucideIcon } from 'lucide-react'
import {
  Briefcase,
  Headphones,
  Tags,
  Users,
  BarChart3,
  LayoutDashboard,
} from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { authClient } from '#/lib/auth-client'
import { track } from '#/lib/analytics-client'
import { amIAdmin, getCurrentUser } from '#/server/professionals'
import { noindexHead } from '#/lib/seo'

// =============================================================================
// /admin layout route
// =============================================================================
// Parent layout for the whole /admin branch. Owns the three things every admin
// route previously duplicated:
//   1. beforeLoad guard — getCurrentUser() + amIAdmin() (reads request headers
//      via AsyncLocalStorage, per gotcha #5/#9 — never authClient.getSession(),
//      which is cookieless under SSR).
//   2. ssr: false — the whole branch is CSR (no crawler value). Selective-SSR
//      rule (gotcha #6): a child can only be MORE restrictive than its parent,
//      so the parent's ssr: false cascades — no child can opt back into SSR.
//   3. Shared chrome — page header + sign-out + sticky sub-nav + <Outlet/>.
//
// Adding a new admin section = drop a file in src/routes/admin/<section>/ and
// add an entry to ADMIN_SECTIONS here. No other wiring.
// =============================================================================

export const Route = createFileRoute('/admin')({
  beforeLoad: async () => {
    // ponytail: guard consolidated from /admin/index.tsx,
    // /admin/profesionales/$id.tsx, and /admin/analitica.tsx. Runs once per
    // navigation into the /admin branch; children no longer re-check.
    const user = await getCurrentUser()
    if (!user) {
      throw redirect({ to: '/profesional/login' })
    }
    const admin = await amIAdmin()
    if (!admin) {
      throw redirect({ to: '/profesional/panel' })
    }
  },
  // ponytail: CSR-only for the whole branch — auth+admin-gated, no crawler
  // value. Children inherit (selective SSR rule).
  ssr: false,
  head: noindexHead,
  component: AdminLayout,
})

interface AdminSection {
  to: string
  label: string
  icon: LucideIcon
  // ponytail: fuzzy so /admin/profesionales/$id highlights "Profesionales".
  // The index '/' entry is exact so the dashboard isn't always active.
  fuzzy?: boolean
}

const ADMIN_SECTIONS: readonly AdminSection[] = [
  { to: '/admin', label: 'Resumen', icon: LayoutDashboard, fuzzy: false },
  { to: '/admin/profesionales', label: 'Profesionales', icon: Briefcase, fuzzy: true },
  { to: '/admin/audios', label: 'Audios', icon: Headphones, fuzzy: true },
  { to: '/admin/categorias', label: 'Categorías', icon: Tags, fuzzy: true },
  { to: '/admin/usuarios', label: 'Usuarios', icon: Users, fuzzy: true },
  { to: '/admin/analitica', label: 'Analítica', icon: BarChart3, fuzzy: false },
] as const

function AdminLayout() {
  const { data: adminUser } = useQuery({
    queryKey: ['me'],
    queryFn: () => getCurrentUser(),
  })
  const actorId = adminUser?.id
  const { pathname } = useLocation()

  // ponytail: fire admin_section_view on section change so we have real
  // visibility into which sections admins actually use. param1 = the section
  // path (stable, unlike a label which could be renamed). Fire-and-forget per
  // gotcha #10 — never awaited, never throws.
  useEffect(() => {
    if (!actorId) return
    track({
      event: 'admin_section_view',
      category: 'admin',
      actorId,
      route: pathname,
      param1: pathname,
    })
  }, [actorId, pathname])

  return (
    <main className="page-wrap page-wrap--wide flex min-h-[100dvh] flex-col py-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-[var(--medi-text-primary)]">
          Administración
        </h1>
        <button
          onClick={async () => {
            if (actorId) {
              track({
                event: 'auth_signout',
                category: 'auth',
                actorId,
              })
            }
            await authClient.signOut()
            window.location.href = '/'
          }}
          className="text-sm font-medium text-[var(--medi-secondary)]"
        >
          Salir
        </button>
      </div>
      <div className="section-underline mt-2" />

      <AdminSubNav />

      <div className="mt-4">
        {/* ponytail: children render here. Each child is a focused section
            (dashboard, list, form) without its own <main> wrapper or auth
            guard — those live here. */}
        <Outlet />
      </div>
    </main>
  )
}

// ponytail: sticky horizontal scrollable sub-nav. Mobile-first: on a phone the
// 6 sections don't all fit, so the bar scrolls horizontally with scroll-snap.
// `display` is NOT set on .admin-subnav (tw-v4 unlayered-beats-layered gotcha
// #2) — the component toggles flex here. The bar sticks to the top on mobile
// (no global top-nav there) and below .top-nav on lg (which is sticky at
// top:0.75rem ≈ bottom ~3.75rem). z-index:30 sits below .top-nav (40) and the
// bottom-tabs (40).
function AdminSubNav() {
  const matchRoute = useMatchRoute()
  return (
    <nav
      className="admin-subnav glass-card-soft mt-3 flex gap-1 overflow-x-auto rounded-[var(--glass-radius-sm)] p-1"
      aria-label="Secciones de administración"
      role="tablist"
    >
      {ADMIN_SECTIONS.map((s) => {
        // ponytail: fuzzy so /admin/profesionales/$id highlights
        // "Profesionales". The dashboard ('/') and analitica are exact so the
        // dashboard tab isn't always active on child routes.
        const fuzzy = s.fuzzy !== false
        const active = !!matchRoute({ to: s.to, fuzzy })
        const Icon = s.icon
        return (
          <Link
            key={s.to}
            to={s.to}
            role="tab"
            aria-selected={active}
            aria-current={active ? 'page' : undefined}
            data-active={active || undefined}
            className="admin-subnav-tab flex shrink-0 items-center gap-1.5 rounded-[var(--glass-radius-sm)] px-3 py-2 text-sm font-medium transition-all"
          >
            <Icon aria-hidden="true" className="size-4" />
            <span>{s.label}</span>
          </Link>
        )
      })}
    </nav>
  )
}
