# AGENTS.md

Guide for AI agents (and humans) working on **psico-support**
([psicoayudaven.com](https://psicoayudaven.com)) — a disaster-response
psychological-support platform connecting people in Venezuela with verified
psychologists.

Read this before editing. It encodes the gotchas that have already cost real
time on this project.

## Stack

- **TanStack Start** (React 19, selective SSR — most routes CSR, profile SSR) + TanStack Router / Query / Form
- **Cloudflare Workers** + **D1** (SQLite) via `@cloudflare/vite-plugin`, **R2** (binary uploads), **Analytics Engine** (product analytics), **Email Service** (transactional mail)
- **Better Auth** (email/password; admin via DB `user.role`, not env)
- **Drizzle ORM** + drizzle-kit (migrations in `drizzle/`)
- **Tailwind CSS v4** + custom glass components (no shadcn registry pulls)
- **Zod** validation; user-facing copy is **Spanish**
- **PWA**: offline app shell + service worker (see gotcha #7)
- **Sentry** (`@sentry/cloudflare` on the worker, `@sentry/tanstackstart-react` on the client) — optional via `VITE_SENTRY_DSN`; source maps uploaded on deploy via `SENTRY_AUTH_TOKEN`

## Commands

```bash
npm run dev          # http://localhost:3000 (reads .env.local) — NO service worker (dev)
npm run build        # vite production build (SSR + client) then prerenders /_shell
                     #   (prerender needs miniflare; CI sets CLOUDFLARE_VITE_FORCE_LOCAL=true)
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

### Build-time env vars

| Var | Required | Purpose |
| --- | --- | --- |
| `VITE_SENTRY_DSN` | no | Enables Sentry (client + worker). Absent = SDK off, build still works. |
| `SENTRY_AUTH_TOKEN` | no | Uploads source maps on `vite build`. Absent = maps won't upload, build still works. |
| `CLOUDFLARE_VITE_FORCE_LOCAL` | no | Forces local miniflare for the prerender step. CI sets this (`true`) so the build doesn't try to reach the Cloudflare remote proxy during `_shell.html` generation. |

The `ANALYTICS` (Analytics Engine), `MEDIA` (R2), and `EMAIL` (Email Service)
bindings are declared in `wrangler.jsonc` and exist automatically in
`wrangler dev`/deploy — no env var needed.

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
npm run deploy
npx wrangler d1 migrations apply psico-support-db --remote   # if schema changed
```

Semver: **patch** = bugfix, **minor** = backwards-compatible feature, **major**
= breaking change. The SW cache key in `public/sw.js` is auto-baked from
`package.json` `version` at build time by `swVersionPlugin`
(vite.config.ts `generateBundle` hook — `__SW_VERSION__` placeholder). Every
`npm version ...` invalidates installed PWA clients at once; no separate
hand-edit. For backwards-compatible releases, SWR + `skipWaiting` still
refreshes content within one reload without needing a cache-name change.

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
`src/server.ts` `httpsRedirect()` (the worker entry — not the Cloudflare
"Always Use HTTPS" dashboard toggle; keeping it in-repo avoids config drift).
The logic redirects **only when it positively detects scheme `http`** via
`CF-Visitor` / `X-Forwarded-Proto`. If neither header is present, it passes
through — this is load-bearing: the build-time `spa` prerender crawls `/` over
plain HTTP without those headers, and redirecting it would follow to
`https://localhost` → SSL handshake error → **the offline `_shell.html` stops
generating**. Don't "tighten" this to also redirect headerless requests;
you'll silently break the PWA shell build.

### 9. Per-request isolation: never stash the `Request` on `globalThis`

A Workers isolate handles many requests concurrently. The previous pattern
stored the incoming `Request` on `globalThis.__TSS_REQUEST__` so server fns
could read cookies/headers — but a second request landing in the same isolate
would **overwrite it mid-flight**, mixing auth/cookies between users. The
incident was a header-leak across concurrent requests.

Every server fn now reads the request via the `getHeaders()` helper (duplicated
per-domain in `src/server/{professionals,audio-stories,follow-ups}.ts`) which
calls TanStack Start's `getRequestHeaders()` — that's backed by
`AsyncLocalStorage`, so it's isolated per request.

**Rules:**

- In any server fn, read the request **only** via `getRequestHeaders()` (or the
  local `getHeaders()` wrapper). **Never** assign the request/response to a
  module-level or `globalThis` variable.
- The `getHeaders()` wrapper has a `try/catch` returning empty `Headers` when
  called outside a request (tests, scripts) — that fallback is intentional;
  don't "harden" it to throw.
- If a fourth server-fn module needs it, extract the helper to `lib/auth.ts`
  (the existing `ponytail:` note names this ceiling).

### 10. Analytics is fire-and-forget and must never break a feature

Product analytics flows to **Cloudflare Analytics Engine** (binding `ANALYTICS`,
dataset `psico_events`). The catalog lives in `src/server/analytics.ts`
(`TRACKED_EVENTS` — the single source of truth for valid event names) and the
typed client helper is `src/lib/analytics-client.ts`. The pipe is, by design,
best-effort:

- `writeEvent()` is **synchronous, never throws, and no-ops without the
  binding** (dev without `wrangler dev`, tests). A broken analytics write must
  never break the feature it's instrumenting.
- The client `track()` helper is **never awaited, never throws, and self-guards
  SSR** (no-op on the server). Callers intentionally drop the returned promise.
- The `track` server fn is **auth-free** so the pre-login help-seeker funnel
  (landing → modality → directory → contact) is fully trackable. Spoofing the
  `actorId` only corrupts the caller's own analytics, not anyone else's.

**Column contract is IMMUTABLE.** Analytics Engine uses fixed-position columns:

| index1 | blob1 | blob2 | blob3 | blob4-6 | double1 | double2 |
| --- | --- | --- | --- | --- | --- | --- |
| actorId | event | category | route | param1/2/3 | count (always 1) | value |

Renaming an event or shifting a param's slot **breaks historical queries**.
Add new events freely; never change an existing one. `param1/2/3` are
overloaded (different meaning per event) — their contract is documented in the
`TRACKED_EVENTS` comment block.

The `pro_contact`/`pro_contact_random` events get `param3=userId` enriched
**server-side** (resolved from D1 via `userIdForPro`) — the client sends only
the `proId`, so anonymous visitors can still be tracked but contacts can still
be attributed per account. Reading the dataset back is via the SQL API with an
account-level API token (the binding is **write-only**).

## Outbound communications

`docs/professional-communications.md` is the log of every broadcast message
sent to the verified psychologists (WhatsApp release notes, support-group
invites, incident comms, etc.). **Read it before drafting any new message to
professionals** — it records what they've already been told, the tone we use
(non-technical, warm, Spanish), and any open commitments (e.g. the
natural-disaster support group promised on 2026-07-03 that still needs a
follow-up when it launches). Add a new entry at the top each time we send one;
never re-announce a shipped feature as "new" or contradict a commitment
already made there.

## Project layout

```
src/
  routes/
    __root.tsx           # shell: <DesktopNav> + children + <BottomTabs> + <NotificationStack> + SW register (PROD)
    index.tsx            # landing triage
    cuenta.tsx           # role-aware account hub (login, panel, admin, sign-out) — CSR
    signup.tsx           # basic-account signup — CSR
    recuperar.tsx        # password reset flow (request + new password + error states)
    ayuda/
      index.tsx          # modality selection (in-person vs remote)
      profesionales/
        index.tsx        # directory: filter/search/paginate, 2-col grid — CSR
        $id.tsx          # per-pro profile (SEO + share) — SSR (keeps OG/JSON-LD)
    profesional/         # all CSR
      login.tsx, registro.tsx, completar.tsx
      panel.tsx          # card-based hub of profile actions
      perfil.tsx, presentacion.tsx, disponibilidad.tsx, audios.tsx   # focused sub-routes
      seguimiento.tsx    # private clinical follow-ups (owner-scoped)
    admin/index.tsx      # pro review + user management — CSR
    recursos/            # self-care tools (respirar, enraizamiento, autochequeo, psicoeducación SSR)
    apoyo/index.tsx      # "Voces que acompañan" — audio-stories tray
    {acerca-de,equipo,terminos,app,como-funciona,social}.tsx   # static / SSR content
    {psicologos,ayudame,ya}.tsx  # vanity redirects (server-side, 307) → remote directory
    media/$              # R2-serving routes (avatar, audio, certificate, document — public or owner/admin)
    api/auth/$.ts        # Better Auth handler (server route)
  server/
    professionals.ts     # list, get, register, availability, admin, auth helpers
    audio-stories.ts     # "Voces que acompañan" clips (record, list, admin review)
    follow-ups.ts        # private clinical follow-ups (owner-scoped, no public/admin fn)
    analytics.ts         # TRACKED_EVENTS catalog + writeEvent() + auth-free track() server fn
    locations.ts         # Venezuela estado/ciudad maps
  components/
    bottom-tabs.tsx      # BottomTabs (mobile, md:hidden) + DesktopNav (desktop, hidden md:flex)
    route-pending.tsx    # router defaultPendingComponent — covers CSR beforeLoad/loader gaps
    not-found.tsx        # router defaultNotFoundComponent — Spanish 404
    error.tsx            # router defaultErrorComponent — Spanish 500 + Sentry captureException
    avatar.tsx, phone-input.tsx, social-icons.tsx, audio-story-viewer.tsx, …
    ui/                  # button, card, badge, input, switch, label, skeleton
  router.tsx             # createRouter + default{Pending,NotFound,Error}Component + ssr-query + Sentry router tracing
  server.ts              # Worker entry: httpsRedirect + Sentry.withSentry (cloudflare SDK)
  start.ts               # createStart + Sentry request/function middleware
  instrument.client.ts   # Sentry.init (client) — imported first in client.tsx
  client.tsx             # client entry (imports instrument.client before anything else)
  lib/
    auth.ts              # Better Auth config (server)
    auth-client.ts       # Better Auth client
    sentry.ts            # getSentryDsn() + shared getSentryInitOptions() (client + dev server)
    analytics-client.ts  # typed track() + getAnonId() + trackProContact{,Random} — SSR-safe, fire-and-forget
    notifications.tsx    # iOS-style fire-and-forget notify() + <NotificationStack/>
    seo.ts               # seoHead() + profileJsonLd() helpers; SITE_URL constant
    install-prompt.tsx   # useInstallPrompt() + <InstallCard/> (PWA install detection)
    hooks/use-debounced.ts
    version.ts           # APP_VERSION (re-export of build-time __APP_VERSION__)
  db/                    # Drizzle schema + D1 client (setCloudflareEnv per-request)
  styles.css             # design tokens + glass + nav + notifications
drizzle/                 # migration SQL (applied via wrangler, not drizzle-kit)
public/
  sw.js                  # hand-rolled SW: navigation fallback + precache shell + runtime SWR
```

## Conventions

- **`// ponytail:` comments** mark deliberate simplifications and name their
  ceiling + upgrade path. Preserve them; add one when you cut a corner.
- **User-facing strings are Spanish**; never leak raw SQL/params to the client.
- **Server functions** live in `src/server/*.ts` and read the request via the
  per-request `getHeaders()` helper (see gotcha #9) — **never** assign the
  request to a module-level / `globalThis` variable.
- **Instrumenting server fns with Sentry**: wrap any lengthy operation in
  `Sentry.startSpan({ name }, async () => { … })` (import `* as Sentry` from
  `@sentry/tanstackstart-react`). The auth-free `track()` server fn in
  `src/server/analytics.ts` is the reference example.
- **Tracking an event**: call `track({ event, category, param1?, … })` from
  `src/lib/analytics-client.ts`. The event name must exist in `TRACKED_EVENTS`
  (compile-time checked). Fire-and-forget — never `await`, never throw (see
  gotcha #10). Add new events to the catalog; **don't** rename or reshuffle
  existing ones (the column contract is immutable).
- **Share/preview URLs** are absolute and use the constant
  `SITE_URL = 'https://psicoayudaven.com'` (`src/lib/seo.ts`) — not an env var
  (nobody shares localhost). Swap for env only if a staging domain needs
  different previews.
- **Responsive nav**: mobile = bottom bar (`md:hidden`); desktop = sticky top
  pill (`hidden md:flex`). Both hide on chromeless auth routes
  (`/signup`, `/profesional/{login,registro,completar}`).
- **`.page-wrap`** caps to `32rem` centered at ≥640px (single-column fallback).
  The directory opts out via `.page-wrap--wide` for its 2-column grid.
