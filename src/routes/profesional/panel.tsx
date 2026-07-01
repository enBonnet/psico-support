import { createFileRoute, redirect, Link } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState, useEffect, useRef } from 'react'
import { authClient } from '#/lib/auth-client'
import { notify } from '#/lib/notifications'
import { Skeleton } from '#/components/ui/skeleton'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { AudioRecorder } from '#/components/audio-recorder'
import type { StoryAudioValue } from '#/components/audio-recorder'
import { Avatar } from '#/components/avatar'
import { cn } from '#/lib/utils'
import {
  getMyProfessional,
  setAvailabilityMode,
  deleteMyProfessional,
  amIAdmin,
  getCurrentUser,
  uploadMyAvatar,
  removeMyAvatar,
  updateMySocials,
  updateMyProfile,
  listMySupportDocs,
  addMySupportDoc,
  removeMySupportDoc,
  SUPPORT_DOC_MAX,
  CERTIFICATE_MIME,
  CERTIFICATE_MAX_BYTES,
  COMMON_TIMEZONES,
  defaultTimezoneForCountry,
  WEEKDAY_LABEL_ES,
  POPULATION_OPTIONS,
  FOCUS_GROUP_OPTIONS,
  PRACTICE_AREA_OPTIONS,
  PAIS_OPTIONS,
  VENEZUELA_ESTADOS,
  AVATAR_MIME,
  AVATAR_MAX_BYTES,
  AVATAR_ACCEPT,
} from '#/server/professionals'
import type {
  AvatarMime,
  CertificateMime,
  ProfileEditInput,
  ScheduleSlot,
  AvailabilityMode,
} from '#/server/professionals'
import { VENEZUELA, ESTADO_CIUDADES } from '#/server/locations'
import {
  FieldShell,
  SectionHeader,
  inputCls,
} from '#/components/professional-form'
import { PhoneInput } from '#/components/phone-input'
import {
  listMyStories,
  uploadMyStory,
  deleteMyStory,
  STORY_MAX_PER_PRO,
  STORY_TITLE_MAX,
} from '#/server/audio-stories'
import { countMyOpenFollowUps } from '#/server/follow-ups'

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
  // ponytail: open follow-ups count for the panel badge. Cheap (1 row) + auth-
  // gated; refetches when the seguimiento route invalidates ['my-followups'].
  const { data: openFollowUps = 0 } = useQuery({
    queryKey: ['my-open-followups'],
    queryFn: () => countMyOpenFollowUps(),
  })

  const verified = me?.verifiedStatus === 'verified'
  // ponytail: content-only pros don't provide direct service — hide the
  // availability section and show a collaborator note instead. They still
  // contribute audios (MyStoriesSection below), gated on `verified`.
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
            ) : me.verifiedStatus === 'disabled' ? (
              <span className="font-semibold text-red-700">Suspendido</span>
            ) : (
              <span className="font-semibold text-red-700">Rechazado</span>
            )}
          </p>

          {!verified &&
            (me.verifiedStatus === 'disabled' ? (
              <p className="glass-card-soft mt-4 rounded-[var(--glass-radius-sm)] bg-red-50/60 px-3 py-2 text-sm text-red-800">
                Tu cuenta está temporalmente suspendida mientras revisamos tu
                información. Escríbenos a soporte para más detalle.
              </p>
            ) : (
              <p className="glass-card-soft mt-4 rounded-[var(--glass-radius-sm)] bg-amber-50/60 px-3 py-2 text-sm text-amber-800">
                Tu credencial está en revisión. Podrás configurar tu
                disponibilidad cuando un administrador apruebe tu registro.
              </p>
            ))}

          <ProfileSection me={me} />
          <AvatarSection me={me} />
          <SocialsSection me={me} />
          <MySupportDocsSection />

          {/* ── Seguimiento clínico ── */}
          <section className="glass-card-soft mt-6 rounded-[var(--glass-radius-sm)] p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-sm font-semibold text-[var(--medi-text-primary)]">
                  Seguimiento clínico
                </h2>
                <p className="mt-1 text-xs text-[var(--medi-text-secondary)]">
                  Registros privados de las personas que atiendes. Solo tú los
                  ves.
                </p>
              </div>
              <Link
                to="/profesional/seguimiento"
                // ponytail: !text-white beats the unlayered `a { color }` rule
                // in styles.css (tw v4: unlayered beats layered utilities).
                className="glass-primary inline-flex shrink-0 items-center gap-2 rounded-[var(--glass-radius-sm)] px-3 py-2 text-sm font-semibold !text-white transition-all hover:translate-y-[-1px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--medi-secondary)]"
              >
                Abrir
                {openFollowUps > 0 && (
                  <span className="glass-pill bg-white/30 px-2 py-0.5 text-xs">
                    {openFollowUps}
                  </span>
                )}
              </Link>
            </div>
          </section>

          {providesService ? (
            <AvailabilitySection me={me} />
          ) : (
            <div className="glass-card-soft mt-10 rounded-[var(--glass-radius-sm)] p-5 text-center text-sm text-[var(--medi-text-secondary)]">
              <p className="font-semibold text-[var(--medi-primary)]">
                Colaborador de contenido
              </p>
              <p className="mt-1">
                Aportas audios a Voces que acompañan. No apareces en el
                directorio de servicio.
              </p>
            </div>
          )}

          <MyStoriesSection verified={verified} />

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

