import { createFileRoute } from '@tanstack/react-router'

import { getR2 } from '#/db'
import { AVATAR_KEY_PREFIX } from '#/server/professionals'

// ponytail: public R2 read path for professional avatars. Mirrors /media/audio/$
// (NOT /media/certificate/$): avatars are public-by-intent (shown on the public
// profile), so the route is unauthed and relies on UUID-key unguessability — a
// guessed/brute-forced URL simply 404s at the R2.get. Keys are write-once (a
// replace uploads a NEW uuid key), but a WITHDRAW path exists (removeMyAvatar
// deletes the R2 object; a replace deletes the old key), so Cache-Control is
// 24h — NOT immutable — bounding replay-after-withdrawal. The SW cooperates
// (gotcha #7): /media/avatar/* rides the network-first default and a 404/410
// evicts its cached copy, so a withdrawn photo stops serving once the device
// is online. Important in this context: a psychologist pulling their face off
// a public directory may have safety reasons.
export const Route = createFileRoute('/media/avatar/$')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url)
        const prefix = '/media/avatar/'
        const idx = url.pathname.indexOf(prefix)
        if (idx < 0) return new Response('Bad request', { status: 400 })
        let suffix = url.pathname.slice(idx + prefix.length)
        try {
          suffix = decodeURIComponent(suffix)
        } catch {
          return new Response('Bad request', { status: 400 })
        }
        // ponytail: block path traversal out of the avatars/ namespace.
        if (!suffix || suffix.includes('..')) {
          return new Response('Bad request', { status: 400 })
        }
        const key = `${AVATAR_KEY_PREFIX}${suffix}`

        const obj = await getR2().get(key)
        if (!obj) {
          return new Response('Not found', { status: 404 })
        }
        const headers = new Headers()
        headers.set(
          'Content-Type',
          obj.httpMetadata?.contentType ?? 'application/octet-stream',
        )
        headers.set('Cache-Control', 'public, max-age=86400')
        return new Response(obj.body, { headers })
      },
    },
  },
})
