import { createFileRoute } from '@tanstack/react-router'

import { getR2 } from '#/db'
import { getAuth, isAdminEmail } from '#/lib/auth'
import { CERT_KEY_PREFIX } from '#/server/professionals'

// ponytail: admin-only R2 read path for professional certificates (título /
// certificado de egreso). Mirrors /media/audio/$ BUT authenticates: unlike
// audio stories (public-by-intent), a certificate is a personal credential
// document, so non-admins get a 404 (not 403 — don't leak that a key exists).
// The browser sends the session cookie on the <img>/<a> request from the
// authenticated admin page, so getSession resolves normally. Cache-Control is
// private + short-lived: keys are write-once (a re-upload creates a new UUID
// key), but we don't want a stale doc cached on a shared device after logout.
export const Route = createFileRoute('/media/certificate/$')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        // ponytail: gate first — never serve bytes to a non-admin, and don't
        // even look at the pathname until auth passes (avoids logging/reflecting
        // keys for unauthed callers).
        const session = await getAuth().api.getSession({ headers: request.headers })
        if (!session?.user || !(await isAdminEmail(session.user.email))) {
          return new Response('Not found', { status: 404 })
        }

        const url = new URL(request.url)
        const prefix = '/media/certificate/'
        const idx = url.pathname.indexOf(prefix)
        if (idx < 0) return new Response('Bad request', { status: 400 })
        let suffix = url.pathname.slice(idx + prefix.length)
        try {
          suffix = decodeURIComponent(suffix)
        } catch {
          return new Response('Bad request', { status: 400 })
        }
        // ponytail: block path traversal — a `..` in the suffix could otherwise
        // escape the certificates/ namespace in R2.
        if (!suffix || suffix.includes('..')) {
          return new Response('Bad request', { status: 400 })
        }
        const key = `${CERT_KEY_PREFIX}${suffix}`

        const obj = await getR2().get(key)
        if (!obj) {
          return new Response('Not found', { status: 404 })
        }
        const headers = new Headers()
        headers.set(
          'Content-Type',
          obj.httpMetadata?.contentType ?? 'application/octet-stream',
        )
        headers.set('Cache-Control', 'private, max-age=60')
        // ponytail: inline PDFs/images so the admin can review a doc inline in
        // the audit card; an attachment download would force an extra step.
        headers.set('Content-Disposition', 'inline')
        return new Response(obj.body, { headers })
      },
    },
  },
})
