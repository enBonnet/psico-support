// =============================================================================
// src/server/metrics.ts — admin-gated D1 aggregations for the analytics view
// =============================================================================
// Counterpart to src/server/analytics-read.ts. The ANALYTICS binding only has
// product events; it can't answer "how many pros are pending review?" or
// "what's the breakdown by modality?". Those are D1 questions — answer them
// here so the in-app dashboard has a unified ops + product view.
//
// Every fn here is admin-gated (reads the session via getRequestHeaders and
// checks isAdminEmail). All queries are read-only aggregations; nothing
// mutates. The dashboard component fans these out in parallel.
//
// Privacy: followUps rows are owner-scoped (no admin read route exists — see
// schema ponytail). Here we ONLY surface aggregate triage counts
// (status/riskLevel), never free-text notes or contact info. This matches the
// level of detail an admin needs to understand load without compromising the
// pro↔help-seeker confidentiality contract.
// =============================================================================

import * as Sentry from '@sentry/tanstackstart-react'
import { createServerFn } from '@tanstack/react-start'
import { and, count, eq, gte, sql } from 'drizzle-orm'
import { getRequestHeaders } from '@tanstack/react-start/server'

import { getDb, withD1Retry } from '#/db'
import { audioStories, followUps, professionals, user } from '#/db/schema'
import { getAuth, isAdminEmail } from '#/lib/auth'

async function requireAdmin(): Promise<void> {
  const session = await getAuth().api.getSession({ headers: getRequestHeaders() })
  if (!session?.user || !(await isAdminEmail(session.user.email))) {
    throw new Error('Acción solo para administradores.')
  }
}

export type ProStatusBreakdown = {
  status: string
  total: number
}

export type ProModalityBreakdown = {
  modality: string
  total: number
}

export type ProGeoBreakdown = {
  country: string
  total: number
}

export type SignupTrendRow = {
  day: string
  total: number
}

export type AudioQueueBreakdown = {
  status: string
  total: number
}

export type FollowUpTriageRow = {
  status: string
  riskLevel: string
  total: number
}

export type MetricsSummary = {
  prosByStatus: ProStatusBreakdown[]
  prosByModality: ProModalityBreakdown[]
  prosByCountry: ProGeoBreakdown[]
  audioQueue: AudioQueueBreakdown[]
  followUpTriage: FollowUpTriageRow[]
  signupTrend7d: SignupTrendRow[]
  signupTrend30d: SignupTrendRow[]
  totals: {
    prosVerified: number
    prosPending: number
    prosTotal: number
    usersTotal: number
    audioPending: number
  }
}

/**
 * All the D1-side metrics in one round-trip. The dashboard loads this once on
 * mount and again on manual refresh — fan-out is server-side so the worker
 * makes the calls in parallel via Promise.all.
 */
export const getMetricsSummary = createServerFn({ method: 'GET' }).handler(
  async () =>
    Sentry.startSpan({ name: 'metrics getMetricsSummary' }, async () => {
      await requireAdmin()
      const db = getDb()

      const [
        prosByStatus,
        prosByModality,
        prosByCountry,
        audioQueue,
        followUpTriage,
        signupTrend7d,
        signupTrend30d,
        totals,
      ] = await Promise.all([
        withD1Retry(() =>
          db
            .select({ status: professionals.verifiedStatus, total: count() })
            .from(professionals)
            .where(sql`${professionals.verifiedStatus} != 'deleted'`)
            .groupBy(professionals.verifiedStatus),
        ),
        // ponytail: modality is a TEXT enum ('in_person' | 'remote' | 'both').
        // Aggregating the raw value keeps the query trivial; the UI maps to
        // Spanish labels.
        withD1Retry(() =>
          db
            .select({
              modality: professionals.modality,
              total: count(),
            })
            .from(professionals)
            .where(
              and(
                eq(professionals.verifiedStatus, 'verified'),
                sql`${professionals.verifiedStatus} != 'deleted'`,
              ),
            )
            .groupBy(professionals.modality),
        ),
        withD1Retry(() =>
          db
            .select({ country: professionals.country, total: count() })
            .from(professionals)
            .where(eq(professionals.verifiedStatus, 'verified'))
            .groupBy(professionals.country)
            .orderBy(sql`total DESC`),
        ),
        withD1Retry(() =>
          db
            .select({ status: audioStories.status, total: count() })
            .from(audioStories)
            .groupBy(audioStories.status),
        ),
        // ponytail: aggregate-only on followUps. status + riskLevel are enum
        // columns; no notes/contact info leaves the table. The dashboard uses
        // this for triage load (e.g. how many 'urgent' open) without breaking
        // the pro↔help-seeker confidentiality contract.
        withD1Retry(() =>
          db
            .select({
              status: followUps.status,
              riskLevel: followUps.riskLevel,
              total: count(),
            })
            .from(followUps)
            .groupBy(followUps.status, followUps.riskLevel),
        ),
        withD1Retry(() =>
          db
            .select({
              day: sql<string>`DATE(${user.createdAt})`.as('day'),
              total: count(),
            })
            .from(user)
            .where(gte(user.createdAt, sql`datetime('now', '-7 days')`))
            .groupBy(sql`day`)
            .orderBy(sql`day ASC`),
        ),
        withD1Retry(() =>
          db
            .select({
              day: sql<string>`DATE(${user.createdAt})`.as('day'),
              total: count(),
            })
            .from(user)
            .where(gte(user.createdAt, sql`datetime('now', '-30 days')`))
            .groupBy(sql`day`)
            .orderBy(sql`day ASC`),
        ),
        withD1Retry(async () => {
          const [verified, pending, all, users, audioPending] = await Promise.all([
            db
              .select({ n: count() })
              .from(professionals)
              .where(eq(professionals.verifiedStatus, 'verified')),
            db
              .select({ n: count() })
              .from(professionals)
              .where(eq(professionals.verifiedStatus, 'pending')),
            db
              .select({ n: count() })
              .from(professionals)
              .where(sql`${professionals.verifiedStatus} != 'deleted'`),
            db.select({ n: count() }).from(user),
            db
              .select({ n: count() })
              .from(audioStories)
              .where(eq(audioStories.status, 'pending')),
          ])
          return {
            prosVerified: verified.at(0)?.n ?? 0,
            prosPending: pending.at(0)?.n ?? 0,
            prosTotal: all.at(0)?.n ?? 0,
            usersTotal: users.at(0)?.n ?? 0,
            audioPending: audioPending.at(0)?.n ?? 0,
          }
        }),
      ])

      return {
        prosByStatus,
        prosByModality,
        prosByCountry,
        audioQueue,
        followUpTriage,
        signupTrend7d,
        signupTrend30d,
        totals,
      } satisfies MetricsSummary
    }),
)
