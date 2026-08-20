// =============================================================================
// src/lib/name.ts — canonical person-name casing ("Ender Bonnet Borrero")
// =============================================================================
// Single source of truth for how person names are cased across the platform:
// first letter of every name/surname uppercase, everything else lowercase,
// whitespace runs collapsed. Normalization runs at the WRITE boundary (the
// Zod schemas in src/server/professionals.ts, Better Auth user creation in
// src/lib/auth.ts, and scripts/normalize-names.ts for the existing-rows
// backfill), so every read path renders consistently with zero per-callsite
// formatting: directory cards, profile SSR SEO/OG/JSON-LD, WhatsApp deep
// links, emails, .ics, admin, panel.
//
// Kept import-free (client + server + tsx scripts all consume it).

// ponytail: minimal Spanish/foreign connective-particle list — the words
// that read as shouted when capitalized ("María DE Los Ángeles" → "María de
// los Ángeles"). First and last words are ALWAYS capitalized so
// surname-looking particles ("Del Valle" as a full surname) still render
// cased. Ceiling: no internal-caps knowledge — "McDonald"/"O'Connor"/"D'Arco"
// render as "Mcdonald"/"O'connor"; upgrade path is a proper human-names
// dataset if a real case ever matters.
const LOWER_PARTICLES = new Set([
  'de',
  'del',
  'el',
  'la',
  'las',
  'los',
  'y',
  'da',
  'das',
  'di',
  'do',
  'dos',
  'du',
  'van',
  'von',
  'der',
  'den',
])

function capWord(word: string): string {
  // Capitalize the first letter of each hyphen-separated segment
  // ("ana-maría" → "Ana-María"); leaves stray punctuation untouched.
  return word
    .split('-')
    .map((seg) =>
      seg ? seg.charAt(0).toLocaleUpperCase('es') + seg.slice(1) : seg,
    )
    .join('-')
}

export function normalizeName(input: string): string {
  const words = input.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return ''
  return words
    .map((w, i) => {
      const lower = w.toLocaleLowerCase('es')
      if (i > 0 && i < words.length - 1 && LOWER_PARTICLES.has(lower)) {
        return lower
      }
      return capWord(lower)
    })
    .join(' ')
}
