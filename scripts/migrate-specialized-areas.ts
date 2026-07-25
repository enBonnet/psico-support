// =============================================================================
// scripts/migrate-specialized-areas.ts — one-off tag-overlap backfill
// =============================================================================
// Moves four tags that already live on the general axes into the new
// specialized_areas column, then leaves the source axes without them:
//
//   focus_groups:    'Cuidadores'    -> specialized_areas 'Personas Cuidadoras'
//   focus_groups:    'Neurodivergentes' -> specialized_areas 'Personas Neurodivergentes'
//   focus_groups:    'Oncológica'    -> specialized_areas 'Oncológica'
//   practice_areas:  'Duelo'         -> specialized_areas 'Duelo'
//
// Existing pros are migrated to specialization_mode='inclusive' so they keep
// appearing in the general directory (no behavior change), while ALSO becoming
// matchable when a help-seeker filters by their specialized area. Once this
// runs, the four moved tags are removed from FOCUS_GROUP_OPTIONS /
// PRACTICE_AREA_OPTIONS in src/server/professionals.ts.
//
// Idempotent: re-running on an already-migrated row produces the same stored
// arrays (the moved tags are removed from source on first run, so the second
// run finds nothing to move). Safe to run repeatedly during rollout.
//
// IMPORTANT: run this against PROD data once, after deploying the schema
// migration. It is NOT needed for local dev — `npm run db:seed` writes
// post-migration fixtures directly (specialized_areas + mode already set).
// Running it locally is harmless (it'll move any old-axis tags the seed left
// in place, e.g. María González's focus_groups=['Oncológica']) but it will
// also normalize specialization_mode to 'inclusive', which overrides any
// 'exclusive' the seed set (e.g. Luis Torres). To exercise the exclusive
// path locally, seed and DON'T run this script.
//
// Usage:
//   npx tsx scripts/migrate-specialized-areas.ts --local            # wrangler D1
//   npx tsx scripts/migrate-specialized-areas.ts --local --db <path> # explicit file
//   npx tsx scripts/migrate-specialized-areas.ts --sql               # print SQL for --remote
//
// The --remote path: run --sql, save to a file, review it, then
//   npx wrangler d1 execute psico-support-db --remote --file=<path>
// (the script does not invoke wrangler itself — keeping that step manual per
// AGENTS.md gotcha #1: never auto-apply migrations/SQL against remote D1).
// =============================================================================

import Database from 'better-sqlite3'
import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

// ponytail: tag-overlap map. Key = old tag in its source axis; value = the new
// specialized_areas tag. 'Cuidadores'/'Neurodivergentes' get a friendlier
// "Personas …" label per Carol's feedback; the other two map verbatim.
const FOCUS_MIGRATIONS: Record<string, string> = {
	Cuidadores: 'Personas Cuidadoras',
	Neurodivergentes: 'Personas Neurodivergentes',
	Oncológica: 'Oncológica',
}
const PRACTICE_MIGRATIONS: Record<string, string> = {
	Duelo: 'Duelo',
}

const ALL_MIGRATED_SPECIALIZED = new Set<string>([
	...Object.values(FOCUS_MIGRATIONS),
	...Object.values(PRACTICE_MIGRATIONS),
])

function parseJsonArray(raw: string | null | undefined): string[] {
	if (!raw) return []
	try {
		const v = JSON.parse(raw)
		return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []
	} catch {
		return []
	}
}

type Row = {
	id: number
	focusGroupsRaw: string
	practiceAreasRaw: string
	specializedRaw: string
}

