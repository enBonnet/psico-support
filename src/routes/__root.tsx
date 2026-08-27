import {
  HeadContent,
  Scripts,
  createRootRouteWithContext,
  useLocation,
} from '@tanstack/react-router'
import { useEffect } from 'react'
import { TanStackRouterDevtoolsPanel } from '@tanstack/react-router-devtools'
import { TanStackDevtools } from '@tanstack/react-devtools'

import TanStackQueryDevtools from '../integrations/tanstack-query/devtools'

import { getLocale } from '#/paraglide/runtime'

import appCss from '../styles.css?url'

import { NotificationStack } from '#/lib/notifications'
import { SITE_DEFAULT_TITLE } from '#/lib/seo'
import { registerPwaUpdate } from '#/lib/pwa-update'
import { BottomTabs, DesktopNav } from '#/components/bottom-tabs'

import type { QueryClient } from '@tanstack/react-query'

interface MyRouterContext {
  queryClient: QueryClient
}

export const Route = createRootRouteWithContext<MyRouterContext>()({
  beforeLoad: async () => {
    // Other redirect strategies are possible; see
    // https://github.com/TanStack/router/tree/main/examples/react/i18n-paraglide#offline-redirect
    if (typeof document !== 'undefined') {
      document.documentElement.setAttribute('lang', getLocale())
    }
  },

  head: () => ({
    meta: [
      {
        charSet: 'utf-8',
      },
      {
        name: 'viewport',
        content: 'width=device-width, initial-scale=1, viewport-fit=cover',
      },
      {
        name: 'theme-color',
        content: '#112a8d',
      },
      {
        title: SITE_DEFAULT_TITLE,
      },
    ],
    links: [
      {
        rel: 'stylesheet',
        href: appCss,
      },
      // ponytail: Open Sans preconnect + stylesheet. Loaded as <link> in head
      // (not a CSS @import) so the font CSS + woff2 fetch in parallel with the
      // app CSS — a CSS @import would chain them serially, blocking first paint
      // by ~300-700ms on mobile. Preconnect warms DNS+TLS to fonts.gstatic.com
      // before the stylesheet is discovered. Weights 400 (body), 500 (font-
      // medium), 600 (font-semibold), 700 (font-bold) — upright only. Italic
      // appears solely in the print-only manual block (`.demo-print blockquote`)
      // and is browser-synthesized; not worth +4 woff2 (~40KB) for the on-screen
      // app. Drops the woff2 download from 8 files (~80KB) to 4 (~40KB).
      {
        rel: 'preconnect',
        href: 'https://fonts.gstatic.com',
        crossOrigin: 'anonymous',
      },
      {
        rel: 'stylesheet',
        href: 'https://fonts.googleapis.com/css2?family=Open+Sans:wght@400;500;600;700&display=swap',
      },
      {
        rel: 'apple-touch-icon',
        href: '/apple-touch-icon.png',
        sizes: '180x180',
      },
      { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' },
      {
        rel: 'icon',
        type: 'image/png',
        sizes: '32x32',
        href: '/favicon-32.png',
      },
      { rel: 'icon', type: 'image/x-icon', href: '/favicon.ico' },
      // ponytail: explicit manifest link. VitePWA emits manifest.webmanifest
      // but didn't link it; without this browsers only found it by auto-probing.
      // PROD-only: VitePWA serves no manifest in dev (devOptions.enabled=false,
      // gotcha #7), so an unconditional link 404s on every dev page load.
      ...(import.meta.env.PROD
        ? [{ rel: 'manifest', href: '/manifest.webmanifest' }]
        : []),
    ],
  }),
  shellComponent: RootDocument,
})

function RootDocument({ children }: { children: React.ReactNode }) {
  // ponytail: pathname drives chromeless-route hiding. Read once here so the
  // bar hides on auth flows without each route opting out.
  const { pathname } = useLocation()
  // ponytail: register the service worker so the app is installable + the
  // precached shell loads offline. VitePWA's devOptions.enabled=false means
  // no SW in dev, so gate on PROD. registerPwaUpdate() (lib/pwa-update.ts)
  // also wires the silent reload on controller change (force-update on
  // deploy) + foreground update polling + dead-chunk recovery — see the
  // module doc for the full rationale.
  useEffect(() => {
    if (import.meta.env.PROD) {
      registerPwaUpdate()
    }
  }, [])
  return (
    <html lang={getLocale()}>
      <head>
        <HeadContent />
      </head>
      <body>
        <DesktopNav pathname={pathname} />
        {children}
        <BottomTabs pathname={pathname} />
        <NotificationStack />
        {/* ponytail: dev-only. TanStack's plugin host registers global hooks
            and ships ~10-15KB in the entry chunk even when the panel is hidden,
            so gating on DEV keeps the prod bundle lean. The conditional import
            at the top of the file is static (not dynamic) so this stays simple;
            tree-shaking drops the unused modules in prod builds. */}
        {import.meta.env.DEV && (
          <TanStackDevtools
            config={{
              position: 'bottom-right',
            }}
            plugins={[
              {
                name: 'Tanstack Router',
                render: <TanStackRouterDevtoolsPanel />,
              },
              TanStackQueryDevtools,
            ]}
          />
        )}
        <Scripts />
      </body>
    </html>
  )
}
