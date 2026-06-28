# AGENTS.md

Guide for AI agents (and humans) working on **psico-support**
([psicoayudaven.com](https://psicoayudaven.com)) — a disaster-response
psychological-support platform connecting people in Venezuela with verified
psychologists.

Read this before editing. It encodes the gotchas that have already cost real
time on this project.

## Stack

- **TanStack Start** (React 19, SSR) + TanStack Router / Query / Form
- **Cloudflare Workers** + **D1** (SQLite) via `@cloudflare/vite-plugin`
- **Better Auth** (email/password; admin via DB `user.role`, not env)
- **Drizzle ORM** + drizzle-kit (migrations in `drizzle/`)
- **Tailwind CSS v4** + custom glass components (no shadcn registry pulls)
- **Zod** validation; user-facing copy is **Spanish**

## Commands

```bash
npm run dev          # http://localhost:3000 (reads .env.local)
npm run build        # vite production build (SSR + client)
npm run lint         # eslint
npm test             # vitest run
npm run db:generate  # create a new migration SQL from src/db/schema.ts edits
npm run deploy       # build + wrangler deploy (DOES NOT apply D1 migrations — see below)
```

Typecheck (no script defined): `npx tsc --noEmit`.
A pre-existing `drizzle.config.ts` env-typing error is expected and unrelated
to app code.

### Database (D1)

Local D1 lives in `dev.db` (gitignored). After editing `src/db/schema.ts`:

```bash
npm run db:generate                                         # writes drizzle/000N_*.sql
npx wrangler d1 migrations apply psico-support-db --local   # local
```

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

### 5. Auth in SSR route guards

`authClient.getSession()` in `beforeLoad` does **not** forward the cookie
during SSR — every protected route bounced to login. Use the
`getCurrentUser` / `amIAdmin` server functions (`src/server/professionals.ts`)
in `beforeLoad`; they read the request via the global `__TSS_REQUEST__`.

## Project layout

```
src/
  routes/
    __root.tsx           # shell: <DesktopNav> + children + <BottomTabs> + <NotificationStack>
    index.tsx            # landing triage
    cuenta.tsx           # role-aware account hub (login, panel, admin, sign-out)
    ayuda/
      index.tsx          # modality selection (in-person vs remote)
      profesionales/
        index.tsx        # directory: filter/search/paginate, 2-col grid on desktop
        $id.tsx          # per-pro profile (SEO + share)
    profesional/
      login.tsx, registro.tsx, completar.tsx, panel.tsx
    admin/index.tsx
    api/auth/$.ts        # Better Auth handler
  server/
    professionals.ts     # all server fns (list, get, register, availability, admin)
    locations.ts         # Venezuela estado/ciudad maps
  components/
    bottom-tabs.tsx      # BottomTabs (mobile, md:hidden) + DesktopNav (desktop, hidden md:flex)
    ui/                  # button, card, badge, input, switch, label
  lib/
    auth.ts              # Better Auth config (server)
    auth-client.ts       # Better Auth client
    notifications.tsx    # iOS-style fire-and-forget notify() + <NotificationStack/>
    seo.ts               # seoHead() + profileJsonLd() helpers
  db/                    # Drizzle schema + D1 client
  styles.css             # design tokens + glass + nav + notifications
drizzle/                 # migration SQL (applied via wrangler, not drizzle-kit)
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
