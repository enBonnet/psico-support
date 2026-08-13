import { eq } from 'drizzle-orm'
import { professionals, fpvSearchRequests, fpvRawResults } from '#/db/schema.ts'
import type { Db } from '#/db/index.ts'
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
  professionalId: number
}

// Reads professionals with verifiedStatus='pending' so the script knows
// who needs to be verified against the FPV API.
export async function getProfessionalsForVerification(
  db: Db,
): Promise<ProfessionalForVerification[]> {
  const rows = await db
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
export async function createSearchRequest(
  db: Db,
  input: CreateSearchRequestInput,
): Promise<number> {
  const result = await db
    .insert(fpvSearchRequests)
    .values({
      searchType: input.searchType,
      searchValue: input.searchValue,
      normalizedValue: input.normalizedValue,
      normalizedKey: input.normalizedKey,
      professionalId: input.professionalId,
      status: 'pending',
    })
    .returning({ id: fpvSearchRequests.id })
    .get()

  return result.id
}

// Saves the raw API response (audit trail). Cédula is already redacted
// by client.ts (redactSensitive) BEFORE reaching this function.
export async function saveRawResult(
  db: Db,
  requestId: number,
  fetchResult: FetchFpvResult,
): Promise<void> {
  await db
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
function mapStatus(clientStatus: string): 'success' | 'ambiguous' | 'empty' | 'error' {
  if (clientStatus === 'ok') return 'success'
  if (clientStatus === 'empty' || clientStatus === 'ambiguous' || clientStatus === 'error') {
    return clientStatus
  }
  return 'error'
}

// Updates the search request status after the API call completes.
export async function updateSearchRequestStatus(
  db: Db,
  requestId: number,
  fetchResult: FetchFpvResult,
  professionalId: number,
): Promise<void> {
  const status = mapStatus(fetchResult.status)

  await db
    .update(fpvSearchRequests)
    .set({
      status,
      executedAt: new Date(),
      professionalId: professionalId,
      errorMessage: fetchResult.error,
    })
    .where(eq(fpvSearchRequests.id, requestId))
    .run()
}

// Marks a professional as verified. Called only when the API returned
// an exact match (status='ok', itemCount=1).
export async function markProfessionalVerified(
  db: Db,
  professionalId: number,
): Promise<void> {
  await db
    .update(professionals)
    .set({ verifiedStatus: 'verified' })
    .where(eq(professionals.id, professionalId))
    .run()
  }