// ponytail: optional avatar upload (post-signup, never in registration). Reuses
// the same base64 → R2 transport as certificates/audio. Optimistic via the
// shared ['my-professional'] cache; the persisted avatar URL resolves once R2
// has the object (R2 reads are strongly consistent right after a write, unlike
// D1, so no flash). Initials fallback is handled by <Avatar>.
type MyPro = Awaited<ReturnType<typeof getMyProfessional>>

function AvatarSection({ me }: { me: NonNullable<MyPro> }) {
  const qc = useQueryClient()
  const inputRef = useRef<HTMLInputElement>(null)

  const upload = useMutation({
    mutationFn: (vars: { data: string; type: AvatarMime }) =>
      uploadMyAvatar({ data: vars }),
    onSuccess: (data) => {
      qc.setQueryData(['my-professional'], (old: MyPro | undefined) =>
        old ? { ...old, avatarKey: data.avatarKey } : old,
      )
      notify({ type: 'success', title: 'Foto actualizada' })
    },
    onError: () =>
      notify({
        type: 'error',
        title: 'No se pudo subir la foto',
        body: 'Inténtalo de nuevo.',
      }),
  })

  const remove = useMutation({
    mutationFn: () => removeMyAvatar(),
    onSuccess: () => {
      qc.setQueryData(['my-professional'], (old: MyPro | undefined) =>
        old ? { ...old, avatarKey: null } : old,
      )
      notify({ type: 'success', title: 'Foto eliminada' })
    },
  })

  async function handleFile(file: File | undefined) {
    if (!file) return
    if (!AVATAR_MIME.includes(file.type as AvatarMime)) {
      notify({
        type: 'error',
        title: 'Formato no válido',
        body: 'Solo JPG, PNG o WEBP.',
      })
      return
    }
    if (file.size > AVATAR_MAX_BYTES) {
      notify({ type: 'error', title: 'Archivo muy grande', body: 'Máximo 2 MB.' })
      return
    }
    // ponytail: read as data URL, strip the "data:<mime>;base64," prefix so the
    // server gets raw b64 (same as readFileAsCertificate in professional-form).
    const data = await new Promise<string | null>((resolve) => {
      const reader = new FileReader()
      reader.onerror = () => resolve(null)
      reader.onload = () => {
        const result = String(reader.result ?? '')
        const comma = result.indexOf(',')
        resolve(comma >= 0 ? result.slice(comma + 1) : result)
      }
      reader.readAsDataURL(file)
    })
    if (!data) {
      notify({ type: 'error', title: 'No se pudo leer el archivo.' })
      return
    }
    upload.mutate({ data, type: file.type as AvatarMime })
    // reset so selecting the same file again re-fires onChange
    if (inputRef.current) inputRef.current.value = ''
  }

  return (
    <section className="glass-card-soft mt-6 flex items-center gap-4 rounded-[var(--glass-radius-sm)] p-4">
      <Avatar
        name={me.name}
        avatarKey={me.avatarKey}
        className={cn('size-16 text-2xl', upload.isPending && 'opacity-50')}
      />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-[var(--medi-text-primary)]">
          Foto de perfil
        </p>
        <p className="text-xs text-[var(--medi-text-secondary)]">
          Aparece en tu perfil público. Opcional.
        </p>
        <div className="mt-2 flex items-center gap-3">
          <input
            ref={inputRef}
            type="file"
            accept={AVATAR_ACCEPT}
            className="hidden"
            onChange={(e) => handleFile(e.target.files?.[0])}
          />
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={upload.isPending}
            className="glass-pill rounded-[var(--glass-radius-pill)] px-3 py-1.5 text-xs font-semibold text-[var(--medi-primary)] transition-all hover:translate-y-[-1px] disabled:opacity-60"
          >
            {upload.isPending
              ? 'Subiendo…'
              : me.avatarKey
                ? 'Cambiar foto'
                : 'Subir foto'}
          </button>
          {me.avatarKey && (
            <button
              type="button"
              onClick={() => remove.mutate()}
              disabled={remove.isPending}
              className="text-xs font-medium text-red-600 hover:underline disabled:opacity-60"
            >
              Quitar
            </button>
          )}
        </div>
      </div>
    </section>
  )
}

