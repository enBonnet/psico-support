import { fpvConfig } from './config.ts'
import type { SearchByName, SearchByFpv } from './normalizer.ts'

const API_PATH = '/api/v1/psicologos_public'

type Search = SearchByName | SearchByFpv

// Shape of the JSON returned by the FPV API
interface FpvApiItem {
  cedula?: string | null
  tipoDocumento?: string | null
  id?: string | number | null
  nombre?: string
  apellido?: string
  fpv?: string | number
  [key: string]: unknown
}

interface FpvApiResponse {
  data?: {
    count?: number
    items?: FpvApiItem[]
  }
  errors?: unknown[]
}

export type FetchStatus = 'ok' | 'empty' | 'ambiguous' | 'error'

export interface FetchFpvResult {
  ok: boolean
  status: FetchStatus
  sourceUrl: string | null
  raw: FpvApiResponse | null
  itemCount: number
  error: string | null
}

function buildUrl(search: Search): string {
  const base = fpvConfig.FPV_API_BASE_URL + API_PATH
  const params = new URLSearchParams({
    page: '1',
    per_page: '25',
  })

  if (search.type === 'fpv') {
    params.set('fpv', search.fpv.normalized)
  } else if (search.type === 'name') {
    params.set('apellido', search.apellido.normalized)
    params.set('nombre', search.nombre.normalized)
  } else {
    throw new Error(`Unsupported search type: ${search['type']}`)
  }

  return `${base}?${params.toString()}`
}

function redactSensitive(rawJson: FpvApiResponse): FpvApiResponse {
  if (!rawJson?.data?.items) return rawJson

  const redacted = structuredClone(rawJson)

  for (const item of redacted.data.items!) {
    if (item && typeof item === 'object') {
      item.cedula = null
      item.tipoDocumento = null
      item.id = null
    }
  }

  return redacted
}

function classifyStatus(itemCount: number): FetchStatus {
  if (itemCount === 0) return 'empty'
  if (itemCount === 1) return 'ok'
  return 'ambiguous'
}

export async function fetchFpvSearch(search: Search): Promise<FetchFpvResult> {
  if (!search?.isValid) {
    return {
      ok: false,
      status: 'error',
      sourceUrl: null,
      raw: null,
      itemCount: 0,
      error: 'Invalid search: did not pass normalization',
    }
  }

  const sourceUrl = buildUrl(search)

  try {
    const controller = new AbortController()
    const timeoutMs = 10000
    const timeout = setTimeout(() => controller.abort(), timeoutMs)

    const response = await fetch(sourceUrl, {
      method: 'GET',
      headers: {
        'User-Agent': fpvConfig.FPV_USER_AGENT,
        Accept: 'application/json',
      },
      signal: controller.signal,
    })

    clearTimeout(timeout)

    if (!response.ok) {
      return {
        ok: false,
        status: 'error',
        sourceUrl,
        raw: null,
        itemCount: 0,
        error: `HTTP ${response.status} ${response.statusText}`,
      }
    }

    const json = (await response.json()) as FpvApiResponse

    const itemCount = json?.data?.count ?? json?.data?.items?.length ?? 0
    const redacted = redactSensitive(json)
    const status = classifyStatus(itemCount)

    return {
      ok: true,
      status,
      sourceUrl,
      raw: redacted,
      itemCount,
      error: null,
    }
  } catch (err) {
    const isTimeout = err instanceof Error && err.name === 'AbortError'
    return {
      ok: false,
      status: 'error',
      sourceUrl,
      raw: null,
      itemCount: 0,
      error: isTimeout
        ? `Timeout after ${timeoutMs}ms`
        : `Network error: ${err instanceof Error ? err.message : String(err)}`,
    }
  }
}