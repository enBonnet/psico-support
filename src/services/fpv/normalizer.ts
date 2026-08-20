export interface FpvNormalization {
  raw: string
  normalized: string
  isValid: boolean
  error: string | null
}

export interface NamePartNormalization {
  raw: string
  normalized: string
  normalizedKey: string
  isValid: boolean
  error: string | null
}

export interface SearchByName {
  type: 'name'
  surname: NamePartNormalization
  name: NamePartNormalization
  normalizedValue: string
  normalizedKey: string
  isValid: boolean
  error: string | null
}

export interface SearchByFpv {
  type: 'fpv'
  fpv: FpvNormalization
  normalizedValue: string
  normalizedKey: string
  isValid: boolean
  error: string | null
}


export function normalizeFpv(rawFpv: unknown): FpvNormalization {
  const raw = String(rawFpv ?? '').trim()

  const digitsOnly = raw.replace(/\D/g, '')
  const normalized = digitsOnly.replace(/^0+/, '')

  if (normalized.length === 0) {
    return { raw, normalized: '', isValid: false, error: 'FPV vacío o sin dígitos' }
  }
  if (normalized.length > 8) {
    return { raw, normalized, isValid: false, error: 'FPV tiene más de 8 dígitos' }
  }

  return { raw, normalized, isValid: true, error: null }
}

export function normalizeNamePart(rawName: unknown): NamePartNormalization {
  const raw = String(rawName ?? '').trim()

  if (raw.length === 0) {
    return { raw, normalized: '', normalizedKey: '', isValid: false, error: 'vacío' }
  }

  const collapsed = raw.replace(/\s+/g, ' ')

  const titled = collapsed
    .toLowerCase()
    .replace(/(^|\s)([a-záéíóúüñ])/g, (_, pre: string, c: string) => pre + c.toUpperCase())
  const normalized = titled.trim()

  const normalizedKey = normalized
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')

  return { raw, normalized, normalizedKey, isValid: true, error: null }
}

export function buildSearchByName(
  rawSurname: unknown,
  rawName: unknown,
): SearchByName {
  const surname = normalizeNamePart(rawSurname)
  const name = normalizeNamePart(rawName)

  if (!surname.isValid || !name.isValid) {
  return {
      type: 'name',
      surname,
      name,
      normalizedValue: '',
      normalizedKey: '',
      isValid: false,
      error: 'Apellido y nombre son obligatorios',
    }
  }

  const normalizedValue = [surname.normalized, name.normalized]
    .filter(Boolean)
    .join(' | ')

  const normalizedKey = [surname.normalizedKey, name.normalizedKey]
    .filter(Boolean)
    .join(' ')

  return {
    type: 'name',
    surname,
    name,
    normalizedValue,
    normalizedKey,
    isValid: true,
    error: null,
  }
}

export function buildSearchByFpv(rawFpv: unknown): SearchByFpv {
  const fpv = normalizeFpv(rawFpv)

  if (!fpv.isValid) {
    return {
      type: 'fpv',
      fpv,
      normalizedValue: '',
      normalizedKey: '',
      isValid: false,
      error: fpv.error,
    }
  }

  return {
    type: 'fpv',
    fpv,
    normalizedValue: fpv.normalized,
    normalizedKey: fpv.normalized,
    isValid: true,
    error: null,
  }
}