// ponytail: optional social handles, edited post-signup + shown only on the
// public profile. Server normalizes pasted "@user"/"https://x.com/user" → bare
// "user", so the inputs accept any form. Local state seeds from me; dirty-gate
// on the Save button avoids no-op writes. Reuses <Input> for a11y + styling
// parity with the rest of the panel.
function SocialsSection({ me }: { me: NonNullable<MyPro> }) {
  const qc = useQueryClient()
  const [x, setX] = useState(me.socialX ?? '')
  const [ig, setIg] = useState(me.socialInstagram ?? '')
  const [tt, setTt] = useState(me.socialTikTok ?? '')

  const save = useMutation({
    mutationFn: (vars: { x: string; instagram: string; tiktok: string }) =>
      updateMySocials({ data: vars }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my-professional'] })
      notify({ type: 'success', title: 'Redes sociales guardadas' })
    },
    onError: () =>
      notify({
        type: 'error',
        title: 'No se pudo guardar',
        body: 'Inténtalo de nuevo.',
      }),
  })

  const dirty =
    x !== (me.socialX ?? '') ||
    ig !== (me.socialInstagram ?? '') ||
    tt !== (me.socialTikTok ?? '')

  return (
    <section className="glass-card-soft mt-6 rounded-[var(--glass-radius-sm)] p-4">
      <h2 className="text-sm font-semibold text-[var(--medi-text-primary)]">
        Redes sociales
      </h2>
      <p className="mt-1 text-xs text-[var(--medi-text-secondary)]">
        Opcional. Se muestran en tu perfil público.
      </p>
      <div className="mt-3 flex flex-col gap-2">
        <Input
          value={x}
          onChange={(e) => setX(e.target.value)}
          placeholder="@usuario (X)"
          aria-label="Usuario de X"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
        />
        <Input
          value={ig}
          onChange={(e) => setIg(e.target.value)}
          placeholder="@usuario (Instagram)"
          aria-label="Usuario de Instagram"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
        />
        <Input
          value={tt}
          onChange={(e) => setTt(e.target.value)}
          placeholder="@usuario (TikTok)"
          aria-label="Usuario de TikTok"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
        />
      </div>
      <Button
        type="button"
        onClick={() => save.mutate({ x, instagram: ig, tiktok: tt })}
        disabled={!dirty || save.isPending}
        className="glass-primary mt-3 min-h-11 w-full !text-white disabled:opacity-50"
      >
        {save.isPending ? 'Guardando…' : 'Guardar redes'}
      </Button>
    </section>
  )
}

// ponytail: minutes ↔ "HH:MM" for the schedule grid's <input type="time">.
function minToTime(m: number): string {
  const h = Math.floor(m / 60)
  const mm = m % 60
  return `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`
}
function timeToMin(t: string): number {
  const [h, m] = t.split(':').map(Number)
  if (!Number.isFinite(h) || !Number.isFinite(m)) return 0
  return Math.min(1440, Math.max(0, h * 60 + m))
}

const AVAILABILITY_MODE_OPTIONS: { value: AvailabilityMode; label: string }[] = [
  { value: 'always', label: 'Siempre disponible' },
  { value: 'scheduled', label: 'Por horario' },
  { value: 'inactive', label: 'No disponible' },
]

// ponytail: additional support docs manager (repeatable). Same base64 → R2 path
// as the avatar upload; same PDF/image mimes + 5MB cap as the main certificate.
// NOT gated on verified — pending pros attach these to speed verification. The
// server re-checks the cap; a race just produces a friendly error.
const SUPPORT_DOC_MIME_SET = new Set<string>(CERTIFICATE_MIME)
const SUPPORT_DOC_ACCEPT = '.pdf,.jpg,.jpeg,image/jpeg,image/png,image/webp'

