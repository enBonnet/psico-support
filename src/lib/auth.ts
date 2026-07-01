import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { tanstackStartCookies } from 'better-auth/tanstack-start'
import { eq } from 'drizzle-orm'

import { getDb } from '#/db'
import * as schema from '#/db/schema'
import { user as userTable } from '#/db/schema'
import { resetPasswordHtml, sendEmail } from '#/server/email'

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
      // ponytail: password recovery via better-auth's built-in flow. POST
      // /api/auth/request-password-reset → sendResetPassword (this fn) for
      // real users only; GET /reset-password/:token 302s to /recuperar?token=
      // or ?error=INVALID_TOKEN; POST /reset-password consumes the token and
      // sets the new password. No migration needed — tokens live in the
      // `verification` table as `reset-password:<token>` rows.
      resetPasswordTokenExpiresIn: 60 * 30, // 30 min (default 1h is long for a reset link)
      revokeSessionsOnPasswordReset: true, // invalidate every active session on reset
      sendResetPassword: async ({ user, url }) => {
        // `url` is the full ${baseURL}/reset-password/:token?callbackURL=... —
        // baseURL resolves from the request (or BETTER_AUTH_URL), so in prod
        // it points at psicoayudaven.com. sendEmail throws on a missing/
        // unverified sender domain; that surfaces as a 500 on the request,
        // which is acceptable (better than silently swallowing a send failure
        // and leaving the user with a reset link that never arrives).
        await sendEmail({
          to: user.email,
          subject: 'Restablece tu contraseña · PsicoAyudaVen',
          html: resetPasswordHtml(url),
          text: `Restablece tu contraseña en PsicoAyudaVen.\n\nAbre este enlace (válido por 30 minutos):\n${url}\n\nSi no pediste este cambio, ignora este correo: tu contraseña no cambiará.`,
        })
      },
    },
    plugins: [tanstackStartCookies()],
    // ponytail: trust every loopback origin on any port. Dev servers roam
    // across ports (vite :3000, wrangler :8787, proxies, tunnels) and Better
    // Auth's CSRF check 403s any request whose Origin port differs from the
    // Host it derives baseURL from — a constant source of local auth breakage.
    // Wildcard patterns are matched by matchesOriginPattern via wildcardMatch.
    // Safe unconditionally: a browser's Origin reflects the real initiating
    // context, and localhost/127.0.0.1 are hardcoded to loopback, so a remote
    // attacker cannot forge a loopback Origin against a public domain. No-op
    // in prod (requests come from psicoayudaven.com). Works under both
    // `npm run dev` and `wrangler dev` (no build-time DEV gate, which would
    // mis-fire under the prod-bundle PWA test path).
    trustedOrigins: [
      'http://localhost:*',
      'http://127.0.0.1:*',
      'https://localhost:*',
      'https://127.0.0.1:*',
    ],
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
