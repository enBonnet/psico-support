import { wrapFetchWithSentry } from '@sentry/tanstackstart-react'
import {
  createStartHandler,
  defaultStreamHandler,
} from '@tanstack/react-start/server'
import { createServerEntry } from '@tanstack/react-start/server-entry'

import { setCloudflareEnv } from '#/db'
import type { CloudflareEnv } from '#/db'
import { getSentryInitOptions } from '#/lib/sentry'
// ponytail: importing seo-server registers the per-request siteUrl resolver
// (side effect at module load) AND gives the sitemap the request-based
// resolver it needs (sitemap runs BEFORE the TanStack handler, so it can't
// use getRequestHeaders — it has no AsyncLocalStorage context yet).
import { resolveSiteUrlFromRequest } from '#/lib/seo-server'
import { trackVanityRedirect } from '#/server/analytics'
import { listVerifiedProIdsRaw } from '#/server/professionals'

const handler = createStartHandler(defaultStreamHandler)

function httpsRedirect(request: Request): Response | null {
  const scheme =
    request.headers.get('cf-visitor')?.match(/"scheme":"([^"]+)"/)?.[1] ??
    request.headers.get('x-forwarded-proto')?.split(',')[0]?.trim()
  if (scheme !== 'http') return null

  const url = new URL(request.url)
  url.protocol = 'https:'
  return Response.redirect(url.toString(), 301)
}

// ponytail: 301 (permanent) redirect for the three vanity shortcuts to the
// remote-filtered directory. TanStack Router's redirect() in beforeLoad emits
// a 307 (temporary) — this worker-level redirect is the SEO-correct form so
// link equity from the brandable URLs (/psicologos, /ayudame, /ya) consolidates
// into /ayuda/profesionales. Fires before TanStack processes the request, so
// the route files' beforeLoad is now unreachable for these paths (kept as a
// safety net in case this helper is bypassed). trackVanityRedirect still
// records the hit in Analytics Engine.
const REMOTE_DIRECTORY_SEARCH =
  '?modality=remote&q=&estado=&ciudad=&population=&focusGroups=&practiceAreas=&page=1'
const VANITY_REDIRECTS: Record<string, string> = {
  '/psicologos': `/ayuda/profesionales${REMOTE_DIRECTORY_SEARCH}`,
  '/ayudame': `/ayuda/profesionales${REMOTE_DIRECTORY_SEARCH}`,
  '/ya': `/ayuda/profesionales${REMOTE_DIRECTORY_SEARCH}`,
}

function vanityRedirect(request: Request): Response | null {
  const url = new URL(request.url)
  // Match on pathname only (no query), so /psicologos?foo=bar still redirects.
  const target = VANITY_REDIRECTS[url.pathname]
  if (!target) return null
  trackVanityRedirect(url.pathname.slice(1), url.pathname)
  const redirectUrl = new URL(target, url)
  // Preserve the original scheme/host from the incoming URL.
  return Response.redirect(redirectUrl.toString(), 301)
}

// ponytail: /sitemap.xml — lists the stable content pages + every verified
// professional profile URL so Google indexes them within a day of a new pro
// being verified (otherwise discovery depends on in-link crawling, which can
// lag weeks). Implemented at the worker level (not a TanStack route) because
// the framework's file-router interprets `sitemap.xml.tsx` as the path
// `/sitemap/xml` (the `.` is treated as a path separator). The worker sees
// the raw pathname and can match the literal dot. Reads D1 once per crawl;
// Google hits sitemaps ~daily, so the cost is negligible.
//
// Ceiling: at >50k verified pros, split into paginated sitemap index files
// (sitemaps cap at 50k URLs / 50MB). Until then one file is correct.
const SITEMAP_STATIC_PATHS = [
  '/',
  '/ayuda',
  '/ayuda/profesionales',
  '/recursos',
  '/recursos/respirar',
  '/recursos/enraizamiento',
  '/recursos/autochequeo',
  '/recursos/primeros-auxilios',
  '/demo',
  '/recursos/reacciones-normales',
  '/apoyo',
  '/acerca-de',
  '/equipo',
  '/terminos',
  '/como-funciona',
  '/social',
  '/app',
  '/ahora',
]

function xmlEscape(s: string): string {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
}

