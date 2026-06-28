// ponytail: hand-rolled runtime service worker (stale-while-revalidate).
// vite-plugin-pwa's SW generation doesn't fire under Vite 8 +
// @cloudflare/vite-plugin's named ssr environment, so we ship a tiny SW
// directly. No precache of build-hashed assets (would need build-time
// injection); instead we cache same-origin GETs as they're requested, so any
// page/asset the user has visited works offline. Cross-origin (Google Fonts)
// is intentionally skipped — text stays readable on system fonts when offline.
//
// CACHE mirrors the app version in package.json. Bump BOTH together (here +
// package.json `version`) when you must force-invalidate every installed PWA
// client at once — e.g. a release with breaking server/API/DB changes where
// an old cached client must not run against the new backend. For backward-
// compatible releases, leave it: SWR + skipWaiting refreshes content within
// one reload.
const CACHE = 'psico-support-1.0.0'

self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys()
      await Promise.all(
        keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)),
      )
      await self.clients.claim()
    })(),
  )
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return
  const sameOrigin = new URL(req.url).origin === self.location.origin
  if (!sameOrigin) return

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE)
      const cached = await cache.match(req)
      const network = fetch(req)
        .then((res) => {
          if (res && res.status === 200) cache.put(req, res.clone())
          return res
        })
        .catch(() => cached)
      return cached || network
    })(),
  )
})
