import { createFileRoute, Link, notFound } from '@tanstack/react-router'
import { Share2, ArrowLeft, MapPin, Users } from 'lucide-react'
import { getPublicProfessional } from '#/server/professionals'
import { notify } from '#/lib/notifications'
import { seoHead, profileJsonLd, SITE_URL } from '#/lib/seo'

export const Route = createFileRoute('/ayuda/profesionales/$id')({
  // ponytail: loader runs on SSR so crawlers + social scrapers get the pro's
  // real data in the head before any client fetch. notFound() → 404 for
  // unknown / unverified ids so a stale shared link never leaks state.
  loader: async ({ params }) => {
    const id = Number(params.id)
    if (!Number.isInteger(id) || id <= 0) throw notFound()
    const pro = await getPublicProfessional({ data: { id } })
    if (!pro) throw notFound()
    return pro
  },
  head: ({ loaderData }) => {
    // ponytail: guard for the notFound path — head can run with no data.
    const pro = loaderData
    if (!pro) {
      return seoHead({
        title: 'Profesional no encontrado',
        description: 'El perfil que buscas no está disponible.',
        path: '/ayuda/profesionales',
      })
    }
    const locationText =
      pro.country === 'Venezuela'
        ? [pro.ciudad, pro.estado].filter(Boolean).join(', ')
        : pro.country
    const modalityText =
      pro.modality === 'remote'
        ? 'Atención online'
        : pro.modality === 'both'
          ? 'Atención presencial y online'
          : 'Atención presencial'
    const popText =
      pro.population.length > 0
        ? `Atiende a: ${pro.population.join(', ')}.`
        : ''
    // ponytail: combine the two optional specialization axes (focus groups +
    // practice areas) into one SEO-friendly clause when either is present.
    const focusText = [...pro.focusGroups, ...pro.practiceAreas]
    const focusClause = focusText.length > 0 ? ` Enfoque: ${focusText.join(', ')}.` : ''
    const description = `${pro.name}, psicólogo verificado${
      locationText ? ` en ${locationText}` : ''
    }. ${modalityText}. ${popText}${focusClause} Contacto directo por WhatsApp.`.replace(
      '  ',
      ' ',
    )
    const path = `/ayuda/profesionales/${pro.id}`
    return seoHead({
      title: `${pro.name} — Psicólogo${locationText ? ` en ${locationText}` : ''}`,
      description,
      path,
      type: 'profile',
    })
  },
  component: ProfilePage,
})