async function sitemapResponse(origin: string): Promise<Response> {
  // ponytail: fail-soft to [] (listVerifiedProIdsRaw swallows D1 errors) so a
  // transient DB hiccup serves a static-only sitemap instead of 500ing —
  // Google keeps the previous sitemap and retries next crawl.
  const proIds = await listVerifiedProIdsRaw()
  // ponytail: origin is the per-request host (psicoayudaven.com OR
  // psicoayudas.com during the side-by-side rollout) so each domain's
  // sitemap self-references — resolved in the worker fetch below via
  // resolveSiteUrlFromRequest (this branch runs outside the handler's ALS).
  const staticUrls = SITEMAP_STATIC_PATHS.map(
    (p) =>
      `  <url><loc>${xmlEscape(`${origin}${p}`)}</loc><changefreq>monthly</changefreq><priority>${p === '/' ? '1.0' : '0.7'}</priority></url>`,
  ).join('\n')
  const proUrls = proIds
    .map(
      (id) =>
        `  <url><loc>${xmlEscape(`${origin}/ayuda/profesionales/${id}`)}</loc><changefreq>weekly</changefreq><priority>0.8</priority></url>`,
    )
    .join('\n')
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${staticUrls}
${proUrls}
</urlset>
`
  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      // ponytail: sitemap changes between deploys (new pros). 1h lets Google
      // re-crawl promptly without hammering the worker.
      'Cache-Control': 'public, max-age=3600',
    },
  })
}

// ponytail: hashed /assets/*.{js,css} filenames are immutable (content-addressed
// by Vite). Caching them forever stops the revalidation storm on every reload
// (prod was returning max-age=0, must-revalidate from the framework default,
// which forces a conditional GET on every navigation). Force-overrides any
// existing Cache-Control on /assets/* because the filenames are guaranteed
// stable by content hash — there's no scenario where revalidation is useful.
// Non-/assets requests pass through unchanged. Only GET/HEAD get the override
// so server-fn RPC POSTs and R2 binary reads (/media/*) aren't affected.
function immutableAssetHeaders(request: Request, response: Response): Response {
  if (request.method !== 'GET' && request.method !== 'HEAD') return response
  const url = new URL(request.url)
  if (!url.pathname.startsWith('/assets/')) return response
  const headers = new Headers(response.headers)
  headers.set('Cache-Control', 'public, max-age=31536000, immutable')
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}

// ponytail: Sentry init is runtime-split (gotcha #12). @sentry/node — what
// @sentry/tanstackstart-react uses server-side — can't run on the Workers
// runtime, so the PROD build wraps the entry with @sentry/cloudflare's
// withSentry (imported dynamically, only in this branch, so Node dev never
// loads the package). In Node dev the tanstackstart SDK inits directly with
// the same shared options; the start.ts middlewares
// (sentryGlobal{Request,Function}Middleware) instrument requests either way,
// and wrapFetchWithSentry below still instruments TanStack server-fns.
// When no DSN is configured we export the bare handler so CI/dev without a
// DSN still build and run.
const entry = createServerEntry(
  wrapFetchWithSentry({
    async fetch(request: Request, opts?: unknown): Promise<Response> {
      const env = opts as CloudflareEnv | undefined
      // ponytail: setCloudflareEnv BEFORE any code that might call writeEvent
      // (analytics) or getDb() — vanityRedirect tracks the hit, and the sitemap
      // handler reads D1, so both need the env bound first. Per-request safe:
      // setCloudflareEnv just assigns to a module-level _env; the next request
      // in this isolate overwrites it, but the AsyncLocalStorage-backed server
      // fns still isolate headers per-request (gotcha #9). This is the same
      // pre-existing pattern, just hoisted above the early returns.
      if (env) setCloudflareEnv(env)

      const redirect = httpsRedirect(request)
      if (redirect) return redirect

      const vanity = vanityRedirect(request)
      if (vanity) return vanity

      // ponytail: /sitemap.xml — handled here because TanStack's file-router
      // mis-parses the dotted filename. Only matches the literal /sitemap.xml
      // path; everything else flows to the app handler. Resolved per-request so
      // each domain's sitemap self-references (origin from the inbound host).
      const url = new URL(request.url)
      if (url.pathname === '/sitemap.xml') {
        return sitemapResponse(resolveSiteUrlFromRequest(request))
      }

      // @ts-expect-error — worker fetch passes env as the second argument
      const response = await handler(request, env)
      return immutableAssetHeaders(request, response)
    },
  }),
)

const sentryOptions = getSentryInitOptions()

let exported = entry
if (sentryOptions) {
  if (import.meta.env.PROD) {
    const { withSentry } = await import('@sentry/cloudflare')
    exported = withSentry(() => sentryOptions, entry)
  } else {
    // Node dev: init the tanstackstart (Node) server SDK directly. The
    // Workers-only cloudflare SDK must not be imported in dev.
    const { init } = await import('@sentry/tanstackstart-react')
    init(sentryOptions)
  }
}
export default exported
