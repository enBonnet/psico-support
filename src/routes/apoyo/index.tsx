import { useState } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { Headphones, Play } from 'lucide-react'

import { listStoryTray } from '#/server/audio-stories'
import type { StoryTrayPro } from '#/server/audio-stories'
import { AudioStoryViewer } from '#/components/audio-story-viewer'
import { seoHead } from '#/lib/seo'

export const Route = createFileRoute('/apoyo/')({
  // ponytail: CSR-only — interactive viewer, no crawler value. The clips are
  // audio (not text-indexable); SEO surface is the landing + the per-pro
  // profile route, which stays SSR. beforeLoad isn't needed (public, no auth).
  ssr: false,
  head: () =>
    seoHead({
      title: 'Voces que acompañan — PsicoAyudaVen',
      description:
        'Escucha mensajes en voz de psicólogos verificados. Si necesitas acompañamiento ahora, empieza aquí.',
      path: '/apoyo',
    }),
  component: ApoyoPage,
})

function ApoyoPage() {
  const { data: tray = [], isLoading } = useQuery({
    queryKey: ['story-tray'],
    queryFn: () => listStoryTray(),
    staleTime: 30_000,
  })
  // ponytail: null = viewer closed; number = viewer open at that pro index.
  // The viewer owns its own clip-advance + close-on-exhaustion logic; this
  // state just gates whether it's mounted and where it starts.
  const [viewerStart, setViewerStart] = useState<number | null>(null)

  const totalClips = tray.reduce((n, p) => n + p.clips.length, 0)

  return (
    <main className="page-wrap flex min-h-[100dvh] flex-col py-6">
      <Link
        to="/"
        className="inline-flex items-center gap-1 self-start py-2 text-base font-medium text-[var(--medi-secondary)]"
        aria-label="Atrás"
      >
        ‹ Atrás
      </Link>

      <header className="mt-2">
        <p className="section-kicker">Voces que acompañan</p>
        <h1 className="mt-2 text-2xl font-bold leading-tight text-[var(--medi-primary)] sm:text-3xl">
          No estás solo
        </h1>
        <div className="section-underline mt-3" />
        <p className="mt-4 text-sm text-[var(--medi-text-secondary)]">
          Mensajes en voz de psicólogos verificados. Toca para escuchar — una
          voz tras otra, hasta donde necesites.
        </p>
      </header>

      {isLoading ? (
        <div className="mt-8 flex flex-col gap-4" aria-busy="true">
          <div className="glass-card h-16 w-full animate-pulse rounded-[var(--glass-radius-sm)]" />
          <div className="flex gap-3 overflow-hidden">
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className="size-20 shrink-0 animate-pulse rounded-full bg-[var(--medi-border)]/40"
              />
            ))}
          </div>
        </div>
      ) : tray.length === 0 ? (
        <div className="glass-card-soft mt-8 rounded-[var(--glass-radius-sm)] p-6 text-center">
          <Headphones
            className="mx-auto size-10 text-[var(--medi-secondary)]"
            aria-hidden="true"
          />
          <p className="mt-3 text-sm text-[var(--medi-text-secondary)]">
            Aún no hay audios disponibles. Vuelve pronto — los psicólogos de la
            red están preparando mensajes para ti.
          </p>
          {/* ponytail: "ahora" → remote directory (the on-demand modality). */}
          <Link
            to="/ayuda/profesionales"
            search={{ modality: 'remote' }}
            className="glass-primary mt-5 inline-flex min-h-12 items-center justify-center rounded-[var(--glass-radius-sm)] px-5 py-2 text-sm font-semibold !text-white"
          >
            Buscar un psicólogo ahora
          </Link>
        </div>
      ) : (
        <>
          {/* Catch-all: lean-back "I don't know what I need, just play me something" */}
          <button
            type="button"
            onClick={() => setViewerStart(0)}
            className="glass-primary mt-6 flex min-h-16 items-center justify-center gap-3 rounded-[var(--glass-radius)] px-6 py-5 text-lg font-semibold !text-white transition-all hover:translate-y-[-1px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--medi-secondary)]"
          >
            <Play className="size-5" aria-hidden="true" />
            Solo necesito escuchar algo
          </button>
          <p className="mt-2 text-center text-xs text-[var(--medi-text-secondary)]">
            {totalClips} {totalClips === 1 ? 'audio' : 'audios'} de{' '}
            {tray.length}{' '}
            {tray.length === 1 ? 'psicólogo' : 'psicólogos'}
          </p>

          {/* Tray: horizontal scroll of pros with ≥1 approved clip */}
          <h2 className="mt-8 border-b border-[var(--medi-border)] pb-1 text-sm font-semibold uppercase tracking-wide text-[var(--medi-text-secondary)]">
            Elige una voz
          </h2>
          <ul className="mt-4 flex gap-4 overflow-x-auto pb-4">
            {tray.map((pro, i) => (
              <li key={pro.professionalId} className="shrink-0">
                <TrayAvatar pro={pro} onClick={() => setViewerStart(i)} />
              </li>
            ))}
          </ul>
        </>
      )}

      {viewerStart !== null && (
        <AudioStoryViewer
          tray={tray}
          startPro={viewerStart}
          onClose={() => setViewerStart(null)}
        />
      )}
    </main>
  )
}

// ponytail: tray avatar — gradient ring (matches the viewer's per-pro gradient
// intent without importing the helper; the gradient here is purely cosmetic,
// the viewer recomputes its own). Initial in the center; clip count badge.
function TrayAvatar({
  pro,
  onClick,
}: {
  pro: StoryTrayPro
  onClick: () => void
}) {
  const initial = pro.name.trim().charAt(0).toUpperCase() || '?'
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-20 flex-col items-center gap-1.5 text-center focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--medi-secondary)]"
      aria-label={`Escuchar audio de ${pro.name}`}
    >
      <span className="relative flex size-20 items-center justify-center rounded-full bg-gradient-to-br from-[var(--medi-primary)] to-[var(--medi-secondary)] text-2xl font-bold !text-white shadow-md transition-transform hover:scale-105">
        {initial}
        {/* clip count badge */}
        <span className="absolute -bottom-1 -right-1 flex size-6 items-center justify-center rounded-full bg-white text-xs font-bold text-[var(--medi-primary)] shadow-sm">
          {pro.clips.length}
        </span>
      </span>
      <span className="line-clamp-2 text-xs font-medium leading-tight text-[var(--medi-text-primary)]">
        {pro.name}
      </span>
    </button>
  )
}
