// ponytail: OG/canonical need an absolute URL and nobody shares localhost, so
// the prod domain is a constant here — not an env var. Swap for an env-driven
// value only if a staging domain ever needs different previews.
export const SITE_URL = 'https://psicoayudaven.com'
export const SITE_NAME = 'psicoayudaven'
const DEFAULT_IMAGE = `${SITE_URL}/logo512.png`

type SeoInput = {
  /** Page title without the brand suffix — the suffix is added for <title>. */
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
  const meta = [
    { title: `${title} · ${SITE_NAME}` },
    { name: 'description', content: description },
    { property: 'og:site_name', content: SITE_NAME },
    { property: 'og:title', content: title },
    { property: 'og:description', content: description },
    { property: 'og:type', content: type },
    { property: 'og:url', content: url },
    { property: 'og:image', content: image },
    { property: 'og:locale', content: 'es_VE' },
    { property: 'twitter:card', content: 'summary_large_image' },
    { property: 'twitter:title', content: title },
    { property: 'twitter:description', content: description },
    { property: 'twitter:image', content: image },
  ]
  const links = [{ rel: 'canonical', href: url }]
  return { meta, links }
}

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
}) {
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
    ...(p.populations?.length ? { knowsAbout: [...p.populations] } : {}),
  }
}
