import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { MapPin, MessageCircle, Headphones } from 'lucide-react'
import { seoHead } from '#/lib/seo'

export const Route = createFileRoute('/ayuda/')({
  head: () =>
    seoHead({
      title: '¿Qué tipo de apoyo necesitas?',
      description:
        'Elige entre asistencia a distancia por WhatsApp con psicólogos verificados o asistencia presencial (brigadas en zonas críticas).',
      path: '/ayuda',
    }),
  component: ModalitySelection,
})

function ModalitySelection() {
  const navigate = useNavigate()

  const go = (modality: 'in_person' | 'remote') => {
    navigate({ to: '/ayuda/profesionales', search: { modality } })
  }

  return (
    <main className="page-wrap flex min-h-[100dvh] flex-col py-6">
      <Link
        to="/"
        className="inline-flex items-center gap-1 self-start py-2 text-base font-medium text-[var(--medi-secondary)]"
        aria-label="Atrás"
      >
        ‹ Atrás
      </Link>

      <h1 className="mt-6 text-2xl font-bold text-[var(--medi-text-primary)]">
        ¿Qué tipo de apoyo necesitas?
      </h1>
      <div className="section-underline mt-2" />

      <div className="mt-8 flex flex-col gap-4">
        <button
          type="button"
          onClick={() => go('remote')}
          className="glass-card flex min-h-24 w-full items-center gap-4 p-5 text-left transition-all hover:translate-y-[-1px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--medi-secondary)]"
        >
          <MessageCircle className="size-9 shrink-0 text-[var(--medi-secondary)]" />
          <span>
            <span className="block text-lg font-semibold text-[var(--medi-text-primary)]">
              Asistencia a distancia
            </span>
            <span className="block text-sm text-[var(--medi-text-secondary)]">
              Online / WhatsApp ahora
            </span>
          </span>
        </button>

        <button
          type="button"
          onClick={() => go('in_person')}
          className="glass-card flex min-h-24 w-full items-center gap-4 p-5 text-left transition-all hover:translate-y-[-1px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--medi-secondary)]"
        >
          <MapPin className="size-9 shrink-0 text-[var(--medi-secondary)]" />
          <span>
            <span className="block text-lg font-semibold text-[var(--medi-text-primary)]">
              Asistencia presencial
            </span>
            <span className="block text-sm text-[var(--medi-text-secondary)]">
              Brigadas en zonas críticas en todo el país
            </span>
          </span>
        </button>

        {/* ponytail: cross-link to /apoyo — same card style as the modality
            choices so the three read as one consistent set. A Link (not a
            button) so it keeps real anchor semantics (right-click, open-in-
            new-tab, SEO). Sits last as an alternative path of care. */}
        <Link
          to="/apoyo"
          className="glass-card flex min-h-24 w-full items-center gap-4 p-5 text-left transition-all hover:translate-y-[-1px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--medi-secondary)]"
        >
          <Headphones className="size-9 shrink-0 text-[var(--medi-secondary)]" />
          <span>
            <span className="block text-lg font-semibold text-[var(--medi-text-primary)]">
              Voces que acompañan
            </span>
            <span className="block text-sm text-[var(--medi-text-secondary)]">
              Mensajes en voz de psicólogos verificados
            </span>
          </span>
        </Link>
      </div>
    </main>
  )
}
