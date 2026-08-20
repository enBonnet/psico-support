// =============================================================================
// scripts/seed-local.ts — populate the local wrangler-managed D1 with fixtures
// =============================================================================
// For local dev only. Inserts a known admin + a spread of professionals across
// verifiedStatus / modality / availability so the directory, admin review queue,
// panel, and Voces que acompañan all have something to render after a fresh
// `wrangler d1 migrations apply psico-support-db --local`.
//
// Usage:
//   ppnpm run db:seed                    # insert (skip if a user email already exists)
//   ppnpm run db:seed -- --reset         # DELETE all rows from every table first
//   ppnpm run db:seed -- --password foo  # override default password (password123)
//
// Idempotent by email: re-running won't duplicate users. --reset wipes
// user/session/account/professionals/audio_stories/follow_ups/professional_documents
// then re-inserts. Does NOT re-apply migrations — run
// `pnpm exec wrangler d1 migrations apply psico-support-db --local` first if needed.
//
// Hashing matches Better Auth's scrypt params (see reset-local-passwords.ts):
//   scrypt N=16384, r=16, p=1, dkLen=64, NFKC-normalized, format `salt:hash`.
// One shared salt for all accounts (local dev only — never leave this machine).
// =============================================================================

import { scrypt, randomBytes } from 'node:crypto'
import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import Database from 'better-sqlite3'

type Args = { password: string; reset: boolean }

function parseArgs(argv: string[]): Args {
	const args = argv.slice(2)
	let password = 'password123'
	let reset = false
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
		if (a === '--password' || a === '-p') [, password] = readValue(i, a)
		else if (a === '--reset') reset = true
		else if (a === '--help' || a === '-h') {
			console.log(
				[
					'Usage: ppnpm run db:seed -- [options]',
					'',
					'Options:',
					'  --password, -p <pw>   password for all seeded accounts (default: password123)',
					'  --reset               wipe all rows before inserting',
					'  --help, -h            show this help',
				].join('\n'),
			)
			process.exit(0)
		} else {
			console.error(`Unknown argument: ${a}`)
			process.exit(1)
		}
	}
	return { password, reset }
}