function ProfilePage() {
  const pro = Route.useLoaderData()

  // ponytail: wa.me wants digits only (no +, no spaces). See directory card.
  const digits = pro.whatsapp.replace(/\D/g, '')
  const text = encodeURIComponent('Hola, te escribo por medio de psicoayudaven.')
  const href = `https://wa.me/${digits}?text=${text}`

  const locationText =
    pro.country === 'Venezuela'
      ? [pro.ciudad, pro.estado].filter(Boolean).join(', ')
      : pro.country
  const modalityText =
    pro.modality === 'remote'
      ? 'Atención online'
      : pro.modality === 'both'
        ? 'Atención presencial y online'
        : 'Atención presencial'

  // ponytail: Web Share API on mobile (native sheet) → clipboard fallback for
  // desktop. navigator.share rejects on cancel; treat that as a no-op, not an
  // error. The shared URL is the current profile, which carries the OG tags.
  async function onShare() {
    const url = window.location.href
    const shareTitle = `${pro.name} — Psicólogo en psicoayudaven`
    // ponytail: Web Share API isn't in Firefox/older browsers at runtime, but
    // the DOM lib types navigator.share as always-present — feature-detect
    // anyway and fall back to clipboard.
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (navigator.share) {
      try {
        await navigator.share({ title: shareTitle, text: shareTitle, url })
        return
      } catch {
        return // user dismissed the sheet
      }
    }
    try {
      await navigator.clipboard.writeText(url)
      notify({
        type: 'success',
        title: 'Enlace copiado',
        body: 'Pégalo donde quieras compartir el perfil.',
      })
    } catch {
      notify({
        type: 'error',
        title: 'No se pudo copiar',
        body: 'Copia la dirección desde el navegador.',
      })
    }
  }

  return (
    <main className="page-wrap flex min-h-[100dvh] flex-col py-4">
      {/* ponytail: JSON-LD rendered inline (not via head meta) because the
          head() meta type is raw HTMLMetaAttributes and rejects the
          'script:ld+json' descriptor at the type level, even though TanStack
          supports it at runtime. Google reads JSON-LD from <body> fine. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(
            profileJsonLd({
              name: pro.name,
              url: `${SITE_URL}/ayuda/profesionales/${pro.id}`,
              locality: pro.ciudad ?? pro.estado,
              country: pro.country,
              populations: pro.population,
              focusGroups: pro.focusGroups,
              practiceAreas: pro.practiceAreas,
            }),
          ),
        }}
      />
      <Link
        to="/ayuda/profesionales"
        search={{ modality: pro.modality === 'remote' ? 'remote' : 'in_person' }}
        className="inline-flex items-center gap-1 self-start py-2 text-base font-medium text-[var(--medi-secondary)]"
        aria-label="Volver al directorio"
      >
        <ArrowLeft className="size-4" /> Directorio
      </Link>

      <div className="glass-card mt-2 p-5">
        <div className="flex items-center gap-2">
          <span className="glass-pill px-2.5 py-1 text-xs font-semibold text-[var(--medi-primary)]">
            Confirmado
          </span>
          <span
            className={`glass-pill inline-flex items-center gap-1 px-2 py-1 text-xs font-medium ${
              pro.available ? 'text-green-700' : 'text-amber-700'
            }`}
          >
            <span
              className={`size-2 rounded-full ${pro.available ? 'bg-green-500' : 'bg-amber-500'}`}
            />
            {pro.available ? 'En línea' : 'No conectado'}
          </span>
        </div>

        <h1 className="mt-3 text-2xl font-bold leading-tight text-[var(--medi-text-primary)]">
          {pro.name}
        </h1>
        <p className="mt-1 text-sm font-medium text-[var(--medi-secondary)]">
          Psicólogo verificado
        </p>

        <dl className="mt-4 flex flex-col gap-2 text-sm text-[var(--medi-text-secondary)]">
          {locationText && (
            <div className="flex items-center gap-2">
              <MapPin className="size-4 shrink-0 text-[var(--medi-secondary)]" />
              <dd>{locationText}</dd>
            </div>
          )}
          <div className="flex items-center gap-2">
            <Users className="size-4 shrink-0 text-[var(--medi-secondary)]" />
            <dd>{modalityText}</dd>
          </div>
          {pro.population.length > 0 && (
            <div className="flex items-center gap-2">
              <Users className="size-4 shrink-0 text-[var(--medi-secondary)]" />
              <dd>Atiende a: {pro.population.join(', ')}</dd>
            </div>
          )}
          {pro.focusGroups.length > 0 && (
            <div className="flex items-center gap-2">
              <Users className="size-4 shrink-0 text-[var(--medi-secondary)]" />
              <dd>Población específica: {pro.focusGroups.join(', ')}</dd>
            </div>
          )}
          {pro.practiceAreas.length > 0 && (
            <div className="flex items-center gap-2">
              <Users className="size-4 shrink-0 text-[var(--medi-secondary)]" />
              <dd>Área de intervención: {pro.practiceAreas.join(', ')}</dd>
            </div>
          )}
        </dl>
      </div>

      <div className="mt-4 flex flex-col gap-2">
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="flex min-h-12 w-full items-center justify-center rounded-[var(--glass-radius-sm)] bg-green-600 px-4 py-3 text-base font-semibold !text-white transition-all hover:translate-y-[-1px] hover:bg-green-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--medi-secondary)]"
        >
          Contactar por WhatsApp
        </a>
        <button
          type="button"
          onClick={onShare}
          className="glass-card-soft flex min-h-12 w-full items-center justify-center gap-2 rounded-[var(--glass-radius-sm)] px-4 py-3 text-base font-semibold text-[var(--medi-primary)] transition-all hover:translate-y-[-1px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--medi-secondary)]"
        >
          <Share2 className="size-5" /> Compartir perfil
        </button>
      </div>
    </main>
  )
}
