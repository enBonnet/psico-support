import { createFileRoute, Link } from '@tanstack/react-router'
import {
  BadgeCheck,
  Github,
  Globe,
  Heart,
  LifeBuoy,
  MessageCircle,
  ShieldCheck,
} from 'lucide-react'
import { seoHead } from '#/lib/seo'
import { APP_VERSION } from '#/lib/version'

// Absolute external links — single consumer, so defined locally rather than
// in seo.ts (which is about the site's own SEO/SITE_URL). Following the same
// "absolute, not env" rationale as SITE_URL: nobody shares localhost.
const REPO_URL = 'https://github.com/enBonnet/psico-support'
const ISSUES_URL = `${REPO_URL}/issues`
const RELEASE_URL = `${REPO_URL}/releases/tag/v${APP_VERSION}`
const BUILD4VEN_URL = 'https://build4venezuela.com'
const AUTHOR_URL = 'https://enbonnet.com'

// Shared classes for the glass credit pills. focus-visible outline matches
// the landing CTAs for a consistent keyboard affordance.
const pillClass =
  'glass-pill inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-[var(--medi-primary)] transition-all hover:translate-y-[-1px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--medi-secondary)]'

export const Route = createFileRoute('/acerca-de')({
  head: () =>
    seoHead({
      title: 'Acerca de Psicoayudaven',
      description:
        'psicoayudaven es una plataforma de código abierto, parte de Build4Venezuela, que conecta a personas en Venezuela con psicólogos verificados de forma gratuita y confidencial.',
      path: '/acerca-de',
    }),
  component: AboutPage,
})

function AboutPage() {
  return (
    <main className="page-wrap flex min-h-[100dvh] flex-col py-6">
      <Link
        to="/"
        className="inline-flex items-center gap-1 self-start py-2 text-base font-medium text-[var(--medi-secondary)]"
        aria-label="Atrás"
      >
        ‹ Atrás
      </Link>

      <p className="section-kicker mt-6">Acerca de Psicoayudaven</p>
      <h1 className="mt-2 text-2xl font-bold text-[var(--medi-text-primary)]">
        Tecnología al servicio de la salud mental
      </h1>
      <div className="section-underline mt-2" />

      <p className="mt-4 text-base text-[var(--medi-text-secondary)]">
        psicoayudaven es una plataforma de código abierto que conecta a personas
        afectadas por situaciones de crisis en Venezuela con psicólogos
        verificados, de forma gratuita y confidencial.
      </p>

      <div className="mt-8 flex flex-col gap-4">
        <section className="glass-card p-5">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-[var(--medi-text-primary)]">
            <ShieldCheck
              aria-hidden="true"
              className="size-5 text-[var(--medi-secondary)]"
            />
            Misión
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-[var(--medi-text-secondary)]">
            Ofrecer apoyo presencial mediante brigadas en zonas críticas y
            contención a distancia por WhatsApp, asegurando que quienes más lo
            necesitan encuentren ayuda de profesionales verificados.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link
              to="/ayuda"
              className="glass-pill inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-[var(--medi-primary)] transition-all hover:translate-y-[-1px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--medi-secondary)]"
            >
              <LifeBuoy aria-hidden="true" className="size-4" />
              Buscar ayuda
            </Link>
            <Link
              to="/profesional/registro"
              className="glass-pill inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-[var(--medi-primary)] transition-all hover:translate-y-[-1px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--medi-secondary)]"
            >
              <MessageCircle aria-hidden="true" className="size-4" />
              Soy psicólogo
            </Link>
          </div>
        </section>

        <section className="glass-card p-5">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-[var(--medi-text-primary)]">
            <Github
              aria-hidden="true"
              className="size-5 text-[var(--medi-text-secondary)]"
            />
            Código abierto
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-[var(--medi-text-secondary)]">
            Este proyecto es open source bajo licencia MIT. Puedes revisar el
            código, reportar problemas o contribuir a mejorarlo.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <a
              href={REPO_URL}
              target="_blank"
              rel="noopener noreferrer"
              className={pillClass}
            >
              <Github aria-hidden="true" className="size-4" />
              Ver en GitHub
            </a>
            <a
              href={ISSUES_URL}
              target="_blank"
              rel="noopener noreferrer"
              className={pillClass}
            >
              Reportar un problema
            </a>
          </div>
        </section>

        <section className="glass-card p-5">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-[var(--medi-text-primary)]">
            <Heart
              aria-hidden="true"
              className="size-5 text-[var(--medi-secondary)]"
            />
            Parte de Build4Venezuela
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-[var(--medi-text-secondary)]">
            Esta plataforma forma parte de{' '}
            <span className="font-medium text-[var(--medi-text-primary)]">
              Build4Venezuela
            </span>
            , un esfuerzo colaborativo de la comunidad tecnológica para construir
            soluciones que sirvan al país.
          </p>
          <div className="mt-4">
            <a
              href={BUILD4VEN_URL}
              target="_blank"
              rel="noopener noreferrer"
              className={pillClass}
            >
              <Heart aria-hidden="true" className="size-4" />
              build4venezuela.com
            </a>
          </div>
        </section>

        <section className="glass-card p-5">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-[var(--medi-text-primary)]">
            <BadgeCheck
              aria-hidden="true"
              className="size-5 text-[var(--medi-secondary)]"
            />
            Creado y mantenido por
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-[var(--medi-text-secondary)]">
            Esta plataforma está desarrollada y mantenida por{' '}
            <span className="font-medium text-[var(--medi-text-primary)]">
              Ender Bonnet
            </span>
            . Puedes conocer más sobre el autor y su trabajo en su sitio web.
          </p>
          <div className="mt-4">
            <a
              href={AUTHOR_URL}
              target="_blank"
              rel="noopener noreferrer"
              className={pillClass}
            >
              <Globe aria-hidden="true" className="size-4" />
              enbonnet.com
            </a>
          </div>
        </section>
      </div>

      <footer className="glass-card-soft mt-6 rounded-[var(--glass-radius-sm)] px-4 py-3 text-center text-sm text-[var(--medi-text-secondary)]">
        <a
          href={RELEASE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium text-[var(--medi-secondary)] hover:underline"
        >
          v{APP_VERSION}
        </a>{' '}
        · MIT
      </footer>
    </main>
  )
}
