import { createFileRoute, Link } from '@tanstack/react-router'
import { seoHead } from '#/lib/seo'
import { InstallCard } from '#/lib/install-prompt'
import { countVerifiedProfessionals } from '#/server/professionals'

export const Route = createFileRoute('/')({
  // ponytail: loader declared before head — declaring head first collapses
  // the route's generic inference (gotcha #3). Landing stays SSR (default),
  // so the count lands in the initial HTML: no flash, SEO-friendly.
  loader: async () => ({ count: await countVerifiedProfessionals() }),
  head: () =>
    seoHead({
      title: 'Red de Apoyo Psicológico Venezuela',
      description:
        'Conectamos a personas afectadas con psicólogos verificados. Apoyo presencial y online por WhatsApp, gratuito y confidencial.',
      path: '/',
    }),
  component: Landing,
})

function Landing() {
  const { count } = Route.useLoaderData()
  // ponytail: floor to nearest 10 for the "Más de N" marketing line — honest
  // (the pool IS more than N) and stable across single-digit churn (adding one
  // pro doesn't flip the hero text). Hide when the floored claim is < 10: a
  // tiny pool reads worse than none, and "Más de 0" is nonsensical. Lower STEP
  // to 5 for finer granularity once the directory grows.
  const STEP = 10
  const claim = Math.floor(count / STEP) * STEP
  return (
    <main className="page-wrap flex min-h-[100dvh] flex-col justify-between py-8">
      <header className="text-center">
        <p className="section-kicker">Venezuela</p>
        <h1 className="mt-2 text-3xl font-bold leading-tight text-[var(--medi-primary)] sm:text-4xl">
          Red de Apoyo Psicológico
        </h1>
        <div className="section-underline mx-auto mt-3" />
        <p className="mt-4 text-base text-[var(--medi-text-secondary)]">
          Conectamos a personas afectadas con psicólogos verificados.
        </p>
        {claim >= STEP && (
          <p className="mt-1 text-sm font-medium text-[var(--medi-secondary)]">
            Más de {claim} profesionales verificados
          </p>
        )}
      </header>

      <nav className="mt-10 flex flex-col gap-4">
      <Link
        to="/ayuda"
        className="glass-primary flex min-h-16 items-center justify-center rounded-[var(--glass-radius)] px-6 py-5 text-lg font-semibold text-white transition-all hover:translate-y-[-1px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--medi-secondary)]"
      >
        Necesito Ayuda Ahora
      </Link>
      <Link
        to="/profesional/registro"
        className="glass-card-soft flex min-h-16 items-center justify-center rounded-[var(--glass-radius)] px-6 py-5 text-lg font-semibold text-[var(--medi-primary)] transition-all hover:translate-y-[-1px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--medi-secondary)]"
      >
        Ofrezco Ayuda (Soy Psicólogo)
      </Link>
      </nav>

      <InstallCard />

      <Link
        to="/acerca-de"
        aria-label="Acerca de Psicoayudaven"
        className="glass-card-soft mt-10 block rounded-[var(--glass-radius-sm)] px-4 py-3 text-center text-sm text-[var(--medi-text-secondary)] transition-all hover:translate-y-[-1px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--medi-secondary)]"
      >
        Servicio gratuito y confidencial.{' '}
        <span className="font-medium text-[var(--medi-secondary)]">
          Acerca de Psicoayudaven
        </span>
      </Link>
    </main>
  )
}
