// =============================================================================
// scripts/reset-local-passwords.ts — set every local user's password to one value
// =============================================================================
// For local dev only. Replaces the password on every `credential` account in the
// local dev.db with a single shared value, so you can log in as any
// user from the seeded DB (e.g. after `pnpm db:pull-prod`)
// without knowing each user's real prod password.
//
// Usage:
//   pnpm run db:reset-passwords                 # default password: password123
//   pnpm run db:reset-passwords -- --password secret
//   pnpm run db:reset-passwords -- --email foo@x.com --password secret  # one user
//   pnpm run db:reset-passwords -- --dry-run    # show counts, don't write
//
// Hashing matches Better Auth's exact scrypt params
// (@better-auth/utils/better-auth/crypto/password.node.cjs):
//   N=16384, r=16, p=1, dkLen=64, NFKC-normalized, format `salt:hash`.
// Verified end-to-end through `verifyPassword()` — the real login flow accepts it.
//
// Uses one shared salt for all accounts (local dev only — these hashes never
// leave this machine). Real Better Auth uses random per-user salts; the verify
// path only checks the salt:hash format, so a fixed salt works identically.
//
// Opens dev.db (repo root) directly with better-sqlite3 — see
// scripts/db-check.mjs for the local-database contract.
// =============================================================================

import { scrypt, randomBytes } from 'node:crypto'
import { existsSync } from 'node:fs'
import Database from 'better-sqlite3'

type Args = {
	password: string
	email?: string
	dryRun: boolean
}

function parseArgs(argv: string[]): Args {
	const args = argv.slice(2)
	let password = 'password123'
	let email: string | undefined
	let dryRun = false

	// Validate that a value-taking flag actually has a following value and that
	// the value isn't itself another flag — otherwise `args[++i]` is undefined
	// or swallows the next flag, which would crash normalize() or silently
	// broaden the reset scope to every credential account.
	// NOTE: args[i+1] is typed `string` (no noUncheckedIndexedAccess), but at
	// runtime it can be undefined when the flag is the last token. The length
	// check is what makes this real — keep it even though TS doesn't see it.
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
		if (a === '--password' || a === '-p') [i, password] = readValue(i, a)
		else if (a === '--email' || a === '-e') [i, email] = readValue(i, a)
		else if (a === '--dry-run' || a === '-n') dryRun = true
		else if (a === '--help' || a === '-h') {
			console.log(
				[
					'Usage: pnpm run db:reset-passwords -- [options]',
					'',
					'Options:',
					'  --password, -p <pw>   password to set (default: password123)',
					'  --email, -e <email>   only reset this user (default: all)',
					'  --dry-run, -n         show counts, write nothing',
					'  --help, -h            show this help',
				].join('\n'),
			)
			process.exit(0)
		} else {
			console.error(`Unknown argument: ${a}`)
			process.exit(1)
		}
	}

	return { password, email, dryRun }
}

function generateKey(password: string, salt: string): Promise<Buffer> {
	return new Promise((resolve, reject) => {
		scrypt(
			password.normalize('NFKC'),
			salt,
			64,
			{ N: 16384, r: 16, p: 1, maxmem: 128 * 16384 * 16 * 2 },
			(err, key) => (err ? reject(err) : resolve(key)),
		)
	})
}

function findLocalDb(): string {
	// The single local dev.db at the repo root (see scripts/db-check.mjs).
	// Throws with a helpful hint if it's missing — that means migrations
	// haven't been applied yet.
	if (!existsSync('dev.db')) {
		throw new Error(
			'dev.db not found at the repo root.\n' +
				'Run `pnpm db:apply:local` (or just `pnpm dev`) to create it first.',
		)
	}
	return 'dev.db'
}

async function main() {
	const { password, email, dryRun } = parseArgs(process.argv)
	const dbPath = findLocalDb()
	console.log(`DB:     ${dbPath}`)
	console.log(`Mode:   ${dryRun ? 'DRY RUN (no writes)' : 'write'}`)
	console.log(`Target: ${email ? 'single account' : 'all credential accounts'}`)
	console.log('Pass:   [redacted — pass via --password]')
	console.log()

	const salt = randomBytes(16).toString('hex')
	const key = await generateKey(password, salt)
	const hash = `${salt}:${key.toString('hex')}`
	const now = Date.now()

	const db = new Database(dbPath, { readonly: dryRun })

	const whereClause = email
		? `WHERE a.provider_id = 'credential' AND u.email = ?`
		: `WHERE a.provider_id = 'credential'`
	const params = email ? [email] : []

	const matches = db
		.prepare(
			`SELECT u.email FROM account a JOIN user u ON a.user_id = u.id
			 ${whereClause} ORDER BY u.email`,
		)
		.all(...params) as { email: string }[]

	if (matches.length === 0) {
		console.log('No matching credential accounts found.')
		db.close()
		return
	}

	console.log(`Will update ${matches.length} account(s):`)
	for (const { email: e } of matches) console.log(`  · ${e}`)

	if (dryRun) {
		console.log('\n(dry run — no changes written)')
		db.close()
		return
	}

	const res = db
		.prepare(
			`UPDATE account SET password = ?, updated_at = ?
			 WHERE provider_id = 'credential'
			 ${email ? `AND user_id = (SELECT id FROM user WHERE email = ?)` : ''}`,
		)
		.run(hash, now, ...(email ? [email] : []))

	console.log(`\n✓ Updated ${res.changes} account(s).`)
	db.close()
}

main().catch((err) => {
	console.error('Failed:', err)
	process.exit(1)
})
