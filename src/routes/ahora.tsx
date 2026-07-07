import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'
import { LifeBuoy, ExternalLink, RefreshCw } from 'lucide-react'
import { track, trackProContactAhora } from '#/lib/analytics-client'
import { notify } from '#/lib/notifications'
import { seoHead } from '#/lib/seo'
import { whatsappHref } from '#/lib/whatsapp'
import { pickRandomProfessional } from '#/server/professionals'

// ponytail: /ahora is the share-link "auto-connect to a professional" route.
// Landing's "Necesito ayuda ahora" button does the same pick-and-open inline;
// /ahora is that flow, as its own URL — useful for QR codes, ad campaigns, and
// any share surface where you want one tap to land in a WhatsApp conversation
// with a contactable psychologist (no directory, no choosing). Distinct from
// the vanity redirects (/psicologos, /ayudame, /ya) which 307 to the directory:
// /ahora renders and auto-connects instead of redirecting.
//
// The pick reuses pickRandomProfessional (modality='remote') — same pool the
// landing CTA and the directory's "Contactar al azar" use (verified +
// providesService + isContactableNow). WhatsApp is the only on-demand
// modality; in-person is brigades, not real-time.
//
// Events (gotcha #10 — entry-point isolation):
//   ahora_view           — /ahora mounted (funnel entry)
//   pro_contact_ahora    — WhatsApp opened (funnel success; param3=userId
//                          resolved server-side via enrichProContactEvent)
// Funnel attribution in SQL:
//   SELECT blob1, SUM(_sample_interval * double1)
//   FROM psico_events
//   WHERE blob1 IN ('ahora_view','pro_contact_ahora')
//   GROUP BY blob1
// Drop-off = ahora_view − pro_contact_ahora (includes "no pro contactable"
// and abandon). popup-blocked is NOT in drop-off: a blocked window.open falls
// back to same-tab navigation (window.location.assign), which still connects
// the user and still fires pro_contact_ahora. If the no-pro slice needs to be
// measured separately later, add an ahora_no_pro event — derive first,
// instrument if noisy.
export const Route = createFileRoute('/ahora')({
  // ponytail: CSR (ssr:false) — same selective-SSR pattern as the directory
  // and the auth routes (gotcha #6). The pick happens client-side and opens a
  // window via window.open, which doesn't exist during SSR. /ahora is a
  // destination route, not a share-preview surface (no OG/JSON-LD needs, unlike
  // /ayuda/profesionales/$id which must stay SSR). The RoutePending spinner
  // (router defaultPendingComponent) covers the first-paint gap before the
  // component mounts on hydrate.
  ssr: false,
  head: () =>
    seoHead({
      title: 'Conectándote con un profesional',
      description:
        'Te conectamos ahora mismo con un psicólogo verificado y disponible, por WhatsApp. Servicio gratuito y confidencial.',
      path: '/ahora',
    }),
  component: Ahora,
})

// ponytail: floor on the loading state so the message reads as intentional
// (not a flash before a redirect). 1.5s is long enough to register the
// "connecting" copy + the not-a-bot reassurance, short enough not to feel
// like a hang on top of the network round-trip.
const MIN_LOADING_MS = 1500

const LOADING_MESSAGES = [
  'Estamos conectándote con un profesional disponible…',
  'Buscando a alguien que pueda acompañarte ahora mismo…',
]

type Phase = 'loading' | 'success' | 'no-pro' | 'error'

