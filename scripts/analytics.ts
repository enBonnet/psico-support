// =============================================================================
// scripts/analytics.ts — query Analytics Engine from the terminal
// =============================================================================
// Wraps the SQL REST API so you can answer questions like "how many WhatsApp
// clicks this week?" without leaving the terminal.
//
// Usage:
//   npm run analytics -- <query> [--days N] [--event NAME] [--sql "..."]
//
// Examples:
//   npm run analytics -- funnel                   # full funnel, 7d
//   npm run analytics -- whatsapp --days 30       # WhatsApp clicks, 30d
//   npm run analytics -- whatsapp-by-pro          # top pros by WhatsApp clicks
//   npm run analytics -- trends --event pro_contact --days 30
//   npm run analytics -- top-events               # all events ranked
//   npm run analytics -- sql "SELECT blob1, COUNT() FROM psico_events GROUP BY 1"
// =============================================================================

import { QUERIES, findQuery, getAnalyticsEnv, runSql } from './analytics-lib'
import type { QueryContext } from './analytics-lib'

type ParsedArgs = {
	query: string
	days: number
	event?: string
	rawSql?: string
}

function parseArgs(argv: string[]): ParsedArgs {
	const args = argv.slice(2)
	const positional = args.filter((a) => !a.startsWith('--'))
	const query = positional[0] ?? 'help'

	let days = 7
	let event: string | undefined
	let rawSql: string | undefined

	for (let i = 0; i < args.length; i++) {
		const a = args[i]
		if (a === '--days') days = Number(args[++i]) || 7
		else if (a === '--event') event = args[++i]
		else if (a === '--sql') rawSql = args[++i]
	}

	return { query, days, event, rawSql }
}

function printTable(columns: string[], rows: Record<string, unknown>[]): void {
	if (rows.length === 0) {
		console.log('  (no rows)')
		return
	}
	const widths = columns.map((c) =>
		Math.max(c.length, ...rows.map((r) => String(r[c] ?? '').length)),
	)
	console.log(`  ${columns.map((c, i) => c.padEnd(widths[i])).join('  ')}`)
	console.log(`  ${widths.map((w) => '-'.repeat(w)).join('  ')}`)
	for (const row of rows) {
		console.log(`  ${columns.map((c, i) => String(row[c] ?? '').padEnd(widths[i])).join('  ')}`)
	}
}

function printHelp(): void {
	console.log('')
	console.log('Usage: npm run analytics -- <query> [--days N] [--event NAME] [--sql "<raw>"]')
	console.log('')
	console.log('Queries:')
	for (const q of QUERIES) {
		console.log(`  ${q.id.padEnd(16)} ${q.description}`)
	}
	console.log('  sql             Raw SQL string against psico_events')
	console.log('')
	console.log('Options:')
	console.log('  --days N        Window in days (default 7)')
	console.log('  --event NAME    Event for `trends` (default pro_contact)')
	console.log('  --sql "..."     Raw SQL (skips catalog)')
	console.log('')
	console.log('Setup: add to .env.local — CF_ACCOUNT_ID, CF_ANALYTICS_TOKEN')
	console.log('       (Account → Analytics → Engine → Read token scope)')
	console.log('')
}

async function main() {
	const args = parseArgs(process.argv)

	if (args.query === 'sql' && args.rawSql) {
		const env = getAnalyticsEnv()
		const result = await runSql(env, args.rawSql)
		const cols = result.meta?.map((m) => m.name) ?? []
		printTable(cols, result.data ?? [])
		return
	}

	if (args.query === 'help' || args.query === '--help' || args.query === '-h') {
		printHelp()
		return
	}

	const def = findQuery(args.query)
	if (!def) {
		console.error(`✗ Unknown query: ${args.query}`)
		printHelp()
		process.exit(1)
	}

	const env = getAnalyticsEnv()
	const ctx: QueryContext = { days: args.days, event: args.event }
	const sql = def.sql(ctx).trim()

	console.log('')
	console.log(`■ ${def.id} — last ${args.days}d`)
	console.log(`  ${def.description}`)
	console.log('')

	const result = await runSql(env, sql)

	if (result.errors && result.errors.length > 0) {
		console.error('✗ SQL errors:')
		for (const e of result.errors) console.error(`  ${e.message}`)
		process.exit(1)
	}

	printTable(def.columns, result.data ?? [])
	console.log('')
}

main().catch((err) => {
	console.error('✗ Failed:', err instanceof Error ? err.message : err)
	process.exit(1)
})
