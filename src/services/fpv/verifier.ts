import { buildSearchByFpv } from './normalizer.ts'
import { fetchFpvSearch } from './client.ts'
import {
  createSearchRequest,
  saveRawResult,
  updateSearchRequestStatus,
  markProfessionalVerified,
} from './repository.ts'
import type { Db } from '#/db/index.ts'
import type { ProfessionalForVerification } from './repository.ts'
import type { FetchFpvResult } from './client.ts'

// Result of verifying a single professional against the FPV API.
export interface VerificationResult {
  professionalId: number
  status: 'verified' | 'ambiguous' | 'empty' | 'error' | 'skipped'
  fpvNumber?: string
  error?: string
}

// Verifies a single professional against the FPV API.
//
// Flow:
//   1. Normalize certificationNumber as FPV
//   2. If invalid → skip (manual review needed)
//   3. Create search request (audit trail)
//   4. Call FPV API
//   5. Save raw result (audit trail)
//   6. Update search request status
//   7. If exact match → mark professional as verified
//
// This function processes ONE professional. The calling script
// handles the loop and rate limiting between calls.
export async function verifyProfessional(
  db: Db,
  professional: ProfessionalForVerification,
): Promise<VerificationResult> {
  
  // 1. Normalize the certificationNumber as FPV
  // ponytail: MVP searches by FPV number only. Name search is deferred
  // because `professionals.name` is a single full-name field, and the FPV
  // API expects separate `apellido` and `nombre` params. Splitting names
  // reliably requires a dedicated parser or schema change (firstName/lastName).
  // Upgrade: add a name-search strategy once the schema or parser is ready.
  const search = buildSearchByFpv(professional.certificationNumber)

  if (!search.isValid) {
    // certificationNumber is not a valid FPV format — skip for manual review
    return {
      professionalId: professional.id,
      status: 'skipped',
      error: `Invalid FPV format: ${search.error}`,
    }
  }

  // 2. Create search request (audit trail) BEFORE calling the API
  const requestId = await createSearchRequest(db, {
    searchType: 'fpv',
    searchValue: professional.certificationNumber,
    normalizedValue: search.normalizedValue,
    normalizedKey: search.normalizedKey,
    professionalId: professional.id,
  })

  // 3. Call the FPV API (async — this is the only async step)
   let fetchResult: FetchFpvResult
  try {
    fetchResult = await fetchFpvSearch(search)
  } catch (err) {
    // If the fetch throws unexpectedly, close the audit row with 'error'
    const errorMessage = err instanceof Error ? err.message : String(err)
    const errorResult: FetchFpvResult = {
      ok: false,
      status: 'error',
      sourceUrl: null,
      raw: null,
      itemCount: 0,
      error: `Unexpected fetch error: ${errorMessage}`,
    }
    await updateSearchRequestStatus(db, requestId, errorResult, professional.id)
    return {
      professionalId: professional.id,
      status: 'error',
      error: errorResult.error,
    }
  }

  // 4. Save raw result (audit trail) — only if the HTTP call succeeded
  if (fetchResult.ok) {
    await saveRawResult(db, requestId, fetchResult)
  }

  // 5. Update search request status (closes the loop)
  await updateSearchRequestStatus(db, requestId, fetchResult, professional.id)

  // 6. Decision: exact match?
  const isExactMatch = fetchResult.ok && fetchResult.status === 'ok' && fetchResult.itemCount === 1

  if (isExactMatch) {
    const returnedItem = fetchResult.raw?.data?.items?.[0]
    
    // Security check: if the API claims 1 result but sends no item, it's an error
    if (!returnedItem) {
      return {
        professionalId: professional.id,
        status: 'error',
        error: 'FPV API reported one result without a result item',
      }
    }

    const returnedFpv = String(returnedItem.fpv ?? '').trim()
    
    // Security check: the FPV returned by the API must match the one we searched
    if (returnedFpv === search.normalizedValue) {
      await markProfessionalVerified(db, professional.id)
      return {
        professionalId: professional.id,
        status: 'verified',
        fpvNumber: search.normalizedValue,
      }
    }
    
    // If the FPV doesn't match, it's a data mismatch (false positive)
    return {
      professionalId: professional.id,
      status: 'error',
      error: `FPV mismatch: searched for ${search.normalizedValue}, API returned ${returnedFpv}`,
    }
  }
  // 7. Not an exact match — return the status for the script to log
  return {
    professionalId: professional.id,
    status: fetchResult.status,
    error: fetchResult.error ?? undefined,
  }
}