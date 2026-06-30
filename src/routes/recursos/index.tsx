import { createFileRoute, Link } from '@tanstack/react-router'
import { Wind, HandHeart, Brain, LifeBuoy } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { seoHead } from '#/lib/seo'

// ponytail: SSR for the hub — it's shareable (whatsapp links to /recursos)
// and cheap to render, so the cards land in the initial HTML. Mirrors the
// /ayuda modality page structure for a consistent "list of destinations"
// mental model across the app.
export const Route = createFileRoute('/recursos/')({
  head: () =>
    seoHead({
      title: 'Herramientas de autocuidado',
      description:
        'Ejercicios de respiración y enraizamiento, información sobre reacciones normales tras una crisis y guía de primeros auxilios psicológicos para ayudar a otros.',
      path: '/recursos',
    }),
  component: RecursosHub,
})

interface Tool {
  to: string
  title: string
  desc: string
  audience: 'Para ti' | 'Para ayudar a otros'
  icon: LucideIcon
}

const TOOLS: readonly Tool[] = [
  {
    to: '/recursos/respirar',
    title: 'Respiración calmante',
    desc: 'Ejercicio guiado de respiración 4-4-4-4 para reducir la ansiedad.',
    audience: 'Para ti',
    icon: Wind,
  },
  {
    to: '/recursos/enraizamiento',
    title: 'Técnica de enraizamiento',
    desc: 'Vuelve al presente con la regla 5-4-3-2-1.',
    audience: 'Para ti',
    icon: HandHeart,
  },
  {
    to: '/recursos/reacciones-normales',
    title: 'Reacciones normales tras una crisis',
    desc: 'Entiende lo que sientes y cuándo pedir ayuda.',
    audience: 'Para ti',
    icon: Brain,
  },
  {
    to: '/recursos/primeros-auxilios',
    title: 'Primeros Auxilios Psicológicos',
    desc: 'Cómo acompañar a alguien en crisis (Mirar, Escuchar, Conectar).',
    audience: 'Para ayudar a otros',
    icon: LifeBuoy,
  },
]

function RecursosHub() {
  return (
    <main className="page-wrap flex min-h-[100dvh] flex-col py-6">
      <Link
        to="/"
        className="inline-flex items-center gap-1 self-start py-2 text-base font-medium text-[var(--medi-secondary)]"
        aria-label="Atrás"
      >
        ‹ Atrás
      </Link>

      <p className="section-kicker mt-6">Autocuidado y ayuda mutua</p>
      <h1 className="mt-2 text-2xl font-bold text-[var(--medi-text-primary)]">
        Herramientas de autocuidado
      </h1>
      <div className="section-underline mt-2" />

      <p className="mt-4 text-sm text-[var(--medi-text-secondary)]">
        Recursos gratuitos para tu bienestar emocional o para acompañar a
        alguien que lo necesita. Funcionan sin conexión una vez que los visitas.
      </p>

      <div className="mt-6 flex flex-col gap-4">
        {TOOLS.map((t) => {
          const Icon = t.icon
          return (
            <Link
              key={t.to}
              to={t.to}
              className="glass-card flex min-h-24 items-center gap-4 p-5 text-left transition-all hover:translate-y-[-1px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--medi-secondary)]"
            >
              <Icon
                aria-hidden="true"
                className="size-9 shrink-0 text-[var(--medi-secondary)]"
              />
              <span>
                <span className="block text-base font-semibold text-[var(--medi-text-primary)]">
                  {t.title}
                </span>
                <span className="block text-sm text-[var(--medi-text-secondary)]">
                  {t.desc}
                </span>
                <span className="mt-1 block text-xs font-medium text-[var(--medi-secondary)]">
                  {t.audience}
                </span>
              </span>
            </Link>
          )
        })}
      </div>
    </main>
  )
}
