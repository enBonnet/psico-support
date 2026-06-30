import { createFileRoute, redirect } from '@tanstack/react-router'

// ponytail: vanity shortcut — psicoayudaven.com/psicologos → remote directory.
// A shareable/marketing form (easier to say and type than the full directory
// path). Redirects to the filtered remote directory because remote (WhatsApp)
// is the on-demand modality — same remote-pinning decision as the immediate-
// support CTAs (CrisisBanner, ProCta, "Necesito Ayuda Ahora"). The full search
// object is passed explicitly so the destination URL matches the directory's
// normalized filter form (no second param-pop-in hop).
//
// Stays SSR (no ssr:false): the redirect fires server-side, so crawlers and
// link-preview scrapers follow it before any client JS runs. No component —
// beforeLoad throws before render, so there's nothing to render. (No 301 here:
// RedirectOptions in this TanStack version has no status field; the framework
// default status is used. Make it 301 only if SEO link-equity transfer
// becomes important — would need a worker-level Response.redirect in
// entry-server.tsx, like httpsRedirect.)
export const Route = createFileRoute('/psicologos')({
  beforeLoad: () => {
    throw redirect({
      to: '/ayuda/profesionales',
      search: {
        modality: 'remote',
        q: '',
        estado: '',
        ciudad: '',
        population: '',
        focusGroups: '',
        practiceAreas: '',
        page: 1,
      },
    })
  },
})
