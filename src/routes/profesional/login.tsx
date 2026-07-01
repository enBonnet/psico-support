import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { authClient } from '#/lib/auth-client'

export const Route = createFileRoute('/profesional/login')({
  // ponytail: CSR-only — interactive auth form, no crawler value. Server
  // fns + Better Auth still work via the worker RPC.
  ssr: false,
  component: LoginPage,
})

function LoginPage() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const { error: err } = await authClient.signIn.email({ email, password })
      if (err) {
        setError(err.message ?? 'No se pudo iniciar sesión.')
        return
      }
      // ponytail: await navigation so the button stays loading until the
      // panel is committed. Without this, setLoading(false) re-armed the
      // button while the panel's beforeLoad/loaders (2 D1 server fns) were
      // still pending — the idle button looked like the first click failed,
      // prompting a second submit.
      //
      // CRITICAL: refresh the session + invalidate the cached anonymous
      // ['me'] BEFORE navigating. signIn.email sets the session cookie in its
      // response, but the panel's beforeLoad → getCurrentUser() races against
      // cookie propagation and could read a stale null → redirect back to
      // login (or hit a transient server-fn error → router error boundary,
      // the "Ups, algo salió mal" that only clears on refresh). Forcing a
      // fresh getSession round-trip guarantees the cookie is committed in the
      // browser, and invalidating ['me'] means cuenta/panel re-read it.
      await authClient.getSession()
      qc.invalidateQueries({ queryKey: ['me'] })
      await navigate({ to: '/profesional/panel' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="page-wrap flex min-h-[100dvh] flex-col py-6">
      <Link
        to="/"
        className="inline-flex items-center gap-1 self-start py-2 text-base font-medium text-[var(--medi-secondary)]"
      >
        ‹ Atrás
      </Link>

      <h1 className="mt-4 text-2xl font-bold text-[var(--medi-text-primary)]">
        Iniciar sesión
      </h1>
      <div className="section-underline mt-2" />

      <form
        onSubmit={onSubmit}
        className="mt-6 flex flex-col gap-4 pb-12"
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
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">Contraseña</span>
          <input
            type="password"
            name="password"
            autoComplete="current-password"
            className="glass-input h-12 w-full px-3 text-base"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>
        {error && (
          <p className="glass-card-soft rounded-[var(--glass-radius-sm)] px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}
        <p className="-mt-2 text-right text-sm">
          <Link
            to="/recuperar"
            className="font-medium text-[var(--medi-secondary)]"
          >
            ¿Olvidaste tu contraseña?
          </Link>
        </p>
        <button
          type="submit"
          disabled={loading}
          className="glass-primary mt-2 flex min-h-14 items-center justify-center rounded-[var(--glass-radius-sm)] px-6 py-4 text-base font-semibold text-white transition-all hover:translate-y-[-1px] disabled:opacity-60"
        >
          {loading ? 'Entrando…' : 'Entrar'}
        </button>
        <p className="text-center text-sm text-[var(--medi-text-secondary)]">
          ¿No tienes cuenta?{' '}
          <Link
            to="/signup"
            className="font-semibold text-[var(--medi-secondary)]"
          >
            Crear cuenta
          </Link>
        </p>
        <p className="text-center text-sm text-[var(--medi-text-secondary)]">
          ¿Eres profesional?{' '}
          <Link
            to="/profesional/registro"
            className="font-semibold text-[var(--medi-secondary)]"
          >
            Regístrate como profesional
          </Link>
        </p>
      </form>
    </main>
  )
}
