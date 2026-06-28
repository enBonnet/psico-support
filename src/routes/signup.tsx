import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { authClient } from '#/lib/auth-client'

export const Route = createFileRoute('/signup')({
  component: SignupPage,
})

function SignupPage() {
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    const { error: err } = await authClient.signUp.email({
      name,
      email,
      password,
    })
    setLoading(false)
    if (err) {
      const msg = err.message ?? ''
      if (/exist|already|registered|duplicat/i.test(msg)) {
        setError('Ya existe una cuenta con ese correo. Inicia sesión.')
      } else if (/password|weak|common/i.test(msg)) {
        setError('La contraseña no cumple los requisitos. Usa al menos 8 caracteres.')
      } else {
        setError(err.message ?? 'No se pudo crear la cuenta.')
      }
      return
    }
    navigate({ to: '/profesional/panel' })
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
