import { Link } from '@tanstack/react-router'
import { AlertTriangle } from 'lucide-react'

// ponytail: no Venezuela-wide crisis line exists as of this build, so the
// banner points to local emergency services + the directory rather than a
// phone number. NEVER invent a number here — only add a specific line with a
// verified official source. Single safety message shared by every recursos
// page so it cannot drift.
export function CrisisBanner() {
  return (
    <aside
      aria-label="Información de emergencia"
      className="glass-card-soft flex items-start gap-3 rounded-[var(--glass-radius-sm)] p-4"
    >
      <AlertTriangle
        aria-hidden="true"
        className="mt-0.5 size-5 shrink-0 text-[var(--notif-warning)]"
      />
      <p className="text-sm leading-relaxed text-[var(--medi-text-secondary)]">
        <span className="font-semibold text-[var(--medi-text-primary)]">
          ¿Es una emergencia?
        </span>{' '}
        Acude al centro de salud más cercano o llama a tu servicio de
        emergencias local.{' '}
        <Link
          to="/ayuda/profesionales"
          className="font-medium text-[var(--medi-secondary)] underline"
        >
          Hablar con un profesional
        </Link>
        .
      </p>
    </aside>
  )
}
