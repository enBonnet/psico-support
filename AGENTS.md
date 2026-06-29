# AGENTS.md

Guide for AI agents (and humans) working on **psico-support**
([psicoayudaven.com](https://psicoayudaven.com)) — a disaster-response
psychological-support platform connecting people in Venezuela with verified
psychologists.

Read this before editing. It encodes the gotchas that have already cost real
time on this project.

## Stack

- **TanStack Start** (React 19, selective SSR — most routes CSR, profile SSR) + TanStack Router / Query / Form
- **Cloudflare Workers** + **D1** (SQLite) via `@cloudflare/vite-plugin`
- **Better Auth** (email/password; admin via DB `user.role`, not env)
- **Drizzle ORM** + drizzle-kit (migrations in `drizzle/`)
- **Tailwind CSS v4** + custom glass components (no shadcn registry pulls)
- **Zod** validation; user-facing copy is **Spanish**
- **PWA**: offline app shell + service worker (see gotcha #7)

## Commands

```bash
npm run dev          # http://localhost:3000 (reads .env.local) — NO service worker (dev)
npm run build        # vite production build (SSR shell + client; generates /_shell)
npm run lint         # eslint
npm test             # vitest run
npm run db:generate  # create a new migration SQL from src/db/schema.ts edits
npm run deploy       # build + wrangler deploy (DOES NOT apply D1 migrations — see below)

# Test the PWA locally (the SW + shell are PROD-only — dev has no SW):
npm run build && npx wrangler dev --port 3000
```

Typecheck (no script defined): `npx tsc --noEmit`.
A pre-existing `drizzle.config.ts` env-typing error is expected and unrelated
to app code. `npm test` also has a pre-existing Vitest/Cloudflare-plugin
startup failure (no test files exist); verify against `wrangler dev` instead.

### Database (D1)

Local D1 lives in `dev.db` (gitignored). After editing `src/db/schema.ts`:

```bash
npm run db:generate                                         # writes drizzle/000N_*.sql
npx wrangler d1 migrations apply psico-support-db --local   # local
```

### Versioning

The app version is the single source of truth in `package.json` `version`,
injected at build time via `vite.config.ts` `define` (`__APP_VERSION__`) and
re-exported as `APP_VERSION` from `src/lib/version.ts` (currently shown in the
account page footer). `CHANGELOG.md` tracks human-readable history.

**Bump the version after any deployable/user-facing change.** Release flow:

```bash
npm version patch|minor|major     # bumps package.json, commits, tags (git must be clean)
# 1. move [Unreleased] items into a new [X.Y.Z] - YYYY-MM-DD entry in CHANGELOG.md
# 2. breaking server/API/DB change? bump CACHE in public/sw.js to match the
#    new version — this force-invalidates every installed PWA client at once
npm run deploy
npx wrangler d1 migrations apply psico-support-db --remote   # if schema changed
```

Semver: **patch** = bugfix, **minor** = backwards-compatible feature, **major**
= breaking change. The SW cache key in `public/sw.js` mirrors the version on
purpose — bump it ONLY on breaking releases; for compatible releases SWR +
`skipWaiting` refreshes installed clients within one reload.

## Critical gotchas

These have each caused prod incidents. Read twice.

### 1. `npm run deploy` does NOT apply D1 migrations

`deploy` = `vite build && wrangler deploy` (code only). Migrations are a
**separate, manual step**. After every schema change, in addition to deploying:

```bash
npx wrangler d1 migrations apply psico-support-db --remote   # prod
npx wrangler d1 migrations apply psico-support-db --local    # dev
npx wrangler d1 migrations list psico-support-db --remote    # sanity check (should be empty)
```

Symptom of a missing migration: inserts/queries fail on prod
(`no such column` / `NOT NULL`) while working perfectly locally. This has
recurred multiple times — always run `migrations list --remote` post-deploy.

### 2. Tailwind v4 layering: unlayered CSS beats utilities

`src/styles.css` custom classes (`.glass-card`, `.bottom-tabs`, etc.) are
**unlayered**. In tw v4, unlayered CSS **wins over** Tailwind utilities
(which live in `@layer`). Concretely:

- `display: flex` in an unlayered class will silently override a component's
  `hidden` / `md:hidden` utility. (This kept the mobile bottom bar visible on
  desktop for two deploys.) **Never set `display` in a custom surface class**
  if the component toggles visibility with utilities — let the utility own it.
- Same for any property: if a utility (`text-white`, `p-4`, …) seems to do
  nothing on an element with a custom class, check whether the class sets that
  property unlayered. Fix by removing it from the class, or `!important` on the
  utility (e.g. `!text-white` on the WhatsApp button).

### 3. TanStack Router `head()` quirks

- `head()` context provides `params` + `loaderData` — **not `search`**. To
  reflect a search param in meta, read it from `loaderData`.
- Declare `loader`/`loaderDeps` **before** `head` in the route options object.
  Declaring `head` first collapses the whole route's generic inference
  (`loaderData` → `never`, search → `{}`).
- `head().meta` accepts raw `HTMLMetaAttributes` (`{name,content}`,
  `{property,content}`, `{title}`) — **not** the `MetaDescriptor` union.
  `'script:ld+json'` is rejected at type level even though TanStack renders it
  at runtime. Render JSON-LD inline in the component body instead (Google
  reads body JSON-LD fine). See `src/routes/ayuda/profesionales/$id.tsx`.
- Title/meta dedupe by `name ?? property`; deepest match wins. JSON-LD
  accumulates; links dedupe by full equality. The root title is a fallback.

### 4. Public data must be verified-only

`getPublicProfessional` / the directory list filter on `verifiedStatus =
'verified'`. Pending/rejected professionals must never surface publicly — a
shared link to an unverified pro **404s** (`throw notFound()`), never leaks
state.

### 5. Auth in route guards (CSR now, was SSR)

Interactive/auth-gated routes are `ssr: false` (CSR — see gotcha #6). Their
`beforeLoad` therefore runs **client-side**, not during SSR. The mechanism is
unchanged: use the `getCurrentUser` / `amIAdmin` server functions
(`src/server/professionals.ts`) in `beforeLoad` — **never** `authClient.getSession()`,
which does a cookieless fetch and always returned null.

In CSR these server functions are plain HTTP RPC to the worker: cookies flow
on the real browser request, and the `RoutePending` spinner
(`defaultPendingComponent`) covers the round-trip gap on first paint.

### 6. Selective SSR: `ssr: false` vs `spa.enabled`

Global `spa: { enabled: true }` rewrites **every** route to CSR and would break
the profile route's SSR (which feeds OG/JSON-LD for share previews). Instead
this app uses **per-route `ssr: false`** (the `ssr` route option):

- **CSR (`ssr: false`)**: `signup`, `cuenta`, `profesional/{login,registro,
  completar,panel}`, `admin/`, `ayuda/profesionales/` (directory).
- **SSR (default)**: `ayuda/profesionales/$id` (profile — SEO/link previews).
  Its `head()` reads `loaderData`; the loader must run server-side.

**Do NOT** enable `spa.enabled` to "make it a SPA" — it is only used as a
build-time shell generator (gotcha #7) and the profile route must stay SSR.
A child can only be *more* restrictive than its parent (selective SSR rule);
luckily the profile and directory are **siblings** (both parented to root,
no shared layout route), so the directory being CSR cannot force the profile.

Note: a CSR route still returns 200 HTML (the app shell) from the worker on
first load — `ssr: false` only controls whether the route's loaders run
server-side, not whether HTML is emitted. The route's component content is
absent from server HTML (renders on hydrate). Verify with `view-source`.

### 7. PWA: app shell + service worker

`tanstackStart({ spa: { enabled: true } })` (`vite.config.ts`) is **not** for
CSR — it's a build-time shell generator. It prerenders `/` with the
`X-TSS_SHELL` header, the SSR handler renders an **empty shell** (no route
loaders), and writes it to `dist/client/_shell.html`. This gives the service
worker a cacheable static shell for offline cold-open. It does **not** conflict
with selective SSR (gotcha #6) — the shell and runtime route SSR are independent.

`public/sw.js` is **hand-rolled** (vite-plugin-pwa's Workbox generation does
not fire under Vite 8 + the named `ssr` env; VitePWA is kept only to emit the
manifest). It does three things:

1. **Precache** the shell (`/_shell`), manifest, and icons at `install`.
2. **Navigation fallback** — `request.mode === 'navigate'` falls back to the
   cached shell when offline, so the app boots instead of showing the browser
   error page. **Canonical shell URL is `/_shell`** (the `.html` form 307-
   redirects to it; point the SW at `/_shell` to avoid caching a redirect).
3. **Runtime SWR** for same-origin GETs, including the GET server-fn RPC
   responses (directory list, session) — so last-known data serves offline.
   Mutations are POST and never cached.

The `<link rel="manifest">` must be in `__root.tsx` `head()` (it was missing;
browsers only found the manifest by auto-probing). The SW registers only in
PROD (`import.meta.env.PROD` in `__root.tsx`) — **test the PWA with
`npm run build && npx wrangler dev`, never `npm run dev`** (no SW, dev HMR
fights the cache).

### 8. HTTP→HTTPS redirect lives in the Worker

`http://psicoayudaven.com` must 301 to `https://`. This is done in
`entry-server.tsx` `httpsRedirect()` (not the Cloudflare "Always Use HTTPS"
dashboard toggle — keeping it in-repo avoids config drift). The logic redirects
**only when it positively detects scheme `http`** via `CF-Visitor` /
`X-Forwarded-Proto`. If neither header is present, it passes through — this is
load-bearing: the build-time `spa` prerender crawls `/` over plain HTTP without
those headers, and redirecting it would follow to `https://localhost` → SSL
handshake error → **the offline `_shell.html` stops generating**. Don't
"tighten" this to also redirect headerless requests; you'll silently break the
PWA shell build.

## Project layout

```
src/
  routes/
    __root.tsx           # shell: <DesktopNav> + children + <BottomTabs> + <NotificationStack>
    index.tsx            # landing triage
    cuenta.tsx           # role-aware account hub (login, panel, admin, sign-out) — CSR
    ayuda/
      index.tsx          # modality selection (in-person vs remote)
      profesionales/
        index.tsx        # directory: filter/search/paginate, 2-col grid — CSR
        $id.tsx          # per-pro profile (SEO + share) — SSR (keeps OG/JSON-LD)
    profesional/
      login.tsx, registro.tsx, completar.tsx, panel.tsx   # all CSR
    admin/index.tsx      # CSR
    api/auth/$.ts        # Better Auth handler (server route)
  server/
    professionals.ts     # all server fns (list, get, register, availability, admin)
    locations.ts         # Venezuela estado/ciudad maps
  components/
    bottom-tabs.tsx      # BottomTabs (mobile, md:hidden) + DesktopNav (desktop, hidden md:flex)
    route-pending.tsx    # router defaultPendingComponent — covers CSR beforeLoad/loader gaps
    not-found.tsx        # router defaultNotFoundComponent — Spanish 404
    ui/                  # button, card, badge, input, switch, label
  router.tsx             # createRouter + default{Pending,NotFound}Component + ssr-query integration
  lib/
    auth.ts              # Better Auth config (server)
    auth-client.ts       # Better Auth client
    notifications.tsx    # iOS-style fire-and-forget notify() + <NotificationStack/>
    seo.ts               # seoHead() + profileJsonLd() helpers
  db/                    # Drizzle schema + D1 client
  styles.css             # design tokens + glass + nav + notifications
drizzle/                 # migration SQL (applied via wrangler, not drizzle-kit)
public/
  sw.js                  # hand-rolled SW: navigation fallback + precache shell + runtime SWR
```

## Conventions

- **`// ponytail:` comments** mark deliberate simplifications and name their
  ceiling + upgrade path. Preserve them; add one when you cut a corner.
- **User-facing strings are Spanish**; never leak raw SQL/params to the client.
- **Server functions** live in `src/server/*.ts` and use `getHeaders()` to
  read the request for auth.
- **Share/preview URLs** are absolute and use the constant
  `SITE_URL = 'https://psicoayudaven.com'` (`src/lib/seo.ts`) — not an env var
  (nobody shares localhost). Swap for env only if a staging domain needs
  different previews.
- **Responsive nav**: mobile = bottom bar (`md:hidden`); desktop = sticky top
  pill (`hidden md:flex`). Both hide on chromeless auth routes
  (`/signup`, `/profesional/{login,registro,completar}`).
- **`.page-wrap`** caps to `32rem` centered at ≥640px (single-column fallback).
  The directory opts out via `.page-wrap--wide` for its 2-column grid.
