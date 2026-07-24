// =============================================================================
// src/components/charts/index.tsx — small inline-SVG chart components
// =============================================================================
// Hand-rolled SVG charts for the analytics dashboard. We deliberately avoid
// pulling in a charting library — the dataset is small, the visuals are
// simple (bars, donut, line, funnel), and inline SVG keeps the bundle tiny
// and the styling consistent with the app's glass design tokens.
//
// All components are presentational (no data fetching). Color tokens come from
// the design system (var(--medi-primary), var(--medi-secondary), etc.). The app
// is currently light-only — the .dark block was removed from styles.css as
// unreachable dead code; if dark mode is later scoped, these charts will need
// explicit dark variants (the color tokens alone won't carry it).
//
// Accessibility: every chart has role="img" + aria-label summarizing the
// shape; the underlying numbers are also rendered as text in the card so
// screen reader users get the actual data even if they skip the chart.
// =============================================================================

import * as React from 'react'

// ─── KPI card ───────────────────────────────────────────────────────────────

export type KpiCardProps = {
  label: string
  value: React.ReactNode
  /** Sub-label shown under the value, typically the technical event name. */
  hint?: string
  /**
   * Percentage delta vs the previous period (+12.5, -3.0). Renders green/amber/
   * muted; omit for a flat card.
   */
  deltaPct?: number
}

export function KpiCard({ label, value, hint, deltaPct }: KpiCardProps) {
  const deltaColor =
    deltaPct === undefined
      ? 'text-[var(--medi-text-secondary)]'
      : deltaPct > 0
        ? 'text-green-700'
        : deltaPct < 0
          ? 'text-amber-700'
          : 'text-[var(--medi-text-secondary)]'
  const deltaSign = deltaPct === undefined ? '' : deltaPct > 0 ? '+' : ''
  return (
    <div className="glass-card-soft flex flex-col gap-1 p-4">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-[var(--medi-text-secondary)]">
        {label}
      </div>
      <div className="text-2xl font-bold tabular-nums text-[var(--medi-primary)]">
        {value}
      </div>
      {hint && (
        <div className="font-mono text-[11px] text-[var(--medi-text-secondary)]">
          {hint}
        </div>
      )}
      {deltaPct !== undefined && (
        <div className={`text-[11px] font-semibold tabular-nums ${deltaColor}`}>
          {deltaSign}
          {deltaPct.toFixed(1)}% vs período anterior
        </div>
      )}
    </div>
  )
}

// ─── Bar list ───────────────────────────────────────────────────────────────

export type BarListProps = {
  data: { label: string; value: number }[]
  /** Optional caption shown when data is empty. */
  emptyLabel?: string
}