function migrateRow(r: Row): {
	focusGroups: string[]
	practiceAreas: string[]
	specialized: string[]
	changed: boolean
} {
	const fg = parseJsonArray(r.focusGroupsRaw)
	const pa = parseJsonArray(r.practiceAreasRaw)
	// specialized starts from whatever's already there (so a re-run after a
	// pro self-edited in /ayuda/especifica doesn't clobber their picks) and
	// is de-duplicated against the migrated set.
	const sp = parseJsonArray(r.specializedRaw).filter(
		(t) => !ALL_MIGRATED_SPECIALIZED.has(t),
	)

	let changed = false
	for (const [oldTag, newTag] of Object.entries(FOCUS_MIGRATIONS)) {
		if (fg.includes(oldTag)) {
			fg.splice(fg.indexOf(oldTag), 1)
			sp.push(newTag)
			changed = true
		}
	}
	for (const [oldTag, newTag] of Object.entries(PRACTICE_MIGRATIONS)) {
		if (pa.includes(oldTag)) {
			pa.splice(pa.indexOf(oldTag), 1)
			sp.push(newTag)
			changed = true
		}
	}
	return { focusGroups: fg, practiceAreas: pa, specialized: sp, changed }
}

function findLocalDb(): string {
	// ponytail: mirror scripts/seed-local.ts's findLocalDb — wrangler's local
	// D1 lives under .wrangler/state/v3/d1/miniflare-D1DatabaseObject/*.sqlite,
	// not at a fixed dev.db path (there's no "path" field in wrangler.jsonc).
	// Sort by size desc to pick the real DB if miniflare ever leaves stray
	// files. Throws with a helpful hint if the state dir is missing — that
	// means `wrangler d1 migrations apply --local` hasn't run yet.
	const dir = '.wrangler/state/v3/d1/miniflare-D1DatabaseObject'
	let files: string[]
	try {
		files = readdirSync(dir)
			.filter((f) => f.endsWith('.sqlite') && !f.startsWith('metadata'))
			.map((f) => join(dir, f))
	} catch {
		throw new Error(
			`No wrangler D1 state found at ${dir}.\n` +
				'Run `npx wrangler d1 migrations apply psico-support-db --local` first.',
		)
	}
	if (files.length === 0)
		throw new Error(
			`No D1 sqlite files in ${dir}.\n` +
				'Run `npx wrangler d1 migrations apply psico-support-db --local` first.',
		)
	files.sort((a, b) => statSync(b).size - statSync(a).size)
	return files[0]
}

function runLocal(dbPathOverride?: string) {
	const dbPath = dbPathOverride ?? findLocalDb()
	const db = new Database(dbPath, { readonly: false })
	const rows = db
		.prepare(
			`SELECT id, focus_groups AS focusGroupsRaw, practice_areas AS practiceAreasRaw, specialized_areas AS specializedRaw FROM professionals`,
		)
		.all() as Row[]

	const update = db.prepare(
		`UPDATE professionals SET focus_groups = ?, practice_areas = ?, specialized_areas = ?, specialization_mode = 'inclusive' WHERE id = ?`,
	)
	const tx = db.transaction((toUpdate: Row[]) => {
		let touched = 0
		for (const r of toUpdate) {
			const m = migrateRow(r)
			if (!m.changed) continue
			update.run(
				JSON.stringify(m.focusGroups),
				JSON.stringify(m.practiceAreas),
				JSON.stringify(m.specialized),
				r.id,
			)
			touched++
		}
		return touched
	})
	const touched = tx(rows.filter((r) => migrateRow(r).changed))
	console.log(`migrated ${touched} of ${rows.length} rows (local: ${dbPath})`)
	db.close()
}

