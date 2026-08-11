# PsicoAyudaVen — 12-month roadmap

**Status:** active planning document (v1, July 2026)
**Horizon:** July 2026 → July 2027
**Owner:** tech lead + clinical advisor

This roadmap consolidates the strategic plan for the next 12 months. It is
built on the current production state (v1.23.0) and reflects decisions made
across product, architecture, team, and funding. It is the artifact to share
with funders, partners, and new team members.

For implementation gotchas, see [`AGENTS.md`](../AGENTS.md). For shipped
history, see [`CHANGELOG.md`](../CHANGELOG.md).

---

## 1. Executive summary

PsicoAyudaVen is a disaster-response psychological-support platform connecting
people in Venezuela with verified psychologists, evolving toward a volunteer
*acompañamiento* model (cross-border, non-therapy). In the next 12 months it
grows from a software-engineer-led, clinically-guided PWA into a small-team
operation shipping **native
iOS + Android apps with embedded video sessions**, a **professional AI
copilot**, and **scheduling for ongoing therapy relationships** — while keeping
the instant crisis-triage path that is the platform's reason for existing.

**Year-1 envelope:** ~$220,000–400,000 (team + platform), pursued via
funding collectives. Today the platform is sustained by a single developer;
the code is open source (MIT) on GitHub.

---

## 2. Where we are (July 2026)

| Dimension | Current state |
|-----------|---------------|
| Team | 1 software engineer (sole supporter — funds, builds, and runs the platform); clinical guidelines set by an advisory group of mental-health medical professionals |
| Platform cost | ~$0–30 / month (Cloudflare free tiers + small Sentry) |
| Surface | PWA only — installs on Android, no App Store / Play Store presence |
| Real-time | None — contact is WhatsApp outbound + pre-recorded audio stories |
| Codebase | One TanStack Start app (React 19 + Cloudflare Workers + D1 + R2 + Analytics Engine) |
| Code | **Open source** (MIT license), public on GitHub (`github.com/enBonnet/psico-support`) |
| Model | Verified-pro directory operational (v1.0, 2026-06-28); volunteer *acompañamiento* model drafted (`/voluntariado`, `/privacidad`) but **not legally validated**, no volunteer registration flow |
| Release cadence | ~25 releases in ~25 days (v1.0 → v1.23.0) |

**Governance today:** the platform is sustained solely by its lead software
engineer, who funds, builds, and operates it. An advisory group of
mental-health medical professionals defines the clinical guidelines,
protocols, and professional standards that therapists and volunteers on the
platform must follow — the engineer executes delivery; the clinical group
sets the standard of care. This split already exists and is the foundation
the Year-1 team expansion builds on — the clinical-advisor role in §12
formalizes and extends it, not creates it. The codebase is open source under
the MIT license, born at the Build4Venezuela open hackathon (a free,
no-prize community event — **not** a founder, funder, or ongoing
institutional relationship).

**Annual run-rate today:** ~$200–400 (domain + minimal services).

**Metrics since launch (2026-06-28), pulled 2026-08-03:**

| Metric | Value | Source |
|--------|-------|--------|
| Unique visitors | 4,140 (as of 2026-07-14) | Cloudflare Web Analytics |
| Unique visitors/day (current) | ~300 (as of 2026-07-14) | Cloudflare Web Analytics |
| Engaged actors (≥1 tracked event) | 839 (~20% of visitors) | Analytics Engine |
| Total tracked events | 3,448 | Analytics Engine |
| WhatsApp contacts (all CTAs) | 131 — help-now 85, directory card 28, `/ahora` 10, random 8 | Analytics Engine |
| PWA installs | 13 | Analytics Engine |

