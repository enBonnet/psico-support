# Design — Availability scheduling, profile editing, clinical follow-ups

Status: **final / locked** (all open decisions resolved inline). This is the
spec being implemented for [psicoayudaven.com](https://psicoayudaven.com), in
ship order **F3 → F2 → F1**.

**What changed from the original draft:** F1 dropped the Cron Trigger — the
schedule (blocks of day/hour + timezone) is now the source of truth and
availability is derived at view time, so there is no cron and no ~10-min lag.
F1 is also a **three-state** model (`always` / `scheduled` / `inactive`), not
two. F3 gained `riskLevel` (3-level clinical triage) + `actionTaken` (PFA-derived
tag set), grounded in WHO/NCTSN Psychological First Aid.

Conventions follow the rest of the repo: Spanish user-facing copy, server fns
in `src/server/*.ts`, JSON-text-array columns for structured fields, `ponytail:`
comments marking deliberate simplifications + their ceiling, and D1 migrations
generated via `npm run db:generate` then applied with wrangler (see AGENTS.md
gotcha #1 — `deploy` does **not** apply migrations).

---

## Feature 1 — Recurring availability schedule (three-state, no cron)

### Goal

A professional is in exactly one of three availability states. Two ways to be
*available* — **Siempre disponible** (always on) or **Por horario** (available
during configured day/hour blocks) — plus an explicit offline state,
**No conectado**. Professionals with no configuration default to Siempre
disponible.

### Current state (what exists today)

- `professionals.available boolean` (`src/db/schema.ts:158`) — a single manual
  ON/OFF toggle, flipped from the panel via `setAvailability`
  (`src/server/professionals.ts:773`).
- The directory orders `available DESC, name ASC` (`:327`) so online pros float
  to the top, and renders an "En línea" / "No conectado" pill
  (`src/routes/ayuda/profesionales/index.tsx:540`).
- `pickRandomProfessional` deliberately **ignores** `available`.
- The directory polls every 20 s (`refetchInterval: 20_000`).

### Design

#### Three-state model + new columns on `professionals`

| State (`availability_mode`) | Meaning | Directory/profile badge |
| --------------------------- | ------- | ----------------------- |
| `always` (default)          | Siempre disponible — always on | "Siempre disponible" |
| `scheduled`                 | Por horario — available during day/hour blocks (live `isActiveNow`) | "Disponible ahora" / "Vuelve a las HH:MM" / "No disponible" |
| `inactive`                  | No conectado — opted out / not configured | "No conectado" |

New columns: `availability_mode` text `'always'|'scheduled'|'inactive'`
**default `'always'`** (plain TEXT, no CHECK — validated by Zod),
`availability_schedule` text nullable (JSON `Schedule`, below), `timezone` text
nullable (IANA, e.g. `America/Caracas`).

**Migration (`0014`):** the mode column's `DEFAULT 'always'` both backfills
every existing professional to Siempre disponible (no one disappears at
cutover) **and** sets new signups to appear online once verified — in a single
`ALTER TABLE … ADD` per column. The old `available` boolean stays as a
**dormant** column (cheaper than a removal migration); it is no longer the
display/ordering source of truth but is kept roughly consistent on write
(`always`→true, `scheduled`→`isActiveNow(...)`, `inactive`→false) for safety.

**No Cron Trigger.** Availability is derived from the schedule at view time:
the directory is CSR and polls every 20 s (the badge recomputes live — more
accurate than a 10-min cron), and the profile page computes it server-side in
SSR (Workers have `Intl.DateTimeFormat`). The rejected cron approach is out —
it added infra + lag, and the schedule blocks are richer for the patient than a
stale binary pill.

#### Schedule JSON shape

```ts
type ScheduleSlot = { d: number; s: number; e: number }
// d: weekday 0 (Sun) … 6 (Sat) — matches JS Date.getDay() in the pro's tz
// s, e: minutes from midnight, 0–1440, e exclusive
type Schedule = ScheduleSlot[]
// Mon–Fri 09:00–17:00 →
// [{d:1,s:540,e:1020},{d:2,s:540,e:1020},{d:3,s:540,e:1020},{d:4,s:540,e:1020},{d:5,s:540,e:1020}]
```

Minutes (not `"HH:MM"`) so comparisons are integer arithmetic with no string
parsing.

#### Pure helpers (`src/server/professionals.ts`, shared server + client + SSR)

- `isActiveNow(schedule, tz, now = new Date())` — uses
  `Intl.DateTimeFormat({ timeZone, weekday:'short', hour, minute })` → maps
  weekday→0-6, minutes = h*60+m, returns `schedule.some(s => s.d===day && mins>=s.s && mins<s.e)`. Bad tz → false + log.
- `formatScheduleHuman(schedule)` → "Lun–Vie 9:00–17:00".
- country→tz map (`Venezuela → America/Caracas`, …) for the UI default.
- `Schedule`/`ScheduleSlot` types + a Zod schema for save validation.

#### Server functions

- `setAvailabilityMode({ mode, schedule, timezone })` — auth-gated. `always` →
  `{ availabilityMode:'always', availabilitySchedule:null, available:true }`;
  `scheduled` → store blocks+tz+mode, `available = isActiveNow(...)`;
  `inactive` → `{ availabilityMode:'inactive', availabilitySchedule:null, available:false }`.
  The three new columns are folded into `getMyProfessional`'s select (no extra
  fetch). **`setAvailability` + the panel's manual-toggle mutation are removed.**

#### Directory (`src/server/professionals.ts` + `ayuda/profesionales/index.tsx`)

- `listProfessionals` returns `availabilityMode`/`availabilitySchedule`/`timezone`;
  `ORDER BY` becomes `name ASC` (drop `available DESC`).
- `StatusPill` → **`AvailabilityBadge`**: `always` → "Siempre disponible";
  `scheduled` → live "Disponible ahora" / "Vuelve a las HH:MM" / "No disponible"
  (client-computed each 20 s poll); `inactive` → "No conectado". The card also
  shows `formatScheduleHuman`.

#### Profile `$id.tsx` (SSR)

`getPublicProfessional` returns the three fields; the SSR loader computes the
badge server-side (so crawlers/link previews see correct text) and renders the
weekly blocks.

#### Panel UI (`src/routes/profesional/panel.tsx`)

`AvailabilitySection` replaces the ON/OFF block (`:227-263`). Three-way choice
— **Siempre disponible / Por horario / No conectado**. Por horario = weekly
grid (`<input type="time">` start/end, add/remove slots) + timezone `<select>`
(default from country). Old big ON/OFF button is gone. Inline hint when on
`always`: "Apareces siempre disponible — cambia a horario o No conectado si
prefieres." Gating unchanged (`providesService && verified`).

### Resolved decisions

- Manual ON/OFF toggle: **removed** (replaced by the three-way control; going
  offline = choosing No conectado).
- Directory ordering: **alphabetical + live badge** (no cron).
- Migration backfill: **flip ALL pros to `always`**.
- New-signup default: **`always`** (appear online on verify).

---

## Feature 2 — Profile customization from the account/panel view

### Goal

Let a verified professional edit the profile fields they entered at registration
(population, focus groups, practice areas, modality, location, WhatsApp,
credential) from their panel. The panel already hosts avatar and socials
editing; this extends it to the full profile.

### Design

- **`updateMyProfile`** (`src/server/professionals.ts`): auth-gated,
  `WHERE userId = session.user.id`; validates with `registerStep2Schema`;
  reuses `buildProUpdate` extracted from `buildProValues:581`. If
  `certificationNumber`/`credentialCountry` changed → set
  `verifiedStatus='pending'` + `available=false`, return `rereview:true`
  (prevents verified-bait-and-switch; pro sees the existing "en revisión"
  notice). `name` updates both the pro row and `user`.
- **Expand `getMyProfessional`** select (`:841`) to return the editable fields.
- **`ProfileSection`** (`panel.tsx`): seeds from `getMyProfessional`; tag-button
  markup duplicated from `completar.tsx:301-411` (TanStack-Form generics
  constraint — only option constants are shared); dirty-gate like
  `SocialsSection:483`; on `rereview` notify "…volvió a revisión".
- **No migration** (all columns already exist).

### Resolved decision

- Credential edit: **reset to `pending`** on certification-number/country change.

---

## Feature 3 — Clinical follow-up form (private per professional)

### Goal

A professional records a follow-up / seguimiento entry for a person who asked
for support. **Required:** the person's phone (same input as the professional
WhatsApp field). **Optional:** name and PFA-grounded fields that help track the
case over time. Entries are **private to the professional who wrote them** —
not public, not shared across professionals, **zero admin access**.

