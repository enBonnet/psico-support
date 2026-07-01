import { createFileRoute, redirect, Link } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { notify } from '#/lib/notifications'
import { Skeleton } from '#/components/ui/skeleton'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { AudioRecorder } from '#/components/audio-recorder'
import type { StoryAudioValue } from '#/components/audio-recorder'
import {
  getMyProfessional,
  getCurrentUser,
} from '#/server/professionals'
import {
  listMyStories,
  uploadMyStory,
  deleteMyStory,
  STORY_MAX_PER_PRO,
  STORY_TITLE_MAX,
} from '#/server/audio-stories'

export const Route = createFileRoute('/profesional/audios')({
  beforeLoad: async () => {
    const user = await getCurrentUser()
    if (!user) {
      throw redirect({ to: '/profesional/login' })
    }
  },
  // ponytail: CSR-only — auth-gated, no crawler value. Split out of the panel
  // so the hub stays a simple menu.
  ssr: false,
  component: AudiosPage,
})

function AudiosPage() {
  const { data: me, isLoading } = useQuery({
    queryKey: ['my-professional'],
    queryFn: () => getMyProfessional(),
  })
  const verified = me?.verifiedStatus === 'verified'

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
        Mis audios de apoyo
      </h1>
      <div className="section-underline mt-2" />
      <p className="mt-3 text-sm text-[var(--medi-text-secondary)]">
        Mensajes en voz para quienes buscan acompañamiento en{' '}
        <Link
          to="/apoyo"
          className="font-semibold text-[var(--medi-secondary)]"
        >
          Voces que acompañan
        </Link>
        .
      </p>

      {isLoading && (
        <div className="mt-4 flex flex-col gap-3" aria-busy="true">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      )}

      {me && <MyStoriesSection verified={verified} />}
    </main>
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
        <span className="text-xs font-medium text-[var(--medi-text-secondary)]">
          {activeCount}/{STORY_MAX_PER_PRO}
        </span>
      </div>

      {!verified ? (
        <p className="mt-2 text-sm text-[var(--medi-text-secondary)]">
          Cuando tu credencial sea verificada podrás grabar mensajes en voz
          para quienes buscan acompañamiento en{' '}
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
