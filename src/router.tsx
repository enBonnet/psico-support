import { createRouter as createTanStackRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'

import { setupRouterSsrQueryIntegration } from '@tanstack/react-router-ssr-query'
import { getContext } from './integrations/tanstack-query/root-provider'
import { RoutePending } from './components/route-pending'
import { NotFound } from './components/not-found'

export function getRouter() {
  const context = getContext()

  const router = createTanStackRouter({
    routeTree,
    context,
    scrollRestoration: true,
    defaultPreload: 'intent',
    defaultPreloadStaleTime: 0,
    // ponytail: CSR routes (ssr:false) resolve beforeLoad/loader client-side,
    // so first paint is delayed by a server-fn round-trip. This pending shell
    // covers that gap for every CSR route from one place. SSR routes (the
    // profile page) resolve loaders before paint, so they never show it.
    defaultPendingComponent: RoutePending,
    // ponytail: the profile route throws notFound() for unknown/unverified ids
    // (verified-only public data). Without a default this fell to TanStack
    // Router's generic <p>Not Found</p> + a dev warning. Spanish 404 page.
    defaultNotFoundComponent: NotFound,
  })

  setupRouterSsrQueryIntegration({ router, queryClient: context.queryClient })

  return router
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
}
