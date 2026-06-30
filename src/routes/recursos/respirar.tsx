import { createFileRoute, Link } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { seoHead } from '#/lib/seo'
import { CrisisBanner } from '#/components/crisis-banner'
import { ProCta } from '#/components/pro-cta'

// ponytail: CSR — interactive widget, no crawler value. head() still runs
// (TanStack renders head for CSR routes into the shell) so the share/SEO
// description is set, just not server-rendered body.
export const Route = createFileRoute('/recursos/respirar')({
  ssr: false,
  head: () =>
    seoHead({
      title: 'Ejercicio de respiración calmante',
      description:
        'Técnica de respiración 4-4-4-4 (respiración cuadrada) para reducir la ansiedad y el pánico en minutos.',
      path: '/recursos/respirar',
    }),
  component: Respiration,
})

// ponytail: box breathing — only 4 discrete phases, so a setTimeout chain is
// simpler and more readable than rAF interpolation. A CSS transition smooths
// the circle between phase scales; the timer only ticks the per-phase
// countdown. Ceiling: a single cycle is 16s; for an actual session the user
// just keeps going — no session-length cap, no cycle counter (YAGNI).
interface Phase {
  label: string
  seconds: number
  scale: number
}
const PHASES: readonly Phase[] = [
  { label: 'Inhala', seconds: 4, scale: 1 },
  { label: 'Sostén', seconds: 4, scale: 1 },
  { label: 'Exhala', seconds: 4, scale: 0.5 },
  { label: 'Sostén', seconds: 4, scale: 0.5 },
]

function Respiration() {
  const [running, setRunning] = useState(false)
  const [phaseIdx, setPhaseIdx] = useState(0)
  const [count, setCount] = useState(PHASES[0].seconds)

  // ponytail: single timeout per tick, cleared by the returned cleanup. Deps
  // include count + phaseIdx so each render schedules exactly one next tick
  // with fresh values (no stale closures). When running flips false the effect
  // short-circuits and clears any pending timer.
  useEffect(() => {
    if (!running) return
    const id = setTimeout(() => {
      if (count > 1) {
        setCount(count - 1)
      } else {
        const nextIdx = (phaseIdx + 1) % PHASES.length
        setPhaseIdx(nextIdx)
        setCount(PHASES[nextIdx].seconds)
      }
    }, 1000)
    return () => clearTimeout(id)
  }, [running, count, phaseIdx])

  function toggle() {
    if (running) {
      setRunning(false)
      return
    }
    setPhaseIdx(0)
    setCount(PHASES[0].seconds)
    setRunning(true)
  }

  const phase = PHASES[phaseIdx]

  return (
    <main className="page-wrap flex min-h-[100dvh] flex-col py-6">
      <Link
        to="/recursos"
        className="inline-flex items-center gap-1 self-start py-2 text-base font-medium text-[var(--medi-secondary)]"
        aria-label="Atrás"
      >
        ‹ Atrás
      </Link>

      <h1 className="mt-6 text-2xl font-bold text-[var(--medi-text-primary)]">
        Respiración calmante
      </h1>
      <div className="section-underline mt-2" />
      <p className="mt-3 text-sm text-[var(--medi-text-secondary)]">
        Respiración cuadrada 4-4-4-4. Sigue el círculo: inhala, sostén, exhala
        y sostén, cuatro segundos en cada fase.
      </p>

      <div className="mt-8 flex flex-col items-center gap-8">
        <div className="relative flex size-60 items-center justify-center">
          {/* halo ring */}
          <div
            aria-hidden="true"
            className="absolute inset-0 rounded-full"
            style={{ backgroundColor: 'rgba(23, 140, 239, 0.08)' }}
          />
          {/* breathing orb */}
          <div
            aria-hidden="true"
            className="absolute size-44 rounded-full"
            style={{
              backgroundColor: 'rgba(23, 140, 239, 0.32)',
              transform: `scale(${running ? phase.scale : 0.72})`,
              transition: `transform ${phase.seconds}s ease-in-out`,
            }}
          />
          <div className="relative flex flex-col items-center">
            <span className="text-xl font-semibold text-[var(--medi-primary)]">
              {running ? phase.label : 'Listo'}
            </span>
            {running && (
              <span className="mt-1 text-6xl font-bold tabular-nums text-[var(--medi-text-primary)]">
                {count}
              </span>
            )}
          </div>
        </div>

        <button
          type="button"
          onClick={toggle}
          className="glass-primary flex min-h-12 items-center justify-center gap-2 rounded-[var(--glass-radius-sm)] px-8 py-3 text-base font-semibold text-white transition-all hover:translate-y-[-1px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--medi-secondary)]"
        >
          {running ? 'Detener' : 'Comenzar'}
        </button>
      </div>

      <div className="mt-10 flex flex-col gap-4">
        <CrisisBanner />
        <ProCta />
      </div>
    </main>
  )
}
