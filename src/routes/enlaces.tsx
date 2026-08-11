import { createFileRoute, Link } from '@tanstack/react-router'
import { ArrowLeft, ExternalLink } from 'lucide-react'
import { SocialIcon } from '#/components/social-icons'
import type { SocialName } from '#/components/social-icons'
import { seoHead } from '#/lib/seo'
import { track } from '#/lib/analytics-client'

// ponytail: SSR (default) — página "link in bio", estática y compartible (es
// justo el tipo de URL que se pone en una biografía de IG/TikTok/X). Sin
// loader: copy + enlaces fijos. Misma forma que /acerca-de y /medias.
export const Route = createFileRoute('/enlaces')({
  head: () =>
    seoHead({
      title: 'Nuestras redes',
      description:
        'Sigue a Psico Ayuda Venezuela en Instagram, TikTok y X (@psicoayudasapp). Contenido de apoyo psicológico, autocuidado y novedades de la red.',
      path: '/enlaces',
    }),
  component: EnlacesPage,
})

// ponytail: handle único para las tres redes (lo confirmó el equipo). Si una
// plataforma pasara a tener un handle distinto, separar por campo en vez de
// construir todo desde HANDLE. Las URLs siguen la convención de
// src/server/professionals.ts socialLinks() (X/IG sin @, TikTok con @).
const HANDLE = 'psicoayudasapp'

interface Social {
  name: SocialName
  label: string
  href: string
  // ponytail: badge brand color (bg tailwind class + white glyph). Reconocimiento
  // instantáneo en un link-in-bio — los glyphs por sí solos son menos legibles
  // para usuarios que escanean rápido. IG usa su gradiente oficial.
  badge: string
}

const SOCIALS: readonly Social[] = [
  {
    name: 'instagram',
    label: 'Instagram',
    href: `https://instagram.com/${HANDLE}`,
    badge:
      'bg-gradient-to-tr from-[#FEDA75] via-[#D62976] to-[#962FBF]',
  },
  {
    name: 'tiktok',
    label: 'TikTok',
    href: `https://www.tiktok.com/@${HANDLE}`,
    badge: 'bg-black',
  },
  {
    name: 'x',
    label: 'X (Twitter)',
    href: `https://x.com/${HANDLE}`,
    badge: 'bg-black',
  },
]

const EXTERNAL = { target: '_blank', rel: 'noopener noreferrer' } as const

function EnlacesPage() {
  return (
    <main className="page-wrap flex min-h-[100dvh] flex-col py-6">
      <Link
        to="/"
        className="inline-flex items-center gap-1 self-start py-2 text-base font-medium text-[var(--medi-secondary)]"
        aria-label="Atrás"
      >
        <ArrowLeft aria-hidden="true" className="size-4" />
        Atrás
      </Link>

      <header className="mt-6 flex flex-col items-center text-center">
        <img
          src="/favicon.svg"
          alt=""
          width={64}
          height={64}
          aria-hidden="true"
          className="size-16"
        />
        <p className="section-kicker mt-4">Nuestras redes</p>
        <h1 className="mt-2 text-2xl font-bold text-[var(--medi-text-primary)]">
          Síguenos en redes
        </h1>
        <div className="section-underline mt-2" />
        <p className="mt-4 text-sm text-[var(--medi-text-secondary)]">
          Apoyo psicológico, herramientas de autocuidado y novedades de la red.
          Te acompañamos también en Instagram, TikTok y X.
        </p>
        <p className="mt-2 text-base font-semibold text-[var(--medi-primary)]">
          @{HANDLE}
        </p>
      </header>

      <ul className="mt-8 flex flex-col gap-3">
        {SOCIALS.map((s) => (
          <li key={s.name}>
            <a
              href={s.href}
              {...EXTERNAL}
              onClick={() =>
                track({
                  event: 'social_profile_click',
                  category: 'public',
                  param1: s.name,
                })
              }
              className="glass-card flex min-h-16 items-center gap-4 p-4 text-left transition-all hover:translate-y-[-1px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--medi-secondary)]"
            >
              <span
                aria-hidden="true"
                className={`flex size-12 shrink-0 items-center justify-center rounded-full text-white ${s.badge}`}
              >
                <SocialIcon name={s.name} className="size-6" />
              </span>
              <span className="flex-1">
                <span className="block text-base font-semibold text-[var(--medi-text-primary)]">
                  {s.label}
                </span>
                <span className="block text-sm text-[var(--medi-text-secondary)]">
                  @{HANDLE}
                </span>
              </span>
              <ExternalLink
                aria-hidden="true"
                className="size-4 shrink-0 text-[var(--medi-text-secondary)]"
              />
            </a>
          </li>
        ))}
      </ul>

      <footer className="glass-card-soft mt-10 rounded-[var(--glass-radius-sm)] px-4 py-3 text-center text-sm text-[var(--medi-text-secondary)]">
        ¿Necesitas ayuda ahora?{' '}
        <Link
          to="/ayuda"
          className="font-medium text-[var(--medi-secondary)] hover:underline"
        >
          Buscar un psicólogo
        </Link>
      </footer>
    </main>
  )
}
