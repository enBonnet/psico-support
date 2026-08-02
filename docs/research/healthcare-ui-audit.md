# Healthcare UI Audit — psico-support

Audit of the psico-support UI against the **Healthcare UI Patterns** skill (grounded in the Koruux 50 healthcare UX/UI examples). The skill lives at `.claude/skills/healthcare-ui/`.

**Scope:** landing, professional directory (Patient Look-up), profile (Patient Records), appointment booking (Appointment Scheduling), account hub (Patient Portal), professional panel (Dashboard), specific-help triage (Outreach), crisis banner, and root shell.

**Method:** read each screen, mapped it to the relevant Koruux category + cross-cutting principles, and scored it. Findings below are ordered by impact: critical → strong → opportunity.

---

## TL;DR

The app is **already strong** on healthcare UX fundamentals — privacy-by-default, crisis-first design, sensitive Spanish tone, accessibility, and mobile-first. Several patterns match or exceed the Koruux best practices.

**Update (1.31.0):** The 3 critical findings (C1 booking lifecycle, C2 crisis banner, C3 panel summary) and 4 opportunities (O4, O7, O8, O4-TS) have been **resolved in code** in this release. The sections below are preserved as the original audit for reference; see the [CHANGELOG `[1.31.0]` entry](../../CHANGELOG.md) for the shipped fixes. Residual gaps noted below: **C1** still lacks a dedicated reschedule server fn (the cancel-then-rebook path works but sends two emails), and there are no in-app reminders (only the confirmation email + `.ics`). The **Tier 3 opportunities** (O1, O2, O3, O5, O6) remain roadmap items.

| Category | Screen | Koruux match | Verdict |
| --- | --- | --- | --- |
| Cross-cutting | All | ✅ | Privacy, tone, a11y, crisis-first all present |
| 1. Patient Look-up | `/ayuda/profesionales` | ✅ Strong | Great search/filter/differentiators; missing favorites + search history |
| 2. Patient Records | `/ayuda/profesionales/$id` | ✅ Strong | Clear hierarchy; no "recent visits"-style timeline |
| 3. Appointment Scheduling | `/cuenta/sesiones/agendar/$proId` | ⚠️ Gap | Slot grid + context good; **no reschedule/cancel, no reminders to patient, no provider context** |
| 7. Dashboard | `/profesional/panel` | ✅ Strong | Clear card hub; no analytics/summary at-a-glance |
| 9. Patient Outreach | `/ayuda/especifica` | ✅ Strong | Excellent triage; no "saved area" / follow-up |
| 10. Patient Portal | `/cuenta` | ✅ Strong | Role-aware hub; no notification prefs |

---

## Critical findings (3)

### C1. Appointment Scheduling lacks reschedule, cancel, and reminder context — Koruux Cat. 3

**Where:** `src/routes/cuenta.sesiones.agendar.$proId.tsx` (booking only), `src/routes/cuenta.sesiones.tsx` (list only — not audited but referenced).

**Koruux:** "Ensuring the utmost flexibility to reschedule or cancel appointments easily is crucial" + "On the patient's side, there should be clarity on the slot picked. The system should have communication prompts to ensure that the patient shows up on time" + "On the provider's side, it is crucial to provide maximum context and information before the appointment."

**Gap:** The booking flow lets a user pick a slot and confirm, but there's no visible:
- **Reschedule / cancel** affordance after booking (only a list view exists).
- **Communication prompts** — the `onSuccess` notify says "Te enviamos los detalles… por correo" but no in-app reminders, and no "add to calendar" link (Koruux explicitly calls out "save the appointment to a digital calendar").
- **Provider context** — the booking page shows the pro's name and durations, but not their photo, location, modality (video link), or a pre-visit note. Koruux: "recently captured vitals, known conditions, and the chief reason for the visit" — in this app's analog: the reason for seeking support.

