import { describe, it, expect } from 'vitest'
import {
  normalizeFpv,
  normalizeNamePart,
  buildSearchByName,
  buildSearchByFpv,
} from './normalizer.ts'

describe('normalizeFpv', () => {
  it('normalizes a simple FPV', () => {
    expect(normalizeFpv('5338').normalized).toBe('5338')
  })

  it('extracts digits from "FPV-5338"', () => {
    expect(normalizeFpv('FPV-5338').normalized).toBe('5338')
  })

  it('extracts digits from "fpv 5338"', () => {
    expect(normalizeFpv('fpv 5338').normalized).toBe('5338')
  })

  it('removes leading zeros', () => {
    expect(normalizeFpv('005338').normalized).toBe('5338')
  })

  it('rejects empty input', () => {
    expect(normalizeFpv('').isValid).toBe(false)
  })

  it('rejects "FPV" without digits', () => {
    expect(normalizeFpv('FPV').normalized).toBe('')
  })

  it('rejects more than 8 digits', () => {
    expect(normalizeFpv('9'.repeat(20)).isValid).toBe(false)
  })

  it('rejects null', () => {
    expect(normalizeFpv(null).isValid).toBe(false)
  })

  it('rejects undefined', () => {
    expect(normalizeFpv(undefined).isValid).toBe(false)
  })
})

describe('normalizeNamePart', () => {
  it('applies Title Case with accents and multiple spaces', () => {
    const r = normalizeNamePart('  díaz   rivera  ')
    expect(r.normalized).toBe('Díaz Rivera')
    expect(r.normalizedKey).toBe('diaz rivera')
  })

  it('converts ALL CAPS to Title Case', () => {
    expect(normalizeNamePart('JUSAGNY AMÉRICA').normalized).toBe('Jusagny América')
  })

  it('converts "martinez" to "Martinez"', () => {
    expect(normalizeNamePart('martinez').normalized).toBe('Martinez')
  })

  it('rejects empty input', () => {
    expect(normalizeNamePart('').isValid).toBe(false)
  })

  it('rejects only spaces', () => {
    expect(normalizeNamePart('   ').isValid).toBe(false)
  })

  it('rejects null', () => {
    expect(normalizeNamePart(null).isValid).toBe(false)
  })
})

describe('buildSearchByName', () => {
  it('builds a valid search', () => {
    const b = buildSearchByName('díaz rivera', 'jusagny américa')
    expect(b.isValid).toBe(true)
    expect(b.normalizedValue).toBe('Díaz Rivera | Jusagny América')
    expect(b.surname.normalized).toBe('Díaz Rivera')
    expect(b.name.normalized).toBe('Jusagny América')
    expect(b.normalizedKey).toBe('diaz rivera jusagny america')
  })

  it('rejects surname only', () => {
    const b = buildSearchByName('Díaz', '')
    expect(b.isValid).toBe(false)
    expect(b.error).not.toBeNull()
  })

  it('rejects name only', () => {
    expect(buildSearchByName('', 'Jusagny').isValid).toBe(false)
  })

  it('rejects both empty', () => {
    expect(buildSearchByName('', '').isValid).toBe(false)
  })
})

describe('buildSearchByFpv', () => {
  it('validates FPV "FPV-5338"', () => {
    const f = buildSearchByFpv('FPV-5338')
    expect(f.isValid).toBe(true)
    expect(f.normalizedValue).toBe('5338')
    expect(f.normalizedKey).toBe('5338')
  })

  it('rejects empty FPV', () => {
    expect(buildSearchByFpv('').isValid).toBe(false)
  })
})