function Ahora() {
  const navigate = useNavigate()
  const [phase, setPhase] = useState<Phase>('loading')
  const [messageIdx, setMessageIdx] = useState(0)
  // ponytail: keep the resolved WhatsApp href around so the success UI can show
  // a "Abrir WhatsApp" button too. window.open may be blocked by Safari/iOS
  // because navigating to /ahora isn't a user gesture — the on-page button is
  // a real tap, so it always works as the manual fallback.
  const [waHref, setWaHref] = useState<string | null>(null)
  // ponytail: drive the main effect off a retry counter instead of a stable
  // [navigate] dep. The error UI's "Reintentar" button increments this to
  // re-fire the effect; without it, the effect only ran on mount and retry()
  // was dead (phase reset to 'loading' but the pick never restarted).
  const [retryToken, setRetryToken] = useState(0)

  // ponytail: rotate the loading submessage every 900ms so the wait feels
  // active, not frozen. Two messages is enough — more would feel jittery.
  useEffect(() => {
    if (phase !== 'loading') return
    const t = setInterval(
      () => setMessageIdx((i) => (i + 1) % LOADING_MESSAGES.length),
      900,
    )
    return () => clearInterval(t)
  }, [phase])

  // ponytail: the main effect fires once per mount AND once per retry (the
  // retryToken dep drives re-runs). Track ahora_view up front so every visit
  // and every retry is measurable. Race the pick RPC against the MIN_LOADING_MS
  // floor so we never open WhatsApp before the loading message has had time
  // to register.
  //
  // Cancellation uses a ref (not a `let cancelled` boolean) because TS narrows
  // a `let cancelled = false` to literal `false` at the post-await check, which
  // both misleads and trips @typescript-eslint/no-unnecessary-condition. A ref
  // has a wider type, so the check reads honestly.
  //
  // StrictMode in dev mounts → unmounts → remounts; each remount re-runs the
  // effect (same as a retry). The cancelledRef guard ensures the superseded
  // run doesn't mutate state after the new one resolves.
  const cancelledRef = useRef(false)
  useEffect(() => {
    track({ event: 'ahora_view', category: 'public', route: '/ahora' })

    cancelledRef.current = false
    ;(async () => {
      const [picked] = await Promise.all([
        pickRandomProfessional({ data: { modality: 'remote' } }),
        new Promise((r) => setTimeout(r, MIN_LOADING_MS)),
      ])
      if (cancelledRef.current) return

      if (!picked) {
        // ponytail: nobody contactable right now (e.g. 3am). Fall back to the
        // autoayuda hub — matches the directory's "no disponibles" CTA and
        // gives the user a calm off-ramp instead of an error. The directory
        // itself stays reachable from /recursos. notify before the redirect so
        // the message lands even though we're navigating away.
        notify({
          type: 'info',
          title: 'Nadie disponible en este momento',
          body: 'Mientras esperas, te llevamos a herramientas de autocuidado que pueden ayudarte ahora.',
        })
        navigate({ to: '/recursos' })
        return
      }

      const href = whatsappHref(picked.whatsapp, picked.name)
      if (!href) {
        // ponytail: the pro's whatsapp column had no digits (shouldn't happen
        // — validated on save — but defensive). Surface as an error so the
        // user has a retry + directory link instead of a silent failure.
        setPhase('error')
        return
      }

      // ponytail: open WhatsApp automatically once the pick resolves. /ahora
      // has no user-gesture context (the user tapped a shared link/QR; by the
      // time JS runs + the 1.5s loading floor elapses, the gesture token has
      // expired, so popup blockers kill window.open). Two strategies:
      //   1. Try window.open(_blank) WITHOUT 'noopener' in the feature string
      //      — MDN documents that noopener makes window.open return null even
      //      on success (the browser severs the opener reference by returning
      //      null instead of a Window handle). We still want the security of
      //      noopener, so we manually set opened.opener = null after opening.
      //      This preserves /ahora on desktop, where Chrome is lenient about
      //      post-navigation popups.
      //   2. If window.open returns null (blocked — Safari/iOS, or the loading
      //      floor blew past the gesture grace window), fall back to same-tab
      //      window.location.assign. Same-tab nav can't be blocked and on
      //      mobile opens the WhatsApp app via the wa.me deep link regardless.
      let opened: Window | null = null
      try {
        opened = window.open(href, '_blank')
        if (opened) opened.opener = null
      } catch {
        opened = null
      }
      trackProContactAhora({ proId: picked.id, modality: 'remote' })
      setWaHref(href)
      setPhase('success')
      if (!opened) {
        // ponytail: popup blocked — navigate this tab to WhatsApp instead.
        // The connection still happened, so count it as funnel success above.
        window.location.assign(href)
      }
    })().catch(() => {
      if (!cancelledRef.current) setPhase('error')
    })

    return () => {
      cancelledRef.current = true
    }
  }, [retryToken, navigate])

  // ponytail: retry resets the loading state and bumps retryToken so the main
  // effect re-fires. Used by the error UI's "Reintentar" button.
  function retry() {
    setRetryToken((n) => n + 1)
    setPhase('loading')
    setMessageIdx(0)
  }

  return (
    <main className="page-wrap flex min-h-[100dvh] flex-col items-center justify-center py-10">
      {phase === 'loading' && (
        <div className="glass-card w-full max-w-md rounded-[var(--glass-radius)] px-6 py-10 text-center">
          <span
            className="mx-auto mb-6 block size-10 animate-spin rounded-full border-2 border-[var(--glass-tint-soft)] border-t-[var(--medi-secondary)]"
            role="status"
            aria-label="Conectando"
          />
          <p className="text-lg font-semibold text-[var(--medi-text-primary)]">
            {LOADING_MESSAGES[messageIdx]}
          </p>
          <p className="mt-3 text-sm text-[var(--medi-text-secondary)]">
            Una{' '}
            <span className="font-medium text-[var(--medi-text-primary)]">
              persona real
            </span>{' '}
            te atenderá por WhatsApp. Sin bots ni inteligencia artificial.
          </p>
        </div>
      )}

      {phase === 'success' && (
        <div className="glass-card w-full max-w-md rounded-[var(--glass-radius)] px-6 py-10 text-center">
          <span className="mx-auto mb-6 flex size-14 items-center justify-center rounded-full bg-[var(--medi-secondary)]/10 text-[var(--medi-secondary)]">
            <LifeBuoy aria-hidden="true" className="size-7" />
          </span>
          <p className="text-lg font-semibold text-[var(--medi-text-primary)]">
            Te conectamos con un profesional
          </p>
          <p className="mt-2 text-sm text-[var(--medi-text-secondary)]">
            Te llevamos a WhatsApp. Si no se abrió, tócalo aquí:
          </p>
          {waHref && (
            <a
              href={waHref}
              target="_blank"
              rel="noopener noreferrer"
              className="glass-primary mt-5 flex min-h-12 w-full items-center justify-center gap-2 rounded-[var(--glass-radius)] px-5 py-3 text-base font-semibold text-white transition-all hover:translate-y-[-1px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--medi-secondary)]"
            >
              <ExternalLink aria-hidden="true" className="size-5" />
              Abrir WhatsApp
            </a>
          )}
          <Link
            to="/ayuda/profesionales"
            search={{ modality: 'remote' }}
            className="mt-3 block text-sm font-medium text-[var(--medi-secondary)] underline-offset-2 hover:underline"
          >
            O ver todos los profesionales
          </Link>
        </div>
      )}

      {phase === 'no-pro' && (
        // ponytail: defensive — the redirect to /recursos fires from the effect
        // before this phase is ever set, but keep the UI honest if the redirect
        // is ever delayed.
        <div className="glass-card w-full max-w-md rounded-[var(--glass-radius)] px-6 py-10 text-center">
          <p className="text-lg font-semibold text-[var(--medi-text-primary)]">
            Nadie disponible en este momento
          </p>
          <p className="mt-2 text-sm text-[var(--medi-text-secondary)]">
            Te estamos llevando a las herramientas de autocuidado.
          </p>
          <Link
            to="/recursos"
            className="glass-primary mt-5 flex min-h-12 w-full items-center justify-center gap-2 rounded-[var(--glass-radius)] px-5 py-3 text-base font-semibold text-white transition-all hover:translate-y-[-1px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--medi-secondary)]"
          >
            Ir a autocuidado
          </Link>
        </div>
      )}

      {phase === 'error' && (
        <div className="glass-card w-full max-w-md rounded-[var(--glass-radius)] px-6 py-10 text-center">
          <p className="text-lg font-semibold text-[var(--medi-text-primary)]">
            Algo salió mal
          </p>
          <p className="mt-2 text-sm text-[var(--medi-text-secondary)]">
            No pudimos buscar un profesional disponible. Inténtalo de nuevo o
            explora el directorio.
          </p>
          <button
            type="button"
            onClick={retry}
            className="glass-primary mt-5 flex min-h-12 w-full items-center justify-center gap-2 rounded-[var(--glass-radius)] px-5 py-3 text-base font-semibold text-white transition-all hover:translate-y-[-1px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--medi-secondary)]"
          >
            <RefreshCw aria-hidden="true" className="size-5" />
            Reintentar
          </button>
          <Link
            to="/ayuda/profesionales"
            search={{ modality: 'remote' }}
            className="mt-3 block text-sm font-medium text-[var(--medi-secondary)] underline-offset-2 hover:underline"
          >
            Ver profesionales
          </Link>
        </div>
      )}
    </main>
  )
}
