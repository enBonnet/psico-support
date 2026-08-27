// =============================================================================
// scripts/promote-local-admin.ts — set a user's role to 'admin' on the local DB
// =============================================================================
// For local dev only. Promotes a user (default: admin@enbonnet.com) to
// role='admin' on the LOCAL dev.db (the single local SQLite that `pnpm dev`
// serves — see scripts/db-check.mjs). It never touches remote/prod. For prod
// use:
//   pnpm exec wrangler d1 execute psico-support-db --remote \
//     --command "UPDATE user SET role='admin' WHERE email='...';"
//
// Usage:
//   pnpm run db:promote-admin                            # admin@enbonnet.com
//   pnpm run db:promote-admin -- --email foo@x.com       # another user
//   pnpm run db:promote-admin -- --dry-run               # preview, no write
//
// Idempotent: re-running on an already-admin user reports "already admin" and
// writes nothing. Promote-only by design — there is intentionally no demote
// path here, matching the `promoteToAdmin` server fn in
// src/server/professionals.ts (promote-only means an admin can never
// accidentally lock themselves — or the last admin — out of the panel).
// ponytail: ceiling — to test the non-admin state locally, re-seed with
// `pnpm run db:seed -- --reset`, or edit the row directly with better-sqlite3.
//
// Opens dev.db directly with better-sqlite3 (same approach as
// scripts/seed-local.ts / reset-local-passwords.ts). One handle; readonly only
// in --dry-run so a missing user / table is reported without taking a write
// lock. Safe alongside a running `pnpm dev` — SQLite serializes writers,
// and this writes one row by primary key.
// =============================================================================

import { existsSync } from 'node:fs'
import Database from 'better-sqlite3'

type Args = { email: string; dryRun: boolean }

function parseArgs(argv: string[]): Args {
	const args = argv.slice(2)
	let email = 'admin@enbonnet.com'
	let dryRun = false
	// Validate that a value-taking flag actually has a following value and that
	// the value isn't itself another flag — otherwise `args[++i]` is undefined
	// or swallows the next flag. Mirrors reset-local-passwords.ts.
	const readValue = (i: number, flag: string): [number, string] => {
		const j = i + 1
		const v = args[j]
		if (j >= args.length || v.startsWith('-')) {
			console.error(`Missing value for ${flag}`)
			process.exit(1)
		}
		return [j, v]
	}
	for (let i = 0; i < args.length; i++) {
		const a = args[i]
		if (a === '--email' || a === '-e') [i, email] = readValue(i, a)
		else if (a === '--dry-run' || a === '-n') dryRun = true
		else if (a === '--help' || a === '-h') {
			console.log(
				[
					'Usage: pnpm run db:promote-admin -- [options]',
					'',
					'Options:',
					'  --email, -e <email>   user to promote (default: admin@enbonnet.com)',
					'  --dry-run, -n         show current + target role, write nothing',
					'  --help, -h            show this help',
				].join('\n'),
			)
			process.exit(0)
		} else {
			console.error(`Unknown argument: ${a}`)
			process.exit(1)
		}
	}
	return { email, dryRun }
}

// Mirrors findLocalDb() in scripts/seed-local.ts + reset-local-passwords.ts:
// the single local dev.db at the repo root. Throws with a helpful hint if
// it's missing — that means migrations haven't been applied yet.
function findLocalDb(): string {
	if (!existsSync('dev.db')) {
		throw new Error(
			'dev.db not found at the repo root.\n' +
				'Run `pnpm db:apply:local` (or just `pnpm dev`) to create it first.',
		)
	}
	return 'dev.db'
}

// async so `main().catch(...)` below always receives a Promise — matches the
// sibling scripts (a sync main() would return undefined on an early `return`,
// and `.catch` on undefined throws). No awaits inside; that's fine.
async function main() {
	const { email, dryRun } = parseArgs(process.argv)
	const dbPath = findLocalDb()
	console.log(`DB:     ${dbPath}`)
	console.log(`Mode:   ${dryRun ? 'DRY RUN (no writes)' : 'write'}`)
	console.log(`Target: ${email}`)
	console.log()

	// One handle; readonly in dry-run so a missing user is reported without a
	// write lock. better-sqlite3 applies the WAL on read for a consistent view
	// even while pnpm dev holds the DB (see scripts/db-check.mjs).
	const db = new Database(dbPath, { readonly: dryRun })

	const row = db
		.prepare('SELECT id, name, email, role FROM user WHERE email = ?')
		.get(email) as { id: string; name: string; email: string; role: string } | undefined

	if (!row) {
		console.log(
			`✗ No user with email ${email} on the local D1.\n` +
				'  Create it first via the /signup flow, or `pnpm run db:seed` for fixtures.',
		)
		db.close()
		process.exit(1)
	}

	console.log(`Current:  name=${row.name}  role=${row.role}`)
	if (row.role === 'admin') {
		console.log('\n✓ Already admin — nothing to do.')
		db.close()
		return
	}

	if (dryRun) {
		console.log('\n(dry run — would set role=admin)')
		db.close()
		return
	}

	// Drizzle's $onUpdate (schema.ts) is an ORM-level hook, not a DB trigger,
	// so a raw UPDATE won't bump updated_at — set it explicitly, matching
	// reset-local-passwords.ts.
	const res = db
		.prepare(`UPDATE user SET role = 'admin', updated_at = ? WHERE id = ?`)
		.run(Date.now(), row.id)
	db.close()

	if (res.changes === 1) {
		console.log(`\n✓ Promoted to admin (${res.changes} row updated).`)
	} else {
		// The row existed moments ago — a non-1 change means a concurrent
		// delete. Never report success on a no-op.
		console.log(`\n✗ Update affected ${res.changes} rows (expected 1) — aborted.`)
		process.exit(1)
	}
}

main().catch((err) => {
	console.error('Failed:', err)
	process.exit(1)
})
