// ponytail: canonical/OG/sitemap/email links need an absolute URL, and during
// the psicoayudas.com rollout TWO prod domains run side-by-side on the same
// worker. With self-referencing canonical (the chosen SEO strategy), those
// URLs must match the host the request ACTUALLY landed on — otherwise the
// psicoayudas.com sitemap/share-preview would leak psicoayudaven.com URLs.
//
// siteUrl() resolves the current origin:
//   - server: via a resolver registered once at worker boot
//     (src/lib/seo-server.ts). It reads the per-request Host header through
//     getRequestHeaders, which is AsyncLocalStorage-backed — per-request
//     isolated, safe under concurrent isolates (gotcha #9). seo.ts can't
//     import that helper directly because @tanstack/react-start/server pulls
//     in node:async_hooks + h3 and would pollute the client bundle.
//   - client: window.location.origin (share buttons, CSR head re-render).
//   - fallback: PRIMARY_SITE_URL, used outside any request (tests, scripts,
//     build-time prerender) and for unknown hosts (localhost, previews) so a
//     forged Host header can't mint OG/canonical URLs for an arbitrary domain.
//
// SITE_URL is kept as an alias of PRIMARY_SITE_URL for the few call sites that
// intentionally want the canonical primary rather than the per-request host
// (e.g. default OG image fallback). NOTE: the email sender (FROM_ADDRESS) and
// the .ics calendar identity (UID + organizer in email.ts /
// cuenta.sesiones.tsx) are LITERAL '@psicoayudaven.com' strings, deliberately
// NOT derived from PRIMARY_SITE_URL — psicoayudaven.com is the only domain
// onboarded as a verified Email Service sender, and the UID must stay stable
// or previously-imported appointments duplicate on re-import. Changing
// PRIMARY_SITE_URL does NOT flip them.
export const PRIMARY_SITE_URL = 'https://psicoayudas.com'
export const SITE_URL = PRIMARY_SITE_URL
export const KNOWN_HOSTS = new Set(['psicoayudaven.com', 'psicoayudas.com'])
export const SITE_NAME = 'PsicoAyudas'
export const SITE_BRAND = 'Psico Ayudas'
// ponytail: tagline names the mission concisely. The full title
// (SITE_DEFAULT_TITLE) must stay ≤ 60 chars / ~600px for Google's SERP
// preview — "Psico Ayudas · Apoyo psicológico gratuito" = 42 chars,
// safely within the limit. The previous tagline ("Red de apoyo gratuito ante
// la contingencia") pushed the title to 66 chars and got truncated. The
// description carries the fuller context (contingencia, WhatsApp, etc.).
// Separator is · (matches the brand-title rhythm) and is reused by seoHead
// for per-page titles so the whole site reads as one family.
export const SITE_TAGLINE = 'Apoyo psicológico gratuito'
export const SITE_TITLE_SEPARATOR = ' · '
export const SITE_DEFAULT_TITLE = `${SITE_BRAND}${SITE_TITLE_SEPARATOR}${SITE_TAGLINE}`

// ponytail: server-side resolver hook. seo.ts is shared (client + server) and
// MUST NOT import @tanstack/react-start/server (it pulls in node:async_hooks +
// h3, polluting the client bundle). src/lib/seo-server.ts (server-only)
// registers its resolver here once at worker boot. Assigning the function ref
// once is safe — the per-request state lives in AsyncLocalStorage inside the
// resolver, NOT on a module/global variable (gotcha #9).
type SiteUrlResolver = () => string
let _serverResolver: SiteUrlResolver | null = null
export function _registerSiteUrlResolver(fn: SiteUrlResolver) {
  _serverResolver = fn
}

// ponytail: the current site origin. Use this everywhere an absolute URL to
// the SITE itself is rendered (canonical, og:url, JSON-LD url/logo, sitemap,
// share links, email action URLs). For stable brand identity (sender domain,
// .ics UID) keep SITE_URL/PRIMARY_SITE_URL instead — those must NOT flip per
// host or calendar entries duplicate and email sender validation breaks.
export function siteUrl(): string {
  // Client: the real origin the user is on (share buttons, CSR head updates).
  if (typeof window !== 'undefined') {
    const host = window.location.hostname
    if (KNOWN_HOSTS.has(host)) return window.location.origin
  }
  // Server: resolver registered at boot reads the current request's headers.
  if (_serverResolver) {
    try {
      return _serverResolver()
    } catch {
      // getRequestHeaders throws outside a request context (tests/scripts).
    }
  }
  return PRIMARY_SITE_URL
}

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
  image,
  type = 'website',
}: SeoInput) {
  const origin = siteUrl()
  const url = `${origin}${path}`
  const resolvedImage = image ?? `${origin}/logo512.png`
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
    { property: 'og:image', content: resolvedImage },
    { property: 'og:locale', content: 'es_LA' },
    // ponytail: Twitter card tags use name= (not property= like OG). Twitter's
    // crawler only reads <meta name="twitter:*">; <meta property="twitter:*">
    // (which React renders when you pass `property`) is silently ignored —
    // so the cards rendered blank in X/Twitter share previews. Also added
    // twitter:url, which was missing entirely. Mirrors the og:url value.
    { name: 'twitter:card', content: 'summary_large_image' },
    { name: 'twitter:title', content: shareTitle },
    { name: 'twitter:description', content: description },
    { name: 'twitter:image', content: resolvedImage },
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
  const origin = siteUrl()
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: SITE_BRAND,
    alternateName: SITE_NAME,
    url: origin,
    logo: `${origin}/logo512.png`,
    description:
      'Red de apoyo psicológico gratuito para personas afectadas en Latinoamérica. Conecta con psicólogos verificados por WhatsApp o de forma presencial.',
    areaServed: 'Latinoamérica',
  }
}

export function websiteJsonLd() {
  const origin = siteUrl()
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: SITE_BRAND,
    url: origin,
    inLanguage: 'es-VE',
    publisher: { '@type': 'Organization', name: SITE_BRAND },
    // ponytail: SearchAction targets the directory's `?q=` param (validated
    // in src/routes/ayuda/profesionales/index.tsx searchSchema). The directory
    // isn't a full-text search, but Google's docs allow this as a "find a
    // psychologist" entry point — it unlocks the sitelinks search box.
    potentialAction: {
      '@type': 'SearchAction',
      target: `${origin}/ayuda/profesionales?q={search_term_string}`,
      'query-input': 'required name=search_term_string',
    },
  }
}
