import {
  sentryGlobalFunctionMiddleware,
  sentryGlobalRequestMiddleware,
} from '@sentry/tanstackstart-react'
import { createCsrfMiddleware, createStart } from '@tanstack/react-start'

// ponytail: CSRF protection for server fns. Server fns are same-origin RPC
// endpoints (POST /_serverFn/...) and a cross-site attacker could otherwise
// fire them via a form auto-submit. The middleware validates the standard
// Origin / Sec-Fetch-Site / Referer signals that browsers set on
// same-origin fetches, returning 403 when they're missing or cross-site.
//
// `filter: handlerType === 'serverFn'` scopes the check to server-fn RPC
// requests only — Better Auth's /api/auth/* routes have their own CSRF
// handling (trustedOrigins in src/lib/auth.ts), and SSR route loaders run
// as same-origin navigations so they don't need this gate.
//
// Defaults (from createCsrfMiddleware): Sec-Fetch-Site must be same-origin,
// Referer is used as a fallback when Origin + Sec-Fetch-Site are absent,
// and requests with no origin info at all are rejected. All sensible for
// a same-origin-only app like this one.
//
// Dev note: Better Auth's `trustedOrigins` in src/lib/auth.ts lists only
// loopback wildcards (dev); in prod it relies on the request's own origin
// matching the deployment URL (Better Auth's default behavior). This
// middleware is the explicit CSRF gate for server fns in both environments.
const csrfMiddleware = createCsrfMiddleware({
  filter: (ctx) => ctx.handlerType === 'serverFn',
})

export const startInstance = createStart(() => {
  return {
    requestMiddleware: [csrfMiddleware, sentryGlobalRequestMiddleware],
    functionMiddleware: [sentryGlobalFunctionMiddleware],
  }
})