**Reach vs engagement:** ~4,140 visitors reached the site (last pulled
2026-07-14 — Web Analytics isn't queryable via the events API), while 839
(~20%) triggered a tracked action and 131 (~3.2%) opened a WhatsApp
conversation. Engaged actors peaked at 212 on launch day (Jul 2) and have
settled to ~10–20/day through late July against ~300 raw visitors/day. The
help-now CTA is the single biggest converter (85 of 131 contacts, up from 64
three weeks ago). This gap is the quantitative case for the funnel-rebuild
work in Q4 — the platform has reach; converting that reach into help-seeker
contacts is the open product problem.

---

## 3. Where we want to be (July 2027)

| Dimension | Target state |
|-----------|--------------|
| Team | 4–6 people (3 full-time eng + clinical advisor + design + community) |
| Surface | Web (PWA, public reach) + **native iOS + Android apps** in the stores |
| Real-time | **Embedded video sessions** (LiveKit) — the primary professional channel |
| Chat | In-app first-aid chat (Cloudflare Durable Objects) + WhatsApp (demoted to first-aid) |
| AI | **Pro-facing copilot** (follow-up assist, recommendations, risk patterns). Help-seeker never interacts with AI. |
| Scheduling | Video-session booking with calendars, cases, longitudinal therapy tracking |
| Model | Volunteer model legally validated and operational alongside the verified-pro directory |
| Funding | Sustainable source identified and committed |
| Measurement | Outcome metrics (not just funnel) |

---

## 4. The platform contains two coexisting products

This split is load-bearing and must not be blurred in the UI.

| Product | Goal | Session | Friction | Commitment | Identity | Channel |
|---------|------|---------|----------|------------|----------|---------|
| **Crisis triage** (existing) | **Restore stability** — PFA, not therapy | ~15 min, on-demand | Zero — no account, no booking | Single contact | Anonymous OK | Chat / WhatsApp / on-demand video |
| **Ongoing therapy** (new) | Therapeutic work over time | Scheduled, longer | Booking, account, consent | Multi-session relationship | Identified | Scheduled video sessions |

**Rule:** a person in crisis must never hit a "create account to talk now"
wall. The crisis path stays frictionless; the therapy path is a committed,
identified relationship.

**Clinical boundary (load-bearing):** the crisis path delivers
**psychological first aid (PFA) — stabilization, not therapy.** Its sole goal
is to restore the person's stability in the moment (a ~15-minute support
session) and refer onward if needed. It is **not** psychotherapy and **not**
regulated professional practice, which is precisely why trained volunteers
can deliver it (the volunteer *acompañamiento* model serves this path). The
therapy path is actual therapeutic work and remains the exclusive domain of
licensed professionals. These goals must not blur: a crisis session never
becomes ad-hoc therapy, and a therapy engagement never collapses into a
15-minute patch.

---

## 5. Channel hierarchy

```
Help-seeker arrives (web or native app)
  │
  ├─ CRISIS PATH (~15-min stabilization — PFA, not therapy)
  │    ├─ In-app first-aid chat (Durable Objects)
  │    ├─ WhatsApp (ws) — first aid only
  │    └─ On-demand video (~15 min — restore stability, refer onward)
  │
  └─ THERAPY PATH (scheduled therapeutic work — licensed pros only)
       └─ Scheduled video session (LiveKit)

Professional side (all sessions, both paths)
  ├─ Case management (cases + sessions + follow-ups)
  ├─ AI copilot (pro-facing, reviewed, never user-facing)
  └─ Scheduling (therapy-path video sessions only)
```

**Video serves both paths with different goals:** crisis path = ~15-minute
on-demand stabilization (PFA); therapy path = scheduled therapeutic sessions.
Chat and WhatsApp are never scheduled — they stay instant first-aid. This
confines scheduling complexity to the therapy path's video surface.

---

## 6. Architecture — backend owns the logic

The single most important architectural principle for a small team:

> **All business logic lives in the backend (Cloudflare Workers). The three
> presentation layers (web, iOS, Android) are thin renderers that call the
> same API. No logic is duplicated across platforms.**

```
┌─────────────────────────────────────────────────────────────┐
│                     PRESENTATION (thin)                      │
│   Web PWA (TanStack Start)   │   Native apps (React Native)  │
│   - public reach + SEO       │   - iOS + Android, one RN     │
│   - directory, /recursos,    │     codebase                  │
│     /apoyo, legal pages      │   - the primary product:      │
│   - low-end-device fallback  │     auth, panel, cases,       │
│                              │     video, chat, scheduling   │
└──────────────┬───────────────┴───────────────┬───────────────┘
               │                               │
               └───────────────┬───────────────┘
                               │  shared API contract
                               │  (Zod schemas, typed server fns)
                               ▼
┌──────────────────────────────────────────────────────────────┐
│                  BACKEND (all logic lives here)               │
│                  Cloudflare Workers                            │
│   ├─ D1 (SQLite) — directory, users, cases, sessions, slots   │
│   ├─ R2 — avatars, certificates, audio stories                │
│   ├─ Durable Objects — real-time first-aid chat                │
│   ├─ Analytics Engine — product telemetry (write-only)        │
│   ├─ Email Service — transactional + session reminders         │
│   ├─ LiveKit (external) — video sessions (room creation,      │
│   │                       tokens, webhook handling)           │
│   └─ AI providers — Workers AI (in-region) + LLM API (DPA)    │
│                      for the pro copilot                       │
└──────────────────────────────────────────────────────────────┘
```

