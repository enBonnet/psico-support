import { createFileRoute, redirect, Link } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState, useEffect, useRef } from 'react'
import { authClient } from '#/lib/auth-client'
import { notify } from '#/lib/notifications'
import { Skeleton } from '#/components/ui/skeleton'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import {
  getMyProfessional,
  setAvailability,
  deleteMyProfessional,
  amIAdmin,
  getCurrentUser,
} from '#/server/professionals'

// ponytail: direct support line to the admin. Constant, not env — mirrors the
// SITE_URL convention in src/lib/seo.ts. wa.me wants digits only (no +).
const SUPPORT_WHATSAPP = '56967024171'

export const Route = createFileRoute('/profesional/panel')({
  beforeLoad: async () => {
    const user = await getCurrentUser()
    if (!user) {
      throw redirect({ to: '/profesional/login' })
    }
  },
  // ponytail: CSR-only — auth-gated dashboard, no crawler value. beforeLoad
  // runs client-side (one getCurrentUser() round-trip); the pending skeleton
  // covers the gap instead of an SSR'd first paint.
  ssr: false,
  component: PanelPage,
})

function PanelPage() {
  const qc = useQueryClient()
  const [signingOut, setSigningOut] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleteName, setDeleteName] = useState('')
  const { data: me, isLoading: meLoading } = useQuery({
    queryKey: ['my-professional'],
    queryFn: () => getMyProfessional(),
  })
  const { data: isAdmin } = useQuery({
    queryKey: ['my-admin'],
    queryFn: () => amIAdmin(),
  })

  const toggle = useMutation({
    mutationFn: (available: boolean) =>
      setAvailability({ data: { available } }),
    onMutate: (available) => {
      qc.setQueryData(['my-professional'], (old: typeof me | undefined) =>
        old ? { ...old, available } : old,
      )
    },
    onSuccess: (_data, available) => {
      qc.setQueryData(['my-professional'], (old: typeof me | undefined) =>
        old ? { ...old, available } : old,
      )
      notify({
        type: 'success',
        title: available
          ? 'Ahora estás visible para pacientes'
          : 'Pasaste a fuera de turno',
        body: available
          ? 'Los pacientes pueden contactarte de inmediato.'
          : 'Ya no apareces en la lista.',
      })
    },
    onError: () =>
      notify({
        type: 'error',
        title: 'No se pudo cambiar tu disponibilidad',
        body: 'Inténtalo de nuevo en unos segundos.',
      }),
  })

  const available = me?.available ?? false
  const verified = me?.verifiedStatus === 'verified'

  const del = useMutation({
    mutationFn: () => deleteMyProfessional(),
    onSuccess: async () => {
      notify({
        type: 'success',
        title: 'Tu cuenta profesional fue eliminada',
        body: 'Ya no apareces en el directorio.',
      })
      // ponytail: soft-delete only touches the pro row; the auth session is
      // still valid, so sign out explicitly + bounce to home. Best-effort —
      // even if signOut fails, the row is already tombstoned server-side.
      await authClient.signOut()
      window.location.href = '/'
    },
    onError: () =>
      notify({
        type: 'error',
        title: 'No se pudo eliminar la cuenta',
        body: 'Inténtalo de nuevo en unos segundos.',
      }),
  })

  async function signOut() {
    setSigningOut(true)
    const { error } = await authClient.signOut()
    if (error) {
      setSigningOut(false)
      notify({
        type: 'error',
        title: 'No se pudo cerrar sesión',
        body: 'Inténtalo de nuevo.',
      })
      return
    }
    window.location.href = '/'
  }

  return (
    <main className="page-wrap flex min-h-[100dvh] flex-col py-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-[var(--medi-text-primary)]">
          Mi Panel
        </h1>
        <div className="flex items-center gap-3">
          {isAdmin && (
            <Link
              to="/admin"
              className="text-sm font-semibold text-[var(--medi-secondary)]"
            >
              Admin
            </Link>
          )}
          <button
            onClick={signOut}
            disabled={signingOut}
            className="text-sm font-medium text-[var(--medi-secondary)] disabled:opacity-60"
          >
            {signingOut ? 'Saliendo…' : 'Salir'}
          </button>
        </div>
      </div>
      <div className="section-underline mt-2" />
      {!meLoading && !me && (
        <p className="glass-card-soft mt-6 rounded-[var(--glass-radius-sm)] p-4 text-sm text-[var(--medi-text-secondary)]">
          No tienes un registro profesional todavía.{' '}
          <Link
            to="/profesional/completar"
            className="font-semibold text-[var(--medi-secondary)]"
          >
            Completa tu perfil profesional.
          </Link>
        </p>
      )}

      {meLoading && (
        <div className="mt-4 flex flex-col gap-3" aria-busy="true">
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-4 w-40" />
          <Skeleton className="mt-6 h-48 w-full" />
        </div>
      )}

      {me && (
        <>
          <p className="mt-4 text-sm">
            <span className="font-semibold">{me.name}</span> ·{' '}
            <span className="text-[var(--medi-text-secondary)]">
              {me.modality === 'in_person'
                ? 'Presencial'
                : me.modality === 'remote'
                  ? 'A distancia'
                  : 'Presencial y a distancia'}
            </span>
          </p>
          <p className="mt-2 text-sm">
            Estado de verificación:{' '}
            {me.verifiedStatus === 'verified' ? (
              <span className="font-semibold text-green-700">Verificado</span>
            ) : me.verifiedStatus === 'pending' ? (
              <span className="font-semibold text-amber-700">En revisión</span>
            ) : (
              <span className="font-semibold text-red-700">Rechazado</span>
            )}
          </p>

          {!verified && (
            <p className="glass-card-soft mt-4 rounded-[var(--glass-radius-sm)] bg-amber-50/60 px-3 py-2 text-sm text-amber-800">
              Tu credencial está en revisión. El interruptor se activará cuando
              un administrador apruebe tu registro.
            </p>
          )}

          <div
            className={`glass-card mt-10 p-8 text-center transition-colors ${
              available
                ? 'bg-green-600/30 text-green-900'
                : 'text-[var(--medi-text-secondary)]'
            }`}
          >
            <p className="text-lg font-semibold">
              {available ? 'Estás Visible para Pacientes' : 'Fuera de Turno'}
            </p>
            <button
              type="button"
              disabled={!verified || toggle.isPending}
              onClick={() => toggle.mutate(!available)}
              className="glass-pill mt-6 inline-flex h-16 w-32 items-center justify-center rounded-full bg-white/90 text-base font-bold text-[var(--medi-primary)] transition-all hover:translate-y-[-1px] disabled:opacity-50"
              aria-pressed={available}
            >
              {available ? 'ON' : 'OFF'}
            </button>
            <p className="mt-4 text-sm opacity-90">
              {available
                ? 'Los pacientes pueden contactarte ahora.'
                : 'Nadie te verá en la lista.'}
            </p>
          </div>

          {(() => {
            // ponytail: wa.me deep link with a pre-filled message that names
            // the professional so the admin knows who's reaching out. Pure
            // client-side — no server fn / DB column needed.
            const supportText = encodeURIComponent(
              `Hola, soy ${me.name} te escribo por medio de psicoayudaven.`,
            )
            const supportHref = `https://wa.me/${SUPPORT_WHATSAPP}?text=${supportText}`
            return (
              <section className="glass-card-soft mt-6 rounded-[var(--glass-radius-sm)] p-4">
                <h2 className="text-sm font-semibold text-[var(--medi-text-primary)]">
                  Soporte y sugerencias
                </h2>
                <p className="mt-1 text-sm text-[var(--medi-text-secondary)]">
                  ¿Tienes una duda, sugerencia o problema? Escríbenos
                  directamente.
                </p>
                <a
                  href={supportHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  // ponytail: !text-white beats the unlayered `a { color }` in
                  // styles.css (tw v4: unlayered beats layered utilities).
                  className="mt-3 flex min-h-11 w-full items-center justify-center rounded-[var(--glass-radius-sm)] bg-green-600 px-4 py-2 text-sm font-semibold !text-white transition-all hover:translate-y-[-1px] hover:bg-green-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--medi-secondary)]"
                >
                  Escribir por WhatsApp
                </a>
              </section>
            )
          })()}

          <section className="mt-6 rounded-[var(--glass-radius-sm)] border border-red-200/60 bg-red-50/40 p-4">
            <h2 className="text-sm font-semibold text-red-800">
              Eliminar cuenta
            </h2>
            <p className="mt-1 text-sm text-red-700/90">
              Borra tu perfil del directorio. Dejarás de aparecer en la lista y
              en la selección aleatoria de pacientes.
            </p>
            <button
              type="button"
              onClick={() => setDeleteOpen(true)}
              className="mt-3 inline-flex min-h-11 items-center justify-center rounded-[var(--glass-radius-sm)] border border-red-300 bg-white px-4 py-2 text-sm font-semibold text-red-700 transition-all hover:translate-y-[-1px] hover:bg-red-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-500"
            >
              Eliminar mi cuenta
            </button>
          </section>

          {deleteOpen && (
            <DeleteAccountModal
              name={me.name}
              pending={del.isPending}
              typedName={deleteName}
              onTypedNameChange={setDeleteName}
              onCancel={() => {
                setDeleteOpen(false)
                setDeleteName('')
              }}
              onConfirm={() => del.mutate()}
            />
          )}
        </>
      )}
    </main>
  )
}