export function BarList({ data, emptyLabel = '(sin datos)' }: BarListProps) {
  if (!data.length) {
    return <div className="text-sm text-[var(--medi-text-secondary)]">{emptyLabel}</div>
  }
  const max = Math.max(...data.map((d) => d.value), 1)
  return (
    <div className="flex flex-col gap-2" role="img" aria-label="Barras horizontales">
      {data.map((d) => {
        const pct = (d.value / max) * 100
        return (
          <div key={d.label} className="flex items-center gap-3">
            <div
              className="w-40 shrink-0 truncate font-mono text-xs text-[var(--medi-text-primary)]"
              title={d.label}
            >
              {d.label}
            </div>
            <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-black/5">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${pct}%`,
                  background:
                    'linear-gradient(90deg, var(--medi-secondary), var(--medi-primary))',
                }}
              />
            </div>
            <div className="w-14 shrink-0 text-right text-xs font-semibold tabular-nums text-[var(--medi-text-primary)]">
              {d.value.toLocaleString('es-VE')}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── Donut ──────────────────────────────────────────────────────────────────

export type DonutProps = {
  data: { label: string; value: number }[]
  /** Caption shown when data is empty. */
  emptyLabel?: string
}

const DONUT_COLORS = [
  'var(--medi-primary)',
  'var(--medi-secondary)',
  '#16a34a',
  '#d97706',
  '#9333ea',
  '#dc2626',
  '#0891b2',
  '#65a30d',
]

export function Donut({ data, emptyLabel = '(sin datos)' }: DonutProps) {
  const total = data.reduce((s, d) => s + d.value, 0)
  if (!total) {
    return <div className="text-sm text-[var(--medi-text-secondary)]">{emptyLabel}</div>
  }
  const radius = 60
  const circumference = 2 * Math.PI * radius
  let offset = 0
  return (
    <div className="flex flex-wrap items-center gap-6">
      <svg
        viewBox="0 0 160 160"
        width="160"
        height="160"
        role="img"
        aria-label={`Distribución de ${total.toLocaleString('es-VE')} eventos`}
        className="shrink-0"
      >
        <circle
          cx="80"
          cy="80"
          r={radius}
          fill="none"
          stroke="rgba(0,0,0,0.05)"
          strokeWidth="20"
        />
        {data.map((d, i) => {
          const fraction = d.value / total
          const dash = fraction * circumference
          const seg = (
            <circle
              key={d.label}
              cx="80"
              cy="80"
              r={radius}
              fill="none"
              stroke={DONUT_COLORS[i % DONUT_COLORS.length]}
              strokeWidth="20"
              strokeDasharray={`${dash} ${circumference - dash}`}
              strokeDashoffset={-offset}
              transform="rotate(-90 80 80)"
            />
          )
          offset += dash
          return seg
        })}
        <text
          x="80"
          y="78"
          textAnchor="middle"
          className="fill-[var(--medi-primary)] font-bold"
          style={{ fontSize: 22 }}
        >
          {total.toLocaleString('es-VE')}
        </text>
        <text
          x="80"
          y="96"
          textAnchor="middle"
          className="fill-[var(--medi-text-secondary)]"
          style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.05em' }}
        >
          total
        </text>
      </svg>
      <ul className="flex flex-col gap-1.5">
        {data.map((d, i) => {
          const pct = ((d.value / total) * 100).toFixed(1)
          return (
            <li key={d.label} className="flex items-center gap-2 text-xs">
              <span
                className="size-3 rounded-full"
                style={{ background: DONUT_COLORS[i % DONUT_COLORS.length] }}
              />
              <span className="font-mono text-[var(--medi-text-primary)]">{d.label}</span>
              <span className="font-semibold tabular-nums text-[var(--medi-text-primary)]">
                {d.value.toLocaleString('es-VE')} ({pct}%)
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

// ─── Line trend ─────────────────────────────────────────────────────────────

export type LineTrendProps = {
  /**
   * Single-series: [{ day, count }]. Two-series: [{ day, a_count, b_count }]
   * (when `seriesB` is provided). The day values are ISO date strings; the
   * chart renders the yyyy-mm-dd 'mm-dd' slice for axis labels. Values may
   * include null/boolean from upstream coercions — treated as 0/empty.
   */
  data: Array<Record<string, string | number | boolean | null>>
  /** Column to plot as the primary series. Defaults to 'count'. */
  series?: string
  /** Optional second column to overlay; renders as a second stroke. */
  seriesB?: string
  /** Optional label for seriesB for the legend. */
  seriesBLabel?: string
}

export function LineTrend({
  data,
  series = 'count',
  seriesB,
  seriesBLabel,
}: LineTrendProps) {
  const W = 640
  const H = 200
  const P = 32
  const innerW = W - P * 2
  const innerH = H - P * 2

  if (!data.length) {
    return (
      <div className="text-sm text-[var(--medi-text-secondary)]">(sin datos)</div>
    )
  }

  const max = Math.max(
    ...data.map((d) => Number(d[series]) || 0),
    ...(seriesB ? data.map((d) => Number(d[seriesB]) || 0) : [1]),
    1,
  )
  const stepX = data.length > 1 ? innerW / (data.length - 1) : innerW

  const toPoint = (i: number, key: string): [number, number] => {
    const v = Number(data[i][key]) || 0
    return [P + i * stepX, P + innerH - (v / max) * innerH]
  }

  const linePath = (key: string): string =>
    data
      .map((_, i) => {
        const [x, y] = toPoint(i, key)
        return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`
      })
      .join(' ')

  const areaPath = (key: string): string => {
    const last = (data.length - 1) * stepX
    return `${linePath(key)} L${(P + last).toFixed(1)},${P + innerH} L${P},${P + innerH} Z`
  }

  // Y-axis gridlines + labels (0, 25, 50, 75, 100% of max)
  const gridlines = [0, 0.25, 0.5, 0.75, 1].map((f) => {
    const y = P + innerH - f * innerH
    const value = Math.round(f * max).toLocaleString('es-VE')
    return (
      <g key={f}>
        <line
          x1={P}
          y1={y}
          x2={W - P}
          y2={y}
          stroke="rgba(0,0,0,0.08)"
          strokeWidth="1"
        />
        <text
          x={P - 6}
          y={y + 3}
          textAnchor="end"
          className="fill-[var(--medi-text-secondary)]"
          style={{ fontSize: 9 }}
        >
          {value}
        </text>
      </g>
    )
  })

  // X-axis labels: first, middle, last
  const labelIdx = [0, Math.floor(data.length / 2), data.length - 1]
  const xlabels = labelIdx.map((i) => {
    if (!data[i]) return null
    const x = P + i * stepX
    const day = String(data[i].day ?? '')
    return (
      <text
        key={i}
        x={x}
        y={H - 8}
        textAnchor="middle"
        className="fill-[var(--medi-text-secondary)]"
        style={{ fontSize: 10 }}
      >
        {day.slice(5)}
      </text>
    )
  })

  return (
    <div className="w-full">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        width="100%"
        height="200"
        role="img"
        aria-label={`Tendencia: ${data.length} puntos; máximo ${max.toLocaleString('es-VE')}`}
      >
        <defs>
          <linearGradient id="trend-a" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--medi-secondary)" stopOpacity="0.25" />
            <stop offset="100%" stopColor="var(--medi-secondary)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {gridlines}
        <path d={areaPath(series)} fill="url(#trend-a)" />
        <path
          d={linePath(series)}
          fill="none"
          stroke="var(--medi-secondary)"
          strokeWidth="2"
        />
        {seriesB && (
          <path
            d={linePath(seriesB)}
            fill="none"
            stroke="var(--medi-primary)"
            strokeWidth="2"
            strokeDasharray="4 3"
          />
        )}
        {xlabels}
      </svg>
      {seriesB && (
        <div className="mt-2 flex items-center justify-center gap-4 text-[11px] text-[var(--medi-text-secondary)]">
          <span className="flex items-center gap-1.5">
            <span
              className="inline-block h-0.5 w-4"
              style={{ background: 'var(--medi-secondary)' }}
            />
            {series}
          </span>
          <span className="flex items-center gap-1.5">
            <span
              className="inline-block h-0.5 w-4 border-t-2 border-dashed"
              style={{ borderColor: 'var(--medi-primary)' }}
            />
            {seriesBLabel ?? seriesB}
          </span>
        </div>
      )}
    </div>
  )
}

// ─── Funnel ─────────────────────────────────────────────────────────────────

export type FunnelStep = {
  step: string
  event?: string
  total: number
  pct_of_prev?: number | null
  pct_of_first?: number | null
}

export type FunnelChartProps = {
  steps: FunnelStep[]
}

export function FunnelChart({ steps }: FunnelChartProps) {
  if (!steps.length || steps.every((s) => !s.total)) {
    return (
      <div className="text-sm text-[var(--medi-text-secondary)]">(sin datos)</div>
    )
  }
  const max = Math.max(...steps.map((s) => s.total), 1)
  return (
    <div
      className="flex flex-col gap-2"
      role="img"
      aria-label={`Embudo: ${steps.map((s) => `${s.step} ${s.total}`).join(', ')}`}
    >
      {steps.map((s, i) => {
        const widthPct = (s.total / max) * 100
        const pctPrev =
          s.pct_of_prev ?? (i > 0 && steps[i - 1].total > 0
            ? (s.total / steps[i - 1].total) * 100
            : null)
        const pctFirst = s.pct_of_first ?? (steps[0].total > 0 ? (s.total / steps[0].total) * 100 : null)
        return (
          <div key={s.step} className="flex flex-col gap-1">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-[var(--medi-text-primary)]">
                {s.step}
              </span>
              <span className="font-semibold tabular-nums text-[var(--medi-text-primary)]">
                {s.total.toLocaleString('es-VE')}
                {pctPrev !== null && i > 0 && (
                  <span className="ml-2 text-[10px] font-normal text-[var(--medi-text-secondary)]">
                    {pctPrev.toFixed(1)}% del paso anterior
                  </span>
                )}
              </span>
            </div>
            <div className="h-7 w-full overflow-hidden rounded-md bg-black/5">
              <div
                className="flex h-full items-center justify-end rounded-md pr-2 text-[10px] font-semibold text-white"
                style={{
                  width: `${Math.max(widthPct, 2)}%`,
                  background:
                    'linear-gradient(90deg, var(--medi-secondary), var(--medi-primary))',
                }}
              >
                {pctFirst !== null && pctFirst < 100 && (
                  <span>{pctFirst.toFixed(0)}%</span>
                )}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── Card wrapper ───────────────────────────────────────────────────────────

export type ChartCardProps = {
  title: string
  description?: string
  /** Optional header-right node (e.g. export button). */
  action?: React.ReactNode
  /** Render-prop for the body; isolated so Suspense/loading states compose. */
  children: React.ReactNode
  className?: string
}

export function ChartCard({
  title,
  description,
  action,
  children,
  className = '',
}: ChartCardProps) {
  return (
    <section className={`glass-card flex flex-col gap-3 p-5 ${className}`}>
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-[var(--medi-primary)]">
            {title}
          </h2>
          {description && (
            <p className="text-xs text-[var(--medi-text-secondary)]">
              {description}
            </p>
          )}
        </div>
        {action}
      </header>
      {children}
    </section>
  )
}

// ─── Export-csv button ──────────────────────────────────────────────────────

export type ExportCsvButtonProps = {
  onClick: () => void
  disabled?: boolean
  label?: string
}

export function ExportCsvButton({
  onClick,
  disabled,
  label = 'CSV',
}: ExportCsvButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="glass-card-soft flex items-center gap-1.5 rounded-[var(--glass-radius-sm)] px-2.5 py-1.5 text-[11px] font-semibold text-[var(--medi-primary)] transition-all hover:translate-y-[-1px] disabled:pointer-events-none disabled:opacity-40"
      title="Exportar a CSV"
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="size-3.5"
        aria-hidden="true"
      >
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
        <polyline points="7 10 12 15 17 10" />
        <line x1="12" y1="15" x2="12" y2="3" />
      </svg>
      {label}
    </button>
  )
}

// ─── CSV export helper ──────────────────────────────────────────────────────

/**
 * Build a CSV string from rows + columns and trigger a browser download.
 * Uses RFC 4180 quoting (double-quote fields containing commas / quotes /
 * newlines). Spanish Excel prefers ';' as the separator on many installs,
 * but ',' is the spec default and works in Google Sheets / Numbers / modern
 * Excel — keep ',' for portability.
 */
export function exportCsv(
  filename: string,
  columns: string[],
  rows: Record<string, unknown>[],
): void {
  const escape = (v: unknown): string => {
    const s = v === null || v === undefined ? '' : String(v)
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`
    return s
  }
  const header = columns.join(',')
  const body = rows
    .map((r) => columns.map((c) => escape(r[c])).join(','))
    .join('\n')
  const csv = `${header}\n${body}`
  // ponytail: BOM prefix so Excel opens UTF-8 (accents, ñ) without garbling.
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename.endsWith('.csv') ? filename : `${filename}.csv`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