**Implications:**
- Validation, scheduling rules, conflict checks, risk escalation, AI
  orchestration, video token minting — **all server-side.**
- Clients render state and call mutations. Nothing smarter.
- The shared schema/type layer (Zod) is the contract. A change to a schema
  is the single source of truth across all three clients.
- **One mobile engineer can ship both iOS and Android** because the RN app
  is a thin renderer. This is the "more with less" lever.

---

## 7. AI strategy — pro-facing copilot only

**Principle:** the help-seeker never interacts with AI. The "personas reales,
no bots ni inteligencia artificial" promise (landing, v1.13.1) holds without
rewrite. AI is a tool the professional uses on the back end; everything it
produces is reviewed by a human before reaching any record or person.

### Copilot features

| Feature | What it does | Phase |
|---------|--------------|-------|
| Follow-up note assistance | Suggests structure, flags missing elements, completes templates from pro notes | Q1 2027 |
| Resource recommendations | Suggests `/recursos`, referrals, worksheets based on session tags | Q1 2027 |
| Caseload risk pattern detection | Flags escalating risk / missed sessions across a pro's open cases | Q2 2027 |
| Session handoff summary | Summarizes the preceding first-aid chat for the incoming pro | Q1 2027 |
| Treatment plan drafting | Suggests goals/milestones from case context (pro reviews) | Q2 2027 |
| Outcome-over-time signals | Surfaces progress signals across sessions | Q2 2027 |

### Provider strategy (two-tier, data-handling tied to legal review)

- **Cloudflare Workers AI** (in-region) for cheap/fast calls: tagging,
  classification, routing flags. Data stays in Cloudflare — no DPA needed.
- **LLM API** (Anthropic/OpenAI) for clinical-grade generation (drafting,
  summaries). Requires a **Data Processing Agreement + explicit consent**.
  Decision deferred to Q3 legal review.

**Off the table (non-negotiable):**
- AI chatbot *as therapist*.
- AI diagnosis.
- AI without a human escalation path.
- Any AI the help-seeker interacts with directly.

---

## 8. Data & retention

