import { createFileRoute, redirect, Link } from '@tanstack/react-router'
import { useQuery, useMutation } from '@tanstack/react-query'
import { useState, useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import {
  CalendarClock,
  Camera,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  MessageCircle,
  Mic,
  Trash2,
  UserCog,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { authClient } from '#/lib/auth-client'
import { notify } from '#/lib/notifications'
import { Skeleton } from '#/components/ui/skeleton'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import {
  getMyProfessional,
  deleteMyProfessional,
  amIAdmin,
  getCurrentUser,
} from '#/server/professionals'
import { countMyOpenFollowUps } from '#/server/follow-ups'
import { listMyStories, STORY_MAX_PER_PRO } from '#/server/audio-stories'

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
  // covers the gap instead of an SSR'd first paint. The heavy edit forms used
  // to live here; they've been split into focused sub-routes
  // (perfil/presentacion/disponibilidad/audios) so this page is just a menu of
  // descriptive links — friendlier for low-tech users.
  ssr: false,
  component: PanelPage,
})

function PanelPage() {
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
  // ponytail: open follow-ups count for the Seguimiento card badge. Cheap
  // (1 row) + auth-gated; refetches when the seguimiento route invalidates
  // ['my-followups'].
  const { data: openFollowUps = 0 } = useQuery({
    queryKey: ['my-open-followups'],
    queryFn: () => countMyOpenFollowUps(),
  })
  // ponytail: active audio count for the Audios card badge (pending+approved).
  // Cheap (≤2 rows per pro per the cap). Fetched on the hub so the card
  // previews state without opening the page.
  const { data: stories = [] } = useQuery({
    queryKey: ['my-stories'],
    queryFn: () => listMyStories(),
  })
  const activeAudios = stories.filter(
    (s) => s.status === 'pending' || s.status === 'approved',
  ).length

  const verified = me?.verifiedStatus === 'verified'
  // ponytail: content-only pros don't provide direct service — hide the
  // Disponibilidad card and show a collaborator note instead. They still
  // contribute audios, gated on `verified`.
  const providesService = me?.providesService ?? true

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
          Mi panel
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
          <Skeleton className="mt-6 h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      )}

      {me && (
        <>
          {/* ── Identidad ── */}
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

          {/* ── Estado de verificación (banner destacado) ── */}
          {/* ponytail: this is the pro's #1 anxiety — promoted from a footnote
              to a prominent banner. Copy matches the original panel's three
              states (verified / disabled / in-revision). */}
          {verified ? (
            <div className="glass-card-soft mt-4 flex items-center gap-2 rounded-[var(--glass-radius-sm)] bg-green-50/60 px-4 py-3 text-sm text-green-800">
              <CheckCircle2
                className="size-5 shrink-0"
                aria-hidden="true"
              />
              <span>
                <span className="font-semibold">Credencial verificada.</span>{' '}
                Ya apareces en el directorio.
              </span>
            </div>
          ) : me.verifiedStatus === 'disabled' ? (
            <div className="glass-card-soft mt-4 flex items-start gap-2 rounded-[var(--glass-radius-sm)] bg-red-50/60 px-4 py-3 text-sm text-red-800">
              <span>
                Tu cuenta está temporalmente suspendida mientras revisamos tu
                información. Escríbenos a soporte para más detalle.
              </span>
            </div>
          ) : (
            <div className="glass-card-soft mt-4 flex items-start gap-2 rounded-[var(--glass-radius-sm)] bg-amber-50/60 px-4 py-3 text-sm text-amber-800">
              <span>
                Tu credencial está{' '}
                <span className="font-semibold">en revisión</span>
                {me.verifiedStatus === 'rejected'
                  ? ' (fue rechazada).'
                  : '.'}{' '}
                {providesService &&
                  'Podrás configurar tu disponibilidad cuando un administrador apruebe tu registro.'}
              </span>
            </div>
          )}

          {/* ── Accesos ── */}
          <nav className="mt-6 flex flex-col gap-3" aria-label="Opciones del panel">
            <PanelCard
              to="/profesional/perfil"
              icon={UserCog}
              title="Perfil profesional"
              subtitle="Nombre, credencial, especialidad, ubicación y teléfono"
            />
            <PanelCard
              to="/profesional/presentacion"
              icon={Camera}
              title="Foto y redes sociales"
              subtitle="Cómo te ven las personas en tu perfil público"
            />
            {providesService ? (
              <PanelCard
                to="/profesional/disponibilidad"
                icon={CalendarClock}
                title="Disponibilidad"
                subtitle="Cuándo pueden contactarte los pacientes"
                meta={
                  <span className="glass-pill shrink-0 px-2 py-0.5 text-xs font-medium text-[var(--medi-text-secondary)]">
                    {me.availabilityMode === 'always'
                      ? 'Siempre'
                      : me.availabilityMode === 'scheduled'
                        ? 'Por horario'
                        : 'No disponible'}
                  </span>
                }
              />
            ) : (
              <div className="glass-card-soft flex items-center gap-3 rounded-[var(--glass-radius-sm)] p-4 text-sm text-[var(--medi-text-secondary)]">
                <Mic
                  className="size-6 shrink-0 text-[var(--medi-secondary)]"
                  aria-hidden="true"
                />
                <span>
                  <span className="block text-base font-semibold text-[var(--medi-primary)]">
                    Colaborador de contenido
                  </span>
                  Aportas audios a Voces que acompañan. No apareces en el
                  directorio de servicio.
                </span>
              </div>
            )}
            <PanelCard
              to="/profesional/seguimiento"
              icon={ClipboardList}
              title="Seguimiento clínico"
              subtitle="Registros privados de las personas que atiendes"
              meta={
                openFollowUps > 0 ? (
                  <span className="glass-pill shrink-0 bg-[var(--medi-secondary)] px-2 py-0.5 text-xs font-semibold !text-white">
                    {openFollowUps}
                  </span>
                ) : undefined
              }
            />
            <PanelCard
              to="/profesional/audios"
              icon={Mic}
              title="Mis audios de apoyo"
              subtitle="Voces que acompañan"
              meta={
                activeAudios > 0 ? (
                  <span className="glass-pill shrink-0 px-2 py-0.5 text-xs font-medium text-[var(--medi-text-secondary)]">
                    {activeAudios}/{STORY_MAX_PER_PRO}
                  </span>
                ) : undefined
              }
            />
          </nav>

          {/* ── Soporte y sugerencias ── */}
          {(() => {
            // ponytail: wa.me deep link with a pre-filled message that names
            // the professional so the admin knows who's reaching out. Pure
            // client-side — no server fn / DB column needed.
            const supportText = encodeURIComponent(
              `Hola, soy ${me.name} te escribo por medio de PsicoAyudaVen.`,
            )
            const supportHref = `https://wa.me/${SUPPORT_WHATSAPP}?text=${supportText}`
            return (
              <section className="glass-card-soft mt-6 rounded-[var(--glass-radius-sm)] p-4">
                <div className="flex items-center gap-3">
                  <MessageCircle
                    className="size-6 shrink-0 text-[var(--medi-secondary)]"
                    aria-hidden="true"
                  />
                  <div className="min-w-0 flex-1">
                    <h2 className="text-sm font-semibold text-[var(--medi-text-primary)]">
                      Soporte y sugerencias
                    </h2>
                    <p className="mt-0.5 text-xs text-[var(--medi-text-secondary)]">
                      ¿Dudas, sugerencias o problemas? Escríbenos directo.
                    </p>
                  </div>
                </div>
                <a
                  href={supportHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  // ponytail: !text-white beats the unlayered `a { color }` in
                  // styles.css (tw v4: unlayered beats layered utilities).
                  className="mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-[var(--glass-radius-sm)] bg-green-600 px-4 py-2 text-sm font-semibold !text-white transition-all hover:translate-y-[-1px] hover:bg-green-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--medi-secondary)]"
                >
                  Escribir por WhatsApp
                </a>
              </section>
            )
          })()}

          {/* ── Zona de peligro ── */}
          <section className="mt-6 rounded-[var(--glass-radius-sm)] border border-red-200/60 bg-red-50/40 p-4">
            <div className="flex items-center gap-2">
              <Trash2
                className="size-5 shrink-0 text-red-700"
                aria-hidden="true"
              />
              <h2 className="text-sm font-semibold text-red-800">
                Eliminar cuenta
              </h2>
            </div>
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

// ponytail: a descriptive link-card for the panel hub. Mirrors the /cuenta and
// /ayuda card style (glass-card + icon + title + subtitle). Optional `meta`
// renders a right-aligned status pill/badge before the chevron so the user
// sees current state without opening the page.
function PanelCard({
  to,
  icon: Icon,
  title,
  subtitle,
  meta,
}: {
  to: string
  icon: LucideIcon
  title: string
  subtitle: string
  meta?: ReactNode
}) {
  return (
    <Link
      to={to}
      className="glass-card flex min-h-[4.5rem] items-center gap-3 p-4 text-left transition-all hover:translate-y-[-1px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--medi-secondary)]"
    >
      <Icon className="size-6 shrink-0 text-[var(--medi-secondary)]" aria-hidden="true" />
      <span className="min-w-0 flex-1">
        <span className="block text-base font-semibold text-[var(--medi-text-primary)]">
          {title}
        </span>
        <span className="block text-sm text-[var(--medi-text-secondary)]">
          {subtitle}
        </span>
      </span>
      {meta}
      <ChevronRight
        className="size-5 shrink-0 text-[var(--medi-text-secondary)]"
        aria-hidden="true"
      />
    </Link>
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