function findLocalDb(): string {
	const dir = '.wrangler/state/v3/d1/miniflare-D1DatabaseObject'
	let files: string[]
	try {
		files = readdirSync(dir)
			.filter((f) => f.endsWith('.sqlite') && !f.startsWith('metadata'))
			.map((f) => join(dir, f))
	} catch {
		throw new Error(
			`No wrangler D1 state found at ${dir}.\n` +
				'Run `pnpm exec wrangler d1 migrations apply psico-support-db --local` first.',
		)
	}
	if (files.length === 0)
		throw new Error(
			`No D1 sqlite files in ${dir}.\n` +
				'Run `pnpm exec wrangler d1 migrations apply psico-support-db --local` first.',
		)
	files.sort((a, b) => statSync(b).size - statSync(a).size)
	return files[0]
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

// ---- fixture data ----------------------------------------------------------
// Values mirror the real option sets in src/server/professionals.ts and
// src/server/locations.ts so the directory filters and admin views render
// exactly as they would against prod-shaped data.

type Modality = 'in_person' | 'remote' | 'both'
type VerifiedStatus =
	| 'pending'
	| 'verified'
	| 'rejected'
	| 'disabled'
	| 'deleted'

type ProSeed = {
	name: string
	email: string
	certificationNumber: string
	certifyingSchool: string
	population: string[]
	focusGroups: string[]
	practiceAreas: string[]
	// ponytail: sensitive specialized areas (4th axis) + per-pro participation
	// mode. Defaults below: most fixtures stay inclusive with empty specialized
	// (mirrors pre-migration rows). A handful pick specialized tags; one is
	// exclusive so the local directory shows both paths.
	specializedAreas: string[]
	specializationMode: 'inclusive' | 'exclusive'
	modality: Modality
	country: string
	estado: string | null
	ciudad: string | null
	whatsappCountry: string
	whatsapp: string
	verifiedStatus: VerifiedStatus
	availabilityMode: 'always' | 'scheduled' | 'inactive'
	providesService: boolean
	contactCount: number
}

const VENEZUELA = 'Venezuela'

const PROS: ProSeed[] = [
	{
		name: 'Dra. María González',
		email: 'maria.gonzalez@example.com',
		certificationNumber: 'VP-00001',
		certifyingSchool: 'Colegio de Psicólogos de Venezuela',
		population: ['Adultos', 'Adultos mayores'],
		focusGroups: ['Migrantes y refugiados'],
		practiceAreas: ['Ansiedad y depresión'],
		// ponytail: post-migration state — Oncológica + Duelo now live on the
		// specialized axis (inclusive), so the local directory shows the new
		// field rendering AND the old-axis-emptied rows.
		specializedAreas: ['Oncológica', 'Duelo'],
		specializationMode: 'inclusive',
		modality: 'both',
		country: VENEZUELA,
		estado: 'Distrito Capital',
		ciudad: 'Caracas',
		whatsappCountry: '58',
		whatsapp: '4120000001',
		verifiedStatus: 'verified',
		availabilityMode: 'always',
		providesService: true,
		contactCount: 12,
	},
	{
		name: 'Dr. José Rodríguez',
		email: 'jose.rodriguez@example.com',
		certificationNumber: 'VP-00002',
		certifyingSchool: 'Colegio de Psicólogos de Venezuela',
		population: ['Niños', 'Adolescentes'],
		focusGroups: ['Adolescentes en riesgo social'],
		practiceAreas: ['Intervención en crisis'],
		specializedAreas: ['Personas Neurodivergentes'],
		specializationMode: 'inclusive',
		modality: 'remote',
		country: VENEZUELA,
		estado: 'Miranda',
		ciudad: 'Los Teques',
		whatsappCountry: '58',
		whatsapp: '4120000002',
		verifiedStatus: 'verified',
		availabilityMode: 'always',
		providesService: true,
		contactCount: 4,
	},
	{
		name: 'Dra. Ana Pérez',
		email: 'ana.perez@example.com',
		certificationNumber: 'VP-00003',
		certifyingSchool: 'Colegio de Psicólogos de Venezuela',
		population: ['Adultos'],
		focusGroups: ['Comunidad LGBTQ+', 'Comunidades rurales'],
		practiceAreas: ['Violencia (género/intrafamiliar)'],
		specializedAreas: [],
		specializationMode: 'inclusive',
		modality: 'both',
		country: VENEZUELA,
		estado: 'Zulia',
		ciudad: 'Maracaibo',
		whatsappCountry: '58',
		whatsapp: '4120000003',
		verifiedStatus: 'verified',
		availabilityMode: 'inactive',
		providesService: true,
		contactCount: 7,
	},
	{
		name: 'Dr. Carlos Hernández',
		email: 'carlos.hernandez@example.com',
		certificationNumber: 'VP-00004',
		certifyingSchool: 'Colegio de Psicólogos de Venezuela',
		population: ['Adolescentes', 'Adultos'],
		focusGroups: ['Personas privadas de libertad'],
		practiceAreas: ['Adicciones', 'Ansiedad y depresión'],
		specializedAreas: ['Personas Cuidadoras'],
		specializationMode: 'inclusive',
		modality: 'in_person',
		country: VENEZUELA,
		estado: 'Carabobo',
		ciudad: 'Valencia',
		whatsappCountry: '58',
		whatsapp: '4120000004',
		verifiedStatus: 'verified',
		availabilityMode: 'always',
		providesService: true,
		contactCount: 0,
	},
	{
		// content-only: verified (audios show in tray) but not in the directory
		name: 'Dra. Sofía Ramírez',
		email: 'sofia.ramirez@example.com',
		certificationNumber: 'VP-00005',
		certifyingSchool: 'Colegio de Psicólogos de Venezuela',
		population: ['Adultos'],
		focusGroups: ['Pueblos originarios'],
		practiceAreas: ['Ansiedad y depresión'],
		specializedAreas: ['Duelo'],
		specializationMode: 'inclusive',
		modality: 'remote',
		country: VENEZUELA,
		estado: 'Mérida',
		ciudad: 'Mérida',
		whatsappCountry: '58',
		whatsapp: '4120000005',
		verifiedStatus: 'verified',
		availabilityMode: 'always',
		providesService: false,
		contactCount: 0,
	},
	{
		// diaspora pro — certifies in Chile, lives in Santiago
		name: 'Dr. Luis Torres',
		email: 'luis.torres@example.com',
		certificationNumber: 'CL-10001',
		certifyingSchool: 'Colegio de Psicólogos de Chile',
		population: ['Adultos', 'Adultos mayores'],
		focusGroups: ['Migrantes y refugiados'],
		practiceAreas: ['Ansiedad y depresión'],
		// ponytail: the EXCLUSIVE case — hidden from default directory browse
		// AND from the random pick, surfaces only when /ayuda/especifica
		// filters by Suicidio or Trauma. The local seed exercises both paths
		// so you can verify the exclusive WHERE clause by visiting:
		//   /ayuda/profesionales?modality=remote        (Luis should NOT show)
		//   /ayuda/profesionales?modality=remote&specialized=Suicidio  (he SHOULD)
		specializedAreas: ['Suicidio', 'Trauma y Estrés post Traumático'],
		specializationMode: 'exclusive',
		modality: 'remote',
		country: 'Chile',
		estado: null,
		ciudad: 'Santiago',
		whatsappCountry: '56',
		whatsapp: '912345678',
		verifiedStatus: 'verified',
		availabilityMode: 'scheduled',
		providesService: true,
		contactCount: 2,
	},
	{
		// pending — lands in the admin review queue
		name: 'Dra. Carmen Díaz',
		email: 'carmen.diaz@example.com',
		certificationNumber: '00007',
		certifyingSchool: 'Colegio de Psicólogos de Venezuela',
		population: ['Niños'],
		focusGroups: [],
		practiceAreas: ['Ansiedad y depresión'],
		specializedAreas: ['Personas Neurodivergentes', 'Diversidad funcional'],
		specializationMode: 'inclusive',
		modality: 'both',
		country: VENEZUELA,
		estado: 'Aragua',
		ciudad: 'Maracay',
		whatsappCountry: '58',
		whatsapp: '4120000007',
		verifiedStatus: 'pending',
		availabilityMode: 'always',
		providesService: true,
		contactCount: 0,
	},
	{
		// rejected — kept for audit, never surfaces publicly
		name: 'Dr. Rafael Morales',
		email: 'rafael.morales@example.com',
		certificationNumber: 'VP-00008',
		certifyingSchool: 'Colegio de Psicólogos de Venezuela',
		population: ['Adultos'],
		focusGroups: [],
		practiceAreas: ['Adicciones'],
		specializedAreas: [],
		specializationMode: 'inclusive',
		modality: 'in_person',
		country: VENEZUELA,
		estado: 'Lara',
		ciudad: 'Barquisimeto',
		whatsappCountry: '58',
		whatsapp: '4120000008',
		verifiedStatus: 'rejected',
		availabilityMode: 'always',
		providesService: true,
		contactCount: 0,
	},
	{
		// disabled — temporarily suspended by admin
		name: 'Dra. Elena Castillo',
		email: 'elena.castillo@example.com',
		certificationNumber: 'VP-00009',
		certifyingSchool: 'Colegio de Psicólogos de Venezuela',
		population: ['Adultos', 'Adolescentes'],
		focusGroups: ['Comunidad LGBTQ+'],
		practiceAreas: ['Violencia (género/intrafamiliar)'],
		specializedAreas: [],
		specializationMode: 'inclusive',
		modality: 'both',
		country: VENEZUELA,
		estado: 'Táchira',
		ciudad: 'San Cristóbal',
		whatsappCountry: '58',
		whatsapp: '4120000009',
		verifiedStatus: 'disabled',
		availabilityMode: 'always',
		providesService: true,
		contactCount: 0,
	},
]

// ---- main ------------------------------------------------------------------

async function main() {
	const { password, reset } = parseArgs(process.argv)
	const dbPath = findLocalDb()
	console.log(`DB:       ${dbPath}`)
	console.log(`Password: [redacted — pass via --password]`)
	console.log(`Reset:    ${reset}`)
	console.log()

	const salt = randomBytes(16).toString('hex')
	const key = await generateKey(password, salt)
	const hash = `${salt}:${key.toString('hex')}`

	const db = new Database(dbPath)

	if (reset) {
		const tables = [
			'follow_ups',
			'professional_documents',
			'audio_stories',
			'professionals',
			'session',
			'account',
			'user',
		]
		const wipe = db.transaction(() => {
			for (const t of tables) {
				const r = db.prepare(`DELETE FROM ${t}`).run()
				if (r.changes > 0) console.log(`  · cleared ${t} (${r.changes} rows)`)
			}
		})
		console.log('Resetting (wiping all rows):')
		wipe()
		console.log()
		// also reset the auto-increment sequences so IDs start clean
		for (const t of [
			'professionals',
			'audio_stories',
			'professional_documents',
			'follow_ups',
		]) {
			db.prepare(
				`UPDATE sqlite_sequence SET seq = 0 WHERE name = ?`,
			).run(t)
		}
	}

	// --- admin user --------------------------------------------------------
	const adminEmail = 'admin@enbonnet.com'
	insertUserAccount(db, {
		name: 'Admin',
		email: adminEmail,
		role: 'admin',
		hash,
	})

	// --- professionals -----------------------------------------------------
	const stmtPro = db.prepare(`
		INSERT INTO professionals (
			user_id, name, certification_number, certifying_school,
			population, focus_groups, practice_areas, specialized_areas, specialization_mode, modality,
			country, estado, ciudad, credential_country, whatsapp_country, whatsapp,
			verified_status, available, provides_service, contact_count,
			availability_mode
		) VALUES (
			@userId, @name, @certificationNumber, @certifyingSchool,
			@population, @focusGroups, @practiceAreas, @specializedAreas, @specializationMode, @modality,
			@country, @estado, @ciudad, @credentialCountry, @whatsappCountry, @whatsapp,
			@verifiedStatus, @available, @providesService, @contactCount,
			@availabilityMode
		)
	`)

	let inserted = 0
	let skipped = 0
	for (const p of PROS) {
		// skip if this email already has a professional row (idempotent re-run)
		const existing = db
			.prepare(
				`SELECT 1 FROM professionals p JOIN user u ON p.user_id = u.id WHERE u.email = ?`,
			)
			.get(p.email)
		if (existing) {
			skipped++
			continue
		}

		const userId = insertUserAccount(db, {
			name: p.name,
			email: p.email,
			role: 'user',
			hash,
		})
		const available = p.verifiedStatus === 'verified' && p.availabilityMode !== 'inactive'
		stmtPro.run({
			userId,
			name: p.name,
			certificationNumber: p.certificationNumber,
			certifyingSchool: p.certifyingSchool,
			population: JSON.stringify(p.population),
			focusGroups: JSON.stringify(p.focusGroups),
			practiceAreas: JSON.stringify(p.practiceAreas),
			specializedAreas: JSON.stringify(p.specializedAreas),
			specializationMode: p.specializationMode,
			modality: p.modality,
			country: p.country,
			estado: p.estado,
			ciudad: p.ciudad,
			credentialCountry: p.country,
			whatsappCountry: p.whatsappCountry,
			whatsapp: p.whatsapp,
			verifiedStatus: p.verifiedStatus,
			available: available ? 1 : 0,
			providesService: p.providesService ? 1 : 0,
			contactCount: p.contactCount,
			availabilityMode: p.availabilityMode,
		})
		inserted++
	}

	const counts = db
		.prepare(
			`SELECT
				(SELECT COUNT(*) FROM user) AS users,
				(SELECT COUNT(*) FROM account) AS accounts,
				(SELECT COUNT(*) FROM professionals) AS pros,
				(SELECT COUNT(*) FROM professionals WHERE verified_status='verified' AND provides_service=1) AS public_pros,
				(SELECT COUNT(*) FROM professionals WHERE verified_status='pending') AS pending_pros;`,
		)
		.get() as {
		users: number
		accounts: number
		pros: number
		public_pros: number
		pending_pros: number
	}

	console.log(
		`Inserted ${inserted} professional(s)${skipped ? `, skipped ${skipped} (already present)` : ''}.`,
	)
	console.log(`Admin login: ${adminEmail} / ${password}`)
	console.log()
	console.log('Table counts:')
	console.log(`  user:                       ${counts.users}`)
	console.log(`  account:                    ${counts.accounts}`)
	console.log(`  professionals:              ${counts.pros}`)
	console.log(`  └ verified & in directory:  ${counts.public_pros}`)
	console.log(`  └ pending (review queue):   ${counts.pending_pros}`)

	db.close()
}

// Inserts a user + a credential account if the email isn't already present.
// Returns the user id (existing or new).
function insertUserAccount(
	db: Database.Database,
	args: { name: string; email: string; role: 'user' | 'admin'; hash: string },
): string {
	const existing = db
		.prepare('SELECT id FROM user WHERE email = ?')
		.get(args.email) as { id: string } | undefined
	if (existing) return existing.id

	const id = crypto.randomUUID()
	const now = Date.now()
	db.prepare(
		`INSERT INTO user (id, name, email, email_verified, role, created_at, updated_at)
		 VALUES (?, ?, ?, 1, ?, ?, ?)`,
	).run(id, args.name, args.email, args.role, now, now)
	db.prepare(
		`INSERT INTO account (id, account_id, provider_id, user_id, password, created_at, updated_at)
		 VALUES (?, ?, 'credential', ?, ?, ?, ?)`,
	).run(crypto.randomUUID(), id, id, args.hash, now, now)
	return id
}

main().catch((err) => {
	console.error('Failed:', err)
	process.exit(1)
})