| Data class | Retention |
|------------|-----------|
| Anonymous crisis-triage contacts (no account) | 12 months after last contact (existing draft) |
| Ongoing therapy cases | **Kept while the case is active.** The 12-month window starts when the case concludes (`status → concluded` or `referred_out`). |
| Professional verification documents | Kept while the pro is verified; removed on request / removal |
| Session video | **Never recorded.** LiveKit sessions are live-only. |
| Analytics | Aggregate-only, immutable column contract (gotcha #10) |

**Privacy rule:** longitudinal case data is far more sensitive than single
crisis contacts. External LLM use on session notes requires strong DPA +
explicit consent — default to Workers AI (in-region) until legal clears
external providers.

---

## 9. Native apps — full product, React Native, thin

- **One React Native codebase** → iOS + Android.
- Full feature parity with the web product (the app *is* the product).
- Thin renderer — all logic via the shared API (see §6).
- **Web (PWA) stays** as the public reach layer: landing, public directory,
  pro profiles (SSR for OG/JSON-LD per gotcha #6), `/recursos`, `/apoyo`,
  legal pages, and a low-end-device fallback.
- New interactive features (video, chat, scheduling, AI copilot) target
  native first; web follows or stays public-only.

**Mobile engineering strategy:** start with **one senior mobile engineer**,
add a mid/contractor in Q1 2027 if scope demands. Because the app is thin,
one engineer can carry both platforms.

---

## 10. Scheduling, cases, long-term therapy

### What exists
- `availability_mode` (always/scheduled/inactive) + recurring weekly blocks
  + IANA timezone, availability derived at view time (v1.13.0, migration 0014).
- `follow_ups` table — flat, one record per contact, owner-scoped
  (v1.13.0, migration 0013).

### What's added (additive migrations, non-breaking)

```
cases (NEW)
  id, professional_id, help_seeker_user_id (nullable),
  status (active|paused|concluded|referred_out),
  treatment_goals (JSON text), started_at, concluded_at

sessions (NEW)
  id, case_id (nullable — crisis contacts stay case-less),
  professional_id, scheduled_at, duration_min,
  status (scheduled|completed|cancelled|no_show),
  video_room_id, risk_level, action_taken, notes

slots (NEW)
  id, professional_id, start_at, end_at,
  status (open|booked|blocked), booked_by_user_id, case_id

follow_ups (EXISTING — keep, extend)
  + optional case_id (nullable, backfills to null)
```

### Build vs buy (scheduling)
- **v1: build minimal on D1** (slots + bookings + conflict checks). The
  existing `availability_schedule` already models recurring blocks — extend
  it to materialize bookable slots.
- **v2 (Q2 2027, only if pros demand):** Google Calendar API sync (free).
- Calendly (per-seat cost) and self-hosted Cal.com (ops burden, Node not
  Workers-native) are **not** adopted.

### Scope discipline — this is NOT an EHR
Build the minimum that supports *acompañamiento* continuity. Avoid:
structured diagnosis fields, insurance/billing, prescription tracking,
medical-grade audit logging. Those are a different regulated company.

---

## 11. Beyond Year 1 — subscriptions & specialist compensation (Preply-for-therapy)

**This is the goal AFTER the 12-month roadmap, not a Year-1 deliverable.**
Nothing in this section is built during Year 1; it is the endgame that the
Year-1 work (team, scheduling, cases, video, native apps, verified specialist
pool) is the *foundation* for. Year 1 remains fully grant/collective-funded
(see §15); subscriptions begin contributing in Year 2.

The platform will operate a **two-tier service model**, and only one tier is paid:

| Tier | Path | Cost | Goal |
|------|------|------|------|
| **Free** | Crisis triage (~15-min PFA stabilization) | $0 — the mission | Restore stability, refer onward |
| **Subscription** | Ongoing therapy (scheduled video sessions) | Monthly fee → quota of sessions | Therapeutic work with licensed specialists |

### How the subscription works (Preply-style marketplace)

- A user subscribes **monthly** and receives a **quota of therapy sessions** for
  that month (e.g. a tier might include 4 scheduled sessions/month).
- The user is matched with licensed specialists from the verified directory.
- **Each delivered session pays the specialist.** The platform collects the
  subscription, disburses per-session payment to the specialist, and retains a
  commission.
- **Commission funds three things:** (1) the specialist payout, (2) payment
  processing fees, and (3) platform maintenance + the **free crisis path**.
  The paid tier cross-subsidizes the free mission — this is the platform's
  sustainability engine and the answer to "who pays for the free crisis help."

### Specialist compensation (Year-2 decision)

| Model | Description |
|-------|-------------|
| **Platform-standard rate** (v1, recommended) | Every verified specialist is paid the same fixed amount per delivered session. Simple, equitable, easy to reason about. |
| Specialist-set rate (Prepy-style) (v2) | Each specialist sets their own per-session price; users choose on price/fit. Marketplace dynamics. Only pays off at volume. |

v1 standard-rate is the ponytail choice: one number, one payout rule, no
marketplace arbitrage to build. Specialist-set rates add a marketplace layer
(tiers, ranking, dynamic pricing) that only pays off at volume.

### Payment processing — the Venezuela complication (must flag)

Venezuela's financial system makes subscriptions and specialist payouts
non-trivial:

- **Stripe does not operate in Venezuela.** Subscription billing likely
  requires a US/international entity (Stripe Atlas, or equivalent) or a
  LATAM-friendly processor (dLocal, Ebanx, MercadoPago).
- **Paying Venezuelan specialists** is the harder problem. Realistic rails
  in-region: Payoneer, Wise, Binance Pay (USDT), Zelle, or crypto (USDT/TRC20).
  Each has compliance, fee, and UX trade-offs.
- This is a **Year-2 workstream** for legal/ops, not a Year-1 task. The
  chosen rails affect the financial model, consumer-protection exposure, and
  tax reporting in both Venezuela and the processor's jurisdiction.

### Trust & transparency

Introducing money changes the trust model. Rules:

- The **crisis path is and remains visibly free.** No paywall, no upsell, no
  "upgrade to talk now." A person in crisis never sees a price.
- Paid therapy is a clearly separate, opt-in tier — never inserted into the
  crisis flow.
- Pricing, session quotas, and the commission split are transparent to both
  users and specialists. No hidden fees.
- The landing's "personas reales" promise still holds — payment routes users
  to real licensed humans, not to AI.

### Indicative schema (Year-2 scope, not built in Year 1)

```
subscription_plans (NEW)
  id, name, monthly_price_usd, sessions_per_month,
  status (active|retired), created_at

user_subscriptions (NEW)
  id, user_id, plan_id, status (active|cancelled|past_due),
  current_period_start, current_period_end,
  sessions_remaining, payment_processor, processor_customer_id

session_payouts (NEW)
  id, session_id, specialist_id, amount_usd,
  status (pending|paid|failed), processor_payout_id, paid_at
```

Sketched here so Year-1 schema choices (§10) don't preclude them — the cases
and sessions tables are designed to attach payouts later without restructuring.

### What Year 1 does to enable this

Year-1 deliverables are the *prerequisites*, not the monetization itself:

- **Verified specialist pool + scheduling + cases** (§10) → the supply side.
- **Native apps + video sessions** (§9, §5) → the delivery surface.
- **Clinical governance + legal review** (Q3) → the trust + compliance
  foundation that payments require.

### Budget impact in Year 1

**None.** Subscriptions are not launched and not revenue-bearing during Year 1.
The team/platform budget in §13–§14 is entirely grant/collective-funded.
Payment-processing fees and specialist payouts are Year-2 lines, scoped once
the model launches.

---

## 12. Team (the dominant cost)

LATAM rates (USD/month). Lean but real team. Ramps conditional on funding.

| Role | Commitment | Monthly | Annual | Why |
|------|-----------|---------|--------|-----|
| Tech lead / full-stack (current dev) | FT | $4,000–6,000 | $48–72k | Owns platform + stack, mentors |
| Mobile engineer (React Native) | FT | $3,500–5,000 | $42–60k | Owns iOS + Android (thin apps, one codebase) |
| Backend / platform engineer | FT (or 0.8) | $3,000–4,500 | $36–54k | Owns video integration, chat (DO), reliability, data |
| Clinical advisor (licensed psychologist) | 0.2–0.3 | $800–1,500 | $10–18k | Safeguarding, protocol, pro/volunteer relations |
| Product / UX designer | 0.5–1.0 | $1,500–3,000 | $18–36k | UX for crisis context (low-friction is clinical) |
| Community / support lead | 0.5 | $800–1,500 | $10–18k | Pro + volunteer onboarding (extends `docs/professional-communications.md`) |
| Legal counsel (Venezuelan lawyer, LOPDP) | retainer | $300–800 | $4–10k | Volunteer charter, data protection, institutional decision |
| QA / test | 0.5–1.0 | $1,200–2,500 | $14–30k | Zero tests exist today; becomes load-bearing with native + video |
| Grant writer / funding lead | contract (Q3–Q4) | $1,000–3,000 | $6–18k | Owns funder pipeline |

**Team total: ~$170,000–280,000 / year.**

---

## 13. Platform & services budget

| Service | Cost / month | Notes |
|---------|-------------|-------|
| Cloudflare (Workers paid, D1 paid, R2, Analytics Engine, Email) | $5–25 | Generous paid tiers; R2 grows with audio/video storage |
| Sentry (Team) | $26–80 | Scales with native crash reporting |
| Apple App Store | ~$8 (amortized $99/yr) | Annual fee |
| Google Play | ~$2 (one-time $25) | Negligible |
| **Video provider (LiveKit)** | **$300–1,500** | Usage-based — the real variable cost; self-host option Q2 2027 |
| Durable Objects (chat) | $50–300 | Real-time first-aid chat |
| AI providers (Workers AI + LLM API) | $30–200 | Pro-facing, low volume (much cheaper than user-facing triage) |
| Email (transactional) | $0–20 | Cloudflare Email Service, currently free |
| Domain + DNS | ~$1 | psicoayudaven.com |
| Observability / APM (beyond Sentry) | $0–200 | Optional |

**Platform total: ~$400–2,500 / month → ~$5,000–30,000 / year.**

### One-time / capex (Year 1)

| Item | Cost | When |
|------|------|------|
| Legal review of volunteer charter + privacy (project) | $2,000–6,000 | Q3 |
| App Store / Play Store listing assets, screenshots | $500–1,500 | Q4 |
| Load testing tooling/consulting (disaster-spike readiness) | $1,000–3,000 | Q4 |
| Video integration spike (LiveKit POC) | internal | Q4 |

---

## 14. Total annual budget

| Bucket | Low | High |
|--------|------|------|
| Team (salaries) | $170,000 | $280,000 |
| Platform & services | $5,000 | $30,000 |
| One-time / capex | $4,000 | $11,000 |
| Buffer (10%) | $18,000 | $32,000 |
| **TOTAL Year 1** | **~$197,000** | **~$353,000** |

**Biggest cost lever:** video adoption. If sessions take off, the
$300–1,500/mo line can 3–5× by year-end. Self-hosting LiveKit (Q2 2027 if
volume justifies) flattens this.

---

## 15. Funding strategy

Funding is a named Q3 workstream, not a side task. Target collectives (ranked
by fit):

| Collective | Fit | Why |
|-----------|-----|-----|
| **Mozilla MVP** (Mozillas.org) | Highest | MIT-licensed open source serving a marginalized population — textbook fit |
| **IDB Lab / BID Lab** | High | LATAM social innovation; mental health + tech eligible |
| **Grand Challenges Canada** | High | Global mental health funding; funds non-Canadian interventions |
| **Help.NGO** | High | Disaster-response tech — exact use case |
| **Direct Relief / Americares** | Medium | Health emergency NGOs with Venezuela programs |
| **Open Society Foundations** (LATAM) | Medium | Civil society + rights; longer cycle |

**Action:** Q3 = shortlist 3–4, draft applications. Q4 = first decisions;
team ramp accelerates conditional on a commitment.

**Funding-contingent phasing:** Q3 runs lean on existing resources (solo dev
+ small legal retainer + grant writing). The Q4 team ramp accelerates only if
a collective commits. If not, Q4 stays lean and we ship the volunteer flow +
legal foundation on current resources, deferring native apps.

---

## 16. Quarterly phasing

### Q3 2026 — Foundation & legal unblock (lean, pre-funding)

**Lean track (always):**
- Volunteer registration flow (parallel to pro registration, pointing to
  `/voluntariado`; cédula optional, adhesion letter captured as consent).
  Resolves CHANGELOG 1.23.0 explicit debt #1.
- Formal legal review kickoff (volunteer charter + privacy + AI data
  handling decision). Resolves debt #3.
- Institutional-registration decision (formal Venezuelan registration vs.
  low-profile). Resolves debt #4.
- Follow up the natural-disaster support group promised to pros on
  2026-07-03 (see `docs/professional-communications.md`).
- **Funding pursuit:** shortlist collectives, draft applications.
- Design the case/session data model with the clinical advisor.
- Retention/privacy review for long-term case data.

**Funded track:** — (none; conditional on Q3/Q4 funding landing)

**Success metric:** volunteer registration ships; legal review engaged;
support group has a launch date; 3+ funding applications submitted.

### Q4 2026 — Volunteer model live + native scaffold + video POC

**Lean track:**
- Volunteer matching surface (how a help-seeker reaches a volunteer vs a
  verified pro).
- Landing + `/ayuda` copy rewrite (both models operational).
- Safeguarding/escalation protocol (what a volunteer does at acute risk).
- Load test for disaster spikes.

**Funded track (if a collective commits):**
- Hire: mobile engineer + designer + clinical advisor.
- React Native scaffold (auth + panel + directory read).
- LiveKit video integration POC.
- Durable Objects first-aid chat MVP.
- **Scheduling v1** — slot booking on D1, TZ-aware, booking confirmation
  (email until push exists). Migrations: `cases` + `sessions` + `slots`.

**Success metric:** first volunteer cohort onboarded; native app scaffold in
build; LiveKit POC working end-to-end; scheduling v1 ships.

### Q1 2027 — Apps in stores + video live + AI copilot v1

- iOS + Android store submissions.
- Video sessions in production (scheduled).
- Push notifications (session reminders).
- First-aid chat in production.
- **AI copilot v1:** follow-up assist + recommendations + handoff summary.
- **Case management v1** in the native app: case list, session log,
  treatment goals.
- Outcome metrics v1 (opt-in, aggregate-only, post-contact).
- Test infrastructure (fix the vitest/Cloudflare-plugin startup gap; tests
  for auth guards, `pickRandomProfessional` weighting, `isActiveNow`,
  per-request isolation).
- Extract `getHeaders()` to `lib/auth.ts` (the `ponytail:` ceiling, if a
  4th server-fn module appears).

**Success metric:** apps live in both stores; first video session completed;
AI copilot used by ≥1 pro; outcome metric collecting data.

### Q2 2027 — Scale, sustainability, annual maturity

- Bus-factor reduction: runbooks (deploy, migration, incident), second
  deployer, onboarding doc.
- Governance decision (open-source contribution guide, who holds deploy
  keys, fiscal sponsor vs. standalone).
- AI quality / bias clinical audit (triage thresholds, false-negative rate).
- Outcome data review + first **annual impact report** (public, in Spanish;
  feeds back into `/acerca-de`).
- Feature-parity review vs. international peers (Crisis Text Line, 7 Cups).
- Optional Google Calendar sync if pros demand.
- Annual retrospective + replan.

**Success metric:** a second person can deploy; an impact report exists; the
next 12 months planned from data.

---

## 17. What this plan deliberately does NOT build

- **No in-app real-time text chat as a therapy channel.** Chat is first-aid
  only; video is the session medium.
- **No AI chatbot as therapist / AI diagnosis / user-facing AI.** Breaks the
  core trust promise; AI is pro-facing only.
- **No monetization built in Year 1.** Subscriptions/specialist payouts are
  the post-Year-1 goal (see §11), not a Year-1 deliverable. Year 1 stays
  grant/collective-funded; introducing money earlier would change the trust
  model before the volunteer model and specialist pool are proven.
- **No multi-country expansion.** Cross-border volunteers ≠ cross-border
  service area. Stay Venezuela.
- **No custom video backend.** External provider (LiveKit) only.
- **No EHR.** Scheduling + cases + session logs are the minimum for
  continuity, not a regulated medical record system.
- **No session recording.** Live-only video; retention rule simplified.
- **No Calendly / per-seat scheduling SaaS.** Per-seat costs scale badly
  and data leaves the boundary.

---

## 18. Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Legal exposure of the volunteer model (unvalidated framework + safeguarding gap) | High | Existential | Q3 legal review before scaling volunteers |
| Funding does not land in Q3/Q4 | Medium | High (delays native + video) | Funding-contingent phasing; lean Q3/Q4 keeps shipping |
| Video adoption spikes platform cost 3–5× | Medium | Medium | Self-host LiveKit Q2 2027 if volume justifies |
| D1 / Cloudflare limits under a real disaster | Medium | High | Q4 load test; verify fail-soft (the v1.21.2 infinite-skeleton pattern) |
| Maintainer burnout (solo → small team transition) | High | High | Q2 bus-factor work; funding enables delegation |
| Volunteer burnout / quality drift at scale | Medium | High | Onboarding + periodic re-engagement; clinical advisor owns |
| AI copilot produces a harmful recommendation that reaches a help-seeker | Low | High | Human-in-the-loop rule; pro reviews everything; Q2 bias audit |

---

## 19. Open items (minimal)

| Item | Owner | Resolution |
|------|-------|-----------|
| AI data handling — in-region (Workers AI) vs external LLM with DPA | Legal review (Q3) | Tied to longitudinal-data privacy question |
| Specific funding source(s) | Funding lead | Q3 applications |
| Video on-demand (crisis) vs scheduled-only | Tech lead | This plan assumes scheduled-only; revisit if crisis-path video is requested |

---

## Changelog

- **2026-07-14** — v1. Initial consolidated plan. Captures decisions across
  team, native apps (React Native, full product), video (LiveKit), chat
  (Durable Objects, first-aid), AI (pro-facing copilot), scheduling + cases,
  retention (case-active), funding (collectives), and the backend-owns-logic
  architecture.
