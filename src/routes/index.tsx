import { createFileRoute, Link } from '@tanstack/react-router'
import { useEffect } from 'react'
import {
  HeartPulse,
  LifeBuoy,
  Stethoscope,
  Headphones,
  UserCheck,
} from 'lucide-react'
import { track } from '#/lib/analytics-client'
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
      title: 'Red de apoyo psicológico Venezuela',
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
  // ponytail: landing_view fires once per mount (CSR hydrate), not on every
  // SSR render — the component effect runs only client-side. route is implicit
  // (the helper defaults to location.pathname).
  useEffect(() => {
    track({ event: 'landing_view', category: 'public' })
  }, [])
  return (
    <main className="page-wrap flex min-h-[100dvh] flex-col justify-between py-8">
      <header className="text-center">
        <p className="section-kicker">Venezuela</p>
        <h1 className="mt-2 text-3xl font-bold leading-tight text-[var(--medi-primary)] sm:text-4xl">
          Red de apoyo psicológico
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

      {/* ponytail: explicit "not a bot" reassurance. Users increasingly assume
          WhatsApp support lines are AI; this states the opposite up front — real
          verified psychologists read and answer every message. Keep it short and
          warm; it sits between the hero and the action buttons. */}
      <div className="glass-card-soft mt-6 flex items-center gap-3 rounded-[var(--glass-radius-sm)] px-4 py-3">
        <UserCheck
          aria-hidden="true"
          className="size-5 shrink-0 text-[var(--medi-secondary)]"
        />
        <p className="text-sm text-[var(--medi-text-secondary)]">
          Te responde una{' '}
          <span className="font-semibold text-[var(--medi-text-primary)]">
            persona real
          </span>
          : psicólogos verificados. Sin bots ni inteligencia artificial.
        </p>
      </div>

      <nav className="mt-10 flex flex-col gap-4">
      {/* ponytail: "Ahora" = immediate → straight to the remote directory
          (WhatsApp is the only on-demand modality; in-person is brigades).
          The modality-selection page (/ayuda) stays reachable via the Ayuda
          nav tab for users who specifically want in-person brigades. */}
      <Link
        to="/ayuda/profesionales"
        search={{ modality: 'remote' }}
        onClick={() => track({ event: 'cta_click', category: 'public', param1: 'help_now' })}
        className="glass-primary flex min-h-16 items-center justify-center gap-2 rounded-[var(--glass-radius)] px-6 py-5 text-lg font-semibold text-white transition-all hover:translate-y-[-1px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--medi-secondary)]"
      >
        <LifeBuoy aria-hidden="true" className="size-5" />
        Necesito ayuda ahora
      </Link>
      <Link
        to="/apoyo"
        onClick={() => track({ event: 'cta_click', category: 'public', param1: 'voces' })}
        className="glass-card-soft flex min-h-16 items-center justify-center gap-2 rounded-[var(--glass-radius)] px-6 py-5 text-lg font-semibold text-[var(--medi-primary)] transition-all hover:translate-y-[-1px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--medi-secondary)]"
      >
        <Headphones aria-hidden="true" className="size-5" />
        Voces que acompañan
      </Link>
      <Link
        to="/recursos"
        onClick={() => track({ event: 'cta_click', category: 'public', param1: 'recursos' })}
        className="glass-card-soft flex min-h-16 items-center justify-center gap-2 rounded-[var(--glass-radius)] px-6 py-5 text-lg font-semibold text-[var(--medi-primary)] transition-all hover:translate-y-[-1px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--medi-secondary)]"
      >
        <HeartPulse aria-hidden="true" className="size-5" />
        Herramientas de autocuidado
      </Link>
      <Link
        to="/profesional/registro"
        onClick={() => track({ event: 'cta_click', category: 'public', param1: 'ofrezco_ayuda' })}
        className="glass-card-soft flex min-h-16 items-center justify-center gap-2 rounded-[var(--glass-radius)] px-6 py-5 text-lg font-semibold text-[var(--medi-primary)] transition-all hover:translate-y-[-1px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--medi-secondary)]"
      >
        <Stethoscope aria-hidden="true" className="size-5" />
        Ofrezco ayuda (soy psicólogo)
      </Link>
      </nav>

      <InstallCard />

      <Link
        to="/como-funciona"
        aria-label="Cómo funciona PsicoAyudaVen"
        className="glass-card-soft mt-10 block rounded-[var(--glass-radius-sm)] px-4 py-3 text-center text-sm text-[var(--medi-text-secondary)] transition-all hover:translate-y-[-1px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--medi-secondary)]"
      >
        ¿Primera vez aquí?{' '}
        <span className="font-medium text-[var(--medi-secondary)]">
          Cómo funciona
        </span>
      </Link>

      <Link
        to="/acerca-de"
        aria-label="Acerca de PsicoAyudaVen"
        className="glass-card-soft mt-2 block rounded-[var(--glass-radius-sm)] px-4 py-3 text-center text-sm text-[var(--medi-text-secondary)] transition-all hover:translate-y-[-1px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--medi-secondary)]"
      >
        Servicio gratuito y confidencial.{' '}
        <span className="font-medium text-[var(--medi-secondary)]">
          Acerca de PsicoAyudaVen
        </span>
      </Link>

      <Link
        to="/equipo"
        aria-label="Equipo de PsicoAyudaVen"
        className="glass-card-soft mt-2 block rounded-[var(--glass-radius-sm)] px-4 py-3 text-center text-sm text-[var(--medi-text-secondary)] transition-all hover:translate-y-[-1px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--medi-secondary)]"
      >
        Las personas detrás del proyecto.{' '}
        <span className="font-medium text-[var(--medi-secondary)]">
          Equipo
        </span>
      </Link>

      <Link
        to="/terminos"
        aria-label="Términos para profesionales"
        className="glass-card-soft mt-2 block rounded-[var(--glass-radius-sm)] px-4 py-3 text-center text-sm text-[var(--medi-text-secondary)] transition-all hover:translate-y-[-1px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--medi-secondary)]"
      >
        <span className="font-medium text-[var(--medi-secondary)]">
          Términos para profesionales
        </span>
      </Link>
    </main>
  )
}
