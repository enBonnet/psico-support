import { describe, it, expect } from 'vitest'
import {
  normalizeFpv,
  normalizeNamePart,
  buildSearchByName,
  buildSearchByFpv,
} from './normalizer.ts'

describe('normalizeFpv', () => {
  it('normaliza un FPV simple', () => {
    expect(normalizeFpv('5338').normalized).toBe('5338')
  })

  it('extrae dígitos de "FPV-5338"', () => {
    expect(normalizeFpv('FPV-5338').normalized).toBe('5338')
  })

  it('extrae dígitos de "fpv 5338"', () => {
    expect(normalizeFpv('fpv 5338').normalized).toBe('5338')
  })

  it('quita ceros adelante', () => {
    expect(normalizeFpv('005338').normalized).toBe('5338')
  })

  it('rechaza vacío', () => {
    expect(normalizeFpv('').isValid).toBe(false)
  })

  it('rechaza "FPV" sin dígitos', () => {
    expect(normalizeFpv('FPV').normalized).toBe('')
  })

  it('rechaza más de 8 dígitos', () => {
    expect(normalizeFpv('9'.repeat(20)).isValid).toBe(false)
  })

  it('rechaza null', () => {
    expect(normalizeFpv(null).isValid).toBe(false)
  })

  it('rechaza undefined', () => {
    expect(normalizeFpv(undefined).isValid).toBe(false)
  })
})

describe('normalizeNamePart', () => {
  it('Title Case con acentos y espacios múltiples', () => {
    const r = normalizeNamePart('  díaz   rivera  ')
    expect(r.normalized).toBe('Díaz Rivera')
    expect(r.normalizedKey).toBe('diaz rivera')
  })

  it('TODO MAYÚS -> Title Case', () => {
    expect(normalizeNamePart('JUSAGNY AMÉRICA').normalized).toBe('Jusagny América')
  })

  it('"martinez" -> "Martinez"', () => {
    expect(normalizeNamePart('martinez').normalized).toBe('Martinez')
  })

  it('rechaza vacío', () => {
    expect(normalizeNamePart('').isValid).toBe(false)
  })

  it('rechaza solo espacios', () => {
    expect(normalizeNamePart('   ').isValid).toBe(false)
  })

  it('rechaza null', () => {
    expect(normalizeNamePart(null).isValid).toBe(false)
  })
})

describe('buildSearchByName', () => {
  it('construye búsqueda válida', () => {
    const b = buildSearchByName('díaz rivera', 'jusagnny américa')
    expect(b.isValid).toBe(true)
    expect(b.normalizedValue).toBe('Díaz Rivera | Jusagnny América')
    expect(b.apellido.normalized).toBe('Díaz Rivera')
    expect(b.nombre.normalized).toBe('Jusagnny América')
    expect(b.normalizedKey).toBe('diaz rivera jusagnny america')
  })

  it('rechaza solo apellido', () => {
    const b = buildSearchByName('Díaz', '')
    expect(b.isValid).toBe(false)
    expect(b.error).not.toBeNull()
  })

  it('rechaza solo nombre', () => {
    expect(buildSearchByName('', 'Jusagnny').isValid).toBe(false)
  })

  it('rechaza ambos vacíos', () => {
    expect(buildSearchByName('', '').isValid).toBe(false)
  })
})

describe('buildSearchByFpv', () => {
  it('FPV "FPV-5338" válido', () => {
    const f = buildSearchByFpv('FPV-5338')
    expect(f.isValid).toBe(true)
    expect(f.normalizedValue).toBe('5338')
    expect(f.normalizedKey).toBe('5338')
  })

  it('FPV vacío inválido', () => {
    expect(buildSearchByFpv('').isValid).toBe(false)
  })
})