function MySupportDocsSection() {
  const qc = useQueryClient()
  const inputRef = useRef<HTMLInputElement>(null)

  const { data: docs = [] } = useQuery({
    queryKey: ['my-support-docs'],
    queryFn: () => listMySupportDocs(),
  })

  const upload = useMutation({
    mutationFn: (vars: { data: string; type: CertificateMime; name: string }) =>
      addMySupportDoc({ data: vars }),
    onSuccess: () => {
      notify({ type: 'success', title: 'Documento guardado' })
      qc.invalidateQueries({ queryKey: ['my-support-docs'] })
    },
    onError: (err: Error) =>
      notify({
        type: 'error',
        title: 'No se pudo subir el documento',
        body: err.message,
      }),
  })

  const del = useMutation({
    mutationFn: (id: number) => removeMySupportDoc({ data: { id } }),
    onSuccess: () => {
      notify({ type: 'success', title: 'Documento eliminado' })
      qc.invalidateQueries({ queryKey: ['my-support-docs'] })
    },
    onError: () =>
      notify({
        type: 'error',
        title: 'No se pudo eliminar',
        body: 'Inténtalo de nuevo.',
      }),
  })

  async function handleFile(file: File | undefined) {
    if (!file) return
    if (!SUPPORT_DOC_MIME_SET.has(file.type)) {
      notify({
        type: 'error',
        title: 'Formato no válido',
        body: 'Solo PDF, JPG, PNG o WEBP.',
      })
      return
    }
    if (file.size > CERTIFICATE_MAX_BYTES) {
      notify({ type: 'error', title: 'Archivo muy grande', body: 'Máximo 5 MB.' })
      return
    }
    // ponytail: read as data URL, strip the "data:<mime>;base64," prefix so the
    // server gets raw b64 (same as the avatar upload + readFileAsCertificate).
    const data = await new Promise<string | null>((resolve) => {
      const reader = new FileReader()
      reader.onerror = () => resolve(null)
      reader.onload = () => {
        const result = String(reader.result ?? '')
        const comma = result.indexOf(',')
        resolve(comma >= 0 ? result.slice(comma + 1) : result)
      }
      reader.readAsDataURL(file)
    })
    if (!data) {
      notify({ type: 'error', title: 'No se pudo leer el archivo.' })
      return
    }
    upload.mutate({
      data,
      type: file.type as CertificateMime,
      name: file.name,
    })
    if (inputRef.current) inputRef.current.value = ''
  }

  const atCap = docs.length >= SUPPORT_DOC_MAX

  return (
    <section className="glass-card-soft mt-6 rounded-[var(--glass-radius-sm)] p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-[var(--medi-text-primary)]">
          Documentos de apoyo
        </h2>
        <span className="text-xs font-medium text-[var(--medi-text-secondary)]">
          {docs.length}/{SUPPORT_DOC_MAX}
        </span>
      </div>
      <p className="mt-1 text-sm text-[var(--medi-text-secondary)]">
        Certificados o credenciales adicionales que aceleren tu verificación.
      </p>

      {docs.length > 0 && (
        <ul className="mt-3 flex flex-col gap-2">
          {docs.map((d) => (
            <li
              key={d.id}
              className="flex items-center justify-between gap-2 rounded-[var(--glass-radius-sm)] border border-[var(--medi-border)] bg-white/50 p-3"
            >
              <a
                href={d.url}
                target="_blank"
                rel="noopener noreferrer"
                className="min-w-0 truncate text-sm font-medium text-[var(--medi-secondary)] hover:underline"
              >
                {d.name ?? 'Documento'}
              </a>
              <button
                type="button"
                onClick={() => del.mutate(d.id)}
                disabled={del.isPending}
                className="shrink-0 text-xs font-medium text-red-600 hover:underline disabled:opacity-60"
              >
                Quitar
              </button>
            </li>
          ))}
        </ul>
      )}

      <input
        ref={inputRef}
        type="file"
        accept={SUPPORT_DOC_ACCEPT}
        className="hidden"
        onChange={(e) => handleFile(e.target.files?.[0])}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={atCap || upload.isPending}
        className="glass-pill mt-3 rounded-[var(--glass-radius-pill)] px-3 py-1.5 text-xs font-semibold text-[var(--medi-primary)] transition-all hover:translate-y-[-1px] disabled:opacity-60"
      >
        {upload.isPending
          ? 'Subiendo…'
          : atCap
            ? 'Límite alcanzado'
            : 'Añadir documento'}
      </button>
    </section>
  )
}

