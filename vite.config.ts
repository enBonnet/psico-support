import { defineConfig, type Plugin } from 'vite'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { devtools } from '@tanstack/devtools-vite'
import { paraglideVitePlugin } from '@inlang/paraglide-js'
import { VitePWA } from 'vite-plugin-pwa'

import { tanstackStart } from '@tanstack/react-start/plugin/vite'

import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { cloudflare } from '@cloudflare/vite-plugin'

// ponytail: single source of truth for the app version. Read at build time
// from package.json and injected into:
//   - app code via `define` (`__APP_VERSION__` / src/lib/version.ts)
//   - the service worker via `swVersionPlugin` below (rewrites
//     `__SW_VERSION__` in the built public/sw.js with the package version)
//
// To release: bump package.json `version`, update CHANGELOG.md, redeploy.
// The SW cache key in public/sw.js follows the package version
// automatically — every `npm version ...` bumps it, force-invalidating
// installed PWA clients without a separate hand-edit. Backwards-compatible
// releases still rely on SWR + skipWaiting (one reload) for incremental
// content refresh.
const APP_VERSION = JSON.parse(
  readFileSync(new URL('./package.json', import.meta.url), 'utf8'),
).version

// ponytail: bake the package version into public/sw.js at build time.
// public/ files are copied verbatim to disk by Vite's build-public plugin
// and never enter the Rollup module graph — Vite's `transform` hook
// doesn't fire on them, and `generateBundle`/`writeBundle` see the bundle
// *before* public assets are written (so `bundle['sw.js']` is undefined).
// We use `closeBundle`, which runs after every asset (including public
// assets) is on disk, to read dist/client/sw.js, replace `__SW_VERSION__`
// with `JSON.stringify(version)`, and write it back. We pick closeBundle
// over a post-build script so the SW is always in sync with the package
// version a single `npm run build` produces.
// Ceiling: if SW moves out of public/ (e.g. into src/ as a TS module),
// a plain `transform()` hook on the module id replaces this whole plugin.
function swVersionPlugin(version: string): Plugin {
  const __dirname = dirname(fileURLToPath(import.meta.url))
  return {
    name: 'sw-version-injection',
    apply: 'build',
    closeBundle() {
      const swPath = resolve(__dirname, 'dist/client/sw.js')
      if (!existsSync(swPath)) {
        this.warn(
          'sw-version-injection: dist/client/sw.js not found — skipping',
        )
        return
      }
      const source = readFileSync(swPath, 'utf8')
      if (!source.includes('__SW_VERSION__')) return
      writeFileSync(
        swPath,
        source.replace(/__SW_VERSION__/g, JSON.stringify(version)),
      )
    },
  }
}

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
    // ponytail: runs after vite-plugin-pwa. closeBundle fires after every
    // asset (public + generated) is written, so sw.js is on disk and ready
    // for the version rewrite.
    swVersionPlugin(APP_VERSION),
  ],
})

export default config
