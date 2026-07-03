import * as Sentry from '@sentry/tanstackstart-react'

import { getSentryInitOptions } from '#/lib/sentry'

const options = getSentryInitOptions()

if (options) {
  Sentry.init(options)
}
