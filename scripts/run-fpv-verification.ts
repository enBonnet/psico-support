import { config } from 'dotenv'
import { createScriptDb } from '../src/services/fpv/db.ts'
import { getProfessionalsForVerification } from '../src/services/fpv/repository.ts'
import { verifyProfessional } from '../src/services/fpv/verifier.ts'
import { fpvConfig } from '../src/services/fpv/config.ts'

// Load .env.local so fpvConfig and DATABASE_URL are available
config({ path: '.env.local' })

// ANSI colors for readable console output
const green = (s: string) => `\x1b[32m${s}\x1b[0m`
const red = (s: string) => `\x1b[31m${s}\x1b[0m`
const yellow = (s: string) => `\x1b[33m${s}\x1b[0m`
const cyan = (s: string) => `\x1b[36m${s}\x1b[0m`
const dim = (s: string) => `\x1b[2m${s}\x1b[0m`
const bold = (s: string) => `\x1b[1m${s}\x1b[0m`

async function main() {
  console.log(bold(cyan('\n=== FPV Verification Script ===\n')))

  // 1. Connect to the wrangler-managed local D1
  console.log(dim('Connecting to local D1...'))
  const db = createScriptDb()

  // 2. Read pending professionals
  const pending = getProfessionalsForVerification(db)

  if (pending.length === 0) {
    console.log(yellow('No professionals pending verification.'))
    console.log(dim('Nothing to do. Exiting.\n'))
    return
  }

  console.log(`Found ${bold(String(pending.length))} professional(s) to verify.\n`)

  // 3. Process each professional
  const results = {
    verified: 0,
    ambiguous: 0,
    empty: 0,
    error: 0,
    skipped: 0,
  }

  for (let i = 0; i < pending.length; i++) {
    const pro = pending[i]
    const progress = dim(`[${i + 1}/${pending.length}]`)
    console.log(`${progress} ${bold(pro.name)} ${dim(`(FPV: ${pro.certificationNumber})`)}`)

    try {
      const result = await verifyProfessional(db, pro)

      switch (result.status) {
        case 'verified':
          console.log(`  ${green('✓ VERIFIED')} ${dim(`— FPV ${result.fpvNumber}`)}\n`)
          results.verified++
          break
        case 'ambiguous':
          console.log(`  ${yellow('⚠ AMBIGUOUS')} ${dim('— multiple matches, needs manual review')}\n`)
          results.ambiguous++
          break
        case 'empty':
          console.log(`  ${yellow('⚠ EMPTY')} ${dim('— FPV number not found in registry')}\n`)
          results.empty++
          break
        case 'error':
          console.log(`  ${red('✗ ERROR')} ${dim(`— ${result.error}`)}\n`)
          results.error++
          break
        case 'skipped':
          console.log(`  ${yellow('⊘ SKIPPED')} ${dim(`— ${result.error}`)}\n`)
          results.skipped++
          break
      }
    } catch (err) {
      // Unexpected error — log and continue with the next professional
      const msg = err instanceof Error ? err.message : String(err)
      console.log(`  ${red('✗ UNEXPECTED ERROR')} ${dim(`— ${msg}`)}\n`)
      results.error++
    }

    // 4. Rate limiting: wait between professionals (skip after the last one)
    if (i < pending.length - 1) {
      const waitMs = fpvConfig.FPV_RATE_LIMIT_MS
      console.log(dim(`  Waiting ${waitMs}ms...`))
      await sleep(waitMs)
    }
  }

  // 5. Summary
  console.log(bold(cyan('=== Summary ===\n')))
  console.log(`  ${bold('Total processed:')} ${pending.length}`)
  console.log(`  ${green('Verified:')}        ${results.verified}`)
  console.log(`  ${yellow('Ambiguous:')}      ${results.ambiguous}`)
  console.log(`  ${yellow('Empty:')}          ${results.empty}`)
  console.log(`  ${yellow('Skipped:')}        ${results.skipped}`)
  console.log(`  ${red('Errors:')}           ${results.error}`)
  console.log(dim('\nDone.\n'))
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

main().catch((err) => {
  console.error(red('\n✗ Script failed:'), err)
  process.exit(1)