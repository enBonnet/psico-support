import { Link, useRouter } from '@tanstack/react-router'
import type { ErrorComponentProps } from '@tanstack/react-router'

// ponytail: router-level defaultErrorComponent. Without this, any uncaught
// error (loader crash, server-fn failure, render throw) fell through to
// TanStack Router's generic built-in English error UI with no way home. This
// mirrors NotFound's layout (kicker + h1 + underline + message + glass CTA)
// so a 500 reads as the same "something broke, here's the way back" surface
// as a 404. Two actions: primary "Volver al inicio" (the user explicitly wants
// a clear path home) and a secondary "Reintentar" — transient errors (DB
// blip on the worker, a flaky fetch) often clear on retry, so offering it
// beats forcing a full navigate.
//
// Error reporting: Sentry here is server-side only (instrument.server.mjs),
// so client errors aren't auto-captured. We console.error so a developer is
// never left guessing why a user saw this page. Upgrade path: wrap getRouter
// in withSentry + a client instrument to capture client throws, then this
// console.error becomes redundant.
export function DefaultErrorComponent({ error, reset }: ErrorComponentProps) {
  const router = useRouter()

  // SSR-safe: console is available on both server and client.
  console.error('[route error]', error)

  return (
    <main className="page-wrap flex min-h-[100dvh] flex-col items-center justify-center py-8 text-center">
      <p className="section-kicker">Error</p>
      <h1 className="mt-2 text-3xl font-bold leading-tight text-[var(--medi-primary)] sm:text-4xl">
        Algo salió mal
      </h1>
      <div className="section-underline mx-auto mt-3" />
      <p className="mt-4 max-w-sm text-base text-[var(--medi-text-secondary)]">
        Ocurrió un problema inesperado al cargar esta página. Puedes volver al
        inicio o intentar de nuevo.
      </p>
      <div className="mt-8 flex flex-col gap-3">
        <Link
          to="/"
          className="glass-primary inline-flex min-h-12 items-center justify-center rounded-[var(--glass-radius)] px-6 py-3 text-base font-semibold text-white transition-all hover:translate-y-[-1px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--medi-secondary)]"
        >
          Volver al inicio
        </Link>
        <button
          type="button"
          onClick={() => {
            // reset() clears the boundary; invalidate() re-runs loaders so a
            // transient data error actually re-fetches instead of re-throwing
            // the same cached failure.
            reset()
            router.invalidate()
          }}
          className="glass-card-soft inline-flex min-h-12 items-center justify-center rounded-[var(--glass-radius)] px-6 py-3 text-base font-semibold text-[var(--medi-primary)] transition-all hover:translate-y-[-1px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--medi-secondary)]"
        >
          Reintentar
        </button>
      </div>
    </main>
  )
}
