// ponytail: OG/canonical need an absolute URL and nobody shares localhost, so
// the prod domain is a constant here — not an env var. Swap for an env-driven
// value only if a staging domain ever needs different previews.
export const SITE_URL = 'https://psicoayudaven.com'
export const SITE_NAME = 'PsicoAyudaVen'
export const SITE_BRAND = 'Psico Ayuda Venezuela'
// ponytail: tagline names the mission concisely. The full title
// (SITE_DEFAULT_TITLE) must stay ≤ 60 chars / ~600px for Google's SERP
// preview — "Psico Ayuda Venezuela · Apoyo psicológico gratuito" = 50 chars,
// safely within the limit. The previous tagline ("Red de apoyo gratuito ante
// la contingencia") pushed the title to 66 chars and got truncated. The
// description carries the fuller context (contingencia, WhatsApp, etc.).
// Separator is · (matches the brand-title rhythm) and is reused by seoHead
// for per-page titles so the whole site reads as one family.
export const SITE_TAGLINE = 'Apoyo psicológico gratuito'
export const SITE_TITLE_SEPARATOR = ' · '
export const SITE_DEFAULT_TITLE = `${SITE_BRAND}${SITE_TITLE_SEPARATOR}${SITE_TAGLINE}`
const DEFAULT_IMAGE = `${SITE_URL}/logo512.png`

type SeoInput = {
  /** Page title without the brand suffix — required, but ignored when path is `/` (uses SITE_DEFAULT_TITLE). */
  title: string
  description: string
  /** Canonical path, e.g. '/ayuda'. Must start with '/'. */
  path: string
  /** Absolute image URL; defaults to the logo. */
  image?: string
  /** og:type — 'website' (default) or 'profile'. */
  type?: string
}

// ponytail: one place encodes the full OG + Twitter + canonical pattern so
// every public page renders the same share-preview shape. Returns { meta,
// links } shaped to spread into a route's head(). Child titles/meta override
// the root's (TanStack dedupes by `name ?? property`, deepest wins), so the
// root title stays a safe fallback for pages that don't call this.
//
// Entries are left intentionally untyped so TS infers the concrete object
// shapes (all valid React HTMLMetaAttributes: name/content/property/title).
// The head() meta type is raw HTMLMetaAttributes, NOT the MetaDescriptor
// union — so 'script:ld+json' can't live here. Render JSON-LD inline in the
// component instead (see profileJsonLd + the $id route).
export function seoHead({
  title,
  description,
  path,
  image = DEFAULT_IMAGE,
  type = 'website',
}: SeoInput) {
  const url = `${SITE_URL}${path}`
  const documentTitle =
    path === '/'
      ? SITE_DEFAULT_TITLE
      : `${title}${SITE_TITLE_SEPARATOR}${SITE_BRAND}`
  const shareTitle = path === '/' ? SITE_DEFAULT_TITLE : title
  const meta = [
    { title: documentTitle },
    { name: 'description', content: description },
    { property: 'og:site_name', content: SITE_BRAND },
    { property: 'og:title', content: shareTitle },
    { property: 'og:description', content: description },
    { property: 'og:type', content: type },
    { property: 'og:url', content: url },
    { property: 'og:image', content: image },
    { property: 'og:locale', content: 'es_VE' },
    // ponytail: Twitter card tags use name= (not property= like OG). Twitter's
    // crawler only reads <meta name="twitter:*">; <meta property="twitter:*">
    // (which React renders when you pass `property`) is silently ignored —
    // so the cards rendered blank in X/Twitter share previews. Also added
    // twitter:url, which was missing entirely. Mirrors the og:url value.
    { name: 'twitter:card', content: 'summary_large_image' },
    { name: 'twitter:title', content: shareTitle },
    { name: 'twitter:description', content: description },
    { name: 'twitter:image', content: image },
    { name: 'twitter:url', content: url },
  ]
  const links = [{ rel: 'canonical', href: url }]
  return { meta, links }
}

