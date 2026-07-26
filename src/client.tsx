// Sentry initialization should be imported first!
import './instrument.client'

import { StartClient } from '@tanstack/react-start/client'
import { StrictMode, startTransition } from 'react'
import { hydrateRoot } from 'react-dom/client'

// Vite emits hashed chunk URLs (/assets/<chunk>-<hash>.js). After a deploy,
// any user holding stale HTML (cached by the SW, a CDN, or just an open tab)
// tries to lazy-import a chunk that 404s on the origin — surfacing as
// "Failed to fetch dynamically imported module: ...". Left alone, the user is
// stuck on a broken route until they hard-reload (WEB-B). Recover by forcing
// a single reload, which re-fetches fresh HTML with current chunk hashes. The
// sessionStorage guard prevents a reload loop if the fresh HTML *also* fails
// (e.g. a broken deploy).
const STALE_CHUNK_RELOAD_KEY = '__staleChunkReloaded'
const STALE_CHUNK_RE =
  /Failed to fetch dynamically imported module|Importing a module script failed/

function handleStaleChunk(err: unknown) {
  const msg = err instanceof Error ? err.message : String(err)
  if (!STALE_CHUNK_RE.test(msg)) return
  if (typeof window === 'undefined' || typeof sessionStorage === 'undefined')
    return
  if (sessionStorage.getItem(STALE_CHUNK_RELOAD_KEY)) return
  sessionStorage.setItem(STALE_CHUNK_RELOAD_KEY, '1')
  window.location.reload()
}

if (typeof window !== 'undefined') {
  window.addEventListener('error', (e) => {
    handleStaleChunk(e.error)
  })
  window.addEventListener('unhandledrejection', (e) => {
    handleStaleChunk(e.reason)
  })
  // After a successful reload (fresh HTML + chunks all imported), clear the
  // guard so a *future* deploy can also be recovered, not just the next one.
  window.addEventListener('load', () => {
    sessionStorage.removeItem(STALE_CHUNK_RELOAD_KEY)
  })
}

startTransition(() => {
  hydrateRoot(
    document,
    <StrictMode>
      <StartClient />
    </StrictMode>,
  )
})
