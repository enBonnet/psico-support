import { buildSearchByFpv } from './normalizer.ts'
import { fetchFpvSearch } from './client.ts'
import {
  createSearchRequest,
  saveRawResult,
  updateSearchRequestStatus,
  markProfessionalVerified,
} from './repository.ts'
import type { ScriptDb } from './db.ts'
import type { ProfessionalForVerification } from './repository.ts'

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
  db: ScriptDb,
  professional: ProfessionalForVerification,
): Promise<VerificationResult> {
  // 1. Normalize the certificationNumber as FPV
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
  const requestId = createSearchRequest(db, {
    searchType: 'fpv',
    searchValue: professional.certificationNumber,
    normalizedValue: search.normalizedValue,
    normalizedKey: search.normalizedKey,
    professionalId: professional.id,
  })

  // 3. Call the FPV API (async — this is the only async step)
  const fetchResult = await fetchFpvSearch(search)

  // 4. Save raw result (audit trail) — only if the HTTP call succeeded
  if (fetchResult.ok) {
    saveRawResult(db, requestId, fetchResult)
  }

  // 5. Update search request status (closes the loop)
  updateSearchRequestStatus(db, requestId, fetchResult, professional.id)

  // 6. Decision: exact match?
  if (fetchResult.ok && fetchResult.status === 'ok' && fetchResult.itemCount === 1) {
    markProfessionalVerified(db, professional.id)
    return {
      professionalId: professional.id,
      status: 'verified',
      fpvNumber: search.normalizedValue,
    }
  }

  // 7. Not an exact match — return the status for the script to log
  return {
    professionalId: professional.id,
    status: fetchResult.status,
    error: fetchResult.error ?? undefined,
  }
}