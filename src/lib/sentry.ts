import type { Options } from '@sentry/core'

import { APP_VERSION } from '#/lib/version'

/** Client-safe DSN — override via `VITE_SENTRY_DSN` in `.env.local`. */
export function getSentryDsn(): string | undefined {
  const dsn = import.meta.env.VITE_SENTRY_DSN
  return typeof dsn === 'string' && dsn.length > 0 ? dsn : undefined
}

/** Shared `Sentry.init` options (client + Node dev server). */
export function getSentryInitOptions(): Options | undefined {
  const dsn = getSentryDsn()
  if (!dsn) return undefined

  return {
    dsn,
    environment: import.meta.env.DEV ? 'development' : 'production',
    release: `psico-support@${APP_VERSION}`,
    // ponytail: required for tanstackRouterBrowserTracingIntegration to emit
    // spans — without it the integration is a no-op. Sample everything in dev,
    // 10% in prod (D1-scale traffic; bump if traces look sparse).
    tracesSampleRate: import.meta.env.DEV ? 1.0 : 0.1,
    dataCollection: {
      // https://docs.sentry.io/platforms/javascript/guides/tanstackstart-react/configuration/options/#dataCollection
      // userInfo: false,
      // httpBodies: [],
    },
  }
}
