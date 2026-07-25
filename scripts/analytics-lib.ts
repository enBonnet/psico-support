// =============================================================================
// scripts/analytics-lib.ts — shared Analytics Engine SQL catalog + runner
// =============================================================================
// Used by both:
//   - scripts/analytics.ts (CLI)
//   - scripts/analytics-dashboard.ts (local dashboard server)
//
// Analytics Engine is WRITE-ONLY from the Worker; reads go through the SQL REST
// API with an account-level token. Column contract is documented in
// src/server/analytics.ts and AGENTS.md gotcha #10.
// =============================================================================

import { config } from 'dotenv'

config({ path: ['.env.local', '.env'] })

export const DATASET = 'psico_events'

export type AnalyticsEnv = {
	accountId: string
	token: string
}

export function getAnalyticsEnv(): AnalyticsEnv {
	const accountId = process.env.CF_ACCOUNT_ID
	const token = process.env.CF_ANALYTICS_TOKEN
	if (!accountId || !token) {
		throw new Error(
			[
				'Missing CF_ACCOUNT_ID or CF_ANALYTICS_TOKEN.',
				'',
				'  Create a token with permission: Account → Analytics → Engine → Read',
				'  (My Profile → API Tokens → Create Token → Custom)',
				'',
				'  Then add to .env.local:',
				'    CF_ACCOUNT_ID=<your account id>',
				'    CF_ANALYTICS_TOKEN=<your token>',
			].join('\n'),
		)
	}
	return { accountId, token }
}

export type QueryContext = {
	days: number
	event?: string
}

export type QueryDef = {
	id: string
	title: string
	description: string
	sql: (ctx: QueryContext) => string
	columns: string[]
}

// Every pre-built query. Aggregations ALWAYS use SUM(_sample_interval * double1)
// to undo sampling at >1M writes/min. Retention is 90 days.
export const QUERIES: QueryDef[] = [
	{
		id: 'funnel',
		title: 'Embudo help-seeker',
		description: 'Landing → directorio → contacto (categoría public)',
		columns: ['event', 'category', 'total'],
		sql: ({ days }) => `
			SELECT
				blob1 AS event,
				blob2 AS category,
				SUM(_sample_interval * double1) AS total
			FROM ${DATASET}
			WHERE blob2 = 'public'
				AND timestamp > NOW() - INTERVAL '${days}' DAY
			GROUP BY event, category
			ORDER BY total DESC
		`,
	},
	{
		id: 'whatsapp',
		title: 'Clicks WhatsApp',
		description: 'Todos los puntos de WhatsApp: directorio, al-azar, ayuda-ahora, /ahora',
		columns: ['event', 'total'],
		sql: ({ days }) => `
			SELECT
				blob1 AS event,
				SUM(_sample_interval * double1) AS total
			FROM ${DATASET}
			WHERE blob1 IN (
				'pro_contact', 'pro_contact_random',
				'pro_contact_help_now', 'pro_contact_ahora'
			)
				AND timestamp > NOW() - INTERVAL '${days}' DAY
			GROUP BY event
			ORDER BY total DESC
		`,
	},
	{
		id: 'whatsapp-by-pro',
		title: 'WhatsApp por profesional',
		description: 'Top profesionales por clicks (todos los puntos de WhatsApp)',
		columns: ['pro_id', 'user_id', 'clicks'],
		sql: ({ days }) => `
			SELECT
				blob4 AS pro_id,
				blob6 AS user_id,
				SUM(_sample_interval * double1) AS clicks
			FROM ${DATASET}
			WHERE blob1 IN (
				'pro_contact', 'pro_contact_random',
				'pro_contact_help_now', 'pro_contact_ahora'
			)
				AND timestamp > NOW() - INTERVAL '${days}' DAY
			GROUP BY pro_id, user_id
			ORDER BY clicks DESC
			LIMIT 20
		`,
	},
	{
		id: 'sources',
		title: 'Origen del contacto',
		description: 'WhatsApp: ¿desde directorio o perfil?',
		columns: ['source', 'clicks'],
		sql: ({ days }) => `
			SELECT
				blob5 AS source,
				SUM(_sample_interval * double1) AS clicks
			FROM ${DATASET}
			WHERE blob1 = 'pro_contact'
				AND timestamp > NOW() - INTERVAL '${days}' DAY
			GROUP BY source
			ORDER BY clicks DESC
		`,
	},
	{
		id: 'trends',
		title: 'Tendencia diaria',
		description: 'Clicks por día para un evento (pro_contact por defecto)',
		columns: ['day', 'count'],
		sql: ({ days, event }) => `
			SELECT
				DATE(timestamp) AS day,
				SUM(_sample_interval * double1) AS count
			FROM ${DATASET}
			WHERE blob1 = '${event ?? 'pro_contact'}'
				AND timestamp > NOW() - INTERVAL '${days}' DAY
			GROUP BY day
			ORDER BY day ASC
		`,
	},
	{
		id: 'top-events',
		title: 'Top eventos',
		description: 'Todos los eventos por número total',
		columns: ['event', 'category', 'total'],
		sql: ({ days }) => `
			SELECT
				blob1 AS event,
				blob2 AS category,
				SUM(_sample_interval * double1) AS total
			FROM ${DATASET}
			WHERE timestamp > NOW() - INTERVAL '${days}' DAY
			GROUP BY event, category
			ORDER BY total DESC
		`,
	},
	{
		id: 'routes',
		title: 'Top rutas',
		description: 'Dónde ocurren los eventos (top 15 rutas)',
		columns: ['route', 'events'],
		sql: ({ days }) => `
			SELECT
				blob3 AS route,
				SUM(_sample_interval * double1) AS events
			FROM ${DATASET}
			WHERE blob3 != ''
				AND timestamp > NOW() - INTERVAL '${days}' DAY
			GROUP BY route
			ORDER BY events DESC
			LIMIT 15
		`,
	},
]

export function findQuery(id: string): QueryDef | undefined {
	return QUERIES.find((q) => q.id === id)
}

export type SqlResult = {
	data?: Record<string, unknown>[]
	errors?: { message: string }[]
	meta?: { name: string }[]
	success?: boolean
	messages?: { message: string }[]
}

export async function runSql(
	env: AnalyticsEnv,
	sql: string,
): Promise<SqlResult> {
	// Cloudflare's Analytics Engine SQL API takes the raw SQL text as the body
	// (NOT a JSON {"sql":"..."} object — that yields HTTP 422 "Expected an SQL
	// statement, found: {"). See the cURL example in the SQL API docs which uses
	// `--data "SELECT ..."`.
	const res = await fetch(
		`https://api.cloudflare.com/client/v4/accounts/${env.accountId}/analytics_engine/sql`,
		{
			method: 'POST',
			headers: {
				Authorization: `Bearer ${env.token}`,
				'content-type': 'text/plain',
			},
			body: sql,
		},
	)

	if (!res.ok) {
		const text = await res.text()
		throw new Error(`HTTP ${res.status}: ${text}`)
	}

	return (await res.json()) as SqlResult
}
