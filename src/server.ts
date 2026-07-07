import * as Sentry from '@sentry/cloudflare'
import { wrapFetchWithSentry } from '@sentry/tanstackstart-react'
import {
  createStartHandler,
  defaultStreamHandler,
} from '@tanstack/react-start/server'
import { createServerEntry } from '@tanstack/react-start/server-entry'

import { setCloudflareEnv } from '#/db'
import { getSentryInitOptions } from '#/lib/sentry'

type CloudflareEnv = {
  DB: D1Database
  MEDIA: R2Bucket
  EMAIL: SendEmail
  ANALYTICS: AnalyticsEngineDataset
  CF_ACCOUNT_ID?: string
  CF_ANALYTICS_TOKEN?: string
}

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

// ponytail: @sentry/cloudflare owns worker-runtime Sentry init + per-request
// isolation. @sentry/node (what @sentry/tanstackstart-react uses server-side)
// can't run on the Workers runtime, so the outer withSentry is the one that
// actually initializes Sentry here; the inner wrapFetchWithSentry still
// instruments TanStack server-fns (per the TanStack-Start-on-Cloudflare guide).
// When no DSN is configured we export the bare handler so CI/dev without a DSN
// still build and run.
const entry = createServerEntry(
  wrapFetchWithSentry({
    async fetch(request: Request, opts?: unknown): Promise<Response> {
      const env = opts as CloudflareEnv | undefined
      const redirect = httpsRedirect(request)
      if (redirect) return redirect

      if (env) setCloudflareEnv(env)
      // @ts-expect-error — worker fetch passes env as the second argument
      return await handler(request, env)
    },
  }),
)

const sentryOptions = getSentryInitOptions()

export default sentryOptions
  ? Sentry.withSentry(() => sentryOptions, entry)
  : entry
