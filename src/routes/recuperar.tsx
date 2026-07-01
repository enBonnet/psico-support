import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { z } from 'zod'

import { authClient } from '#/lib/auth-client'
import { notify } from '#/lib/notifications'
import { SITE_URL } from '#/lib/seo'

export const Route = createFileRoute('/recuperar')({
  // ponytail: CSR-only — interactive recovery form, no crawler value. Server
  // fns + Better Auth still work via the worker RPC, like the sibling auth
  // routes (signup, login). Selective SSR (ssr:false) instead of global
  // spa.enabled so the profile route keeps its SSR link previews.
  validateSearch: z.object({
    // Present after Better Auth's GET /reset-password/:token validates the
    // token and 302s here with ?token=VALID_TOKEN.
    token: z.string().min(1).optional(),
    // Present when the token was missing/expired/already-used — Better Auth
    // 302s with ?error=INVALID_TOKEN.
    error: z.string().optional(),
  }),
  ssr: false,
  component: RecuperarPage,
})

// ponytail: one route, three views, branched on the search params Better Auth
// produces. No beforeLoad redirect for authed users — a logged-in user may
// legitimately want to reset (and revokeSessionsOnPasswordReset logs them out
// anyway after a successful reset). Mirrors login/signup styling: page-wrap,
// glass-input, glass-primary, glass-card-soft error box.
function RecuperarPage() {
  return <RecoveryRouter />
}

function RecoveryRouter() {
  const { token, error } = Route.useSearch()

  if (error) return <InvalidTokenView />
  if (token) return <ResetPasswordView token={token} />
  return <RequestResetView />
}

