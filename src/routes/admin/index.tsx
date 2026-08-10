import { createFileRoute, Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import {
  Briefcase,
  Headphones,
  Tags,
  Users,
  BarChart3,
  ChevronRight,
  CheckCircle2,
  Clock,
} from 'lucide-react'
import {
  countVerifiedProfessionals,
  listAllProfessionals,
  listUsers,
} from '#/server/professionals'
import { listPendingStories } from '#/server/audio-stories'

// =============================================================================
// /admin — dashboard overview
// =============================================================================
// Lightweight landing for the admin branch. Surfaces "needs attention" counts
// (pending pros + pending audios) as a callout, a KPI strip, and tappable
// cards into each section. The section pages (/admin/profesionales, etc.) hold
// the actual work; this is the at-a-glance "what should I act on" view —
// mirrors the pro panel's "Atención" summary card (healthcare-ui Cat. 7).
//
// The chrome (header, sign-out, sticky sub-nav, <main> wrapper) lives in the
// parent layout route src/routes/admin.tsx.
// =============================================================================

export const Route = createFileRoute('/admin/')({
  // ponytail: guard + ssr + chrome all live in the parent layout route
  // (src/routes/admin.tsx). This child only declares its component.
  component: AdminDashboard,
})

function AdminDashboard() {
  // ponytail: parallel cheap counts for the KPI strip + "needs attention"
  // callout. Each is one round-trip; they fan out together.
  const { data: verifiedCount } = useQuery({
    queryKey: ['verified-count'],
    queryFn: () => countVerifiedProfessionals(),
  })
  const { data: pendingProsRes } = useQuery({
    queryKey: ['admin-professionals', '', 'pending', 1],
    queryFn: () =>
      listAllProfessionals({
        data: { q: undefined, status: 'pending', page: 1, pageSize: 1 },
      }),
  })
  const pendingPros = pendingProsRes?.total ?? 0
  const { data: pendingStories = [] } = useQuery({
    queryKey: ['pending-stories'],
    queryFn: () => listPendingStories(),
  })
  const pendingAudios = pendingStories.length
  const { data: usersRes } = useQuery({
    queryKey: ['admin-users', '', 1],
    queryFn: () =>
      listUsers({ data: { q: undefined, page: 1, pageSize: 1 } }),
  })
  const userCount = usersRes?.total ?? 0

  const needsAttention = pendingPros > 0 || pendingAudios > 0

  return (
    <>
      {/* ── Needs attention ── */}
      {/* ponytail: amber callout that deep-links into the queues. Hidden
          entirely when there's nothing pending (no "0 tareas" box). Mirrors
          the pro panel's empty-state-safe summary card. */}
      {needsAttention && (
        <section className="glass-card-soft mt-4 rounded-[var(--glass-radius-sm)] border-l-4 border-amber-500 bg-amber-50/60 p-4">
          <div className="flex items-center gap-2 text-amber-800">
            <Clock className="size-5 shrink-0" aria-hidden="true" />
            <h2 className="text-sm font-semibold">Necesita atención</h2>
          </div>
          <ul className="mt-2 flex flex-col gap-1.5 text-sm">
            {pendingPros > 0 && (
              <li>
                <Link
                  to="/admin/profesionales"
                  className="font-semibold text-amber-800 underline-offset-2 hover:underline"
                >
                  {pendingPros} {pendingPros === 1 ? 'profesional por revisar' : 'profesionales por revisar'}
                </Link>
              </li>
            )}
            {pendingAudios > 0 && (
              <li>
                <Link
                  to="/admin/audios"
                  className="font-semibold text-amber-800 underline-offset-2 hover:underline"
                >
                  {pendingAudios} {pendingAudios === 1 ? 'audio por revisar' : 'audios por revisar'}
                </Link>
              </li>
            )}
          </ul>
        </section>
      )}

      {/* ── KPI strip ── */}
      <section
        className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4"
        aria-label="Resumen"
      >
        <Kpi
          icon={Clock}
          label="Pendientes"
          value={pendingPros}
          tone="amber"
          to="/admin/profesionales"
        />
        <Kpi
          icon={CheckCircle2}
          label="Verificados"
          value={verifiedCount}
          tone="green"
          to="/admin/profesionales"
        />
        <Kpi
          icon={Headphones}
          label="Audios pend."
          value={pendingAudios}
          tone="amber"
          to="/admin/audios"
        />
        <Kpi
          icon={Users}
          label="Usuarios"
          value={userCount}
          tone="neutral"
          to="/admin/usuarios"
        />
      </section>

      {/* ── Section cards ── */}
      <nav
        className="mt-6 grid grid-cols-1 gap-3 md:grid-cols-2"
        aria-label="Secciones de administración"
      >
        <SectionCard
          to="/admin/profesionales"
          icon={Briefcase}
          title="Profesionales"
          subtitle="Revisa credenciales, aprueba, suspende o edita perfiles"
          meta={
            pendingPros > 0 ? (
              <span className="glass-pill shrink-0 bg-amber-100/80 px-2 py-0.5 text-xs font-semibold text-amber-800">
                {pendingPros}
              </span>
            ) : undefined
          }
        />
        <SectionCard
          to="/admin/audios"
          icon={Headphones}
          title="Audios de apoyo"
          subtitle="Aprobación de clips enviados a Voces que acompañan"
          meta={
            pendingAudios > 0 ? (
              <span className="glass-pill shrink-0 bg-amber-100/80 px-2 py-0.5 text-xs font-semibold text-amber-800">
                {pendingAudios}
              </span>
            ) : undefined
          }
        />
        <SectionCard
          to="/admin/categorias"
          icon={Tags}
          title="Categorías de audios"
          subtitle="Crea, edita y reordena las categorías de los audios"
        />
        <SectionCard
          to="/admin/usuarios"
          icon={Users}
          title="Usuarios"
          subtitle="Promueve cuentas de confianza a administrador"
        />
        <SectionCard
          to="/admin/analitica"
          icon={BarChart3}
          title="Analítica"
          subtitle="KPIs, embudos, retención y estado operativo de D1"
        />
      </nav>
    </>
  )
}

// ponytail: a KPI tile in the dashboard strip. tone drives the icon color
// (amber = action needed, green = healthy, neutral = informational). The whole
// tile is a link so a tap jumps straight into the relevant section.
function Kpi({
  icon: Icon,
  label,
  value,
  tone,
  to,
}: {
  icon: LucideIcon
  label: string
  value: number | undefined
  tone: 'amber' | 'green' | 'neutral'
  to: string
}) {
  const toneCls =
    tone === 'amber'
      ? 'text-amber-700'
      : tone === 'green'
        ? 'text-green-700'
        : 'text-[var(--medi-secondary)]'
  return (
    <Link
      to={to}
      className="glass-card flex flex-col gap-1 p-3 transition-all hover:translate-y-[-1px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--medi-secondary)]"
    >
      <Icon className={`size-5 ${toneCls}`} aria-hidden="true" />
      <span className="text-2xl font-bold text-[var(--medi-text-primary)]">
        {value ?? '—'}
      </span>
      <span className="text-xs font-medium text-[var(--medi-text-secondary)]">
        {label}
      </span>
    </Link>
  )
}

// ponytail: a descriptive link-card. Mirrors the pro panel's PanelCard
// (icon + title + subtitle + optional meta + chevron) so the admin branch
// reads as part of the same app.
function SectionCard({
  to,
  icon: Icon,
  title,
  subtitle,
  meta,
}: {
  to: string
  icon: LucideIcon
  title: string
  subtitle: string
  meta?: ReactNode
}) {
  return (
    <Link
      to={to}
      className="glass-card flex min-h-[4.5rem] items-center gap-3 p-4 text-left transition-all hover:translate-y-[-1px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--medi-secondary)]"
    >
      <Icon className="size-6 shrink-0 text-[var(--medi-secondary)]" aria-hidden="true" />
      <span className="min-w-0 flex-1">
        <span className="block text-base font-semibold text-[var(--medi-text-primary)]">
          {title}
        </span>
        <span className="block text-sm text-[var(--medi-text-secondary)]">
          {subtitle}
        </span>
      </span>
      {meta}
      <ChevronRight
        className="size-5 shrink-0 text-[var(--medi-text-secondary)]"
        aria-hidden="true"
      />
    </Link>
  )
}