### Clinical grounding

The optional field set is derived from **WHO/NCTSN Psychological First Aid**
(8 core actions) + a clinical-safety layer (simplified Columbia/C-SSRS triage):
Contact & Engagement, Information Gathering, Safety/Stabilization (→ risk
triage), Practical Assistance / Coping / Linkage (→ actionTaken tags).

### Privacy boundary (honest note)

No public route and no admin route — every query is scoped
`WHERE professionalId = <my pro id>` derived from the session. This is
**app-level privacy**: the deployer can always read D1 directly.

### Data model — new table `follow_ups` (migration `0013`)

| Column            | Type      | Notes                                                                 |
| ----------------- | --------- | --------------------------------------------------------------------- |
| `id`              | integer pk| autoincrement                                                         |
| `professional_id` | integer FK| `references(professionals.id) ON DELETE CASCADE` — ownership + cleanup|
| `phone`           | text notNull | stored formatted like pro WhatsApp, e.g. `+58 412 1234567`         |
| `phone_country`   | text      | the country driving the dial code (for re-format on edit)             |
| `name`            | text      | optional                                                              |
| `reason`          | text      | optional — motivo de consulta (free text) · PFA #4                    |
| `risk_level`      | text enum | `['none','watch','urgent']` default `'none'` — clinical triage        |
| `action_taken`    | text      | optional JSON array of PFA tags (see below)                           |
| `status`          | text enum | `['open','contacted','closed']` default `'open'`                      |
| `notes`           | text      | optional free text                                                    |
| `next_contact_at` | integer ts| optional — when to follow up next                                     |
| `created_at`      | integer ts| default `unixepoch()`                                                 |
| `updated_at`      | integer ts| `$onUpdate(new Date())`                                               |