// ponytail: minimal confirm-by-typing-name modal. Native <dialog>/focus-trap
// libs are YAGNI here — a controlled fixed overlay matches the codebase's
// notification overlay pattern (styles.css .notif-stack z-index:100; this
// sits one layer above at 110). Escape + backdrop-click close it; the
// confirm button is disabled until the typed name matches (case-insensitive
// trim, so accents/capitalization don't lock a user out).
function DeleteAccountModal({
  name,
  pending,
  typedName,
  onTypedNameChange,
  onCancel,
  onConfirm,
}: {
  name: string
  pending: boolean
  typedName: string
  onTypedNameChange: (v: string) => void
  onCancel: () => void
  onConfirm: () => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  // ponytail: focus the confirm input on open so the keyboard appears on
  // mobile without an extra tap.
  useEffect(() => {
    inputRef.current?.focus()
  }, [])
  // ponytail: Escape closes; stops at the first open so a nested field's
  // Escape (none today) wouldn't double-handle.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])

  const matches =
    typedName.trim().toLowerCase() === name.trim().toLowerCase()

  return (
    <div
      className="fixed inset-0 z-[110] flex items-end justify-center bg-black/50 p-4 backdrop-blur-sm sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-account-title"
      onClick={onCancel}
    >
      <div
        className="glass-card w-full max-w-md rounded-[var(--glass-radius)] p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h2
          id="delete-account-title"
          className="text-lg font-bold text-red-800"
        >
          Eliminar cuenta
        </h2>
        <p className="mt-2 text-sm text-[var(--medi-text-secondary)]">
          Esta acción elimina tu perfil del directorio y de la selección
          aleatoria de pacientes. Para confirmar, escribe tu nombre tal como
          aparece:
        </p>
        <p className="mt-2 text-sm font-semibold text-[var(--medi-text-primary)]">
          {name}
        </p>
        <Input
          ref={inputRef}
          value={typedName}
          onChange={(e) => onTypedNameChange(e.target.value)}
          autoComplete="off"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          aria-label="Escribe tu nombre para confirmar"
          className="mt-3"
        />
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="ghost"
            onClick={onCancel}
            disabled={pending}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={onConfirm}
            disabled={!matches || pending}
          >
            {pending ? 'Eliminando…' : 'Eliminar cuenta'}
          </Button>
        </div>
      </div>
    </div>
  )
}
