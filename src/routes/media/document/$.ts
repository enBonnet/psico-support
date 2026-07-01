import { createFileRoute } from '@tanstack/react-router'
import { and, eq } from 'drizzle-orm'

import { getDb, getR2 } from '#/db'
import { professionals, professionalDocuments } from '#/db/schema'
import { getAuth, isAdminEmail } from '#/lib/auth'
import { SUPPORT_DOC_KEY_PREFIX } from '#/server/professionals'

// ponytail: owner-or-admin R2 read path for additional support documents.
// Unlike /media/certificate/$ (admin-only), the owning pro can view their own
// docs from the panel — so the gate resolves the session's pro id and checks
// the doc row belongs to them, OR falls back to admin. Non-authorized callers
// get a 404 (not 403 — don't leak that a key exists). Cache-Control is private
// + short-lived: these are personal credential docs, never cached on a shared
// device after logout (same posture as the certificate route).
export const Route = createFileRoute('/media/document/$')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const session = await getAuth().api.getSession({
          headers: request.headers,
        })
        if (!session?.user) {
          return new Response('Not found', { status: 404 })
        }

        const url = new URL(request.url)
        const prefix = '/media/document/'
        const idx = url.pathname.indexOf(prefix)
        if (idx < 0) return new Response('Bad request', { status: 400 })
        let suffix = url.pathname.slice(idx + prefix.length)
        try {
          suffix = decodeURIComponent(suffix)
        } catch {
          return new Response('Bad request', { status: 400 })
        }
        // ponytail: block path traversal — a `..` in the suffix could otherwise
        // escape the support-docs/ namespace in R2.
        if (!suffix || suffix.includes('..')) {
          return new Response('Bad request', { status: 400 })
        }
        const key = `${SUPPORT_DOC_KEY_PREFIX}${suffix}`

        const db = getDb()
        const isAdmin = await isAdminEmail(session.user.email)
        if (!isAdmin) {
          // ponytail: ownership check — the doc row must belong to a pro whose
          // userId matches the session. Resolves via a single join; the R2 get
          // only happens once authorized (avoid fetching bytes for a non-owner).
          const owned = await db
            .select({ id: professionalDocuments.id })
            .from(professionalDocuments)
            .innerJoin(
              professionals,
              eq(professionals.id, professionalDocuments.professionalId),
            )
            .where(
              and(
                eq(professionalDocuments.docKey, key),
                eq(professionals.userId, session.user.id),
              ),
            )
            .limit(1)
          if (owned.length === 0) {
            return new Response('Not found', { status: 404 })
          }
        }

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
        // ponytail: inline PDFs/images so the pro/admin can review a doc inline;
        // an attachment download would force an extra step.
        headers.set('Content-Disposition', 'inline')
        return new Response(obj.body, { headers })
      },
    },
  },
})