// ponytail: private routes (auth, pro panel, admin) have no crawler value and
// shouldn't be indexed — they render as empty shells behind a login wall. One
// shared head() shape so every private route opts out with the same one-liner.
// Routes call `head: noindexHead` (or `head: () => noindexHead()`). The root
// title still applies, so the page isn't title-less; robots just drops it.
export const noindexHead = () => ({
  meta: [{ name: 'robots', content: 'noindex' }],
})

// ponytail: schema.org Person for a professional profile. Google reads
// JSON-LD from <head>; TanStack renders `script:ld+json` meta descriptors as
// <script type="application/ld+json">. jobTitle is hard-coded 'Psicólogo' —
// every verified row is a psychologist by the credential model.
export function profileJsonLd(p: {
  name: string
  url: string
  locality?: string | null
  country?: string | null
  populations?: readonly string[]
  focusGroups?: readonly string[]
  practiceAreas?: readonly string[]
  specializedAreas?: readonly string[]
  /**
   * Canonical profile URLs (social media etc.) — maps to schema.org Person.sameAs,
   * which Google's Knowledge Graph reads to link an entity to its social profiles.
   */
  sameAs?: readonly string[]
}) {
  // ponytail: knowsAbout folds all four specialization axes (age population +
  // focus groups + practice areas + specialized areas) into one schema.org
  // field. Specialized areas (Suicidio, Trauma, etc.) are folded in because
  // Google reads knowsAbout as topic expertise — exactly what they represent.
  const knowsAbout = [
    ...(p.populations ?? []),
    ...(p.focusGroups ?? []),
    ...(p.practiceAreas ?? []),
    ...(p.specializedAreas ?? []),
  ]
  return {
    '@context': 'https://schema.org',
    '@type': 'Person',
    name: p.name,
    jobTitle: 'Psicólogo',
    url: p.url,
    ...(p.locality || p.country
      ? {
          address: {
            '@type': 'PostalAddress',
            ...(p.locality ? { addressLocality: p.locality } : {}),
            ...(p.country ? { addressCountry: p.country } : {}),
          },
        }
      : {}),
    ...(knowsAbout.length ? { knowsAbout } : {}),
    // ponytail: sameAs only when the pro actually provided socials — an empty
    // array would be valid JSON-LD but useless, so omit it entirely.
    ...(p.sameAs && p.sameAs.length ? { sameAs: [...p.sameAs] } : {}),
  }
}

// ponytail: schema.org Organization + WebSite for the landing page. Google
// reads WebSite to enable the sitelinks search box (potentialAction) and
// aligns the entity in its Knowledge Graph. One-shot per-deploy schema, no
// per-route maintenance. Rendered inline in the component body (same pattern
// as profileJsonLd — gotcha #3: 'script:ld+json' is rejected by head() at the
// type level, so JSON-LD lives in the component, not in head()).
//
// The site has no on-site search, so the SearchAction points at the directory
// with a placeholder query — Google's docs allow this even if the directory's
// filtering isn't full-text search; it's a "find a psychologist" entry point.
export function organizationJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: SITE_BRAND,
    alternateName: SITE_NAME,
    url: SITE_URL,
    logo: `${SITE_URL}/logo512.png`,
    description:
      'Red de apoyo psicológico gratuito para personas afectadas en Venezuela. Conecta con psicólogos verificados por WhatsApp o de forma presencial.',
    areaServed: 'VE',
  }
}

export function websiteJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: SITE_BRAND,
    url: SITE_URL,
    inLanguage: 'es-VE',
    publisher: { '@type': 'Organization', name: SITE_BRAND },
    // ponytail: SearchAction targets the directory's `?q=` param (validated
    // in src/routes/ayuda/profesionales/index.tsx searchSchema). The directory
    // isn't a full-text search, but Google's docs allow this as a "find a
    // psychologist" entry point — it unlocks the sitelinks search box.
    potentialAction: {
      '@type': 'SearchAction',
      target: `${SITE_URL}/ayuda/profesionales?q={search_term_string}`,
      'query-input': 'required name=search_term_string',
    },
  }
}
