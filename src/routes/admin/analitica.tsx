import { createFileRoute, Link, redirect } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { ArrowLeft, RefreshCw } from 'lucide-react'

import { amIAdmin, getCurrentUser } from '#/server/professionals'
import { runAnalyticsQuery } from '#/server/analytics-read'
import type { AnalyticsQueryResult } from '#/server/analytics-read'
import { getMetricsSummary } from '#/server/metrics'
import type { MetricsSummary } from '#/server/metrics'
import {
  BarList,
  ChartCard,
  Donut,
  ExportCsvButton,
  FunnelChart,
  KpiCard,
  LineTrend,
  exportCsv,
} from '#/components/charts'
import { Skeleton } from '#/components/ui/skeleton'
import { notify } from '#/lib/notifications'
import { TRACKED_EVENTS  } from '#/server/analytics'
import type {TrackedEvent} from '#/server/analytics';
import type { QueryId } from '#/server/analytics-queries';

// =============================================================================
// /admin/analitica — in-app analytics dashboard
// =============================================================================
// Hybrid counterpart to scripts/analytics-dashboard.ts. Pulls both Analytics
// Engine data (admin-gated SQL-API proxy with a 60s cache — see
// src/server/analytics-read.ts) and D1 ops metrics (src/server/metrics.ts) so
// the admin sees a unified ops + product view in one screen.
//
// CSR (ssr: false) — same selective-SSR pattern as the rest of /admin (no SEO
// value, requires a session). The beforeLoad guard mirrors /admin: amIAdmin
// or bounce to login/panel.
//
// Every Analytics-Engine query the route uses has its own useQuery so they
// fan out in parallel and each card shows its own loading/error state without
// blocking the others. The days window is route-level state (default 7d, with
// 1/7/30/90 presets).
// =============================================================================

export const Route = createFileRoute('/admin/analitica')({
  beforeLoad: async () => {
    // ponytail: same pattern as /admin — server fns read the request via
    // AsyncLocalStorage, so cookies flow on the real browser fetch under CSR.
    const user = await getCurrentUser()
    if (!user) throw redirect({ to: '/profesional/login' })
    const admin = await amIAdmin()
    if (!admin) throw redirect({ to: '/profesional/panel' })
  },
  ssr: false,
  component: AnalyticsPage,
})

const PRESETS: { label: string; days: number }[] = [
  { label: '24h', days: 1 },
  { label: '7d', days: 7 },
  { label: '30d', days: 30 },
  { label: '90d', days: 90 },
]

function AnalyticsPage() {
  const [days, setDays] = useState(7)

  return (
    <main className="page-wrap page-wrap--wide flex min-h-[100dvh] flex-col py-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link
            to="/admin"
            aria-label="Volver a administración"
            className="glass-card-soft flex size-9 items-center justify-center rounded-[var(--glass-radius-sm)] text-[var(--medi-primary)] transition-all hover:translate-y-[-1px]"
          >
            <ArrowLeft className="size-4" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-[var(--medi-text-primary)]">
              Analítica
            </h1>
            <p className="text-xs text-[var(--medi-text-secondary)]">
              Cloudflare Analytics Engine (dataset{' '}
              <code className="font-mono">psico_events</code>) + D1 ops
            </p>
          </div>
        </div>
        <PresetSelector days={days} onDaysChange={setDays} />
      </header>
      <div className="section-underline mt-2" />

      <NotConfiguredBanner days={days} />

      <KpiStrip days={days} />
      <FunnelSection days={days} />
      <EngagementSection days={days} />
      <CatalogSection days={days} />
      <RetentionSection days={days} />
      <D1Section />
    </main>
  )
}

// ── Preset selector + refresh ───────────────────────────────────────────────

