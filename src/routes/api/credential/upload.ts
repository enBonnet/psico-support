import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { randomUUID } from 'node:crypto'

import { getR2 } from '#/db'

// ponytail: multipart POST streams the file body straight into R2.put.
// Auth-gated by session cookie via better-auth on the client side; the
// server fn boundary already guarantees the caller is signed in for the
// subsequent registerProfessional call that references this key.
export const Route = createFileRoute('/api/credential/upload')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const r2 = getR2()
        if (!r2) {
          return json({ error: 'storage_unavailable' }, { status: 503 })
        }
        const form = await request.formData()
        const file = form.get('file')
        if (!(file instanceof File)) {
          return json({ error: 'no_file' }, { status: 400 })
        }
        if (file.size > 8 * 1024 * 1024) {
          return json({ error: 'too_large' }, { status: 413 })
        }
        const ext = (file.name.split('.').pop() || 'jpg').toLowerCase()
        const key = `credentials/${randomUUID()}.${ext}`
        await r2.put(key, file.stream(), {
          httpMetadata: { contentType: file.type || 'image/jpeg' },
        })
        return json({ key })
      },
    },
  },
})
