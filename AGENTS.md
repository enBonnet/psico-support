# AGENTS.md

Guide for AI agents (and humans) working on **psico-support**
([psicoayudaven.com](https://psicoayudaven.com)) — a disaster-response
psychological-support platform connecting people in Venezuela with verified
psychologists.

Read this before editing. It encodes the gotchas that have already cost real
time on this project.

## Stack

- **TanStack Start** (React 19, selective SSR — most routes CSR, profile SSR) + TanStack Router / Query / Form
- **Two runtimes, one codebase**: local dev runs **plain Node** (better-sqlite3 `dev.db` + a filesystem media bucket — no wrangler/workerd/miniflare); production deploys to **Cloudflare Workers** + **D1** + **R2** + **Analytics Engine** via `@cloudflare/vite-plugin` (build-only — see gotcha #12)
- **Better Auth** (email/password; admin via DB `user.role`, not env)
- **Drizzle ORM** + drizzle-kit (migrations in `drizzle/`)
- **Tailwind CSS v4** + custom glass components (no shadcn registry pulls)
- **Zod** validation; user-facing copy is **Spanish**
- **PWA**: offline app shell + service worker (see gotcha #7)
- **Sentry** (`@sentry/cloudflare` on the worker, `@sentry/tanstackstart-react` on the client) — optional via `VITE_SENTRY_DSN`; source maps uploaded on deploy via `SENTRY_AUTH_TOKEN`

## Commands

```bash
pnpm dev             # http://localhost:3000 (reads .env.local) — plain Node SSR, NO wrangler/
                     #   (the db-check preflight auto-creates + migrates dev.db). NO SW in dev.
pnpm build           # vite production build (SSR + client) then prerenders /_shell
                     #   (prerender needs miniflare; CI sets CLOUDFLARE_VITE_FORCE_LOCAL=true)
pnpm lint            # eslint
pnpm test            # vitest run (node env; config in vitest.config.ts)
pnpm db:generate     # create a new migration SQL from src/db/schema.ts edits
pnpm deploy          # build + wrangler deploy (DOES NOT apply D1 migrations — see below)

# Test the PWA locally (the SW + shell are PROD-only — dev has no SW):
pnpm build && pnpm exec wrangler dev --port 3000
```

**pnpm is the only package manager** (pinned via `packageManager` in
package.json; build-script approvals live in `pnpm-workspace.yaml`
`allowBuilds`). There is no `package-lock.json` — never run `npm install` /
`npm ci` here. For one-off binaries use `pnpm exec <bin>` (local) or
`pnpm dlx <pkg>` (remote).

Typecheck (no script defined): `pnpm exec tsc --noEmit`.
A pre-existing `drizzle.config.ts` env-typing error is expected and unrelated
to app code.

### Build-time env vars

| Var | Required | Purpose |
| --- | --- | --- |
| `VITE_SENTRY_DSN` | no | Enables Sentry (client + worker). Absent = SDK off, build still works. |
| `SENTRY_AUTH_TOKEN` | no | Uploads source maps on `vite build`. Absent = maps won't upload, build still works. |
| `CLOUDFLARE_VITE_FORCE_LOCAL` | no | Forces local miniflare for the prerender step. CI sets this (`true`) so the build doesn't try to reach the Cloudflare remote proxy during `_shell.html` generation. |

The `ANALYTICS` (Analytics Engine) and `MEDIA` (R2) bindings are declared in
`wrangler.jsonc` and exist automatically in `wrangler dev`/deploy — no env var
needed. Transactional mail goes through **Mailgun** (REST API, not a binding):
`MAILGUN_SENDING_KEY` (or `MAILGUN_API_KEY`) and `MAILGUN_DOMAIN` are
**required**; `MAILGUN_FROM_EMAIL` is optional (falls back to
`noreply@mg.psicoayudaven.com`); `MAILGUN_REGION` (`us`/`eu`, default `us`)
picks the API base. They come from `.env.local` in dev and must be set as
wrangler secrets in prod — one command per secret:
`pnpm exec wrangler secret put MAILGUN_SENDING_KEY`, then
`MAILGUN_DOMAIN`, then `MAILGUN_FROM_EMAIL` (and `MAILGUN_REGION` if EU).
There is deliberately **no `send_email` binding** — the old `remote: true`
binding forced `wrangler dev` to open a remote proxy session, which required
Cloudflare auth + a workers.dev subdomain and blocked anyone without account
access from running the app locally. (Local dev no longer runs `wrangler` at
all — see gotcha #12 — but the binding stays gone.)

### Database (local dev.db / prod D1)

**One** local SQLite database: **`dev.db`** at the repo root (gitignored,
WAL mode). It is BOTH the drizzle-kit tooling DB (`DATABASE_URL=file:./dev.db`
for `db:generate`/`db:push`/`db:studio`) AND the dev runtime DB that `pnpm dev`
serves requests against (opened by `src/db/driver.ts` with better-sqlite3).
Production runs D1 — unchanged. The old two-DB split (`dev.db` +
`.wrangler/state/.../miniflare-*.sqlite`) is gone; `.wrangler/` state only
exists for prod builds (`vite build` prerender + `wrangler dev` smoke tests)
and CI.

After editing `src/db/schema.ts`:

```bash
pnpm db:generate          # writes drizzle/000N_*.sql
pnpm db:apply:local       # applies ALL drizzle/*.sql to dev.db (wrangler-style
                          #   file listing — NOT the drizzle journal, which
                          #   would skip hand-written 0018–0022)
pnpm db:status            # read-only sanity-check of dev.db
```

`pnpm dev` runs `scripts/db-check.mjs --fix` as a preflight: when `dev.db` is
missing or schema-less it runs `db:apply:local` (creating the file if needed)
and re-checks, so a fresh clone or a deleted `dev.db` self-heals on the next
`pnpm dev`. `db:status` gives the read-only report; `--strict` is for CI.

Migration tracking locally is the `local_migrations` table (file names, same
semantics as wrangler's `d1_migrations` on prod). `pnpm db:pull-prod` rebuilds
that table after loading a prod dump (the dump carries prod's `d1_migrations`,
which means nothing locally). Seed fixtures with `pnpm db:seed`; promote a
local admin with `pnpm db:promote-admin`.

`wrangler d1 migrations apply psico-support-db --local` is now only needed
before **prod builds** (the prerender crawls against miniflare D1 — CI does
this automatically). It no longer affects `pnpm dev`.

### Versioning

The app version is the single source of truth in `package.json` `version`,
injected at build time via `vite.config.ts` `define` (`__APP_VERSION__`) and
re-exported as `APP_VERSION` from `src/lib/version.ts` (currently shown in the
account page footer). `CHANGELOG.md` tracks human-readable history.

**Bump the version after any deployable/user-facing change.** Release flow:

```bash
pnpm version patch|minor|major  # bumps package.json, commits, tags (git must be clean)
# 1. move [Unreleased] items into a new [X.Y.Z] - YYYY-MM-DD entry in CHANGELOG.md
pnpm deploy
pnpm exec wrangler d1 migrations apply psico-support-db --remote   # if schema changed
```

Semver: **patch** = bugfix, **minor** = backwards-compatible feature, **major**
= breaking change. The SW cache key in `public/sw.js` is auto-baked from
`package.json` `version` at build time by `swVersionPlugin`
(vite.config.ts `generateBundle` hook — `__SW_VERSION__` placeholder). Every
`pnpm version ...` invalidates installed PWA clients at once; no separate
hand-edit. For backwards-compatible releases, SWR + `skipWaiting` still
refreshes content within one reload without needing a cache-name change.

## Critical gotchas

These have each caused prod incidents. Read twice.

### 1. `pnpm deploy` does NOT apply D1 migrations

`deploy` = `vite build && wrangler deploy` (code only). Migrations are a
**separate, manual step**. After every schema change, in addition to deploying:

```bash
pnpm exec wrangler d1 migrations apply psico-support-db --remote   # prod
pnpm exec wrangler d1 migrations apply psico-support-db --local    # dev
pnpm exec wrangler d1 migrations list psico-support-db --remote    # sanity check (should be empty)
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

- **CSR (`ssr: false`)**: `signup`, `cuenta`, `cuenta.sesiones*` (booking — gated),
  `ahora` (auto-connect share link), `profesional/{login,registro,completar,
  panel,sesiones}`, `admin/` (the whole branch — `ssr: false` + the admin guard
  live on the **layout route `admin.tsx`**, which every `admin/*` child inherits),
  `ayuda/profesionales/` (directory).
- **SSR (default)**: `ayuda/profesionales/$id` (profile — SEO/link previews) and
  `ayuda/especifica` (specific-help triage). Their `head()` reads `loaderData`;
  the loader must run server-side.

**Do NOT** enable `spa.enabled` to "make it a SPA" — it is only used as a
build-time shell generator (gotcha #7) and the profile route must stay SSR.
A child can only be *more* restrictive than its parent (selective SSR rule);
luckily the profile and directory are **siblings** (both parented to root,
no shared layout route), so the directory being CSR cannot force the profile.
The `/admin` branch relies on this rule in reverse: the layout route's
`ssr: false` cascades down to every child (a child can't opt back into SSR).

Note: a CSR route still returns 200 HTML (the app shell) from the worker on
first load — `ssr: false` only controls whether the route's loaders run
server-side, not whether HTML is emitted. The route's component content is
absent from server HTML (renders on hydrate). Verify with `view-source`.

### 7. PWA: app shell + service worker

`tanstackStart({ spa: { enabled: <build only> } })` (`vite.config.ts`) is
**not** for CSR — it's a build-time shell generator. It prerenders `/` with the
`X-TSS_SHELL` header, the SSR handler renders an **empty shell** (no route
loaders), and writes it to `dist/client/_shell.html`. This gives the service
worker a cacheable static shell for offline cold-open. It does **not** conflict
with selective SSR (gotcha #6) — the shell and runtime route SSR are independent.

**`spa.enabled` must stay OFF in dev** (it's gated to `isProdBuild` — gotcha
#12). If it's on during `vite dev`, TanStack serves every route as a client
shell: SSR loaders silently stop running server-side (only `__root__` shows in
the dehydrated matches), the SSR profile page renders its notFound head, and
nothing errors. Symptom: dev HTML has full `<head>` meta but no route content.

`public/sw.js` is **hand-rolled** (vite-plugin-pwa's Workbox generation does
not fire under Vite 8 + the named `ssr` env; VitePWA is kept only to emit the
manifest). It does three things:

1. **Precache** the shell (`/_shell`), manifest, and icons at `install`.
2. **Navigation fallback** — `request.mode === 'navigate'` falls back to the
   cached shell when offline, so the app boots instead of showing the browser
   error page. **Canonical shell URL is `/_shell`** (the `.html` form 307-
   redirects to it; point the SW at `/_shell` to avoid caching a redirect).
3. **Runtime caching** for same-origin GETs, split by mutability:
   **cache-first ONLY for immutable-by-construction assets** — `/assets/*`
   (Vite content-hashed). **Everything else is NETWORK-FIRST** with the cached
   copy as the offline fallback only: GET server-fn RPC responses,
   `/media/avatar/*`, `/media/audio/*`, manifest, icons. Why: RPC responses
   can depend on the session cookie (`getCurrentUser`, `amIAdmin`, …) and the
   Cache API does **not** vary on cookies — cache-first replayed a stale
   anonymous `null` to a freshly logged-in user, so `/cuenta` looked
   logged-out (and the admin card stayed hidden) until a manual reload. And
   both public media types have DELETE paths (`removeMyAvatar`,
   `deleteMyStory`), so they need the network-first branch's 404/410 eviction
   to bound replay-after-delete. Network-first still caches 200s, so
   last-known data (directory list, session, stories) serves offline as the
   fallback. Mutations are POST and never cached. **Never widen the
   cache-first allowlist** beyond immutable assets — cookie-dependent or
   revocable responses must not replay stale. The split is structural, not
   header-based: the old `x-tsr-serverFn` header detection was dropped, so
   even if TanStack renames its RPC conventions, RPC GETs land in the
   network-first default and the stale-session bug can't silently return.
4. **Private credential media are NEVER intercepted**: `/media/certificate/*`
   (admin-only) and `/media/document/*` (owner-or-admin) bypass the SW
   entirely — no caching, no offline replay. Same rationale as `/api/auth/*`:
   the Cache API ignores `Cache-Control: private`, so caching these would
   replay personal credential docs post-logout / cross-account on a shared
   browser profile. Public media stays cached by design (network-first +
   offline fallback): `/media/avatar/*` and `/media/audio/*` both emit 24h
   max-age and rely on 404 eviction to bound revocation (avatar withdraw /
   story delete propagates once the device is online; offline devices replay
   until reconnect — inherent limit of offline replay).

The `<link rel="manifest">` must be in `__root.tsx` `head()` (it was missing;
browsers only found the manifest by auto-probing). The SW registers only in
PROD (`import.meta.env.PROD` in `__root.tsx`) — **test the PWA with
`pnpm build && pnpm exec wrangler dev`, never `pnpm dev`** (no SW, dev HMR
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

### 11. Multi-domain: psicoayudaven.com + psicoayudas.com (side-by-side)

Two prod domains run on the **same worker + same D1** during the psicoayudas.com
rollout. There is **no per-domain config, branch, or DB** — both hostnames are
`custom_domain` routes in `wrangler.jsonc` and hit the identical code path. The
only thing that differs per domain is the absolute URLs emitted in SEO/share
context, which resolve per-request from the inbound `Host` header.

- **Self-referencing canonical.** Each domain emits canonical/OG/sitemap/JSON-LD
  pointing at its **own** host (chosen so both are independently indexable and
  share previews match the shared host). Resolution flows through `siteUrl()` in
  `src/lib/seo.ts`: on the client it reads `window.location.origin`; on the
  server it calls a resolver registered once at worker boot.
- **`src/lib/seo-server.ts` is SERVER-ONLY.** It imports
  `@tanstack/react-start/server` (`getRequestHeaders` → `node:async_hooks` +
  `h3`) to read the per-request Host. `seo.ts` (shared) MUST NOT import it —
  that would pollute the client bundle. Instead `seo-server.ts` calls
  `_registerSiteUrlResolver()` at module load, and `siteUrl()` invokes the
  registered ref. Assigning the ref once is gotcha #9-safe: the per-request
  state lives in TanStack's AsyncLocalStorage inside the resolver, not on a
  module/global. Verified post-build: `getRequestHeaders`/`async_hooks` appear
  in `dist/server/**` only, never `dist/client/**`.
- **Known-host allowlist.** `KNOWN_HOSTS = {psicoayudaven.com, psicoayudas.com}`
  in `seo.ts`. Any other Host (localhost, wrangler dev, preview hostname, a
  forged header) falls back to `PRIMARY_SITE_URL` so a crafted request can't
  mint OG/canonical URLs for an arbitrary domain.
- **`SITE_URL` is kept as an alias of `PRIMARY_SITE_URL`** for the few call
  sites that intentionally want the canonical primary regardless of inbound
  host: visible brand text (`demo.tsx`, `app.tsx`), and `.ics` calendar identity
  (`uid`/organizer/filename in `email.ts` + `cuenta.sesiones.tsx`) — calendar
  UIDs must NOT flip per host or re-imports duplicate entries.
- **Email sender stays `noreply@mg.psicoayudaven.com`.** Only that domain is
  verified as a Mailgun sender; the From address does not follow
  the request host. Email **action links** (logo, footer, cancel/reset/book) DO
  follow the host via `resolveSiteUrl()` — session cookies are per-domain, so a
  cancel link that crossed domains would land the user logged-out.
- **Better Auth `baseURL` already resolves from the request**, so password-reset
  links initiated on psicoayudas.com are psicoayudas.com links with no code
  change (`recuperar.tsx` uses `window.location.origin` for `redirectTo`).
- **Sitemap** (`src/server.ts`) runs BEFORE the TanStack handler, so it has no
  AsyncLocalStorage context — it uses `resolveSiteUrlFromRequest(request)`
  (explicit-request variant) instead of `resolveSiteUrl()`.
- **To cut over permanently to one domain:** add a Cloudflare bulk-redirect
  (301) from the retired domain to the survivor at the edge, THEN remove the old
  route from `wrangler.jsonc`. Don't just delete the route — link equity needs
  the 301. After cutover, the multi-host machinery here can stay (it's a no-op
  once only one KNOWN_HOST remains in practice) or be collapsed back to a
  constant.

### 12. Two runtimes: Node dev / Workers prod, split by `#/db/driver` alias

Local dev runs **plain Node** — no wrangler, no workerd, no miniflare, no
`.wrangler/` state. Production deploys to Cloudflare Workers. The split lives
in `vite.config.ts`:

- `command === 'build' || process.env.TSS_PRERENDERING === 'true'` → include
  `cloudflare({ viteEnvironment: { name: 'ssr' } })` + alias
  `#/db/driver` → `src/db/driver.worker.ts` (D1 + real R2 binding).
- Otherwise (`vite dev`) → no cloudflare plugin; `#/db/driver` resolves
  naturally (tsconfig `#/*` paths) to `src/db/driver.ts`: better-sqlite3 on
  `dev.db` (WAL), a filesystem R2 shim under `.local/media/`, and a
  module-load `setCloudflareEnv(devEnvFromProcess())` so server fns keep
  reading `MAILGUN_*` / `APPOINTMENTS_ENABLED` / `CF_*` through
  `getCloudflareEnv()` unchanged. `ANALYTICS` is deliberately absent in dev —
  the existing guards no-op analytics.

**Why `TSS_PRERENDERING`:** the post-build prerender boots an internal
`vite preview` server, which re-resolves `vite.config.ts` with
`command === 'serve'`. Without the env check the preview would drop the
cloudflare plugin, fall back to its Node middleware, and 500 the crawl
(`Failed to fetch /: Internal Server Error` — it imports a `server.js` the
worker build never emits). TanStack sets `TSS_PRERENDERING=true` before
starting that preview server; it's the reliable build-context signal.

**Rules:**

- **The browser must never resolve `#/db/driver` to a real driver.** Server-fn
  modules (e.g. `src/server/analytics.ts`, `src/server/professionals.ts`) keep
  their module-level `#/db` imports in the client variants TanStack compiles,
  so every route's client graph contains `#/db` → `#/db/driver`. The
  `driver-select` plugin in `vite.config.ts` maps that specifier per
  environment: client → `src/db/driver.client.ts` (a stub that throws if ever
  CALLED, but is inert to LOAD); ssr → `driver.worker.ts` in prod/prerender
  builds; plain dev SSR → natural resolution (`driver.ts`). Why it matters:
  without the stub, dev handed the browser `better-sqlite3`, whose module
  scope crashed hydration ("promisify is not a function") and every CSR route
  hung on the pending spinner. This Vite version has no per-environment
  `resolve.alias`, hence the plugin — don't "simplify" it into a build alias;
  client exports that must stay client-safe as VALUES (constants, pure URL
  builders like `TRACKED_EVENTS` / `SPECIALIZED_AREA_OPTIONS` /
  `publicAvatarUrl`) live in `src/lib/*`, not under `src/server/`.
- **Never import `better-sqlite3` outside `src/db/driver.ts` and `scripts/`**
  (tsx-run Node scripts). The native addon cannot run on workerd; the alias
  only protects the graph if better-sqlite3 has exactly one app-code entry
  point. Verified post-build: `dist/server` contains only inert
  better-sqlite3 *strings* (comments, dialect maps), never module code, and
  `dist/client` contains no driver at all.
- `Db` stays the **D1-derived async type** even though dev runs the sync
  better-sqlite3 driver underneath — the async type forces `await` at every
  call site, which works on both. Don't drop awaits "because dev is sync".
- **`src/server.ts` is the SSR entry in BOTH runtimes.** TanStack resolves
  `src/server.ts` by filename convention for the dev server (it doesn't read
  `wrangler.jsonc`), so `/sitemap.xml`, the vanity `/psicologos` `/ayudame`
  `/ya` 301s, the HTTP→HTTPS redirect, and immutable `/assets/*` headers run
  in `pnpm dev` too. The one prod-only piece is the `@sentry/cloudflare`
  wrapper: it's a dynamic import behind an `import.meta.env.PROD` branch
  (that SDK needs the Workers runtime); Node dev inits the tanstackstart Node
  SDK with the same shared options instead, and the start.ts middlewares
  instrument requests in both runtimes.
- **Dev is verifiably Cloudflare-free.** `pnpm dev` boots and serves the full
  app (SSR, auth, media, sitemap) with `wrangler.jsonc` renamed away AND
  `node_modules/@cloudflare`, `node_modules/wrangler`, and
  `node_modules/@sentry/cloudflare` physically hidden — no workerd process is
  spawned, `.wrangler/` is never written. Keep it that way: any new
  `@cloudflare/*` or `@sentry/cloudflare` import must be either build-gated
  (dynamic import behind `isProdBuild`/`import.meta.env.PROD`) or live in
  files outside the dev graph. `@cloudflare/workers-types` is types-only
  (tsc) and stays a normal dependency.
- Plain `vite preview` (`pnpm preview`) can't serve the worker bundle (Node
  middleware + worker-format output mismatch) — also fine with
  build + `wrangler dev`.
- R2 surface is intentionally narrow (`put/get/delete` + `httpMetadata`).
  If R2 features beyond that are adopted (ranges, listings), extend the
  `.local/media` shim or test via the prod build.

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
    cuenta.sesiones*.tsx # scheduled video-call booking (client side) — CSR, gated by VITE_APPOINTMENTS_ENABLED (client) + APPOINTMENTS_ENABLED secret (server); both must be on
    signup.tsx           # basic-account signup — CSR
    recuperar.tsx        # password reset flow (request + new password + error states)
    ayuda/
      index.tsx          # modality selection (in-person vs remote)
      especifica.tsx    # specific-help triage (sensitive areas) → directory pre-filtered — SSR
      profesionales/
        index.tsx        # directory: filter/search/paginate, 2-col grid — CSR
        $id.tsx          # per-pro profile (SEO + share) — SSR (keeps OG/JSON-LD)
    ahora.tsx            # share-link "auto-connect to WhatsApp" (renders + auto-connects, NOT a redirect)
    profesional/         # all CSR
      login.tsx, registro.tsx, completar.tsx
      panel.tsx          # card-based hub of profile actions
      perfil.tsx, presentacion.tsx, disponibilidad.tsx, audios.tsx, sesiones.tsx   # focused sub-routes
      seguimiento.tsx    # private clinical follow-ups (owner-scoped)
    admin/               # all CSR — parent layout route (admin.tsx) owns the guard + chrome + sub-nav
      index.tsx          # dashboard overview: "needs attention" callout + KPI strip + section cards
      profesionales/
        index.tsx        # credential audit (search + filters + paginated cards, 2-col on lg)
        $id.tsx          # edit a pro's profile before accepting ("approve with changes")
      audios/index.tsx   # pending-clip review queue (Voces que acompañan)
      categorias/index.tsx  # audio_categories CRUD (create/edit/toggle/delete)
      usuarios/index.tsx # promote-to-admin
      analitica.tsx      # KPIs / funnels / retention / D1 operational inventory (linked from the sub-nav)
    recursos/            # self-care tools (respirar, enraizamiento, autochequeo, psicoeducación SSR)
    apoyo/index.tsx      # "Voces que acompañan" — audio-stories tray grouped by category
    {acerca-de,equipo,terminos,privacidad,voluntariado,app,como-funciona,social}.tsx   # static / SSR content
    {psicologos,ayudame,ya}.tsx  # vanity redirects (server-side, 307) → remote directory
    media/$              # R2-serving routes (avatar, audio, certificate, document — public or owner/admin)
    api/auth/$.ts        # Better Auth handler (server route)
  server/
    professionals.ts     # list, get, register, availability, admin (incl. adminUpdateProfessional), auth helpers
    appointments.ts      # scheduled video-call booking — gated by APPOINTMENTS_ENABLED secret + flag
    audio-stories.ts     # "Voces que acompañan" clips + audio_categories CRUD (record, list, admin review)
    follow-ups.ts        # private clinical follow-ups (owner-scoped, no public/admin fn)
    analytics.ts         # TRACKED_EVENTS catalog + writeEvent() + auth-free track() server fn
    analytics-read.ts    # read-back of the Analytics Engine dataset (SQL API) for /admin/analitica
    email.ts             # transactional mail (password reset, appointment confirm/cancel + .ics)
    locations.ts         # Venezuela estado/ciudad maps
  components/
    bottom-tabs.tsx      # BottomTabs (mobile, md:hidden) + DesktopNav (desktop, hidden md:flex)
    route-pending.tsx    # router defaultPendingComponent — covers CSR beforeLoad/loader gaps
    not-found.tsx        # router defaultNotFoundComponent — Spanish 404
    error.tsx            # router defaultErrorComponent — Spanish 500 + Sentry captureException
    avatar.tsx, phone-input.tsx, tag-select.tsx, social-icons.tsx, audio-story-viewer.tsx,
    professional-form.tsx, admin-shared.ts, pro-cta.tsx, crisis-banner.tsx, audio-recorder.tsx, …
    ui/                  # button, card, badge, input, switch, skeleton (no label — removed dead Radix <Label>)
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
    features.ts          # client feature flags (build-time VITE_ vars, e.g. APPOINTMENTS_ENABLED)
    notifications.tsx    # iOS-style fire-and-forget notify() + <NotificationStack/>
    seo.ts               # seoHead() + profileJsonLd() + siteUrl() (per-request host resolver; PRIMARY_SITE_URL fallback)
    install-prompt.tsx   # useInstallPrompt() + <InstallCard/> (PWA install detection)
    whatsapp.ts          # centralized WhatsApp deep-link + message builder
    hooks/use-debounced.ts
    version.ts           # APP_VERSION (re-export of build-time __APP_VERSION__)
   db/                    # Drizzle schema + client split by runtime:
                          #   index.ts (shared Db type + retry helpers), env.ts (per-request env holder),
                          #   driver.ts (Node dev: better-sqlite3 + .local/media R2 shim),
                          #   driver.worker.ts (D1/R2 bindings — selected at build),
                          #   driver.client.ts (browser stub — see gotcha #12 rules)
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
- **Share/preview URLs** are absolute and **self-reference the request host**
  via `siteUrl()` in `src/lib/seo.ts` (canonical, og:url, default og:image,
  JSON-LD). The constant `PRIMARY_SITE_URL = 'https://psicoayudas.com'` is only
  the **fallback** for unknown hosts (localhost, previews, tests) and the few
  call sites that want the canonical primary regardless of inbound host — never
  an env var. See gotcha #11 for the dual-domain resolver + why this replaced
  the old single-constant model.
- **Responsive nav**: mobile = bottom bar (`md:hidden`); desktop = sticky top
  pill (`hidden md:flex`). Both hide on chromeless auth routes
  (`/signup`, `/profesional/{login,registro,completar}`).
- **`.page-wrap`** caps to `32rem` centered at ≥640px (single-column fallback).
  The directory opts out via `.page-wrap--wide` for its 2-column grid.
- **Label/input relationship** (standardized): data-entry fields render a
  **visible label above the control** via the shared `FieldShell`
  (`src/components/professional-form.tsx`) — `<label className="flex
  flex-col gap-1"><span>…</span>{control}</label>`. Never use a placeholder as
  the only affordance for a real input. Search bars and compact filter grids
  are a deliberately different control type: icon-led, `placeholder` +
  `aria-label`, no visible label (see the directory and admin search bars).
  The control class is the shared `inputCls = 'glass-input h-12 w-full px-3
  text-base'`; the `<Input>` UI component bakes in the same height. There is
  no floating-label pattern and no `<Label>` shadcn component (that file was
  dead code and removed).
