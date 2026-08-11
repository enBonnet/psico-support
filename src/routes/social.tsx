import { createFileRoute, Link } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { seoHead, siteUrl } from '#/lib/seo'
import { track } from '#/lib/analytics-client'
import { notify } from '#/lib/notifications'

// ponytail: SSR (default) so OG/Twitter meta lands in the initial HTML for
// crawlers — this page exists to be shared, the preview is the whole point.
// No loader: the pitch is static copy, no DB read needed.

// ponytail: share copy is host-agnostic; the URL is computed per-render inside
// SocialPage via siteUrl() so a psicoayudas.com visitor shares a psicoayudas.com
// link (and vice versa). It can't be a module-level constant because module
// init runs at worker boot with no request context — siteUrl() would fall back
// to the primary domain for everyone.
const SHARE_TEXT =
  '¿Eres psicólogo/a? Únete a la red de apoyo psicológico de Latinoamérica y conecta con quienes te necesitan. Verificamos tus credenciales. Gratis y confidencial.'

export const Route = createFileRoute('/social')({
  head: () =>
    seoHead({
      title: 'Únete como psicólogo',
      description:
        'Conecta con personas que necesitan apoyo psicológico en Latinoamérica. Verificamos tus credenciales, tú decides tu disponibilidad. Gratis y confidencial.',
      path: '/social',
    }),
  component: SocialPage,
})

// ponytail: native share-intent URLs — no JS SDKs, one outbound link per
// platform. WhatsApp folds text+url into the wa.me `text` param; X/Facebook
// use their official sharer endpoints. target=_blank so the user keeps our page.
function buildShareLinks(shareUrl: string) {
  return {
    whatsapp: `https://wa.me/?text=${encodeURIComponent(`${SHARE_TEXT} ${shareUrl}`)}`,
    twitter: `https://twitter.com/intent/tweet?text=${encodeURIComponent(SHARE_TEXT)}&url=${encodeURIComponent(shareUrl)}`,
    facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`,
  } as const
}

const EXTERNAL = { target: '_blank', rel: 'noopener noreferrer' } as const

function SocialPage() {
  const [hasShare, setHasShare] = useState(false)
  // ponytail: resolve per-render so the shared URL matches the host the visitor
  // is on (client: window.location; SSR: per-request host). Share buttons are
  // clicked client-side, so this is effectively window.location.origin + path.
  const shareUrl = `${siteUrl()}/social`
  const shareLinks = buildShareLinks(shareUrl)

  // ponytail: feature-detect navigator.share on mount (client-only — it's
  // undefined during SSR). Offers the native sheet on mobile where it beats
  // hand-picking a platform.
  useEffect(() => {
    if ('share' in navigator) setHasShare(true)
  }, [])

  const shareNative = async () => {
    try {
      await navigator.share({
        title: 'Únete como psicólogo',
        text: SHARE_TEXT,
        url: shareUrl,
      })
      track({ event: 'social_share', category: 'public', param1: 'native' })
    } catch {
      // user dismissed the sheet — no-op
    }
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl)
      track({ event: 'social_share', category: 'public', param1: 'copy' })
      notify({ type: 'success', title: 'Enlace copiado' })
    } catch {
      notify({ type: 'warning', title: 'No se pudo copiar', body: shareUrl })
    }
  }

  return (
    <main className="page-wrap flex min-h-[100dvh] flex-col py-8">
      <header className="text-center">
        <p className="section-kicker">Para psicólogos</p>
        <h1 className="mt-2 text-3xl font-bold leading-tight text-[var(--medi-primary)] sm:text-4xl">
          ¿Eres psicólogo/a?
          <br />
          Únete a la red
        </h1>
        <div className="section-underline mx-auto mt-3" />
        <p className="mt-4 text-base text-[var(--medi-text-secondary)]">
          Conecta con personas que necesitan apoyo psicológico en Latinoamérica.
          Verificamos tus credenciales, tú decides tu disponibilidad y
          modalidad.
        </p>
      </header>

      <ul className="mt-8 flex flex-col gap-3 text-sm text-[var(--medi-text-primary)]">
        {[
          'Verificación gratuita de tu colegiación',
          'Tú eliges cuándo y dónde atiendes',
          'Presencial, a distancia o ambas modalidades',
          'Servicio gratuito y confidencial',
        ].map((line) => (
          <li
            key={line}
            className="glass-card-soft rounded-[var(--glass-radius-sm)] px-4 py-3"
          >
            {line}
          </li>
        ))}
      </ul>

      <Link
        to="/profesional/registro"
        className="glass-primary mt-8 flex min-h-16 items-center justify-center rounded-[var(--glass-radius)] px-6 py-5 text-lg font-semibold text-white transition-all hover:translate-y-[-1px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--medi-secondary)]"
      >
        Quiero unirme
      </Link>

      <section className="mt-12">
        <h2 className="text-center text-lg font-semibold text-[var(--medi-text-primary)]">
          Invita a otros colegas
        </h2>
        <p className="mt-1 text-center text-sm text-[var(--medi-text-secondary)]">
          Comparte este enlace con psicólogos que quieran sumarse.
        </p>
        <div className="mt-4 flex flex-col gap-3">
          {hasShare && (
            <button
              type="button"
              onClick={shareNative}
              className="glass-primary flex min-h-12 items-center justify-center rounded-[var(--glass-radius-sm)] px-4 py-3 text-sm font-semibold text-white transition-all hover:translate-y-[-1px]"
            >
              Compartir…
            </button>
          )}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <a
              href={shareLinks.whatsapp}
              {...EXTERNAL}
              onClick={() =>
                track({ event: 'social_share', category: 'public', param1: 'whatsapp' })
              }
              className="glass-card-soft flex min-h-12 items-center justify-center rounded-[var(--glass-radius-sm)] px-4 py-3 text-sm font-semibold text-[var(--medi-primary)] transition-all hover:translate-y-[-1px]"
            >
              WhatsApp
            </a>
            <a
              href={shareLinks.twitter}
              {...EXTERNAL}
              onClick={() =>
                track({ event: 'social_share', category: 'public', param1: 'twitter' })
              }
              className="glass-card-soft flex min-h-12 items-center justify-center rounded-[var(--glass-radius-sm)] px-4 py-3 text-sm font-semibold text-[var(--medi-primary)] transition-all hover:translate-y-[-1px]"
            >
              X / Twitter
            </a>
            <a
              href={shareLinks.facebook}
              {...EXTERNAL}
              onClick={() =>
                track({ event: 'social_share', category: 'public', param1: 'facebook' })
              }
              className="glass-card-soft flex min-h-12 items-center justify-center rounded-[var(--glass-radius-sm)] px-4 py-3 text-sm font-semibold text-[var(--medi-primary)] transition-all hover:translate-y-[-1px]"
            >
              Facebook
            </a>
          </div>
          <button
            type="button"
            onClick={copy}
            className="glass-card-soft flex min-h-12 items-center justify-center rounded-[var(--glass-radius-sm)] px-4 py-3 text-sm font-semibold text-[var(--medi-text-secondary)] transition-all hover:translate-y-[-1px]"
          >
            Copiar enlace
          </button>
        </div>
      </section>

      <Link
        to="/"
        aria-label="Volver al inicio"
        className="mt-10 block rounded-[var(--glass-radius-sm)] px-4 py-3 text-center text-sm text-[var(--medi-text-secondary)] transition-all hover:translate-y-[-1px]"
      >
        ‹ Volver al inicio
      </Link>
    </main>
  )
}
