// ponytail: SERVER-ONLY. Never import this from a shared/client module — it
// pulls in @tanstack/react-start/server (node:async_hooks + h3), which would
// bloat and break the client bundle. Shared code resolves the host indirectly
// via siteUrl() in seo.ts (which calls the resolver registered here). Import
// this module from src/server.ts, src/server/email.ts, src/server/appointments.ts
// only.

import { getRequestHeaders } from '@tanstack/react-start/server'

import { KNOWN_HOSTS, PRIMARY_SITE_URL, _registerSiteUrlResolver } from './seo'

// ponytail: read the current request's Host + scheme. getRequestHeaders is
// backed by AsyncLocalStorage (per-request isolated — gotcha #9), so calling
// this from anywhere inside the TanStack handler / a server fn returns the
// RIGHT request even when an isolate is handling many concurrently. Only
// known prod hosts (psicoayudaven.com / psicoayudas.com) resolve to themselves;
// anything else (localhost, wrangler dev host, preview hostname, forged Host)
// falls back to PRIMARY_SITE_URL so the sitemap/canonical/OG can't be aimed at
// an arbitrary domain by a crafted request.
export function resolveSiteUrl(): string {
  try {
    const headers = getRequestHeaders()
    const host = headers.get('host')
    if (host && KNOWN_HOSTS.has(host)) {
      const scheme =
        headers.get('cf-visitor')?.match(/"scheme":"([^"]+)"/)?.[1] ??
        headers.get('x-forwarded-proto')?.split(',')[0]?.trim() ??
        'https'
      return `${scheme}://${host}`
    }
  } catch {
    // Outside a request context (tests, scripts, build-time prerender) —
    // getRequestHeaders throws "No StartEvent found in AsyncLocalStorage".
    // Fall through to the primary default.
  }
  return PRIMARY_SITE_URL
}

// ponytail: explicit-request variant for call sites that are NOT inside the
// TanStack handler's AsyncLocalStorage — notably src/server.ts's /sitemap.xml
// branch, which short-circuits BEFORE handler() is invoked so getRequestHeaders
// would throw. Those call sites already hold the Request, so they pass it here.
export function resolveSiteUrlFromRequest(request: Request): string {
  const url = new URL(request.url)
  if (KNOWN_HOSTS.has(url.hostname)) {
    // Always https in the emitted URL: the http→https 301 (server.ts) handles
    // the browser side; the sitemap/canonical must point at the secure origin
    // regardless of how the inbound request was made.
    return `https://${url.hostname}`
  }
  return PRIMARY_SITE_URL
}

// Register once at module load (worker boot) so shared seo.ts can resolve the
// current host without importing this server-only module.
_registerSiteUrlResolver(resolveSiteUrl)