// ponytail: three-state availability (F1). Replaces the old ON/OFF toggle.
// 'always'/'inactive' are one-tap; 'scheduled' reveals a weekly grid of
// {start,end} slots per day + a timezone select. Plain controlled state (like
// SocialsSection); setAvailabilityMode persists + sets `available` server-side.
function AvailabilitySection({ me }: { me: NonNullable<MyPro> }) {
  const qc = useQueryClient()
  const initialTz = me.timezone ?? defaultTimezoneForCountry(me.country)
  const [mode, setMode] = useState<AvailabilityMode>(me.availabilityMode)
  const [slots, setSlots] = useState<ScheduleSlot[]>(me.availabilitySchedule)
  const [timezone, setTimezone] = useState(initialTz)

  const save = useMutation({
    mutationFn: (vars: {
      mode: AvailabilityMode
      schedule: ScheduleSlot[]
      timezone: string
    }) => setAvailabilityMode({ data: vars }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my-professional'] })
      notify({ type: 'success', title: 'Disponibilidad guardada' })
    },
    onError: () =>
      notify({
        type: 'error',
        title: 'No se pudo guardar',
        body: 'Inténtalo de nuevo.',
      }),
  })

  // ponytail: only dirty if the mode changed, or (in scheduled mode) slots/tz
  // changed. Switching to always/inactive discards the grid server-side, so
  // slot edits don't count when not in scheduled mode.
  const dirty =
    mode !== me.availabilityMode ||
    (mode === 'scheduled' &&
      (JSON.stringify(slots) !== JSON.stringify(me.availabilitySchedule) ||
        timezone !== initialTz))

  function submit() {
    save.mutate({
      mode,
      schedule: mode === 'scheduled' ? slots : [],
      timezone,
    })
  }

  // ponytail: Mon-first display order (d=0 is Domingo).
  const DAYS_MON_FIRST = [1, 2, 3, 4, 5, 6, 0]
  function addSlot(day: number) {
    setSlots((s) => [...s, { d: day, s: 540, e: 1020 }])
  }
  function updateSlot(flatIndex: number, patch: Partial<ScheduleSlot>) {
    setSlots((s) =>
      s.map((sl, i) => (i === flatIndex ? { ...sl, ...patch } : sl)),
    )
  }
  function removeSlot(flatIndex: number) {
    setSlots((s) => s.filter((_, i) => i !== flatIndex))
  }

  return (
    <section className="glass-card-soft mt-6 rounded-[var(--glass-radius-sm)] p-4">
      <h2 className="text-sm font-semibold text-[var(--medi-text-primary)]">
        Disponibilidad
      </h2>
      <p className="mt-1 text-xs text-[var(--medi-text-secondary)]">
        Cómo y cuándo apareces para los pacientes en el directorio.
      </p>

      <div className="mt-3 grid grid-cols-3 gap-2">
        {AVAILABILITY_MODE_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            aria-pressed={mode === opt.value}
            onClick={() => setMode(opt.value)}
            className={
              'min-h-11 rounded-[var(--glass-radius-sm)] border px-2 py-2 text-xs font-medium transition-all ' +
              (mode === opt.value
                ? 'border-[var(--medi-secondary)] bg-[var(--medi-secondary)] text-white'
                : 'border-[var(--medi-border)] text-[var(--medi-text-secondary)] hover:translate-y-[-1px]')
            }
          >
            {opt.label}
          </button>
        ))}
      </div>

      {mode === 'always' && (
        <p className="mt-3 text-sm text-[var(--medi-text-secondary)]">
          Apareces siempre como disponible.
        </p>
      )}
      {mode === 'inactive' && (
        <p className="mt-3 text-sm text-[var(--medi-text-secondary)]">
          No apareces en el directorio hasta que vuelvas a activarte.
        </p>
      )}

      {mode === 'scheduled' && (
        <div className="mt-3 flex flex-col gap-2">
          <FieldShell label="Zona horaria" errors={[]}>
            <select
              className={inputCls}
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
            >
              {COMMON_TIMEZONES.map((tz) => (
                <option key={tz} value={tz}>
                  {tz}
                </option>
              ))}
            </select>
          </FieldShell>

          {DAYS_MON_FIRST.map((day) => {
            const daySlots = slots
              .map((s, i) => ({ s, i }))
              .filter(({ s }) => s.d === day)
              .sort((a, b) => a.s.s - b.s.s)
            return (
              <div
                key={day}
                className="rounded-[var(--glass-radius-sm)] border border-[var(--medi-border)] p-2"
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-[var(--medi-text-primary)]">
                    {WEEKDAY_LABEL_ES[day]}
                  </span>
                  <button
                    type="button"
                    onClick={() => addSlot(day)}
                    className="text-xs font-medium text-[var(--medi-secondary)] hover:underline"
                  >
                    + Añadir
                  </button>
                </div>
                {daySlots.length === 0 ? (
                  <p className="mt-1 text-xs text-[var(--medi-text-secondary)]">
                    Sin horario
                  </p>
                ) : (
                  <ul className="mt-1 flex flex-col gap-1">
                    {daySlots.map(({ s, i }) => (
                      <li key={i} className="flex items-center gap-2">
                        <input
                          type="time"
                          className="glass-input h-9 px-2 text-sm"
                          value={minToTime(s.s)}
                          onChange={(e) =>
                            updateSlot(i, { s: timeToMin(e.target.value) })
                          }
                          aria-label="Inicio"
                        />
                        <span className="text-xs text-[var(--medi-text-secondary)]">
                          –
                        </span>
                        <input
                          type="time"
                          className="glass-input h-9 px-2 text-sm"
                          value={minToTime(s.e)}
                          onChange={(e) =>
                            updateSlot(i, { e: timeToMin(e.target.value) })
                          }
                          aria-label="Fin"
                        />
                        <button
                          type="button"
                          onClick={() => removeSlot(i)}
                          aria-label="Quitar horario"
                          className="text-xs text-red-600 hover:underline"
                        >
                          ✕
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )
          })}
        </div>
      )}

      <Button
        type="button"
        onClick={submit}
        disabled={!dirty || save.isPending}
        className="glass-primary mt-3 min-h-11 w-full !text-white disabled:opacity-50"
      >
        {save.isPending ? 'Guardando…' : 'Guardar disponibilidad'}
      </Button>
    </section>
  )
}

// ponytail: self-serve profile edit. Plain controlled state (no TanStack Form),
// matching SocialsSection's pattern — the server validates via profileEditSchema
// and surfaces a single error toast; field-level inline errors are YAGNI for
// editing already-valid data. Markup mirrors completar.tsx but on useState.
// Changing certification number/country resets verifiedStatus → 'pending'.
function ProfileSection({ me }: { me: NonNullable<MyPro> }) {
  const qc = useQueryClient()
  const [name, setName] = useState(me.name)
  const [certificationNumber, setCertificationNumber] = useState(
    me.certificationNumber,
  )
  const [certifyingSchool, setCertifyingSchool] = useState(
    me.certifyingSchool ?? '',
  )
  const [population, setPopulation] = useState<string[]>(me.population)
  const [focusGroups, setFocusGroups] = useState<string[]>(me.focusGroups)
  const [practiceAreas, setPracticeAreas] = useState<string[]>(
    me.practiceAreas,
  )
  const [modality, setModality] = useState(me.modality)
  const [country, setCountry] = useState(me.country)
  const [estado, setEstado] = useState(me.estado ?? '')
  const [ciudad, setCiudad] = useState(me.ciudad ?? '')
  const [credentialCountry, setCredentialCountry] = useState(
    me.credentialCountry ?? '',
  )
  const [whatsappCountry, setWhatsappCountry] = useState(
    me.whatsappCountry ?? '',
  )
  const [whatsapp, setWhatsapp] = useState(me.whatsapp)

  const save = useMutation({
    mutationFn: (vars: ProfileEditInput) => updateMyProfile({ data: vars }),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['my-professional'] })
      notify({
        type: 'success',
        title: data.rereview
          ? 'Perfil actualizado — tu credencial volvió a revisión'
          : 'Perfil actualizado',
      })
    },
    onError: (err: Error) =>
      notify({
        type: 'error',
        title: 'No se pudo guardar',
        body: err.message,
      }),
  })

  // ponytail: dirty-gate the Save button so a no-op open doesn't write. Tag
  // arrays compared by joined string (order-stable within a session).
  const dirty =
    name !== me.name ||
    certificationNumber !== me.certificationNumber ||
    (certifyingSchool || '') !== (me.certifyingSchool ?? '') ||
    population.join(',') !== me.population.join(',') ||
    focusGroups.join(',') !== me.focusGroups.join(',') ||
    practiceAreas.join(',') !== me.practiceAreas.join(',') ||
    modality !== me.modality ||
    country !== me.country ||
    estado !== (me.estado ?? '') ||
    ciudad !== (me.ciudad ?? '') ||
    credentialCountry !== (me.credentialCountry ?? '') ||
    whatsappCountry !== (me.whatsappCountry ?? '') ||
    whatsapp !== me.whatsapp

  function submit() {
    // ponytail: estado/ciudad are only meaningful for Venezuela; nulled
    // otherwise so the payload matches profileEditSchema's output shape. The
    // server re-validates, so the enum cast is safe (the <select> only emits
    // valid members).
    const payload = {
      name: name.trim(),
      certificationNumber,
      certifyingSchool: certifyingSchool.trim() || null,
      population,
      focusGroups,
      practiceAreas,
      modality,
      country,
      estado: country === VENEZUELA ? estado : null,
      ciudad: country === VENEZUELA ? ciudad || null : null,
      credentialCountry: credentialCountry || null,
      whatsappCountry: whatsappCountry || null,
      whatsapp,
    }
    save.mutate(payload as ProfileEditInput)
  }

  const ciudades = (
    ESTADO_CIUDADES as Record<string, readonly string[] | undefined>
  )[estado] ?? []

  return (
    <section className="glass-card-soft mt-6 rounded-[var(--glass-radius-sm)] p-4">
      <h2 className="text-sm font-semibold text-[var(--medi-text-primary)]">
        Perfil profesional
      </h2>
      <p className="mt-1 text-xs text-[var(--medi-text-secondary)]">
        Edita los datos del directorio. Cambiar tu número de colegiación
        reinicia la verificación.
      </p>

      <div className="mt-3 flex flex-col gap-3">
        <FieldShell label="Nombre" errors={[]}>
          <input
            className={inputCls}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </FieldShell>

        <SectionHeader>Credencial</SectionHeader>
        <FieldShell label="País del colegio o certificación" errors={[]}>
          <select
            className={inputCls}
            value={credentialCountry}
            onChange={(e) => setCredentialCountry(e.target.value)}
          >
            <option value="" disabled>
              Selecciona…
            </option>
            {PAIS_OPTIONS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </FieldShell>
        <FieldShell label="Número de colegiación" errors={[]}>
          <input
            type="text"
            autoCapitalize="none"
            className={inputCls}
            value={certificationNumber}
            onChange={(e) => setCertificationNumber(e.target.value)}
          />
        </FieldShell>
        <FieldShell label="Colegio / institución (opcional)" errors={[]}>
          <input
            type="text"
            className={inputCls}
            value={certifyingSchool}
            onChange={(e) => setCertifyingSchool(e.target.value)}
            placeholder="Ej. Colegio de Psicólogos de Venezuela"
          />
        </FieldShell>

        <SectionHeader>Especialización</SectionHeader>
        <TagSelect
          label="¿Con quién trabajas?"
          options={POPULATION_OPTIONS}
          value={population}
          onChange={setPopulation}
        />
        <TagSelect
          label="Poblaciones específicas (opcional)"
          options={FOCUS_GROUP_OPTIONS}
          value={focusGroups}
          onChange={setFocusGroups}
        />
        <TagSelect
          label="Áreas de intervención (opcional)"
          options={PRACTICE_AREA_OPTIONS}
          value={practiceAreas}
          onChange={setPracticeAreas}
        />

        <SectionHeader>Ubicación &amp; contacto</SectionHeader>
        <FieldShell label="Modalidad" errors={[]}>
          <select
            className={inputCls}
            value={modality}
            onChange={(e) =>
              setModality(e.target.value as 'in_person' | 'remote' | 'both')
            }
          >
            <option value="in_person">Presencial</option>
            <option value="remote">A distancia</option>
            <option value="both">Ambas</option>
          </select>
        </FieldShell>
        <FieldShell label="País donde vives" errors={[]}>
          <select
            className={inputCls}
            value={country}
            onChange={(e) => {
              setCountry(e.target.value)
              // ponytail: reset estado/ciudad on country change — the lists are
              // Venezuela-scoped; a stale value would filter to nothing.
              setEstado('')
              setCiudad('')
            }}
          >
            {PAIS_OPTIONS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </FieldShell>
        {country === VENEZUELA && (
          <>
            <FieldShell label="Estado" errors={[]}>
              <select
                className={inputCls}
                value={estado}
                onChange={(e) => {
                  setEstado(e.target.value)
                  setCiudad('')
                }}
              >
                <option value="" disabled>
                  Selecciona…
                </option>
                {VENEZUELA_ESTADOS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </FieldShell>
            <FieldShell label="Ciudad" errors={[]}>
              <select
                className={inputCls}
                value={ciudad}
                onChange={(e) => setCiudad(e.target.value)}
                disabled={!estado}
              >
                <option value="" disabled>
                  {estado ? 'Selecciona…' : 'Primero elige estado'}
                </option>
                {ciudades.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </FieldShell>
          </>
        )}
        <PhoneInput
          country={whatsappCountry}
          phone={whatsapp}
          onCountryChange={setWhatsappCountry}
          onPhoneChange={setWhatsapp}
          countryLabel="País del WhatsApp"
          phoneLabel="WhatsApp / teléfono"
        />
      </div>

      <Button
        type="button"
        onClick={submit}
        disabled={!dirty || save.isPending}
        className="glass-primary mt-3 min-h-11 w-full !text-white disabled:opacity-50"
      >
        {save.isPending ? 'Guardando…' : 'Guardar perfil'}
      </Button>
    </section>
  )
}

// ponytail: multi-select tag buttons (mirrors completar.tsx). Plain value +
// onChange so it composes with useState (no TanStack Form generics here).
function TagSelect({
  label,
  options,
  value,
  onChange,
}: {
  label: string
  options: readonly string[]
  value: string[]
  onChange: (v: string[]) => void
}) {
  return (
    <FieldShell label={label} errors={[]}>
      <div className="flex flex-wrap gap-2">
        {options.map((opt) => {
          const selected = value.includes(opt)
          return (
            <button
              key={opt}
              type="button"
              aria-pressed={selected}
              onClick={() =>
                onChange(
                  selected
                    ? value.filter((v) => v !== opt)
                    : [...value, opt],
                )
              }
              className={
                'min-h-11 rounded-[var(--glass-radius-sm)] border px-4 py-2 text-sm font-medium transition-all ' +
                (selected
                  ? 'border-[var(--medi-secondary)] bg-[var(--medi-secondary)] text-white'
                  : 'border-[var(--medi-border)] text-[var(--medi-text-secondary)] hover:translate-y-[-1px]')
              }
            >
              {opt}
            </button>
          )
        })}
      </div>
    </FieldShell>
  )
}

// ponytail: pro's own "Voces que acompañan" manager. Counts toward the cap
// (≤2 active) and gates on verified — pending/rejected pros see a waiting
// message instead of the recorder. Upload reuses the same base64 + R2 path
// as certificates; delete hard-deletes the row + its R2 object.
function MyStoriesSection({ verified }: { verified: boolean }) {
  const qc = useQueryClient()
  const [title, setTitle] = useState('')
  const [audio, setAudio] = useState<StoryAudioValue | null>(null)

  const { data: stories = [] } = useQuery({
    queryKey: ['my-stories'],
    queryFn: () => listMyStories(),
  })

  // ponytail: cap counts only pending + approved (rejected = audit, doesn't
  // block). Server re-checks, so a race here just produces a friendly error.
  const activeCount = stories.filter(
    (s) => s.status === 'pending' || s.status === 'approved',
  ).length
  const atCap = activeCount >= STORY_MAX_PER_PRO

  const upload = useMutation({
    mutationFn: (vars: StoryAudioValue & { title: string | null }) =>
      uploadMyStory({
        data: {
          mime: vars.mime,
          durationSec: vars.durationSec,
          data: vars.data,
          title: vars.title,
        },
      }),
    onSuccess: () => {
      notify({
        type: 'success',
        title: 'Audio enviado',
        body: 'Quedó en revisión. Aparecerá aquí cuando se apruebe.',
      })
      setAudio(null)
      setTitle('')
      qc.invalidateQueries({ queryKey: ['my-stories'] })
    },
    onError: (err: Error) =>
      notify({
        type: 'error',
        title: 'No se pudo subir el audio',
        body: err.message,
      }),
  })

  const del = useMutation({
    mutationFn: (id: number) => deleteMyStory({ data: { id } }),
    onSuccess: () => {
      notify({ type: 'success', title: 'Audio eliminado' })
      qc.invalidateQueries({ queryKey: ['my-stories'] })
    },
    onError: () =>
      notify({
        type: 'error',
        title: 'No se pudo eliminar',
        body: 'Inténtalo de nuevo.',
      }),
  })

  function submit() {
    if (!audio) return
    upload.mutate({ ...audio, title: title.trim() || null })
  }

  return (
    <section className="glass-card-soft mt-6 rounded-[var(--glass-radius-sm)] p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-[var(--medi-text-primary)]">
          Mis audios de apoyo
        </h2>
        <span className="text-xs font-medium text-[var(--medi-text-secondary)]">
          {activeCount}/{STORY_MAX_PER_PRO}
        </span>
      </div>

      {!verified ? (
        <p className="mt-2 text-sm text-[var(--medi-text-secondary)]">
          Cuando tu credencial sea verificada podrás grabar mensajes en voz para
          quienes buscan acompañamiento en{' '}
          <Link
            to="/apoyo"
            className="font-semibold text-[var(--medi-secondary)]"
          >
            Voces que acompañan
          </Link>
          .
        </p>
      ) : (
        <>
          <p className="mt-1 text-sm text-[var(--medi-text-secondary)]">
            Mensajes cortos (idealmente 1:30, máx. 3 min). Cada audio pasa por
            revisión antes de publicarse.
          </p>

          {stories.length > 0 && (
            <ul className="mt-3 flex flex-col gap-2">
              {stories.map((s) => (
                <li
                  key={s.id}
                  className="rounded-[var(--glass-radius-sm)] border border-[var(--medi-border)] bg-white/50 p-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={`glass-pill px-2 py-0.5 text-xs font-medium ${
                        s.status === 'approved'
                          ? 'text-green-700'
                          : s.status === 'pending'
                            ? 'text-amber-700'
                            : 'text-red-700'
                      }`}
                    >
                      {s.status === 'approved'
                        ? 'Aprobado'
                        : s.status === 'pending'
                          ? 'En revisión'
                          : 'Rechazado'}
                    </span>
                    <button
                      type="button"
                      onClick={() => del.mutate(s.id)}
                      disabled={del.isPending}
                      className="text-xs font-medium text-red-600 hover:underline disabled:opacity-50"
                    >
                      Eliminar
                    </button>
                  </div>
                  {s.title && (
                    <p className="mt-1.5 text-sm font-medium text-[var(--medi-text-primary)]">
                      {s.title}
                    </p>
                  )}
                  <audio
                    controls
                    src={s.url}
                    preload="none"
                    className="mt-2 w-full"
                    aria-label={`Audio (${s.status})`}
                  />
                </li>
              ))}
            </ul>
          )}

          {atCap ? (
            <p className="glass-card-soft mt-3 rounded-[var(--glass-radius-sm)] px-3 py-2 text-sm text-[var(--medi-text-secondary)]">
              Tienes {STORY_MAX_PER_PRO} audios. Elimina uno para grabar uno
              nuevo.
            </p>
          ) : (
            <div className="mt-3 flex flex-col gap-2">
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={STORY_TITLE_MAX}
                placeholder="Título (opcional) — ej. “Para cuando la soledad pesa”"
                aria-label="Título del audio (opcional)"
              />
              <AudioRecorder value={audio} onChange={setAudio} />
              <Button
                type="button"
                onClick={submit}
                disabled={!audio || upload.isPending}
                className="glass-primary mt-1 min-h-12 rounded-[var(--glass-radius-sm)] !text-white disabled:opacity-50"
              >
                {upload.isPending ? 'Enviando…' : 'Enviar para revisión'}
              </Button>
            </div>
          )}
        </>
      )}
    </section>
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
