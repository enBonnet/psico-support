import { createFileRoute, redirect, Link } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState, useRef } from 'react'
import { notify } from '#/lib/notifications'
import { Skeleton } from '#/components/ui/skeleton'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { Avatar } from '#/components/avatar'
import { cn } from '#/lib/utils'
import {
  getMyProfessional,
  getCurrentUser,
  uploadMyAvatar,
  removeMyAvatar,
  updateMySocials,
  AVATAR_MIME,
  AVATAR_MAX_BYTES,
  AVATAR_ACCEPT,
} from '#/server/professionals'
import type { AvatarMime } from '#/server/professionals'

export const Route = createFileRoute('/profesional/presentacion')({
  beforeLoad: async () => {
    const user = await getCurrentUser()
    if (!user) {
      throw redirect({ to: '/profesional/login' })
    }
  },
  // ponytail: CSR-only — auth-gated, no crawler value. Split out of the panel
  // so the hub stays a simple menu.
  ssr: false,
  component: PresentacionPage,
})

type MyPro = Awaited<ReturnType<typeof getMyProfessional>>

function PresentacionPage() {
  const { data: me, isLoading } = useQuery({
    queryKey: ['my-professional'],
    queryFn: () => getMyProfessional(),
  })

  return (
    <main className="page-wrap flex min-h-[100dvh] flex-col py-6">
      <Link
        to="/profesional/panel"
        className="inline-flex items-center gap-1 self-start py-2 text-base font-medium text-[var(--medi-secondary)]"
        aria-label="Volver al panel"
      >
        ‹ Panel
      </Link>

      <h1 className="text-2xl font-bold text-[var(--medi-text-primary)]">
        Foto y redes sociales
      </h1>
      <div className="section-underline mt-2" />
      <p className="mt-3 text-sm text-[var(--medi-text-secondary)]">
        Cómo te ven las personas que llegan a tu perfil público.
      </p>

      {isLoading && (
        <div className="mt-4 flex flex-col gap-3" aria-busy="true">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      )}

      {me && (
        <>
          <AvatarSection me={me} />
          <SocialsSection me={me} />
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