Index: `(professional_id, created_at desc)`. Plain-TEXT enums (no CHECK — Zod
validates). `action_taken` tag set (multi-select JSON array, reusing the
existing tag-button UI): `Escucha activa` · `Información sobre afrontamiento` ·
`Estabilización` · `Apoyo social` · `Derivación`.

### Phone input — shared component

Extract the country-`<select>` + `formatWhatsapp` tel input from
`completar.tsx:435-487` into `src/components/phone-input.tsx` (plain
`{country, phone, onCountryChange, onPhoneChange}` props, like
`CertificateInput`). Used by the follow-up form. Registration forms keep their
inline copy (separate optional refactor).

### Server functions — new `src/server/follow-ups.ts`

Mirrors `audio-stories.ts`: own `getHeaders()`, ownership via
`professionals.userId = session.user.id` (never a client id). Phone validated
with the same regex as `registerStep2Schema`.

- `listMyFollowUps({ q, status, riskLevel, page })` → `{ rows, total }` (`q`
  LIKEs phone/name/reason; ordered `created_at DESC`).
- `createMyFollowUp`, `updateMyFollowUp`, `deleteMyFollowUp` (ownership via
  innerJoin like `deleteMyStory:374`).
- **No public fn, no admin fn.**

### UI — new route `/profesional/seguimiento` (CSR + auth guard, like `panel.tsx`)

List (search + status/risk filter + pagination, newest first) + create/edit
form (`<PhoneInput>`, name, reason, risk `<select>` with an escalation reminder
when `urgent`, `actionTaken` tags, status, notes, next-contact date). Linked
from the panel.

### Resolved decisions

- Admin access: **none**.
- Field set: always-on (phone*, name, reason, status, nextContactAt, notes) +
  `riskLevel` (3-level) + `actionTaken` (tags). No `contactOutcome`,
  `referralNeeded`, `eventContext`, `distressLevel` for v1 (fold into notes).

---

## Implementation order

Ship **3 → 2 → 1** (standalone first; F1 reuses the panel-section pattern F2
establishes). Migrations: **`0013`** (`follow_ups`), **`0014`** (availability
columns). F2 has no migration. Each release is additive (nullable columns / new
table / new enum value on existing TEXT column) — **non-breaking**; no `sw.js`
cache bump (compatible releases; SWR + `skipWaiting` refresh installed clients).

Per deploy: `npm run deploy`, then
`npx wrangler d1 migrations apply psico-support-db --remote` **and** `--local`,
then `npx wrangler d1 migrations list psico-support-db --remote` to confirm
empty (AGENTS.md gotcha #1).
