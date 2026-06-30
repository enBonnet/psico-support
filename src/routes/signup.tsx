import {
  createFileRoute,
  redirect,
  Link,
  useNavigate,
} from '@tanstack/react-router'
import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { authClient } from '#/lib/auth-client'
import { getCurrentUser } from '#/server/professionals'

export const Route = createFileRoute('/signup')({
  beforeLoad: async () => {
    // ponytail: an authenticated user already has an account — creating
    // another is pointless. Send them to the role-aware account hub. One
    // server-fn round-trip; RoutePending covers the gap.
    const user = await getCurrentUser()
    if (user) throw redirect({ to: '/cuenta' })
  },
  // ponytail: CSR-only — interactive form, no crawler value. Selective SSR
  // (ssr:false) instead of global spa.enabled so the profile route keeps its
  // SSR link previews. Server fns + auth still work via the worker RPC.
  ssr: false,
  component: SignupPage,
})

function SignupPage() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const { error: err } = await authClient.signUp.email({
        name,
        email,
        password,
      })
      if (err) {
        const msg = err.message ?? ''
        if (/exist|already|registered|duplicat/i.test(msg)) {
          setError('Ya existe una cuenta con ese correo. Inicia sesión.')
        } else if (/password|weak|common/i.test(msg)) {
          setError(
            'La contraseña no cumple los requisitos. Usa al menos 8 caracteres.',
          )
        } else {
          setError(err.message ?? 'No se pudo crear la cuenta.')
        }
        return
      }
      // ponytail: same session-cookie race as login (see CHANGELOG 1.3.3).
      // signUp.email sets the cookie in its response, but cuenta reads the
      // session via the ['me'] query; without a forced getSession round-trip
      // + cache invalidation it could briefly read the anonymous state.
      // Forcing the round-trip commits the cookie; invalidating ['me'] makes
      // cuenta render the authenticated view. A bare account (no professional
      // row) belongs on /cuenta, not the panel.
      await authClient.getSession()
      qc.invalidateQueries({ queryKey: ['me'] })
      await navigate({ to: '/cuenta' })
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
        Crear cuenta
      </h1>
      <div className="section-underline mt-2" />
      <p className="mt-3 text-sm text-[var(--medi-text-secondary)]">
        Crea una cuenta básica. Si después quieres aparecer como profesional,
        podrás completar tu perfil desde el panel.
      </p>

      <form
        onSubmit={onSubmit}
        className="mt-6 flex flex-col gap-4 pb-12"
        noValidate
      >
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">Tu nombre</span>
          <input
            type="text"
            autoComplete="name"
            className="glass-input h-12 w-full px-3 text-base"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            minLength={2}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">Correo</span>
          <input
            type="email"
            inputMode="email"
            autoComplete="email"
            className="glass-input h-12 w-full px-3 text-base"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">Contraseña (mín. 8)</span>
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
          {loading ? 'Creando…' : 'Crear cuenta'}
        </button>
        <p className="text-center text-sm text-[var(--medi-text-secondary)]">
          ¿Ya tienes cuenta?{' '}
          <Link
            to="/profesional/login"
            className="font-semibold text-[var(--medi-secondary)]"
          >
            Inicia sesión
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
