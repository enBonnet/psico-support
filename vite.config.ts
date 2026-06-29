import { defineConfig } from 'vite'
import { readFileSync } from 'node:fs'
import { devtools } from '@tanstack/devtools-vite'
import { paraglideVitePlugin } from '@inlang/paraglide-js'
import { VitePWA } from 'vite-plugin-pwa'

import { tanstackStart } from '@tanstack/react-start/plugin/vite'

import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { cloudflare } from '@cloudflare/vite-plugin'

// ponytail: single source of truth for the app version. Read at build time
// from package.json and injected via `define` below. To release a new
// version: bump package.json `version`, update CHANGELOG.md, then redeploy.
// The SW cache key in public/sw.js mirrors this on purpose — bump both
// together when you need to force-invalidate every installed PWA client.
const APP_VERSION = JSON.parse(
  readFileSync(new URL('./package.json', import.meta.url), 'utf8'),
).version

const config = defineConfig({
  resolve: { tsconfigPaths: true },
  define: {
    __APP_VERSION__: JSON.stringify(APP_VERSION),
  },
  plugins: [
    devtools(),
    paraglideVitePlugin({
      project: './project.inlang',
      outdir: './src/paraglide',
      strategy: ['url', 'baseLocale'],
    }),
    cloudflare({ viteEnvironment: { name: 'ssr' } }),
    tailwindcss(),
    // ponytail: SPA shell generation. spa.enabled triggers a post-build
    // prerender of the maskPath (/) with header X-TSS_SHELL, which the SSR
    // handler renders as an EMPTY shell (isShell=true, no route loaders run)
    // and writes to dist/client/index.html. This gives the service worker a
    // cacheable static shell to serve on cold-open offline. It is independent
    // of per-route ssr:false/selective SSR — the profile route still SSRs for
    // crawlers (verified post-build). Upgrade: crawlLinks/precache hashed
    // assets if you want build-time precaching instead of runtime SWR.
    tanstackStart({ spa: { enabled: true } }),
    viteReact(),
    // ponytail: precache the app shell so a 3G user who loaded once gets
    // instant subsequent loads. Live data still flows via TanStack Query
    // polling. Drop this plugin if offline support is no longer needed.
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico'],
      manifest: {
        // ponytail: both name + short_name are the brand handle so the
        // installed-app label is consistent across platforms — Android uses
        // `name` (install prompt, app drawer, home screen), iOS uses
        // `short_name` (icon label). The descriptive "Red de Apoyo Psicológico
        // Venezuela" still shows in the browser tab via <title> in __root.tsx.
        name: 'Psicoayudaven',
        short_name: 'Psicoayudaven',
        description:
          'Conecta a personas afectadas con psicólogos verificados en Venezuela.',
        theme_color: '#13297e',
        background_color: '#eff7fe',
        display: 'standalone',
        start_url: '/',
        lang: 'es',
        icons: [
          { src: '/logo192.png', sizes: '192x192', type: 'image/png' },
          { src: '/logo512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          {
            src: '/maskable-icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
          {
            src: '/favicon.ico',
            sizes: '64x64 32x32 24x24 16x16',
            type: 'image/x-icon',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
        navigateFallback: '/index.html',
      },
      devOptions: { enabled: false },
    }),
  ],
})

export default config
