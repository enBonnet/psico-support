# Ponytail Debt Ledger

Harvested from `ponytail:` comments across the repo. Per the `ponytail-debt`
convention, a `ponytail:` comment is supposed to name **a deliberate
simplification, its ceiling, and the trigger to revisit it.** This ledger
tracks those deferrals so "later" can't quietly become "never."

**Last audited:** 2026-07-08.

---

## How to read this

Each row: `file:line — what was simplified. ceiling: the limit named.
upgrade: the trigger to revisit.`

- **Actionable deferrals** — a real ceiling + trigger. Track these.
- **Stale / partially rotted** — comment drifted from reality. Fix the comment
  or the code.
- **Guardrails (not debt)** — comments that document a deliberate *safety*
  choice, not a shortcut. Kept for reference; no action.
- **Documentation (not debt)** — the ~370 comments that explain *why* code is
  shaped a certain way. Not listed individually. Not actionable.

## Stats

- **Total `ponytail:` markers:** ~380 across ~70 files.
- **Actionable deferrals:** 1 open (the `getHeaders()` duplication).
- **Stale:** 0 after this audit (the audio-story-viewer "no profile photos
  yet" was fixed in the same change that produced this ledger).
- **No-trigger markers:** the majority of the ~380. These are documentation,
  not debt — see "Boundaries" below.

---

## Actionable deferrals

### `getHeaders()` duplicated across 3 server-fn modules

- `src/server/professionals.ts:2037`
- `src/server/follow-ups.ts:19`
- `src/server/audio-stories.ts:18`

**What was simplified:** the per-request `getHeaders()` helper (wraps
`getRequestHeaders()` from TanStack Start, with a try/catch that returns empty
`Headers` outside a request) is copy-pasted into each server-fn domain module
rather than imported from a shared location.

**Ceiling:** 3 copies. Cross-module imports are avoided to keep the domains
decoupled.

**Upgrade:** extract to `src/lib/auth.ts` **when a fourth server-fn module
needs it.** This trigger is documented verbatim in AGENTS.md gotcha #9 and in
the comment on each copy.

**Status:** open, not yet triggered. Leave as-is.

---

## Stale (resolved in this audit)

### ~~Audio-story viewer: "no profile photos yet"~~

- `src/components/audio-story-viewer.tsx:17` (now updated)

**Was:** the comment claimed profile photos didn't exist yet and the gradient
+ initial served as the avatar substitute. In reality the avatar
infrastructure (`professionals.avatarKey`, `publicAvatarUrl`,
`/media/avatar/$.ts`, the `Avatar` component) had shipped — it just wasn't
wired into the stories tray/viewer.

**Resolved:** `listStoryTray` now selects `avatarKey`; the viewer + tray render
the photo when present, falling back to the initial. Comment updated to
reflect that the gradient is now a background layer behind the photo, not a
substitute for one.

---

## Guardrails (deliberate, not debt — do not "fix")

These look like deferrals but are actually load-bearing safety decisions.
Documented here so a future agent doesn't treat them as TODOs.

### Crisis banner: no Venezuela-wide crisis line

- `src/components/crisis-banner.tsx:6`

**What:** the banner points to local emergency services + the directory rather
than a phone number, because no verified Venezuela-wide crisis line existed at
build time.

**Why it's a guardrail, not debt:** the comment explicitly says
"NEVER invent a number here — only add a specific line with a verified
official source." Adding a number without a real source would be dangerous.
This becomes actionable only if/when a verified national line surfaces.

### Analytics column contract is immutable

- `src/server/analytics.ts` (catalog header)

**What:** `TRACKED_EVENTS` event names and `param1/2/3` slots are frozen —
renaming or reshuffling breaks historical queries in Analytics Engine.

**Why it's a guardrail:** documented in AGENTS.md gotcha #10. Add new events
freely; never change existing ones.

### D1 transient retry helper is hand-rolled

- `src/db/index.ts:46` (`withD1Retry`)

**What:** a small retry-with-backoff wrapper around D1 queries to absorb
transient DO resets (the WEB-1 / WEB-3 incidents in the CHANGELOG).

**Why it's a guardrail:** the hand-rolled version works and is documented.
Upgrade path would be an official Cloudflare retry wrapper if one ships; none
exists today.

---

## Boundaries

**Read-only report.** This file changes nothing in the code.

**The ~370 documentation comments are intentionally not listed here.** A
`ponytail:` comment that explains *why* code exists (SSR vs CSR routing
choices, fire-and-forget analytics, R2 key conventions, PFA/ASQ-derived
clinical content provenance, security ownership checks) is documentation, not
debt. The convention has drifted slightly from its original
"ceiling + trigger" intent toward general commentary — that's a style note,
not an action item. If the convention is ever tightened, those comments would
need to lose the `ponytail:` prefix (or gain a real ceiling), but that's a
sweep, not a debt paydown.
