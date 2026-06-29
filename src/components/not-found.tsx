import { Link } from '@tanstack/react-router'

// ponytail: router-level defaultNotFoundComponent. The profile route throws
// notFound() for unknown/unverified ids (verified-only public data, AGENTS.md
// §4) and the directory 307-normalizes search — without this the router fell
// back to its generic <p>Not Found</p> and logged a warning in dev. Kept
// content-minimal + Spanish + consistent with the landing page's shell.
export function NotFound() {
  return (
    <main className="page-wrap flex min-h-[100dvh] flex-col items-center justify-center py-8 text-center">
      <p className="section-kicker">404</p>
      <h1 className="mt-2 text-3xl font-bold leading-tight text-[var(--medi-primary)] sm:text-4xl">
        Página no encontrada
      </h1>
      <div className="section-underline mx-auto mt-3" />
      <p className="mt-4 max-w-sm text-base text-[var(--medi-text-secondary)]">
        La página que buscas no existe o el perfil ya no está disponible.
      </p>
      <Link
        to="/"
        className="glass-primary mt-8 inline-flex min-h-12 items-center justify-center rounded-[var(--glass-radius)] px-6 py-3 text-base font-semibold text-white transition-all hover:translate-y-[-1px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--medi-secondary)]"
      >
        Volver al inicio
      </Link>
    </main>
  )
}
