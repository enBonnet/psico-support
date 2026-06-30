import { createFileRoute, redirect } from '@tanstack/react-router'
import { REMOTE_DIRECTORY_SEARCH } from './psicologos'

// ponytail: ultra-short vanity → remote directory, for urgent/crisis sharing
// ("psicoayudaven.com/ya"). Shares REMOTE_DIRECTORY_SEARCH with /psicologos so
// all three vanities stay bit-identical in destination. SSR so the redirect
// fires server-side for crawlers/scrapers; no component — beforeLoad throws
// before render.
export const Route = createFileRoute('/ya')({
  beforeLoad: () => {
    throw redirect({
      to: '/ayuda/profesionales',
      search: REMOTE_DIRECTORY_SEARCH,
    })
  },
})
