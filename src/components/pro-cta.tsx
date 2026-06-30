import { Link } from '@tanstack/react-router'
import { MessageCircle } from 'lucide-react'

// ponytail: the "talk to a professional" footer + safety disclaimer repeated
// on every recursos tool page. Extracted (not inlined 5x) so the disclaimer
// wording — which is safety-relevant — cannot drift between pages.
export function ProCta() {
  return (
    <div className="mt-8 flex flex-col gap-3">
      <Link
        to="/ayuda/profesionales"
        className="glass-primary flex min-h-14 items-center justify-center gap-2 rounded-[var(--glass-radius-sm)] px-6 py-4 text-base font-semibold text-white transition-all hover:translate-y-[-1px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--medi-secondary)]"
      >
        <MessageCircle aria-hidden="true" className="size-5" />
        Hablar con un profesional ahora
      </Link>
      <p className="text-center text-xs text-[var(--medi-text-secondary)]">
        Estas herramientas no sustituyen la atención profesional.
      </p>
    </div>
  )
}
