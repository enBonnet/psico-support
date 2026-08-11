import { createFileRoute, Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { HeartPulse, LifeBuoy, Stethoscope, UserCheck } from 'lucide-react'
import { track, trackProContactHelpNow } from '#/lib/analytics-client'
import { CrisisBanner } from '#/components/crisis-banner'
import { notify } from '#/lib/notifications'
import { seoHead, organizationJsonLd, websiteJsonLd } from '#/lib/seo'
import { InstallCard } from '#/lib/install-prompt'
import { whatsappHref } from '#/lib/whatsapp'
import {
  countVerifiedProfessionals,
  getCurrentUser,
  getMyProfessional,
  pickRandomProfessional,
} from '#/server/professionals'

export const Route = createFileRoute('/')({
  // ponytail: loader declared before head — declaring head first collapses
  // the route's generic inference (gotcha #3). Landing stays SSR (default),
  // so the count lands in the initial HTML: no flash, SEO-friendly.
  loader: async () => ({ count: await countVerifiedProfessionals() }),
  head: () =>
    seoHead({
      // ponytail: title is ignored for path '/' (seoHead falls back to
      // SITE_DEFAULT_TITLE — "Psico Ayudas · Red de apoyo gratuito
      // ante la contingencia"), but kept here as a self-documenting hint and
      // for callers that read this route's head config directly.
      title:
        'Psico Ayudas · Red de apoyo gratuito ante la contingencia',
      // ponytail: meta description must fit within Google's mobile SERP
      // preview (~3 lines, ~120 chars). The previous versions (189 chars,
      // then 138 chars) still exceeded the mobile 3-line limit. This version
      // is ~103 chars — safely within mobile, and keeps the key search-intent
      // terms (apoyo psicológico, gratuito, Latinoamérica, psicólogos verificados,
      // WhatsApp, confidencial).
      description:
        'Apoyo psicológico gratuito en Latinoamérica. Psicólogos verificados por WhatsApp. Servicio confidencial.',
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
  const [picking, setPicking] = useState(false)
  // ponytail: client-side session read (not the SSR loader) so the landing HTML
  // stays generic + auth-free for crawlers/anonymous visitors. Only after hydrate
  // does the "Soy psicólogo" button swap to a panel/completar shortcut for a
  // signed-in pro. Mirrors the cuenta.tsx three-way branch. A signed-in pro sees
  // the generic button for the brief hydrate→RPC window, then it swaps.
  const { data: me } = useQuery({
    queryKey: ['me'],
    queryFn: () => getCurrentUser(),
  })
  const { data: pro } = useQuery({
    queryKey: ['my-professional'],
    queryFn: () => getMyProfessional(),
    enabled: !!me,
  })
  // ponytail: "ready" matches buildProfessionalWhere's public-surface gate
  // (verifiedStatus === 'verified' && providesService === true). Anything else
  // (pending/rejected/disabled, or a content-only pro) routes to completar,
  // whose beforeLoad bounces an existing pro row to the panel anyway.
  const proReady =
    !!pro && pro.verifiedStatus === 'verified' && pro.providesService === true
  // ponytail: landing_view fires once per mount (CSR hydrate), not on every
  // SSR render — the component effect runs only client-side. route is implicit
  // (the helper defaults to location.pathname).
  useEffect(() => {
    track({ event: 'landing_view', category: 'public' })
  }, [])

  // ponytail: the primary CTA used to deep-link to the directory, which lost
  // ~96% of the funnel (500 landings → 20 contacts). Now it auto-picks a pro
  // who is contactable right now (same pool as the directory's "Contactar al
  // azar") and drops the user straight into a WhatsApp chat — one tap from the
  // hero. If nobody is contactable at the moment (e.g. 3am), fall back to the
  // directory via a notify + navigate so the user still has a path. modality
  // is 'remote' — WhatsApp is the only on-demand modality (in-person = brigades).
  async function helpNow() {
    if (picking) return
    // ponytail: fire intent up front so the funnel is measurable end-to-end:
    // cta_click(help_now) = tapped the button; pro_contact_help_now = WhatsApp
    // opened; cta_click(help_now_fallback) = no pro contactable. The gap
    // between help_now and (pro_contact_help_now + help_now_fallback) is the
    // error/abandon slice.
    track({ event: 'cta_click', category: 'public', param1: 'help_now' })
    setPicking(true)
    try {
      const picked = await pickRandomProfessional({
        data: { modality: 'remote' },
      })
      if (!picked) {
        notify({
          type: 'info',
          title: 'Nadie disponible en este momento',
          body: 'Te llevamos al directorio para que veas horarios y escribas cuando quieras.',
        })
        track({
          event: 'cta_click',
          category: 'public',
          param1: 'help_now_fallback',
        })
        // ponytail: window.location so it works regardless of router state —
        // this is a one-shot escape from the SSR landing into the CSR
        // directory, not an in-app navigation that needs to preserve history.
        window.location.assign('/ayuda/profesionales?modality=remote')
        return
      }
      const href = whatsappHref(picked.whatsapp, picked.name)
      if (!href) {
        notify({
          type: 'error',
          title: 'Algo salió mal',
          body: 'No pudimos abrir WhatsApp. Inténtalo de nuevo.',
        })
        return
      }
      // ponytail: fire success only once we know WhatsApp can actually open —
      // a null href above returns early, so reaching here means we have a real
      // wa.me link. Counting it before the null check would overstate the
      // success metric.
      trackProContactHelpNow({ proId: picked.id, modality: 'remote' })
      window.open(href, '_blank', 'noopener,noreferrer')
    } catch {
      notify({
        type: 'error',
        title: 'Algo salió mal',
        body: 'No pudimos buscar un profesional. Inténtalo de nuevo.',
      })
    } finally {
      setPicking(false)
    }
  }
  return (
    <main className="page-wrap flex min-h-[100dvh] flex-col justify-between py-8">
      <header className="text-center">
        <p className="section-kicker">Latinoamérica</p>
        <h1 className="mt-2 text-3xl font-bold leading-tight text-[var(--medi-primary)] sm:text-4xl">
          Apoyo psicológico ante los terremotos
        </h1>
        <div className="section-underline mx-auto mt-3" />
        <p className="mt-4 text-base text-[var(--medi-text-secondary)]">
          Red gratuita y confidencial para personas afectadas por la
          contingencia.
        </p>
        {claim >= STEP && (
          <p className="mt-1 text-sm font-medium text-[var(--medi-secondary)]">
            Más de {claim} profesionales en la red
          </p>
        )}
      </header>

      {/* ponytail: C2 (healthcare-ui audit) — crisis escape hatch on the
          highest-traffic page. A user in acute suicidal crisis landing on "/"
          needs an immediate "¿Es una emergencia?" path before any CTA. The
          banner pins modality=remote so a person in distress never hits an
          empty in-person list. Sits directly below the hero (above the CTAs)
          so it's visible on first paint without scrolling on most phones. */}
      <CrisisBanner />

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
        {/* ponytail: "Ahora" = immediate. Auto-picks a professional who is
          contactable right now and opens WhatsApp directly — one tap from the
          hero instead of funneling through the directory (which was bleeding
          ~96% of landings). The directory stays reachable via the "ver todos"
          link below this CTA and via the Ayuda nav tab.
          Rendered as a real <a> (href to the directory) so it still works
          without JS / before hydration — the landing is SSR'd, so the hero
          ships as real HTML. helpNow intercepts the click to run the auto-pick
          and preventDefault on success; if JS is off or hydration hasn't run,
          the link is a plain navigation to the directory (the same URL
          helpNow itself falls back to when no pro is contactable). */}
        <a
          href="/ayuda/profesionales?modality=remote"
          onClick={(e) => {
            // ponytail: only intercept as a JS click (left/middle click on a
            // real anchor still works for open-in-new-tab etc.). Modifier
            // clicks are the browser's to handle.
            if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return
            e.preventDefault()
            helpNow()
          }}
          aria-disabled={picking}
          className="glass-primary flex min-h-16 cursor-pointer items-center justify-center gap-2 rounded-[var(--glass-radius)] px-6 py-5 text-lg font-semibold text-white transition-all hover:translate-y-[-1px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--medi-secondary)] aria-disabled:cursor-progress aria-disabled:opacity-80"
        >
          <LifeBuoy aria-hidden="true" className="size-5" />
          {picking ? 'Buscando un profesional…' : 'Necesito ayuda ahora'}
        </a>
        {/* ponytail: secondary escape hatch for users who want to browse / pick
          themselves. Kept small so the auto-pick stays the dominant CTA, but
          present so the directory is never more than one tap away. */}
        <Link
          to="/ayuda/profesionales"
          search={{ modality: 'remote' }}
          onClick={() =>
            track({
              event: 'cta_click',
              category: 'public',
              param1: 'help_now_browse',
            })
          }
          className="self-center text-sm font-medium text-[var(--medi-secondary)] underline-offset-2 hover:underline"
        >
          O ver todos los profesionales
        </Link>
        {/* ponytail: third primary CTA — for users who know the specific area
          they need (duelo, trauma, suicidio, etc.). Routes to a category
          picker that deep-links into the directory pre-filtered. Styled like
          the autocuidado / soy-psicólogo cards (not the dominant auto-pick)
          so "ayuda ahora" stays the top-of-funnel default for the unsure
          majority, while giving the self-aware minority a direct path. */}
        <Link
          to="/ayuda/especifica"
          onClick={() =>
            track({
              event: 'cta_click',
              category: 'public',
              param1: 'help_especifica',
            })
          }
          className="glass-card-soft flex min-h-16 items-center justify-center gap-2 rounded-[var(--glass-radius)] px-6 py-5 text-lg font-semibold text-[var(--medi-primary)] transition-all hover:translate-y-[-1px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--medi-secondary)]"
        >
          <LifeBuoy aria-hidden="true" className="size-5" />
          Necesito ayuda específica
        </Link>
        <Link
          to="/recursos"
          onClick={() =>
            track({
              event: 'cta_click',
              category: 'public',
              param1: 'recursos',
            })
          }
          className="glass-card-soft flex min-h-16 items-center justify-center gap-2 rounded-[var(--glass-radius)] px-6 py-5 text-lg font-semibold text-[var(--medi-primary)] transition-all hover:translate-y-[-1px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--medi-secondary)]"
        >
          <HeartPulse aria-hidden="true" className="size-5" />
          Herramientas de autocuidado
        </Link>
        {/* ponytail: pro-aware CTA. Anonymous/non-pro visitors get the
            registration path. A signed-in pro who is verified+providing gets a
            shortcut to their panel; any other pro state (pending/rejected/
            disabled/content-only) is nudged to completar, whose beforeLoad
            bounces an existing pro row to the panel. Label/destination resolve
            client-side after hydrate (see the useQuery block above); until then
            the generic registration button renders. Two explicit <Link> branches
            keep TanStack Router's `to` literal-typed. */}
        {pro ? (
          proReady ? (
            <Link
              to="/profesional/panel"
              onClick={() =>
                track({
                  event: 'cta_click',
                  category: 'public',
                  param1: 'pro_panel',
                })
              }
              className="glass-card-soft flex min-h-16 items-center justify-center gap-2 rounded-[var(--glass-radius)] px-6 py-5 text-lg font-semibold text-[var(--medi-primary)] transition-all hover:translate-y-[-1px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--medi-secondary)]"
            >
              <Stethoscope aria-hidden="true" className="size-5" />
              Ir a mi panel profesional
            </Link>
          ) : (
            <Link
              to="/profesional/completar"
              onClick={() =>
                track({
                  event: 'cta_click',
                  category: 'public',
                  param1: 'pro_completar',
                })
              }
              className="glass-card-soft flex min-h-16 items-center justify-center gap-2 rounded-[var(--glass-radius)] px-6 py-5 text-lg font-semibold text-[var(--medi-primary)] transition-all hover:translate-y-[-1px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--medi-secondary)]"
            >
              <Stethoscope aria-hidden="true" className="size-5" />
              Completar mi perfil profesional
            </Link>
          )
        ) : (
          <Link
            to="/profesional/registro"
            onClick={() =>
              track({
                event: 'cta_click',
                category: 'public',
                param1: 'ofrezco_ayuda',
              })
            }
            className="glass-card-soft flex min-h-16 items-center justify-center gap-2 rounded-[var(--glass-radius)] px-6 py-5 text-lg font-semibold text-[var(--medi-primary)] transition-all hover:translate-y-[-1px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--medi-secondary)]"
          >
            <Stethoscope aria-hidden="true" className="size-5" />
            Soy psicólogo, quiero ayudar
          </Link>
        )}
      </nav>

      <InstallCard />

      <Link
        to="/como-funciona"
        aria-label="Cómo funciona Psico Ayudas"
        className="glass-card-soft mt-10 block rounded-[var(--glass-radius-sm)] px-4 py-3 text-center text-sm text-[var(--medi-text-secondary)] transition-all hover:translate-y-[-1px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--medi-secondary)]"
      >
        ¿Primera vez aquí?{' '}
        <span className="font-medium text-[var(--medi-secondary)]">
          Cómo funciona
        </span>
      </Link>

      <Link
        to="/acerca-de"
        aria-label="Acerca de Psico Ayudas"
        className="glass-card-soft mt-2 block rounded-[var(--glass-radius-sm)] px-4 py-3 text-center text-sm text-[var(--medi-text-secondary)] transition-all hover:translate-y-[-1px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--medi-secondary)]"
      >
        Servicio gratuito y confidencial.{' '}
        <span className="font-medium text-[var(--medi-secondary)]">
          Acerca de Psico Ayudas
        </span>
      </Link>

      <Link
        to="/demo"
        aria-label="Tour guiado y manual de usuario"
        className="glass-card-soft mt-2 block rounded-[var(--glass-radius-sm)] px-4 py-3 text-center text-sm text-[var(--medi-text-secondary)] transition-all hover:translate-y-[-1px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--medi-secondary)]"
      >
        ¿Quieres ver cómo funciona?{' '}
        <span className="font-medium text-[var(--medi-secondary)]">
          Tour guiado y manual
        </span>
      </Link>

      {/* ponytail: aviso corto de transición hacia el modelo de acompañamiento
          voluntario transfronterizo. No reescribe el copy de la landing; solo
          añade un enlace discreto al marco de voluntariado. */}
      <Link
        to="/voluntariado"
        aria-label="Marco de voluntariado"
        className="glass-card-soft mt-2 block rounded-[var(--glass-radius-sm)] px-4 py-3 text-center text-sm text-[var(--medi-text-secondary)] transition-all hover:translate-y-[-1px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--medi-secondary)]"
      >
        Acompañamiento voluntario transfronterizo.{' '}
        <span className="font-medium text-[var(--medi-secondary)]">
          Conoce el marco
        </span>
      </Link>

      {/* ponytail: enlace a la política de datos desde el punto de entrada
          principal — consistente con /acerca-de y /como-funciona, donde la
          política también es alcanzable. */}
      <Link
        to="/privacidad"
        aria-label="Política de datos"
        className="glass-card-soft mt-2 block rounded-[var(--glass-radius-sm)] px-4 py-3 text-center text-sm text-[var(--medi-text-secondary)] transition-all hover:translate-y-[-1px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--medi-secondary)]"
      >
        Cómo tratamos tu información.{' '}
        <span className="font-medium text-[var(--medi-secondary)]">
          Política de datos
        </span>
      </Link>

      {/* ponytail: Organization + WebSite JSON-LD. Rendered inline in the body
          (not head()) because TanStack's head() meta type rejects
          'script:ld+json' at the type level (gotcha #3) — Google reads body
          JSON-LD fine. Unlocks sitelinks search box + Knowledge Graph. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(organizationJsonLd()),
        }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteJsonLd()) }}
      />
    </main>
  )
}
