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
        content: '#13297e',
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
      { rel: 'manifest', href: '/manifest.webmanifest' },
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
        <Scripts />
      </body>
    </html>
  )
}