function PresetSelector({
  days,
  onDaysChange,
}: {
  days: number
  onDaysChange: (d: number) => void
}) {
  return (
    <div className="flex items-center gap-2">
      <div
        className="glass-card-soft flex items-center gap-1 rounded-[var(--glass-radius-pill)] p-1"
        role="tablist"
        aria-label="Ventana de tiempo"
      >
        {PRESETS.map((p) => {
          const active = p.days === days
          return (
            <button
              key={p.days}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onDaysChange(p.days)}
              className={
                'rounded-[var(--glass-radius-pill)] px-3 py-1.5 text-xs font-semibold transition-all ' +
                (active
                  ? 'bg-[var(--medi-secondary)] text-white shadow'
                  : 'text-[var(--medi-text-secondary)] hover:text-[var(--medi-primary)]')
              }
            >
              {p.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ── Not-configured banner ───────────────────────────────────────────────────

function NotConfiguredBanner({ days }: { days: number }) {
  // The warning comes back from each analytics query; we surface it once at
  // the top if the most recent query returned one. Using the top-events query
  // as a canary since the KPI strip always loads it — and now keyed on the
  // same `days` so it shares the cache entry instead of firing a wasted 7d
  // request whenever the user picks a different preset.
  const { data } = useQuery({
    queryKey: ['analytics', 'top-events', days],
    queryFn: () =>
      runAnalyticsQuery({ data: { id: 'top-events', days } }),
  })
  if (!data?.warning) return null
  return (
    <div className="glass-card mt-4 border-l-4 border-amber-500 bg-amber-50 p-4 text-sm text-amber-900">
      <strong className="font-semibold">Analítica no configurada.</strong>{' '}
      {data.warning}
    </div>
  )
}

// ── KPI strip ───────────────────────────────────────────────────────────────

function useTopEvents(days: number) {
  return useQuery({
    queryKey: ['analytics', 'top-events', days],
    queryFn: () =>
      runAnalyticsQuery({ data: { id: 'top-events', days } }),
  })
}

function usePrevPeriodTopEvents(days: number) {
  // Period-over-period delta: fetch the same `top-events` shape for the
  // immediately prior window (e.g. if main is 7d, this is the 7d before
  // that). The `top-events-prev` query in the catalog uses a BETWEEN
  // timestamp predicate to pin that prior window — the runAnalyticsQuery
  // cache is keyed on (queryId, days), so this is a distinct cache entry
  // from the rolling-window `top-events`.
  return useQuery({
    queryKey: ['analytics', 'top-events-prev', days],
    queryFn: () => runAnalyticsQuery({ data: { id: 'top-events-prev', days } }),
    // Don't refetch on every focus — prior period is just for delta context.
    staleTime: 5 * 60_000,
  })
}

function pickEventTotal(
  res: AnalyticsQueryResult | undefined,
  eventName: string,
): number {
  if (!res?.rows) return 0
  return res.rows.reduce((sum, r) => {
    const ev = String(r.event ?? '')
    return ev === eventName ? sum + (Number(r.total) || 0) : sum
  }, 0)
}

function deltaPct(curr: number, prev: number): number | undefined {
  if (!prev) return undefined
  return ((curr - prev) / prev) * 100
}

function KpiStrip({ days }: { days: number }) {
  const curr = useTopEvents(days)
  const prev = usePrevPeriodTopEvents(days)

  const contacts =
    pickEventTotal(curr.data, 'pro_contact') +
    pickEventTotal(curr.data, 'pro_contact_random') +
    pickEventTotal(curr.data, 'pro_contact_help_now') +
    pickEventTotal(curr.data, 'pro_contact_ahora')
  const prevContacts =
    pickEventTotal(prev.data, 'pro_contact') +
    pickEventTotal(prev.data, 'pro_contact_random') +
    pickEventTotal(prev.data, 'pro_contact_help_now') +
    pickEventTotal(prev.data, 'pro_contact_ahora')
  const directoryView = pickEventTotal(curr.data, 'directory_view')
  const prevDirectoryView = pickEventTotal(prev.data, 'directory_view')
  const profileView = pickEventTotal(curr.data, 'profile_view')
  const prevProfileView = pickEventTotal(prev.data, 'profile_view')
  const landingView = pickEventTotal(curr.data, 'landing_view')
  const prevLandingView = pickEventTotal(prev.data, 'landing_view')

  return (
    <section className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
      <KpiCard
        label="Contactos WhatsApp"
        value={contacts.toLocaleString('es-VE')}
        hint="pro_contact* (4 entry points)"
        deltaPct={deltaPct(contacts, prevContacts)}
      />
      <KpiCard
        label="Vistas directorio"
        value={directoryView.toLocaleString('es-VE')}
        hint="directory_view"
        deltaPct={deltaPct(directoryView, prevDirectoryView)}
      />
      <KpiCard
        label="Vistas perfil"
        value={profileView.toLocaleString('es-VE')}
        hint="profile_view"
        deltaPct={deltaPct(profileView, prevProfileView)}
      />
      <KpiCard
        label="Vistas landing"
        value={landingView.toLocaleString('es-VE')}
        hint="landing_view"
        deltaPct={deltaPct(landingView, prevLandingView)}
      />
    </section>
  )
}

// ── Generic Analytics query card ────────────────────────────────────────────

function useAnalyticsQuery(
  id: QueryId,
  days: number,
  opts?: { event?: TrackedEvent; eventB?: TrackedEvent },
) {
  return useQuery({
    queryKey: ['analytics', id, days, opts?.event, opts?.eventB],
    queryFn: () =>
      runAnalyticsQuery({
        data: {
          id,
          days,
          event: opts?.event,
          eventB: opts?.eventB,
        },
      }),
  })
}

function QueryError({ message }: { message?: string }) {
  return (
    <div className="rounded-md border-l-4 border-red-500 bg-red-50 p-3 text-sm text-red-800">
      {message ?? 'Error al cargar la consulta.'}
    </div>
  )
}

// ── Funnel section ──────────────────────────────────────────────────────────

function FunnelSection({ days }: { days: number }) {
  const funnel = useAnalyticsQuery('funnel-steps', days)
  const helpNow = useAnalyticsQuery('help-now-funnel', days)
  const ahora = useAnalyticsQuery('ahora-funnel', days)
  const proSignup = useAnalyticsQuery('pro-signup-funnel', days)

  return (
    <section className="mt-6">
      <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--medi-text-secondary)]">
        Embudos
      </h3>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartCard
          title="Embudo help-seeker"
          description="Landing → CTA → directorio → perfil → contacto"
          action={
            <ExportCsvButton
              disabled={!funnel.data?.rows.length}
              onClick={() =>
                funnel.data &&
                exportCsv(
                  `embudo-help-seeker-${days}d`,
                  funnel.data.columns,
                  funnel.data.rows,
                )
              }
            />
          }
        >
          {funnel.isLoading ? (
            <Skeleton className="h-40 w-full" />
          ) : funnel.isError ? (
            <QueryError message={String(funnel.error.message)} />
          ) : (
            <FunnelChart
              steps={(funnel.data?.rows ?? []).map((r) => ({
                step: String(r.step ?? ''),
                event: String(r.event ?? ''),
                total: Number(r.total ?? 0),
                pct_of_prev: Number(r.pct_of_prev),
                pct_of_first: Number(r.pct_of_first),
              }))}
            />
          )}
        </ChartCard>

        <ChartCard
          title="Funnel /ahora"
          description="Auto-conexión directa (/ahora → WhatsApp)"
          action={
            <ExportCsvButton
              disabled={!ahora.data?.rows.length}
              onClick={() =>
                ahora.data &&
                exportCsv(
                  `funnel-ahora-${days}d`,
                  ahora.data.columns,
                  ahora.data.rows,
                )
              }
            />
          }
        >
          {ahora.isLoading ? (
            <Skeleton className="h-40 w-full" />
          ) : ahora.isError ? (
            <QueryError message={String(ahora.error.message)} />
          ) : (
            <FunnelChart
              steps={(ahora.data?.rows ?? []).map((r) => ({
                step: String(r.step ?? ''),
                event: String(r.event ?? ''),
                total: Number(r.total ?? 0),
              }))}
            />
          )}
        </ChartCard>

        <ChartCard
          title="Funnel «Necesito ayuda ahora»"
          description="Landing CTA → (sin disponibles | WhatsApp abierto)"
          action={
            <ExportCsvButton
              disabled={!helpNow.data?.rows.length}
              onClick={() =>
                helpNow.data &&
                exportCsv(
                  `funnel-help-now-${days}d`,
                  helpNow.data.columns,
                  helpNow.data.rows,
                )
              }
            />
          }
        >
          {helpNow.isLoading ? (
            <Skeleton className="h-40 w-full" />
          ) : helpNow.isError ? (
            <QueryError message={String(helpNow.error.message)} />
          ) : (
            <FunnelChart
              steps={(helpNow.data?.rows ?? []).map((r) => ({
                step: String(r.step ?? ''),
                event: String(r.event ?? ''),
                total: Number(r.total ?? 0),
              }))}
            />
          )}
        </ChartCard>

        <ChartCard
          title="Embudo de registro profesional"
          description="Vista → continúa → acepta términos → submit → signup"
          action={
            <ExportCsvButton
              disabled={!proSignup.data?.rows.length}
              onClick={() =>
                proSignup.data &&
                exportCsv(
                  `funnel-pro-signup-${days}d`,
                  proSignup.data.columns,
                  proSignup.data.rows,
                )
              }
            />
          }
        >
          {proSignup.isLoading ? (
            <Skeleton className="h-40 w-full" />
          ) : proSignup.isError ? (
            <QueryError message={String(proSignup.error.message)} />
          ) : (
            <FunnelChart
              steps={(proSignup.data?.rows ?? []).map((r) => ({
                step: String(r.step ?? ''),
                event: String(r.event ?? ''),
                total: Number(r.total ?? 0),
              }))}
            />
          )}
        </ChartCard>
      </div>
    </section>
  )
}

// ── Engagement section ──────────────────────────────────────────────────────

function EngagementSection({ days }: { days: number }) {
  const [trendEvent, setTrendEvent] = useState<TrackedEvent>('pro_contact')
  const trend = useAnalyticsQuery('trends', days, { event: trendEvent })

  const byPro = useAnalyticsQuery('whatsapp-by-pro', days)
  const profileViews = useAnalyticsQuery('profile-views-by-pro', days)
  const sources = useAnalyticsQuery('sources', days)
  const audioEng = useAnalyticsQuery('audio-engagement', days)
  const selfcare = useAnalyticsQuery('selfcare-engagement', days)
  const pwa = useAnalyticsQuery('pwa-funnel', days)

  return (
    <section className="mt-6">
      <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--medi-text-secondary)]">
        Engagement
      </h3>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartCard
          title="Tendencia diaria"
          description={`Eventos por día — ${trendEvent}`}
          action={
            <label className="flex items-center gap-1 text-[11px] text-[var(--medi-text-secondary)]">
              Evento
              <select
                value={trendEvent}
                onChange={(e) => setTrendEvent(e.target.value as TrackedEvent)}
                className="rounded-md border border-[var(--medi-border)] bg-white/70 px-2 py-1 text-xs text-[var(--medi-text-primary)]"
              >
                {TREND_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </label>
          }
        >
          {trend.isLoading ? (
            <Skeleton className="h-40 w-full" />
          ) : trend.isError ? (
            <QueryError message={String(trend.error.message)} />
          ) : (
            <LineTrend
              data={trend.data?.rows ?? []}
              series="count"
            />
          )}
        </ChartCard>

        <ChartCard
          title="Origen del contacto"
          description="WhatsApp: ¿desde directorio o perfil?"
        >
          {sources.isLoading ? (
            <Skeleton className="h-40 w-full" />
          ) : sources.isError ? (
            <QueryError message={String(sources.error.message)} />
          ) : (
            <Donut
              data={(sources.data?.rows ?? []).map((r) => ({
                label: String(r.source ?? 'desconocido'),
                value: Number(r.clicks ?? 0),
              }))}
            />
          )}
        </ChartCard>

        <ChartCard
          title="WhatsApp por profesional"
          description="Top 20 profesionales por clicks (proId · userId · source)"
          action={
            <ExportCsvButton
              disabled={!byPro.data?.rows.length}
              onClick={() =>
                byPro.data &&
                exportCsv(
                  `whatsapp-por-pro-${days}d`,
                  byPro.data.columns,
                  byPro.data.rows,
                )
              }
            />
          }
        >
          {byPro.isLoading ? (
            <Skeleton className="h-40 w-full" />
          ) : byPro.isError ? (
            <QueryError message={String(byPro.error.message)} />
          ) : (
            <ProTable rows={byPro.data?.rows ?? []} />
          )}
        </ChartCard>

        <ChartCard
          title="Vistas de perfil por profesional"
          description="Top 15 profesionales por vistas de perfil"
        >
          {profileViews.isLoading ? (
            <Skeleton className="h-40 w-full" />
          ) : profileViews.isError ? (
            <QueryError message={String(profileViews.error.message)} />
          ) : (
            <BarList
              data={(profileViews.data?.rows ?? []).map((r) => ({
                label: `#${r.pro_id ?? '?'}`,
                value: Number(r.views ?? 0),
              }))}
            />
          )}
        </ChartCard>

        <ChartCard
          title="Engagement de audios"
          description="Voces que acompañan — reproducciones, atribución, cierre"
        >
          {audioEng.isLoading ? (
            <Skeleton className="h-40 w-full" />
          ) : audioEng.isError ? (
            <QueryError message={String(audioEng.error.message)} />
          ) : (
            <BarList
              data={(audioEng.data?.rows ?? []).map((r) => ({
                label: String(r.event ?? ''),
                value: Number(r.total ?? 0),
              }))}
            />
          )}
        </ChartCard>

        <ChartCard
          title="Uso de autocuidado"
          description="Inicio y finalización de herramientas"
        >
          {selfcare.isLoading ? (
            <Skeleton className="h-40 w-full" />
          ) : selfcare.isError ? (
            <QueryError message={String(selfcare.error.message)} />
          ) : (
            <BarList
              data={(selfcare.data?.rows ?? []).map((r) => ({
                label: String(r.event ?? ''),
                value: Number(r.total ?? 0),
              }))}
            />
          )}
        </ChartCard>

        <ChartCard
          title="Funnel PWA / instalación"
          description="install_prompt_trigger → dismiss | app_installed"
        >
          {pwa.isLoading ? (
            <Skeleton className="h-40 w-full" />
          ) : pwa.isError ? (
            <QueryError message={String(pwa.error.message)} />
          ) : (
            <BarList
              data={(pwa.data?.rows ?? []).map((r) => ({
                label: String(r.event ?? ''),
                value: Number(r.total ?? 0),
              }))}
            />
          )}
        </ChartCard>
      </div>
    </section>
  )
}

// Trend event picker derives from the full TRACKED_EVENTS catalog so any new
// event is automatically chartable. Defaults to pro_contact (highest-signal
// event for a daily "how's it going" glance).
const TREND_OPTIONS: readonly TrackedEvent[] = TRACKED_EVENTS

function ProTable({ rows }: { rows: Record<string, unknown>[] }) {
  if (!rows.length) {
    return (
      <div className="text-sm text-[var(--medi-text-secondary)]">
        (sin datos)
      </div>
    )
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-left text-[var(--medi-text-secondary)]">
            <th className="py-1 pr-2">pro_id</th>
            <th className="py-1 pr-2">user_id</th>
            <th className="py-1 pr-2">origen</th>
            <th className="py-1 text-right">clicks</th>
          </tr>
        </thead>
        <tbody className="font-mono">
          {rows.map((r, i) => (
            <tr key={`${r.pro_id ?? i}-${i}`} className="border-t border-black/5">
              <td className="py-1 pr-2">{String(r.pro_id ?? '')}</td>
              <td className="py-1 pr-2 truncate text-[var(--medi-text-secondary)]">
                {String(r.user_id ?? '')}
              </td>
              <td className="py-1 pr-2">{String(r.source ?? '')}</td>
              <td className="py-1 text-right font-semibold tabular-nums">
                {Number(r.clicks ?? 0).toLocaleString('es-VE')}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── Catalog coverage section ───────────────────────────────────────────────
//
// Dedicated surfaces for the events that don't fit into the funnels or the
// engagement strip. Every event in TRACKED_EVENTS now has at least one card
// it shows up in (the rest are covered by funnels + KPIs). This section
// exists so an admin doesn't have to scroll the top-events table to find,
// e.g. 'pro_avatar_upload' or 'password_reset_request'.

function CatalogSection({ days }: { days: number }) {
  const panel = useAnalyticsQuery('panel-engagement', days)
  const directory = useAnalyticsQuery('directory-behavior', days)
  const profile = useAnalyticsQuery('profile-engagement', days)
  const auth = useAnalyticsQuery('auth-events', days)
  const adminAct = useAnalyticsQuery('admin-activity', days)

  return (
    <section className="mt-6">
      <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--medi-text-secondary)]">
        Catálogo completo
      </h3>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartCard
          title="Engagement del panel profesional"
          description="Perfil, disponibilidad, audios, baja — cómo usan su panel los pros"
        >
          {panel.isLoading ? (
            <Skeleton className="h-40 w-full" />
          ) : panel.isError ? (
            <QueryError message={String(panel.error.message)} />
          ) : (
            <BarList
              data={(panel.data?.rows ?? []).map((r) => ({
                label: String(r.event ?? ''),
                value: Number(r.total ?? 0),
              }))}
            />
          )}
        </ChartCard>

        <ChartCard
          title="Comportamiento en el directorio"
          description="Modalidad, búsquedas, filtros limpiados, paginación, vanities"
        >
          {directory.isLoading ? (
            <Skeleton className="h-40 w-full" />
          ) : directory.isError ? (
            <QueryError message={String(directory.error.message)} />
          ) : (
            <BarList
              data={(directory.data?.rows ?? []).map((r) => ({
                label: String(r.event ?? ''),
                value: Number(r.total ?? 0),
              }))}
            />
          )}
        </ChartCard>

        <ChartCard
          title="Engagement con perfiles"
          description="Shares, redes sociales del pro, CTA profesional"
        >
          {profile.isLoading ? (
            <Skeleton className="h-40 w-full" />
          ) : profile.isError ? (
            <QueryError message={String(profile.error.message)} />
          ) : (
            <BarList
              data={(profile.data?.rows ?? []).map((r) => ({
                label: String(r.event ?? ''),
                value: Number(r.total ?? 0),
              }))}
            />
          )}
        </ChartCard>

        <ChartCard
          title="Eventos de autenticación"
          description="Sign-in, sign-out y resets (signup va en el funnel de registro)"
        >
          {auth.isLoading ? (
            <Skeleton className="h-40 w-full" />
          ) : auth.isError ? (
            <QueryError message={String(auth.error.message)} />
          ) : (
            <BarList
              data={(auth.data?.rows ?? []).map((r) => ({
                label: String(r.event ?? ''),
                value: Number(r.total ?? 0),
              }))}
            />
          )}
        </ChartCard>

        <ChartCard
          title="Actividad de administración"
          description="Revisión de pros, toggle servicio, revisión de audios, promociones"
        >
          {adminAct.isLoading ? (
            <Skeleton className="h-40 w-full" />
          ) : adminAct.isError ? (
            <QueryError message={String(adminAct.error.message)} />
          ) : (
            <BarList
              data={(adminAct.data?.rows ?? []).map((r) => ({
                label: String(r.event ?? ''),
                value: Number(r.total ?? 0),
              }))}
            />
          )}
        </ChartCard>
      </div>
    </section>
  )
}

// ── Retention section ───────────────────────────────────────────────────────

function RetentionSection({ days }: { days: number }) {
  const unique = useAnalyticsQuery('unique-actors', days)
  const hourly = useAnalyticsQuery('hourly-heatmap', days, {
    event: 'pro_contact',
  })

  return (
    <section className="mt-6">
      <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--medi-text-secondary)]">
        Retención y patrones
      </h3>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartCard
          title="Usuarios únicos"
          description="Conteo DISTINCT de actorId en ventanas de 1/7/30 días"
        >
          {unique.isLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : unique.isError ? (
            <QueryError message={String(unique.error.message)} />
          ) : (
            <UniqueActorsTable rows={unique.data?.rows ?? []} />
          )}
        </ChartCard>

        <ChartCard
          title="Mapa de calor por hora (UTC)"
          description="Cuándo ocurren los contactos por WhatsApp"
        >
          {hourly.isLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : hourly.isError ? (
            <QueryError message={String(hourly.error.message)} />
          ) : (
            <HourlyHeatmap rows={hourly.data?.rows ?? []} />
          )}
        </ChartCard>
      </div>
    </section>
  )
}

function UniqueActorsTable({ rows }: { rows: Record<string, unknown>[] }) {
  if (!rows.length) {
    return (
      <div className="text-sm text-[var(--medi-text-secondary)]">
        (sin datos)
      </div>
    )
  }
  const labels: Record<string, string> = {
    '1d': 'Diarios (DAU)',
    '7d': 'Semanales (WAU)',
    '30d': 'Mensuales (MAU)',
  }
  return (
    <div className="grid grid-cols-3 gap-3">
      {rows.map((r) => {
        const w = String(r.window ?? '')
        return (
          <div
            key={w}
            className="glass-card-soft flex flex-col gap-1 rounded-[var(--glass-radius-sm)] p-3"
          >
            <div className="text-[10px] uppercase tracking-wide text-[var(--medi-text-secondary)]">
              {labels[w] ?? w}
            </div>
            <div className="text-2xl font-bold tabular-nums text-[var(--medi-primary)]">
              {Number(r.unique_actors ?? 0).toLocaleString('es-VE')}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function HourlyHeatmap({ rows }: { rows: Record<string, unknown>[] }) {
  if (!rows.length) {
    return (
      <div className="text-sm text-[var(--medi-text-secondary)]">
        (sin datos)
      </div>
    )
  }
  const byHour = new Map<number, number>()
  for (const r of rows) byHour.set(Number(r.hour), Number(r.count ?? 0))
  const max = Math.max(...Array.from(byHour.values()), 1)
  // ponytail: 24 cells, one per hour. Empty hours render as a faint cell so
  // the user sees the full day shape instead of just the populated hours.
  return (
    <div>
      <div className="grid grid-cols-12 gap-1">
        {Array.from({ length: 24 }, (_, h) => {
          const v = byHour.get(h) ?? 0
          const intensity = v / max
          // 0 → faint, 1 → full primary
          const bg =
            v === 0
              ? 'rgba(0,0,0,0.04)'
              : `color-mix(in oklab, var(--medi-primary) ${Math.round(
                  intensity * 100,
                )}%, transparent)`
          return (
            <div
              key={h}
              title={`${h}:00–${h + 1}:00 — ${v.toLocaleString('es-VE')}`}
              className="flex aspect-square items-center justify-center rounded-sm text-[9px] font-semibold"
              style={{
                background: bg,
                color: intensity > 0.5 ? 'white' : 'var(--medi-text-primary)',
              }}
            >
              {v > 0 ? v : ''}
            </div>
          )
        })}
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-[var(--medi-text-secondary)]">
        <span>00</span>
        <span>06</span>
        <span>12</span>
        <span>18</span>
        <span>23h UTC</span>
      </div>
    </div>
  )
}

// ── D1 ops section ──────────────────────────────────────────────────────────

function D1Section() {
  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ['metrics-summary'],
    queryFn: () => getMetricsSummary(),
  })

  return (
    <section className="mt-6">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-[var(--medi-text-secondary)]">
          Estado operacional (D1)
        </h3>
        <button
          type="button"
          onClick={() => {
            refetch()
            notify({ type: 'info', title: 'Actualizando métricas…' })
          }}
          disabled={isFetching}
          className="glass-card-soft flex items-center gap-1.5 rounded-[var(--glass-radius-sm)] px-3 py-1.5 text-xs font-semibold text-[var(--medi-primary)] transition-all hover:translate-y-[-1px] disabled:opacity-50"
        >
          <RefreshCw className={`size-3.5 ${isFetching ? 'animate-spin' : ''}`} />
          Actualizar
        </button>
      </div>

      {isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : isError ? (
        <QueryError message={String(error.message)} />
      ) : data ? (
        <D1Grid data={data} />
      ) : null}
    </section>
  )
}

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pendientes',
  verified: 'Verificados',
  rejected: 'Rechazados',
  disabled: 'Suspendidos',
  deleted: 'Eliminados',
}

const MODALITY_LABELS: Record<string, string> = {
  in_person: 'Presencial',
  remote: 'Remoto',
  both: 'Ambos',
}

const RISK_LABELS: Record<string, string> = {
  none: 'Sin riesgo',
  watch: 'Vigilar',
  urgent: 'Urgente',
}

const STATUS_LABELS_FOLLOWUP: Record<string, string> = {
  open: 'Abierto',
  contacted: 'Contactado',
  closed: 'Cerrado',
}

function D1Grid({ data }: { data: MetricsSummary }) {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <ChartCard
        title="Profesionales por estado"
        description="Distribución del inventario (excluye eliminados)"
      >
        <BarList
          data={data.prosByStatus.map((r) => ({
            label: STATUS_LABELS[r.status] ?? r.status,
            value: r.total,
          }))}
        />
      </ChartCard>

      <ChartCard
        title="Profesionales verificados por modalidad"
        description="Cómo atienden los verificados"
      >
        <Donut
          data={data.prosByModality.map((r) => ({
            label: MODALITY_LABELS[r.modality] ?? r.modality,
            value: r.total,
          }))}
        />
      </ChartCard>

      <ChartCard
        title="Verificados por país"
        description="Distribución geográfica"
      >
        <BarList
          data={data.prosByCountry.map((r) => ({
            label: r.country,
            value: r.total,
          }))}
        />
      </ChartCard>

      <ChartCard
        title="Cola de audios (Voces que acompañan)"
        description="Pendientes / aprobados / rechazados"
      >
        <BarList
          data={data.audioQueue.map((r) => ({
            label: STATUS_LABELS[r.status] ?? r.status,
            value: r.total,
          }))}
        />
      </ChartCard>

      <ChartCard
        title="Seguimientos clínicos (agregado)"
        description="Triaje por estado × nivel de riesgo — solo conteos, sin PII"
      >
        <FollowUpTriageTable rows={data.followUpTriage} />
      </ChartCard>

      <ChartCard
        title="Altas de usuarios (últimos 30d)"
        description="Signups por día desde D1"
      >
        <LineTrend
          data={
            data.signupTrend30d.map((r) => ({
              day: r.day,
              count: r.total,
            }))
          }
          series="count"
        />
      </ChartCard>
    </div>
  )
}

function FollowUpTriageTable({
  rows,
}: {
  rows: MetricsSummary['followUpTriage']
}) {
  if (!rows.length) {
    return (
      <div className="text-sm text-[var(--medi-text-secondary)]">
        (sin datos)
      </div>
    )
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-left text-[var(--medi-text-secondary)]">
            <th className="py-1 pr-3">Estado</th>
            <th className="py-1 pr-3">Riesgo</th>
            <th className="py-1 text-right">Total</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={`${r.status}-${r.riskLevel}-${i}`} className="border-t border-black/5">
              <td className="py-1 pr-3">
                {STATUS_LABELS_FOLLOWUP[r.status] ?? r.status}
              </td>
              <td className="py-1 pr-3">
                <span
                  className={
                    r.riskLevel === 'urgent'
                      ? 'font-semibold text-red-700'
                      : r.riskLevel === 'watch'
                        ? 'font-semibold text-amber-700'
                        : 'text-[var(--medi-text-secondary)]'
                  }
                >
                  {RISK_LABELS[r.riskLevel] ?? r.riskLevel}
                </span>
              </td>
              <td className="py-1 text-right font-semibold tabular-nums">
                {r.total.toLocaleString('es-VE')}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
