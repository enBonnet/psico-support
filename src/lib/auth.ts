import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { tanstackStartCookies } from 'better-auth/tanstack-start'
import { eq } from 'drizzle-orm'

import { getDb } from '#/db'
import * as schema from '#/db/schema'
import { user as userTable } from '#/db/schema'

// ponytail: Better Auth expects a singleton, but the D1 binding is only
// resolvable inside a request. Build the auth instance on first use
// (cached) so the drizzle adapter receives a live Db.
type Auth = ReturnType<typeof buildAuth>
let _auth: Auth | null = null

function buildAuth() {
  return betterAuth({
    database: drizzleAdapter(getDb(), {
      provider: 'sqlite',
      schema: {
        user: schema.user,
        session: schema.session,
        account: schema.account,
        verification: schema.verification,
      },
    }),
    emailAndPassword: {
      enabled: true,
    },
    plugins: [tanstackStartCookies()],
  })
}

export function getAuth(): Auth {
  if (_auth) return _auth
  _auth = buildAuth()
  return _auth
}

// ponytail: admin is a DB column now (user.role), not an env list. One
// lookup by email; safe to call per-request since D1 is the source of
// truth and changing a role needs no redeploy. Returns false on any miss
// (unknown email / no session).
export async function isAdminEmail(
  email: string | null | undefined,
): Promise<boolean> {
  if (!email) return false
  const db = getDb()
  const rows = await db
    .select({ role: userTable.role })
    .from(userTable)
    .where(eq(userTable.email, email))
    .limit(1)
  return rows[0]?.role === 'admin'
}