function emitSql() {
	// ponytail: emit idempotent UPDATEs as a single SQL script for `wrangler d1
	// execute --remote --file=…`. D1/SQLite ships json_* functions, so we use
	// them directly instead of brittle REPLACE() on serialized JSON text:
	//   json_remove pulls the old tag out of the source array
	//   json_insert pushes the new tag onto specialized_areas (no dup: filtered)
	// Each statement is a no-op on rows that don't contain the source tag
	// (the json_position check skips them), which makes the script re-runnable.
	// Specialization mode is set to 'inclusive' on every row so existing pros
	// keep their current visibility (no row disappears at cutover).
	const stmts: string[] = [
		`-- set every existing pro to inclusive mode (no behavior change for them)`,
		`UPDATE professionals SET specialization_mode = 'inclusive'`,
		`WHERE specialization_mode IS NULL OR specialization_mode <> 'inclusive';`,
		``,
		`-- focus_groups -> specialized_areas migrations`,
		`-- (json_each-based removal + deduped insert; no-op when the tag is absent)`,
	]
	const buildMove = (sourceCol: string, oldTag: string, newTag: string) => {
		// ponytail: json_each yields the *parsed* value (Cuidadores, not "Cuidadores"),
		// so the WHERE comparisons use plain single-quoted SQL string literals.
		// specialized_areas append uses json_insert with json() — but json() needs its
		// ARGUMENT to be valid JSON, so we wrap the new tag in double quotes inside
		// the single-quoted literal: json('"Personas Cuidadoras"') parses the quoted
		// string and emits the bare token into the array. The CASE skips the insert
		// when the new tag is already present (idempotent on re-run).
		const oldLit = `'${oldTag.replace(/'/g, "''")}'`
		const newLit = `'${newTag.replace(/'/g, "''")}'`
		// JSON-stringified form of newTag, single-quote-escaped for SQL: '"New Tag"'
		const newLitJson = `'"${newTag.replace(/'/g, "''")}"'`
		return [
			`UPDATE professionals`,
			`SET ${sourceCol} = (`,
			`      SELECT json_group_array(value)`,
			`      FROM json_each(${sourceCol})`,
			`      WHERE value <> ${oldLit}`,
			`    ),`,
			`    specialized_areas = CASE`,
			`      WHEN EXISTS (SELECT 1 FROM json_each(specialized_areas) WHERE value = ${newLit})`,
			`        THEN specialized_areas`,
			`      ELSE json_insert(specialized_areas, '$[#]', json(${newLitJson}))`,
			`    END`,
			`WHERE EXISTS (SELECT 1 FROM json_each(${sourceCol}) WHERE value = ${oldLit});`,
			``,
		].join('\n')
	}
	for (const [oldTag, newTag] of Object.entries(FOCUS_MIGRATIONS)) {
		stmts.push(buildMove('focus_groups', oldTag, newTag))
	}
	stmts.push(`-- practice_areas -> specialized_areas migrations`)
	for (const [oldTag, newTag] of Object.entries(PRACTICE_MIGRATIONS)) {
		stmts.push(buildMove('practice_areas', oldTag, newTag))
	}
	console.log(stmts.join('\n'))
	console.log(
		`-- review the above, then run: npx wrangler d1 execute psico-support-db --remote --file=<this file>`,
	)
}

function main() {
	const args = process.argv.slice(2)
	const mode = args[0]
	if (mode === '--local') {
		// ponytail: --db <path> overrides the auto-discovered wrangler state path
		// (used by tests; operators normally omit it and let findLocalDb resolve
		// the wrangler-managed D1 file under .wrangler/state/v3/d1/…).
		const dbArgIdx = args.indexOf('--db')
		const dbPathOverride =
			dbArgIdx !== -1 && args[dbArgIdx + 1] ? args[dbArgIdx + 1] : undefined
		runLocal(dbPathOverride)
	} else if (mode === '--sql') {
		emitSql()
	} else {
		console.error(
			[
				'Usage:',
				'  npx tsx scripts/migrate-specialized-areas.ts --local   # write to local dev.db',
				'  npx tsx scripts/migrate-specialized-areas.ts --sql      # print SQL for remote review',
				'',
				'Remote apply: save the --sql output to a file, review it, then',
				'  npx wrangler d1 execute psico-support-db --remote --file=<path>',
			].join('\n'),
		)
		process.exit(1)
	}
}

main()