**Recommendation:**
1. Add a reschedule + cancel action on `/cuenta/sesiones` (and a cancel link in the confirmation email).
2. Surface an "add to calendar" (`.ics`) link on confirmation — the email service already supports `.ics` per `src/server/email.ts`.
3. On the booking confirmation + reminder, include the pro's photo, name, modality, and a one-line "what to expect."
4. Optional: a free-text "motivo de la consulta" field at booking (PHI caution — store minimally, don't log).

### C2. No crisis banner on the highest-traffic entry point — Koruux cross-cutting (Critical Information Delivery)

**Where:** `src/routes/index.tsx` (landing). The `CrisisBanner` component exists and is used on `/recursos/*` pages, but **the landing does not render it**.

**Koruux:** "Establish a clear mechanism for time-sensitive or critical information — it must not be buried in a general feed." + "Crisis resources visible… should be accessible from anywhere."

**Gap:** A user landing on `/` who is in acute suicidal crisis sees "Apoyo psicológico ante los terremotos" and CTAs — but no immediate crisis escape hatch. The fastest path is "Necesito ayuda ahora" → auto-picks a pro → WhatsApp, which is good, but it's 2 taps and assumes a pro is contactable. A crisis banner with "¿Es una emergencia? Acude al centro de salud más cercano" should be visible on first paint.

The `/ayuda/especifica` triage **does** have a crisis footnote (line 151-155), and the `CrisisBanner` is on recursos pages — so the pattern exists, it's just not on the landing.

**Recommendation:** Render `<CrisisBanner />` near the top of the landing (above or directly below the hero), matching its placement on recursos pages. This is a small, high-impact change.

### C3. Provider dashboard gives no "intervention needed" cues — Koruux Cat. 7

**Where:** `src/routes/profesional/panel.tsx`.

**Koruux:** "Depict a clear overview of how things are running. Highlight scenarios where an intervention may be required." + "A dashboard should be a quick summary indicating health with an easy way to probe further."

**Gap:** The panel is a clean card menu (Perfil, Presentación, Disponibilidad, Sesiones, Seguimiento, Audios) with status badges — but a provider opening it gets **no summary of what needs attention today**:
- No "you have N upcoming video sessions today/this week."
- No "N open clinical follow-ups need a note" (the count badge exists, but it's not framed as actionable).
- No "your availability window starts in 30 min" reminder.

The `countMyOpenFollowUps` badge (line 84-87) is the closest, but it's a passive count, not an intervention cue.

**Recommendation:** Add a compact "Hoy" / "Atención" summary card at the top of the panel (when there's anything to show):
- Upcoming video sessions (next session time + patient initials).
- Open follow-ups needing a note (with a direct link).
- Availability status reminder ("Tu ventana de atención empieza en N min").

Keep it empty-state-safe: if nothing's pending, the card is absent (don't show an empty "nothing today" box — Koruux: avoid dashboards that feel empty).

---

## Strong patterns (5) — keep these

### S1. Privacy-by-default in the directory — Koruux Cross-cutting + Cat. 1

`getPublicProfessional` and the directory filter on `verifiedStatus = 'verified'`. Unverified pros **404** via `throw notFound()`. No PHI in URLs (only the pro's numeric ID). The booking route is `noindex`. This is textbook least-privilege data display. ✅

### S2. Crisis-first routing — Koruux Cross-cutting

- "Necesito ayuda ahora" auto-picks a contactable pro and opens WhatsApp — **one tap from hero** (vs. the old directory funnel that lost 96%). This directly serves the "patient in distress" principle.
- `/ayuda/especifica` Suicidio category copy: "Aquí te escuchamos sin juicio" — warm, non-judgmental, Spanish. ✅
- Crisis banner pins `modality=remote` so a person in distress never hits an empty in-person list. ✅

### S3. Differentiated directory cards — Koruux Cat. 1

`ProfessionalCard` shows name + location + population + focus groups + practice areas + specialized areas + availability badge + "Confirmado" pill. This exceeds Koruux's "data points that would help differentiate between records with common first or last names" — a user can distinguish two "María González" entries by specialty, city, and availability. The availability badge uses **color + dot + text** (green/amber/slate), not color alone. ✅

### S4. Sensitive, plain-language Spanish tone — Koruux Cross-cutting

Consistent across the app: "Te responde una persona real," "Sin bots ni inteligencia artificial," "Aquí te escuchamos sin juicio." No clinical jargon in patient-facing copy. The `docs/professional-communications.md` log encodes the warm, non-technical tone — a rare maturity. ✅

### S5. Accessibility fundamentals — Koruux Cross-cutting

- `aria-label` on icon-only buttons (search clear, filter toggle, back).
- `role="tablist"` / `role="tab"` / `aria-selected` on duration tabs.
- `min-h-12` (48px) touch targets on CTAs, exceeding the 44px floor.
- `aria-busy="true"` on loading skeletons.
- Visible focus rings (`focus-visible:outline-2`).
- `<label>` via `FieldShell` pattern, not placeholder-only. ✅

---

## Opportunities (8) — nice-to-have improvements

### O1. Directory: no "favorites" / "recently contacted" quick-access — Cat. 1

Koruux: "Advanced filter provides quick access to patients marked as 'Favorites' and 'Assigned to the provider'" + "search history panel for reference."

For a help-seeker, a returning user has no way to quickly re-find a pro they previously contacted. The directory always starts from scratch. A lightweight "Recientes" rail (client-side localStorage of contacted pro IDs) would reduce friction for repeat users without a DB change.

### O2. Directory: filter state is local-only, not shareable — Cat. 1

`q`, `estado`, `ciudad`, etc. live in component state (the `ponytail:` note explains why — avoiding per-keystroke loader re-runs). Only `modality` and `page` are URL-driven. This means a refined search can't be shared as a deep link. Koruux emphasizes shareable filtered views. Consider serializing filters to the URL on a debounce (not per keystroke) so a shareable link captures the active filter set.

### O3. Profile: no "related professionals" / back to filtered directory context — Cat. 2

When a user clicks from a filtered directory to a profile, then hits back, the directory's local state is preserved (good — it's the same route). But the profile itself offers no "otros profesionales en [área]" suggestions. Koruux: smooth integration with other parts of the product. A small "Más especialistas en trauma" rail on the profile (same specialty) would keep a help-seeker in-flow if the first pro isn't contactable.

### O4. Booking: slot grid has no timezone confirmation — Cat. 3

`timeFmt` uses the browser's timezone (`es-VE` locale, but `Intl.DateTimeFormat` defaults to the runtime tz). A Venezuelan abroad (common in the disaster-response diaspora) sees slots in their device tz — correct, but never confirmed. Koruux: "clarity on the slot picked." A small "Hora de [ciudad/TZ]" label under the day header would remove ambiguity.

### O5. Account hub: no notification preferences — Cat. 10

Koruux: "Allow patients to personalize their portal experience by setting preferences, customizing notifications." The account hub has no settings for reminder frequency, channel preference (email vs WhatsApp), or opt-out. Relevant if/when outreach campaigns are added.

### O6. Specific-help triage: no "save my area" / return-to — Cat. 9

A user who picks "Duelo" lands in the filtered directory, but the triage choice isn't remembered. If they leave and return to `/ayuda/especifica`, they re-pick from scratch. A subtle "Visto recientemente: Duelo" affordance (localStorage) would help repeat visitors.

### O7. Panel: verification status uses color-tinted backgrounds without icons in two states — Cat. 7 + Cross-cutting

The panel's verification banner uses `bg-green-50/60`, `bg-amber-50/60`, `bg-red-50/60` with matching text colors. The **verified** state has a `CheckCircle2` icon ✅, but the **disabled** (red) and **in-review** (amber) states are text-only. Koruux cross-cutting: "multiple indicators, not color alone." Add a `ShieldAlert` / `Clock` icon to the disabled and in-review banners.

### O8. Empty states vary in quality — Cross-cutting

- **Strong:** directory empty state ("No hay profesionales…") steers to self-care tools — actionable, not a dead end. ✅
- **Weak:** booking `groups.length === 0` state ("No hay horarios… Vuelve a revisar") offers no alternative action. Add a "buscar otro profesional" link (mirror the directory's self-care steer).

---

## Category-by-category scorecard

| Category | Screen(s) | Score | Notes |
| --- | --- | --- | --- |
| **Cross-cutting** | All | **A** | Privacy, tone, a11y strong; crisis banner missing on landing (C2) |
| **1. Patient Look-up** | Directory | **A-** | Search/filter/differentiators excellent; no favorites/history (O1, O2) |
| **2. Patient Records** | Profile | **B+** | Clear hierarchy; no related-pros (O3) |
| **3. Appointment Scheduling** | Booking | **C+** | Slot grid good; missing reschedule/cancel/reminders/provider context (C1) |
| **4. Telemedicine** | n/a | — | Video calls are external (WhatsApp / scheduled link); no in-app telemedicine UI |
| **5. Care Plan** | n/a | — | Out of scope (follow-ups are provider-private, not a patient care plan) |
| **6. Vital Signs** | n/a | — | Not applicable (psychology, no vitals) |
| **7. Dashboard** | Pro panel | **B** | Clean hub; no "needs attention" summary (C3) |
| **8. Patient Communication** | WhatsApp | **A-** | Centralized deep-link builder; no in-app secure messaging |
| **9. Patient Outreach** | Especifica | **A-** | Excellent triage; no "saved area" return (O6) |
| **10. Patient Portal** | Cuenta | **B+** | Role-aware hub; no notification prefs (O5) |

---

## Recommended priority

If acting on this audit:

1. **C2** — Add `<CrisisBanner />` to the landing. Small, high-impact, safety-critical.
2. **C1** — Reschedule/cancel + add-to-calendar on booking. User-facing, reduces no-shows.
3. **C3** — "Today / needs attention" summary on the pro panel. Provider-facing, reduces missed sessions.
4. **O7** — Icons on disabled/in-review verification banners. Quick a11y win.
5. **O8** — Actionable empty state on booking "no slots." Quick copy fix.

The rest (favorites, shareable filters, related pros, notification prefs) are product features to roadmap, not bugs.

---

## How this audit was produced

1. Activated the `healthcare-ui` skill (loaded `SKILL.md` + `references/principles.md`).
2. Mapped each screen to a Koruux category via the skill's Category Selection Guide.
3. Read each screen and scored against the category's key considerations + checklist.
4. Filtered findings by impact (critical = safety/PHI/major flow break; opportunity = polish/feature).
5. Cross-referenced the project's own gotchas (AGENTS.md) to avoid recommending anything that conflicts (e.g., the local-state-for-filters decision is deliberate).