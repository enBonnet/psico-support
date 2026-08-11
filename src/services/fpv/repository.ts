import { eq } from 'drizzle-orm'
import { professionals, fpvSearchRequests, fpvRawResults } from '#/db/schema.ts'
import type { ScriptDb } from './db.ts'
import type { FetchFpvResult } from './client.ts'

// A professional pending FPV verification, as read from the DB.
export interface ProfessionalForVerification {
  id: number
  name: string
  certificationNumber: string
}

// Input for creating a search request row.
export interface CreateSearchRequestInput {
  searchType: 'name' | 'fpv'
  searchValue: string
  normalizedValue: string
  normalizedKey: string
  professionalId?: number
}

// Reads professionals with verifiedStatus='pending' so the script knows
// who needs to be verified against the FPV API.
export function getProfessionalsForVerification(
  db: ScriptDb,
): ProfessionalForVerification[] {
  const rows = db
    .select({
      id: professionals.id,
      name: professionals.name,
      certificationNumber: professionals.certificationNumber,
    })
    .from(professionals)
    .where(eq(professionals.verifiedStatus, 'pending'))
    .all()

  return rows
}

// Creates a search request record (audit trail) before hitting the API.
// Returns the inserted row id.
export function createSearchRequest(
  db: ScriptDb,
  input: CreateSearchRequestInput,
): number {
  const result = db
    .insert(fpvSearchRequests)
    .values({
      searchType: input.searchType,
      searchValue: input.searchValue,
      normalizedValue: input.normalizedValue,
      normalizedKey: input.normalizedKey,
      professionalId: input.professionalId ?? null,
      status: 'pending',
    })
    .returning({ id: fpvSearchRequests.id })
    .get()

  return result.id
}

// Saves the raw API response (audit trail). Cédula is already redacted
// by client.ts (redactSensitive) BEFORE reaching this function.
export function saveRawResult(
  db: ScriptDb,
  requestId: number,
  fetchResult: FetchFpvResult,
): void {
  db
    .insert(fpvRawResults)
    .values({
      requestId,
      sourceUrl: fetchResult.sourceUrl ?? '',
      rawJson: fetchResult.raw ? JSON.stringify(fetchResult.raw) : null,
      itemCount: fetchResult.itemCount,
    })
    .run()
}

// Maps the client status to the DB status enum.
// Client 'ok' → DB 'success'; the rest match directly.
function mapStatus(clientStatus: string): 'success' | 'ambiguous' | 'empty' | 'error' {
  if (clientStatus === 'ok') return 'success'
  if (clientStatus === 'empty' || clientStatus === 'ambiguous' || clientStatus === 'error') {
    return clientStatus
  }
  return 'error'
}

// Updates the search request status after the API call completes.
// Sets executedAt to now and optionally links the professional or records an error.
export function updateSearchRequestStatus(
  db: ScriptDb,
  requestId: number,
  fetchResult: FetchFpvResult,
  professionalId?: number,
): void {
  const status = mapStatus(fetchResult.status)

  db
    .update(fpvSearchRequests)
    .set({
      status,
      executedAt: new Date(),
      professionalId: professionalId ?? null,
      errorMessage: fetchResult.error,
    })
    .where(eq(fpvSearchRequests.id, requestId))
    .run()
}

// Marks a professional as verified. Called only when the API returned
// an exact match (status='ok', itemCount=1).
export function markProfessionalVerified(
  db: ScriptDb,
  professionalId: number,
): void {
  db
    .update(professionals)
    .set({ verifiedStatus: 'verified' })
    .where(eq(professionals.id, professionalId))
    .run()
}