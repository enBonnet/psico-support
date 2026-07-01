import {
  createStartHandler,
  defaultStreamHandler,
} from '@tanstack/react-start/server'

import { setCloudflareEnv } from '#/db'

// ponytail: custom server entry captures the worker (request, env, ctx)
// signature so we can stash the D1 binding where getDb() reaches it. The
// default entry drops env on the floor.
type CloudflareEnv = {
  DB: D1Database
  MEDIA: R2Bucket
  EMAIL: SendEmail
}

const handler = createStartHandler(defaultStreamHandler)

// ponytail: force HTTPS. Cloudflare's "Always Use HTTPS" is a dashboard toggle
// (not in this repo → config drift risk, and global to the zone). Doing it
// here keeps the redirect in version control and as the first thing every
// request hits. Detect the real scheme via CF-Visitor (set by Cloudflare's
// edge) with X-Forwarded-Proto as a fallback; request.url can't be trusted
// directly because the worker sees the original scheme inconsistently.
// Returns null when the request is already HTTPS so the handler runs normally.
//
// We ONLY redirect when we positively detect a plain-http scheme via the edge
// headers. If neither header is present (local `wrangler dev` and the build-
// time spa prerender crawl don't set them), we pass through — otherwise the
// prerender would follow its own redirect to https://localhost, hit an SSL
// handshake error, and fail to generate the offline shell (_shell.html).
function httpsRedirect(request: Request): Response | null {
  const scheme =
    request.headers.get('cf-visitor')?.match(/"scheme":"([^"]+)"/)?.[1] ??
    request.headers.get('x-forwarded-proto')?.split(',')[0]?.trim()
  if (scheme !== 'http') return null

  const url = new URL(request.url)
  url.protocol = 'https:'
  return Response.redirect(url.toString(), 301)
}

async function fetch(request: Request, env?: CloudflareEnv): Promise<Response> {
  // Redirect any plain-HTTP request to HTTPS before any work / DB / SSR runs.
  const redirect = httpsRedirect(request)
  if (redirect) return redirect

  if (env) setCloudflareEnv(env)
  // ponytail: store the active request on a global so auth.getSession
  // can read cookies. Cleared in finally after the handler resolves.
  const g = globalThis as unknown as { __TSS_REQUEST__?: Request }
  g.__TSS_REQUEST__ = request
  try {
    // @ts-expect-error — createStartHandler's signature only declares
    // (request); passing extra args is the worker fetch convention.
    return await handler(request, env)
  } finally {
    g.__TSS_REQUEST__ = undefined
  }
}

export default { fetch }