// --- View 1: request a reset link -------------------------------------
function RequestResetView() {
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      // redirectTo is absolute (SITE_URL): better-auth uses it as callbackURL
      // when 302-ing after token validation. The constant keeps it on the prod
      // domain (nobody recovers a password from localhost). See seo.ts ponytail.
      const { error: err } = await authClient.requestPasswordReset({
        email,
        redirectTo: `${SITE_URL}/recuperar`,
      })
      if (err) {
        setError(err.message ?? 'No se pudo enviar el enlace.')
        return
      }
      // Always show the same confirmation — better-auth returns an identical
      // response whether or not the email exists (timing-attack protected), so
      // we mirror that here and never reveal account existence.
      setSent(true)
    } finally {
      setLoading(false)
    }
  }

  if (sent) {
    return (
      <Shell title="Revisa tu correo" backTo="/profesional/login">
        <div className="glass-card-soft rounded-[var(--glass-radius-sm)] px-4 py-3 text-sm text-[var(--medi-text-primary)]">
          Si ese correo existe en nuestro sistema, te enviamos un enlace para
          restablecer tu contraseña. El enlace es válido por 30 minutos.
        </div>
        <p className="mt-4 text-center text-sm text-[var(--medi-text-secondary)]">
          ¿No te llegó? Revisa el correo no deseado, o{' '}
          <button
            type="button"
            onClick={() => setSent(false)}
            className="font-semibold text-[var(--medi-secondary)] underline"
          >
            volver a intentarlo
          </button>
          .
        </p>
        <p className="mt-2 text-center text-sm text-[var(--medi-text-secondary)]">
          <Link
            to="/profesional/login"
            className="font-semibold text-[var(--medi-secondary)]"
          >
            Volver a iniciar sesión
          </Link>
        </p>
      </Shell>
    )
  }

  return (
    <Shell title="Recuperar contraseña" backTo="/profesional/login">
      <p className="text-sm text-[var(--medi-text-secondary)]">
        Ingresa tu correo y te enviaremos un enlace para crear una contraseña
        nueva.
      </p>
      <form
        onSubmit={onSubmit}
        className="mt-4 flex flex-col gap-4 pb-12"
        noValidate
      >
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">Correo</span>
          <input
            type="email"
            name="email"
            inputMode="email"
            autoComplete="email"
            className="glass-input h-12 w-full px-3 text-base"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </label>
        {error && (
          <p className="glass-card-soft rounded-[var(--glass-radius-sm)] px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={loading}
          className="glass-primary mt-2 flex min-h-14 items-center justify-center rounded-[var(--glass-radius-sm)] px-6 py-4 text-base font-semibold text-white transition-all hover:translate-y-[-1px] disabled:opacity-60"
        >
          {loading ? 'Enviando…' : 'Enviar enlace'}
        </button>
      </form>
    </Shell>
  )
}

// --- View 2: set a new password (arrived via ?token=) -----------------
function ResetPasswordView({ token }: { token: string }) {
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (password.length < 8) {
      setError('La contraseña debe tener al menos 8 caracteres.')
      return
    }
    if (password !== confirm) {
      setError('Las contraseñas no coinciden.')
      return
    }
    setLoading(true)
    try {
      const { error: err } = await authClient.resetPassword({
        newPassword: password,
        token,
      })
      if (err) {
        // Most likely INVALID_TOKEN (expired/used). Point them back to request
        // a fresh link rather than leaving them stuck on this view.
        setError(
          err.message ??
            'El enlace ya no es válido. Solicita uno nuevo.',
        )
        return
      }
      // revokeSessionsOnPasswordReset invalidates all sessions, so the user is
      // logged out everywhere — send them to login, not /cuenta. Toast tells
      // them the reset worked; without it they'd land on a bare login page.
      notify({
        type: 'success',
        title: 'Contraseña actualizada',
        body: 'Ya puedes iniciar sesión con tu nueva contraseña.',
      })
      await navigate({ to: '/profesional/login' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <Shell title="Nueva contraseña" backTo="/recuperar">
      <form
        onSubmit={onSubmit}
        className="mt-4 flex flex-col gap-4 pb-12"
        noValidate
      >
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">Nueva contraseña (mín. 8)</span>
          <input
            type="password"
            autoComplete="new-password"
            className="glass-input h-12 w-full px-3 text-base"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">Repetir contraseña</span>
          <input
            type="password"
            autoComplete="new-password"
            className="glass-input h-12 w-full px-3 text-base"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
            minLength={8}
          />
        </label>
        {error && (
          <p className="glass-card-soft rounded-[var(--glass-radius-sm)] px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={loading}
          className="glass-primary mt-2 flex min-h-14 items-center justify-center rounded-[var(--glass-radius-sm)] px-6 py-4 text-base font-semibold text-white transition-all hover:translate-y-[-1px] disabled:opacity-60"
        >
          {loading ? 'Guardando…' : 'Guardar contraseña'}
        </button>
      </form>
    </Shell>
  )
}

// --- View 3: token invalid/expired (arrived via ?error=) --------------
function InvalidTokenView() {
  const navigate = useNavigate()
  return (
    <Shell title="Enlace no válido" backTo="/profesional/login">
      <div className="glass-card-soft rounded-[var(--glass-radius-sm)] px-4 py-3 text-sm text-[var(--medi-text-primary)]">
        Este enlace ya caducó o ya se usó. Por seguridad, los enlaces de
        recuperación expiran a los 30 minutos y solo se pueden usar una vez.
      </div>
      <button
        type="button"
        onClick={() => void navigate({ to: '/recuperar' })}
        className="glass-primary mt-4 flex min-h-14 w-full items-center justify-center rounded-[var(--glass-radius-sm)] px-6 py-4 text-base font-semibold text-white transition-all hover:translate-y-[-1px]"
      >
        Solicitar un nuevo enlace
      </button>
    </Shell>
  )
}

// --- Shared chrome (matches login/signup) -----------------------------
function Shell({
  title,
  backTo,
  children,
}: {
  title: string
  backTo: '/profesional/login' | '/recuperar'
  children: React.ReactNode
}) {
  return (
    <main className="page-wrap flex min-h-[100dvh] flex-col py-6">
      <Link
        to={backTo}
        className="inline-flex items-center gap-1 self-start py-2 text-base font-medium text-[var(--medi-secondary)]"
      >
        ‹ Atrás
      </Link>

      <h1 className="mt-4 text-2xl font-bold text-[var(--medi-text-primary)]">
        {title}
      </h1>
      <div className="section-underline mt-2" />

      <div className="mt-6">{children}</div>
    </main>
  )
}
