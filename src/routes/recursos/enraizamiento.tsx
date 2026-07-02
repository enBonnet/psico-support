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
      title: 'Técnica de enraizamiento',
      description:
        'Anclas corporales para volver al presente cuando sientes ansiedad, pánico o desconexión.',
      path: '/recursos/enraizamiento',
    }),
  component: Enraizamiento,
})

// ponytail: 5-step state machine — useState index + back/next. The anchors
// stay in the body (feet, hands, breath, touch) instead of the environment:
// in an emergency, "name 5 things you see / 2 smells" can point straight at
// rubble, smoke or sirens. The UI walks one anchor at a time so the user is
// never overwhelmed.
interface Step {
  anchor: string
  title: string
  prompt: string
}
const STEPS: readonly Step[] = [
  {
    anchor: 'pies',
    title: 'Siente los pies',
    prompt: 'Nota el peso, la tela o el cuero. No tienes que mover nada.',
  },
  {
    anchor: 'manos',
    title: 'Aprieta y suelta las manos',
    prompt: 'Cierra los puños contando hasta tres y suelta. Repite si quieres.',
  },
  {
    anchor: 'hombros',
    title: 'Afloja los hombros',
    prompt: 'Déjalos caer con suavidad. Nota cómo pesan al soltarse.',
  },
  {
    anchor: 'respiración',
    title: 'Escucha tu respiración',
    prompt: 'No la cambies. Solo nota cómo el aire entra y sale.',
  },
  {
    anchor: 'tacto',
    title: 'Toca algo cerca',
    prompt: 'Una tela, tu mano, el borde de algo. Nota su textura.',
  },
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
        Cinco anclas para volver al presente llevando la atención a tu cuerpo.
        Ve paso a paso, a tu ritmo.
      </p>

      <div className="mt-8">
        <div className="flex items-center justify-between text-xs font-medium text-[var(--medi-text-secondary)]">
          <span>
            Paso {idx + 1} de {STEPS.length}
          </span>
          <span>Ancla: {step.anchor}</span>
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
          {idx + 1}
        </span>
        <p className="text-lg font-medium text-[var(--medi-text-primary)]">
          {step.title}
        </p>
        <p className="text-sm text-[var(--medi-text-secondary)]">{step.prompt}</p>
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
