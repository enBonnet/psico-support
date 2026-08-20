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
   // ponytail: MVP fetches only page 1 (up to 25 items). If the API returns
  // >25 matches, classifyStatus marks it 'ambiguous' without paginating.
  // Ceiling: if we ever need to confirm a match among >25 homonyms, implement
  // a pagination loop here to fetch all pages before classifying.

  if (search.type === 'fpv') {
    params.set('fpv', search.fpv.normalized)
  } else {
    // Discriminated union: not 'fpv' means SearchByName — the type system
    // guarantees it, so no runtime branch (or throw) is needed here.
    params.set('apellido', search.surname.normalized)
    params.set('nombre', search.name.normalized)
  }

  return `${base}?${params.toString()}`
}

function redactSensitive(
  rawJson: FpvApiResponse | null,
): FpvApiResponse | null {
  const items = rawJson?.data?.items
  if (!items) return rawJson

  const redacted = structuredClone(rawJson)

  // The response is untrusted JSON: array slots can be null/garbage even when
  // the type says FpvApiItem, so keep a runtime guard before writing to it.
  for (const raw of redacted.data?.items ?? []) {
    const item = raw as FpvApiItem | null
    if (item) {
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

export async function fetchFpvSearch(
  search: Search | undefined,
): Promise<FetchFpvResult> {
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
  // Hoisted out of the try block so the catch handler can reference it.
  const timeoutMs = fpvConfig.FPV_TIMEOUT_MS

  try {
    const controller = new AbortController()
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

    // Annotated (not asserted) as nullable: response.json() can produce
    // anything for a 200 with a malformed body, so the guards below must stay.
    const json: FpvApiResponse | null = await response.json()

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