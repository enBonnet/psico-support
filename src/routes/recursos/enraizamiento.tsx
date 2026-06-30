import { createFileRoute, Link } from '@tanstack/react-router'
import { useState } from 'react'
import { seoHead } from '#/lib/seo'
import { CrisisBanner } from '#/components/crisis-banner'
import { ProCta } from '#/components/pro-cta'

// ponytail: CSR — step-through widget, no crawler value.
export const Route = createFileRoute('/recursos/enraizamiento')({
  ssr: false,
  head: () =>
    seoHead({
      title: 'Técnica de enraizamiento 5-4-3-2-1',
      description:
        'Ejercicio de enraizamiento 5-4-3-2-1 para volver al presente cuando sientes ansiedad, pánico o desconexión.',
      path: '/recursos/enraizamiento',
    }),
  component: Enraizamiento,
})

// ponytail: 5-step state machine — useState index + back/next. The "count
// things out loud" instructions are the intervention; the UI just walks the
// user through them one at a time so they're not overwhelmed.
interface Step {
  n: number
  verb: string
  prompt: string
}
const STEPS: readonly Step[] = [
  { n: 5, verb: 'veas', prompt: 'Nombra 5 cosas que puedas ver a tu alrededor.' },
  { n: 4, verb: 'puedas tocar', prompt: 'Nombra 4 cosas que puedas tocar.' },
  { n: 3, verb: 'escuches', prompt: 'Nombra 3 sonidos que puedas escuchar.' },
  { n: 2, verb: 'puedas oler', prompt: 'Identifica 2 olores cercanos.' },
  { n: 1, verb: 'puedas saborear', prompt: 'Identifica 1 sabor en tu boca.' },
]

function Enraizamiento() {
  const [idx, setIdx] = useState(0)
  const step = STEPS[idx]
  const last = idx === STEPS.length - 1

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
        Técnica de enraizamiento
      </h1>
      <div className="section-underline mt-2" />
      <p className="mt-3 text-sm text-[var(--medi-text-secondary)]">
        La regla 5-4-3-2-1 te ayuda a volver al presente usando tus sentidos.
        Ve paso a paso, en voz alta o mentalmente.
      </p>

      <div className="mt-8">
        <div className="flex items-center justify-between text-xs font-medium text-[var(--medi-text-secondary)]">
          <span>
            Paso {idx + 1} de {STEPS.length}
          </span>
          <span>Sentido: {step.verb}</span>
        </div>
        <div
          className="mt-2 flex h-1.5 overflow-hidden rounded-full"
          aria-hidden="true"
          style={{ backgroundColor: 'rgba(19, 41, 126, 0.1)' }}
        >
          <div
            className="h-full rounded-full transition-all"
            style={{
              width: `${((idx + 1) / STEPS.length) * 100}%`,
              backgroundColor: 'var(--medi-secondary)',
            }}
          />
        </div>
      </div>

      <div className="glass-card mt-6 flex min-h-56 flex-col items-center justify-center gap-4 p-8 text-center">
        <span className="text-7xl font-bold text-[var(--medi-secondary)] tabular-nums">
          {step.n}
        </span>
        <p className="text-lg font-medium text-[var(--medi-text-primary)]">
          {step.prompt}
        </p>
        <p className="text-sm text-[var(--medi-text-secondary)]">
          Tómate tu tiempo. Cuando estés listo, continúa.
        </p>
      </div>

      <div className="mt-6 flex gap-3">
        <button
          type="button"
          onClick={() => setIdx((i) => Math.max(0, i - 1))}
          disabled={idx === 0}
          className="glass-card-soft flex min-h-12 flex-1 items-center justify-center rounded-[var(--glass-radius-sm)] px-4 py-3 text-base font-semibold text-[var(--medi-primary)] transition-all hover:translate-y-[-1px] disabled:opacity-50"
        >
          Anterior
        </button>
        {last ? (
          <button
            type="button"
            onClick={() => setIdx(0)}
            className="glass-primary flex min-h-12 flex-1 items-center justify-center rounded-[var(--glass-radius-sm)] px-4 py-3 text-base font-semibold text-white transition-all hover:translate-y-[-1px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--medi-secondary)]"
          >
            Empezar de nuevo
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setIdx((i) => Math.min(STEPS.length - 1, i + 1))}
            className="glass-primary flex min-h-12 flex-1 items-center justify-center rounded-[var(--glass-radius-sm)] px-4 py-3 text-base font-semibold text-white transition-all hover:translate-y-[-1px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--medi-secondary)]"
          >
            Siguiente
          </button>
        )}
      </div>

      <div className="mt-10 flex flex-col gap-4">
        <CrisisBanner />
        <ProCta />
      </div>
    </main>
  )
}
