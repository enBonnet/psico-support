import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { MapPin, MessageCircle } from 'lucide-react'

export const Route = createFileRoute('/ayuda/')({
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
          onClick={() => go('in_person')}
          className="glass-card flex min-h-24 w-full items-center gap-4 p-5 text-left transition-all hover:translate-y-[-1px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--medi-secondary)]"
        >
          <MapPin className="size-9 shrink-0 text-[var(--medi-secondary)]" />
          <span>
            <span className="block text-lg font-semibold text-[var(--medi-text-primary)]">
              Asistencia Presencial
            </span>
            <span className="block text-sm text-[var(--medi-text-secondary)]">
              Brigadas en zonas críticas (La Guaira)
            </span>
          </span>
        </button>

        <button
          type="button"
          onClick={() => go('remote')}
          className="glass-card flex min-h-24 w-full items-center gap-4 p-5 text-left transition-all hover:translate-y-[-1px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--medi-secondary)]"
        >
          <MessageCircle className="size-9 shrink-0 text-[var(--medi-secondary)]" />
          <span>
            <span className="block text-lg font-semibold text-[var(--medi-text-primary)]">
              Contención a Distancia
            </span>
            <span className="block text-sm text-[var(--medi-text-secondary)]">
              Online / WhatsApp ahora
            </span>
          </span>
        </button>
      </div>
    </main>
  )
}
