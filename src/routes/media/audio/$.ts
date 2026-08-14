import { createFileRoute } from '@tanstack/react-router'

import { getR2 } from '#/db'
import { STORY_KEY_PREFIX } from '#/server/audio-stories'

// ponytail: public R2 read path for audio stories. Mirrors the api/auth/$
// server-route convention. No auth — content is public by intent; the
// moderation gate is upstream in src/server/audio-stories.ts (only approved
// clips' keys ever leave the server, and the UUID suffixes are unguessable, so
// a guessed/brute-forced URL simply 404s at the R2.get). Keys are write-once
// (a re-record creates a NEW uuid key), but clips can be DELETED
// (deleteMyStory drops the row + the R2 object), so Cache-Control is 24h —
// NOT immutable — bounding replay-after-delete. The SW cooperates (gotcha #7):
// /media/audio/* rides the network-first default, and a 404/410 evicts the
// SW's cached copy, so a deleted clip stops replaying once the device is
// online. A device that is offline keeps replaying its cached copy until it's
// next online — the inherent limit of offline replay, not a cache bug.
// Offline replay itself is desirable (a story heard once replays offline at
// 3am); revisit max-age if video lands and payload sizes grow.
export const Route = createFileRoute('/media/audio/$')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url)
        const prefix = '/media/audio/'
        const idx = url.pathname.indexOf(prefix)
        if (idx < 0) return new Response('Bad request', { status: 400 })
        // ponytail: pathname is already URL-decoded by the Request parser, but
        // be defensive — an encoded uuid separator would be unusual yet cheap
        // to handle. decodeURIComponent can throw on malformed input; guard.
        let suffix = url.pathname.slice(idx + prefix.length)
        try {
          suffix = decodeURIComponent(suffix)
        } catch {
          return new Response('Bad request', { status: 400 })
        }
        if (!suffix || suffix.includes('..')) {
          return new Response('Bad request', { status: 400 })
        }
        const key = `${STORY_KEY_PREFIX}${suffix}`

        // ponytail: get() returns an R2ObjectBody which already carries both
        // the streamable body and the httpMetadata (contentType set at upload).
        // No need for getWithMetadata (that returns metadata-only, no body).
        const obj = await getR2().get(key)
        if (!obj) {
          return new Response('Not found', { status: 404 })
        }
        const headers = new Headers()
        headers.set(
          'Content-Type',
          obj.httpMetadata?.contentType ?? 'application/octet-stream',
        )
        // ponytail: R2 supports range requests for media seeking; advertise
        // it so <audio> can scrub without re-fetching the whole clip.
        headers.set('Accept-Ranges', 'bytes')
        headers.set('Cache-Control', 'public, max-age=86400')
        return new Response(obj.body, { headers })
      },
    },
  },
})
