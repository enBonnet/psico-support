# UI Style — Medicall

This project's visual design is adapted from the
[Medicall](https://glthemes.com/wordpress-theme/medicall/) WordPress theme by
Good Looking Themes — a clean, trustworthy medical/healthcare aesthetic built
on a deep medical blue with a bright blue accent.

> Source reference: the theme's live demo at
> `https://demo.glthemes.com/medicall/` and its stylesheet at
> `wp-content/themes/medicall/assets/css/style.min.css`.

## Design tokens

All tokens live in [`src/styles.css`](../src/styles.css) under `:root` and
flow through Tailwind v4's `@theme inline` + shadcn's semantic variables, so
every component inherits the look without per-component styling.

### Color palette

| Token                   | Value     | Role                                                   |
| ----------------------- | --------- | ------------------------------------------------------ |
| `--medi-primary`        | `#13297e` | Deep medical blue — buttons, headings, primary actions |
| `--medi-primary-hover`  | `#1e3ebd` | Primary hover state                                    |
| `--medi-secondary`      | `#178cef` | Bright blue accent — links, icons, gradients           |
| `--medi-white`          | `#ffffff` | Surfaces, cards                                        |
| `--medi-text-primary`   | `#252525` | Body text, headings                                    |
| `--medi-text-secondary` | `#606060` | Muted text, descriptions                               |
| `--medi-line`           | `#ececec` | Borders, dividers                                      |
| `--medi-bg`             | `#eff7fe` | Page background (soft blue tint)                       |

### Typography

- **Font**: `Open Sans` (400–700 + italics), loaded from Google Fonts.
- **Base size**: `1rem` / **line-height**: `1.778`.
- **Headings** (`h1`–`h6`): weight `700`, line-height `1.6`.
  - `h1` 52px, `h2` 40px (≥767px), `h3` 32px, `h4` 24px (≥767px), `h5` 20px (≥767px).

### Shape & spacing

- **Radius**: `0.25rem` (4px) — Medicall uses sharp, clinical corners on cards,
  buttons, and inputs. shadcn radii (`--radius-sm/md/lg/xl`) derive from this.
- **Card padding**: `32px` (from the theme's `.base-card` / `.card`).
- **Button**: `12px 32px` padding, solid primary background, 4px radius.

## Signature motif — gradient section underline

Medicall's hallmark is a short blue gradient bar centered (or left-aligned)
under section titles. Use the `.section-underline` helper:

```html
<div class="section-underline" />
```

Gradient stops (exact from the theme):

```css
linear-gradient(
  90deg,
  #178cef 0,
  #349bef 26.56%,
  #76b9f0 55.21%,
  #8fc5f1 80.21%,
  #b0d6f5 100%
);
```

Dimensions: `100px × 6px`, rounded ends.

Pair with `.section-kicker` (capitalized, 700, `#13297e`, `1.125rem`) for the
small label above a section heading.

## shadcn semantic mapping

shadcn's semantic tokens are remapped onto the Medicall palette so standard
components (`Button`, `Card`, `Input`, etc.) render in-theme automatically:

| shadcn token              | Mapped to                                        |
| ------------------------- | ------------------------------------------------ |
| `--primary`               | deep blue (`oklch(0.32 0.17 264)` ≈ `#13297e`)   |
| `--primary-foreground`    | white                                            |
| `--accent` / `--ring`     | bright blue (`oklch(0.62 0.19 244)` ≈ `#178cef`) |
| `--muted-foreground`      | grey (`#606060`)                                 |
| `--border` / `--input`    | `#ececec`                                        |
| `--background` / `--card` | white                                            |
| `--radius`                | `0.25rem`                                        |

## Background

The page background is a soft blue wash rather than a flat color — three
radial gradients over a `#eff7fe` base, plus a subtle fixed grid overlay
(`body::before` / `body::after`). This carries Medicall's airy, clinical feel
while staying lightweight.

## Dark mode

A navy/blue dark variant is defined under `.dark` — same token names, inverted
luminance, keeping the blue identity. Activate by adding the `dark` class to
`<html>`.

## Liquid Glass

Apple's iOS 26 / macOS Tahoe material language, adapted onto the Medicall
palette. Glass is a **material treatment**, not a recolor: the deep medical
blue identity stays, surfaces become translucent layered panes with backdrop
blur, saturation boost, specular edge highlights and a faint refractive tint.

The material is tuned for a disaster-response product read on phones in harsh
lighting: tints are kept relatively strong (55–72% white) so text contrast
holds even when `backdrop-filter` is unsupported or reduced-transparency is
requested. A `prefers-reduced-transparency` fallback collapses every glass
surface to a solid tint — readable, just not refractive.

### Glass tokens

All tokens live in `src/styles.css` under `:root` and `.dark`. New code should
prefer these over the legacy `--surface*` aliases.

| Token                    | Light value              | Role                                                      |
| ------------------------ | ------------------------ | --------------------------------------------------------- |
| `--glass-tint-strong`    | `rgba(255,255,255,0.72)` | Primary surface fill (cards, bars)                        |
| `--glass-tint`           | `rgba(255,255,255,0.55)` | Default surface fill                                      |
| `--glass-tint-soft`      | `rgba(255,255,255,0.38)` | Recessed surfaces (inputs, soft cards, dropzones)         |
| `--glass-edge`           | `rgba(255,255,255,0.6)`  | Inner edge highlight                                      |
| `--glass-edge-dim`       | `rgba(255,255,255,0.28)` | Bottom/right rim light                                    |
| `--glass-specular`       | `rgba(255,255,255,0.9)`  | Top-left specular catch (pseudo-element highlight)        |
| `--glass-stroke`         | `rgba(19,41,126,0.12)`   | 1px satin border (blue-tinted, not flat grey)             |
| `--glass-blur`           | `22px`                   | `backdrop-filter` blur radius (bars use 1.2×, pills 12px) |
| `--glass-saturate`       | `180%`                   | Saturation boost on the blurred backdrop                  |
| `--glass-brightness`     | `108%`                   | Brightness lift on the blurred backdrop                   |
| `--glass-radius`         | `1rem`                   | Default glass corner (cards, primary CTAs)                |
| `--glass-radius-sm`      | `0.75rem`                | Inputs, soft cards, action buttons                        |
| `--glass-radius-pill`    | `999px`                  | Badges, chips, switch track, toggle                       |
| `--glass-shadow`         | (composite)              | Inset specular + two-layer drop shadow                    |
| `--glass-shadow-pressed` | (composite)              | Tighter shadow for soft/recessed surfaces                 |

Dark mode mirrors these with a navy tint (`rgba(20,32,64,*)`) and cool
specular highlights (`rgba(180,205,255,*)`), slightly higher blur (24px) and
lower saturation (160%) — the same construction, inverted luminance.

### Specular edge (the rim light)

`.glass-card`, `.glass-bar` and `.island-shell` render a `::before`
pseudo-element with a 140° linear gradient: a bright top-left specular catch
fading to a dim bottom-right rim, blended in `screen` mode at 50% opacity.
This is the single detail that makes a translucent pane read as _glass_
rather than _frosted plastic_. Pointer-events are disabled on the pseudo so
it never intercepts taps.

### Glass helper classes

| Class              | Purpose                                                          |
| ------------------ | ---------------------------------------------------------------- |
| `.glass-card`      | Primary translucent surface — cards, list items, dashboard panes |
| `.glass-card-soft` | Recessed surface — inputs, dropzones, status callouts            |
| `.glass-pill`      | Tight pill — badges, chips, switch track, availability toggle    |
| `.glass-bar`       | Sticky header/footer — stronger tint, 1.2× blur, pinned edges    |
| `.glass-input`     | Translucent input — focus ring uses `--medi-secondary` at 35%    |
| `.glass-primary`   | Primary CTA — saturated deep-blue tint + specular top highlight  |
| `.island-shell`    | Legacy alias — now renders the canonical `.glass-card` material  |
| `.feature-card`    | Legacy alias — upgraded to the glass material + specular edge    |

### shadcn primitives

The shadcn components are remapped onto glass so they render in-material
without per-usage styling:

- **`Card`** → `.glass-card` (was `rounded-xl border bg-card shadow-sm`)
- **`Input`** → `.glass-input` (was `border border-input bg-transparent`)
- **`Badge`** default/secondary → `.glass-pill`; outline → `.glass-card-soft`
- **`Button`** adds two variants: `glass` (recessed) and `glassPrimary`
  (saturated CTA). `outline`/`secondary`/`ghost` now use glass surfaces.
- **`Switch`** → `.glass-pill` track, larger thumb (size-6) with drop shadow

### Usage rules

1. **One material per layer.** Don't nest `.glass-card` inside `.glass-card`
   — use `.glass-card-soft` for the inner surface so the depth reads.
2. **Glass wants blur behind it.** The page background's radial gradients +
   grid overlay exist to give `backdrop-filter` something to refract. On
   near-flat backgrounds the effect is invisible — keep the body bg gradient.
3. **Text contrast first.** The tints are tuned so `--medi-text-primary`
   (`#252525`) passes WCAG AA on `.glass-card` even without blur. If you
   lower a tint, recheck contrast.
4. **44×44 touch targets still rule.** Glass doesn't change the mobile-first
   sizing constraint. `min-h-16` on the landing triage, `min-h-12` on action
   buttons — unchanged.
5. **`prefers-reduced-transparency`** collapses every glass surface to a
   solid tint automatically. No per-component work needed.
6. **Radius hierarchy:** `.glass-radius` (1rem) for cards/CTAs, `.glass-radius-sm`
   (0.75rem) for inputs/buttons, `.glass-radius-pill` for pills. Medicall's
   4px `--radius` is preserved for legacy sharp-corner components.

## Legacy aliases (kept for compatibility)

The previous sea-green palette's custom properties (`--sea-ink`, `--lagoon`,
`--palm`, `--sand`, `--foam`, `--line`, `--kicker`, `--hero-a/b`, etc.) are
preserved as aliases pointing at the new blues, so existing decorative CSS
(`.island-shell`, `.feature-card`, `.nav-link`, `.site-footer`) continues to
work without edits. New code should prefer the `--medi-*` tokens.

## Helper classes

| Class                | Purpose                                                 |
| -------------------- | ------------------------------------------------------- |
| `.page-wrap`         | Centered content container (`min(1080px, 100% - 2rem)`) |
| `.section-underline` | The 100×6px blue gradient bar                           |
| `.section-kicker`    | Small capitalized blue label above headings             |
| `.glass-card`        | Primary translucent surface (blur + specular edge)      |
| `.glass-card-soft`   | Recessed surface (inputs, dropzones, callouts)          |
| `.glass-pill`        | Tight pill (badges, chips, switch track)                |
| `.glass-bar`         | Sticky header/footer (stronger tint, 1.2× blur)         |
| `.glass-input`       | Translucent input with focus ring                       |
| `.glass-primary`     | Saturated deep-blue CTA with specular top highlight     |
| `.island-shell`      | Legacy alias → `.glass-card` material                   |
| `.feature-card`      | Legacy alias → glass material + hover translate         |
| `.nav-link`          | Nav item with animated gradient underline               |
| `.island-kicker`     | Tiny uppercase tracked label                            |
| `.rise-in`           | Entrance animation (translateY + fade)                  |

## Verification

- `prettier --check src/styles.css` — passes.
- `vite build` — succeeds; CSS output ≈ 41 kB (8.6 kB gzip).
- `npx tsc --noEmit` — clean.
- `npm run lint` — clean (pre-existing paraglide generated-file parse errors
  only, unrelated to styling).
- Smoke test: all routes return 200/307 against local D1; professionals list
  renders the empty state in the glass material.

## How the source was extracted

The `glthemes.com/live-demo/?theme=medicall` page loads the real demo inside
an `<iframe>` whose `src` is injected server-side by a PHP page template
(`templates/theme-demo.php`) and is **not** exposed in the page HTML or any
client JS. The actual demo host is `https://demo.glthemes.com/medicall/`
(discovered via a `301` redirect on `demo.glthemes.com/medicall`). From there
the rendered HTML lists the theme stylesheets; the canonical one is
`style.min.css`, whose `:root` block defines the `--medi-*` tokens above.

## What's not done yet

- No Medicall-style **hero section**, **department cards**, **appointment
  form**, or **footer** have been built — the MVP routes (landing triage,
  patient flow, professional onboarding, admin) are in place using the glass
  material. The token set makes additional in-theme views trivial to add.
- No per-component overrides beyond the glass remap; if a shadcn component
  needs Medicall's exact padding/radius, add it at the component level rather
  than global tokens.
- Glass on **native iOS Safari** uses `-webkit-backdrop-filter` (wired); on
  very old browsers without backdrop-filter support, surfaces fall back to
  the solid tint via `@supports`-free declaration order (the tint is always
  painted under the filter).
