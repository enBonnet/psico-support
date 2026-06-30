import { createFileRoute, redirect } from '@tanstack/react-router'
import { REMOTE_DIRECTORY_SEARCH } from './psicologos'

// ponytail: short vanity → remote directory. Shares REMOTE_DIRECTORY_SEARCH
// with /psicologos so all three vanities (/psicologos, /ayudame, /ya) stay
// bit-identical in destination. "Ayúdame" reads as a sibling of /ayuda.
// SSR so the redirect fires server-side for crawlers/scrapers; no component —
// beforeLoad throws before render.
export const Route = createFileRoute('/ayudame')({
  beforeLoad: () => {
    throw redirect({
      to: '/ayuda/profesionales',
      search: REMOTE_DIRECTORY_SEARCH,
    })
  },
})
