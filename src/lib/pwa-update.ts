// ponytail: PWA update orchestration. Replaces the raw
// `navigator.serviceWorker.register('/sw.js')` that lived in __root.tsx.
//
// Why this exists: after a deploy that bumped build hashes, an open tab is
// still running OLD JavaScript that lazy-imports /assets/*.{js} URLs which
// no longer exist on the origin. TanStack Router's preload throws, the
// dynamic-import error fires before React mounts the error boundary, and
// the user sees a blank page / bare 500. The SW (public/sw.js) intercepts
// the dead-chunk fetch itself and serves the Spanish fallback. This module
// is the CLIENT-side complement: it makes sure the new SW activates ASAP
// and that the page reloads onto the new build the moment it does.
//
// Three behaviors, all silent (no prompt, no toast — chosen for a crisis-
// response app where prompts add friction):
//
//   1. REGISTER with `updateViaCache: 'none'` — the byte-comparison for
//      `sw.js` always goes to the network, never an HTTP-cached copy. Without
//      this, a stale `sw.js` can linger behind a CDN/browser cache and the
//      update is delayed by hours.
//   2. CONTROLLERCHANGE → reload, but ONLY when the controller is being
//      REPLACED (not the very first install, where there was no prior
//      controller — reloading there would just re-fetch the same shell).
//      The new SW has already precached the new shell via skipWaiting(), so
//      the reload lands on the fresh build.
//   3. FOREGROUND POLL — on `visibilitychange → visible`, call
//      `registration.update()` so an installed home-screen PWA checks for a
//      new build every time it's opened. The browser's default check is up
//      to 24h; this brings propagation down to "next open".
//   4. CHUNK-ERROR RECOVERY — a capture-phase window 'error' listener
//      detects dynamic-import failures ("Failed to fetch dynamically
//      imported module" / "error loading dynamically imported module") and
//      reloads ONCE. Guarded by sessionStorage so a genuinely broken build
//      doesn't loop forever.
//
// Ceiling: if we ever need prompt-based UX (toast with a "Recargar" button),
// swap the controllerchange handler for an event emission + UI surface. The
// detection logic stays the same.

// ponytail: error-message substrings that indicate a deploy-rotted dynamic
// import. The list is deliberately permissive (substring match) — false
// positives here just trigger a guarded one-time reload, while a false
// negative strands the user on a blank page after a deploy. Patterns:
//   - "Failed to fetch dynamically imported module" — Chrome/Edge, JS chunk
//   - "error loading dynamically imported module" — Firefox, JS chunk
//   - "Importing a module script failed" — Safari, JS chunk
//   - "Unable to preload CSS for" — Vite's __vitePreload helper, CSS chunk
//     (Vite fetches a chunk's CSS deps before evaluating the JS; if the
//     CSS URL is dead post-deploy, the import rejects with this message
//     instead of the JS-module message above)
//   - "Failed to load module script" — defensive catch-all for MIME-mismatch
//     and other module-script load failures (e.g. if the SW or origin ever
//     serves the wrong Content-Type for a hashed asset)
const CHUNK_ERR_PATTERNS = [
  'Failed to fetch dynamically imported module',
  'error loading dynamically imported module',
  'Importing a module script failed',
  'Unable to preload CSS for',
  'Failed to load module script',
]

const RELOADED_ONCE_KEY = '__pwa_reloaded_once'

function isChunkLoadError(error: unknown): boolean {
  if (!error) return false
  const msg =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : ''
  if (!msg) return false
  return CHUNK_ERR_PATTERNS.some((p) => msg.includes(p))
}

function reloadOnceForChunkError() {
  try {
    if (sessionStorage.getItem(RELOADED_ONCE_KEY)) return
    sessionStorage.setItem(RELOADED_ONCE_KEY, '1')
  } catch {
    // sessionStorage can throw in private mode / sandboxed iframes — fall
    // through to reload anyway, since the worst case is one extra reload.
  }
  // location.reload(true) is deprecated; plain reload is the modern reload.
  // Bust the HTTP cache on sw.js via the SW update flow above.
  window.location.reload()
}

export function registerPwaUpdate() {
  if (!('serviceWorker' in navigator)) return

  // Capture-phase so we see the error before React's error boundary can
  // swallow it (dynamic-import failures reject at import time, before any
  // React tree is mounted, so the boundary wouldn't catch them anyway —
  // but capture is still correct/defensive here).
  window.addEventListener(
    'error',
    (event) => {
      if (isChunkLoadError(event.error)) {
        reloadOnceForChunkError()
      }
    },
    true,
  )

  // Also catch the unhandledrejection path — some bundlers surface the
  // dynamic-import failure as a rejected promise rather than a sync error.
  window.addEventListener('unhandledrejection', (event) => {
    if (isChunkLoadError(event.reason)) {
      reloadOnceForChunkError()
    }
  })

  // ponytail: Vite's canonical preload-failure signal. Vite wraps dynamic
  // imports in __vitePreload, which fetches the chunk's CSS deps before
  // evaluating the JS; if any dep URL is dead post-deploy, Vite dispatches
  // `vite:preloadError` on window (in addition to rejecting the import
  // promise, which the listeners above already cover). Listening here is
  // more reliable than message-string matching because the event fires
  // even when the rejection is swallowed by a framework's error boundary
  // before reaching `unhandledrejection`. See vitejs/vite#18046.
  window.addEventListener('vite:preloadError', () => {
    reloadOnceForChunkError()
  })

  // Reload only on controller REPLACEMENT, not the first install. Before
  // this listener fires, navigator.serviceWorker.controller is null on the
  // very first navigation (no prior SW); once a SW claims the client, it
  // becomes non-null. If it CHANGES from one SW to another, that's an
  // update → reload.
  let firstController = navigator.serviceWorker.controller
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    const next = navigator.serviceWorker.controller
    if (firstController && next && firstController !== next) {
      // Clear the chunk-error guard so the post-reload page can use it again
      // if the new build itself turns out broken on a future deploy.
      try {
        sessionStorage.removeItem(RELOADED_ONCE_KEY)
      } catch {
        /* ignore */
      }
      window.location.reload()
    }
    firstController = next
  })

  navigator.serviceWorker
    .register('/sw.js', { updateViaCache: 'none' })
    .then((registration) => {
      // Foreground poll: every time the tab becomes visible (app brought
      // back from background, or home-screen PWA reopened), check for a new
      // SW. Browser default is up to 24h; this makes propagation "next open".
      const checkForUpdate = () => {
        registration.update().catch(() => {
          /* update() rejects on offline/transport errors — ignore, next
             visibilitychange will retry. Never throw on PWA plumbing. */
        })
      }
      if (document.visibilityState === 'visible') checkForUpdate()
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') checkForUpdate()
      })
    })
    .catch(() => {
      /* SW registration failures are non-fatal — the app still works as a
         plain website, just without offline support. Stay silent. */
    })
}
