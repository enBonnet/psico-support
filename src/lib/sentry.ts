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
    dataCollection: {
      // https://docs.sentry.io/platforms/javascript/guides/tanstackstart-react/configuration/options/#dataCollection
      // userInfo: false,
      // httpBodies: [],
    },
  }
}
