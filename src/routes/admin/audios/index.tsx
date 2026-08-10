import { createFileRoute } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { notify } from '#/lib/notifications'
import { track } from '#/lib/analytics-client'
import { getCurrentUser } from '#/server/professionals'
import { listPendingStories, reviewStory } from '#/server/audio-stories'
import type { PendingStoryRow } from '#/server/audio-stories'

// =============================================================================
// /admin/audios — pending-clip review queue (Voces que acompañan)
// =============================================================================
// Lifted verbatim from the old monolithic /admin/index.tsx AudioStoriesSection.
// No behavioral changes — same query, same optimistic mutation, same tracking.
// =============================================================================

export const Route = createFileRoute('/admin/audios/')({
  component: AudioStoriesSection,
})

function AudioStoriesSection() {
  const qc = useQueryClient()
  const { data: adminUser } = useQuery({
    queryKey: ['me'],
    queryFn: () => getCurrentUser(),
  })
  const actorId = adminUser?.id
  const { data: pendingStories = [], isLoading: storiesLoading } = useQuery({
    queryKey: ['pending-stories'],
    queryFn: () => listPendingStories(),
  })

  const decideStory = useMutation({
    mutationFn: (vars: { storyId: number; status: 'approved' | 'rejected' }) =>
      reviewStory({ data: vars }),
    onMutate: async (vars) => {
      await qc.cancelQueries({ queryKey: ['pending-stories'] })
      const prev = qc.getQueryData<PendingStoryRow[]>(['pending-stories'])
      qc.setQueryData<PendingStoryRow[]>(['pending-stories'], (old) =>
        old?.filter((s) => s.id !== vars.storyId),
      )
      return { prev }
    },
    onError: (_e, _vars, ctx) => {
      if (ctx?.prev) {
        qc.setQueryData<PendingStoryRow[]>(['pending-stories'], ctx.prev)
      }
      notify({
        type: 'error',
        title: 'No se pudo actualizar el audio',
        body: 'Inténtalo de nuevo.',
      })
    },
    onSuccess: (_d, vars) => {
      if (actorId) {
        track({
          event: 'admin_audio_review',
          category: 'admin',
          actorId,
          param1: vars.status,
          param2: String(vars.storyId),
        })
      }
      qc.invalidateQueries({ queryKey: ['pending-stories'] })
      qc.invalidateQueries({ queryKey: ['story-tray'] })
      notify({
        type: vars.status === 'approved' ? 'success' : 'warning',
        title:
          vars.status === 'approved' ? 'Audio aprobado' : 'Audio rechazado',
        body:
          vars.status === 'approved'
            ? 'Ya aparece en Voces que acompañan.'
            : 'Quedó fuera de la lista pública.',
      })
    },
  })

  return (
    <section>
      <h2 className="border-b border-[var(--medi-border)] pb-1 text-sm font-semibold uppercase tracking-wide text-[var(--medi-text-secondary)]">
        Audios de apoyo — revisión
      </h2>
      {storiesLoading ? (
        <p className="mt-2 text-sm text-[var(--medi-text-secondary)]">
          Cargando…
        </p>
      ) : pendingStories.length === 0 ? (
        <p className="glass-card-soft mt-2 p-4 text-center text-sm text-[var(--medi-text-secondary)]">
          No hay audios por revisar.
        </p>
      ) : (
        <ul className="mt-3 flex flex-col gap-3">
          {pendingStories.map((s) => (
            <li key={s.id} className="glass-card p-4">
              <div className="flex items-start justify-between gap-2">
                <p className="truncate text-sm font-semibold text-[var(--medi-text-primary)]">
                  {s.proName}
                </p>
                {s.category && (
                  <span className="glass-pill shrink-0 px-2 py-0.5 text-xs font-medium text-[var(--medi-secondary)]">
                    {s.category.title}
                  </span>
                )}
              </div>
              {s.title && (
                <p className="mt-0.5 text-sm text-[var(--medi-text-secondary)]">
                  “{s.title}”
                </p>
              )}
              <p className="mt-0.5 text-xs text-[var(--medi-text-secondary)]">
                {Math.floor(s.durationSec / 60)}:
                {(s.durationSec % 60).toString().padStart(2, '0')}
              </p>
              <audio
                controls
                src={s.url}
                preload="none"
                className="mt-2 w-full"
                aria-label={`Audio de ${s.proName} para revisión`}
              />
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={() =>
                    decideStory.mutate({ storyId: s.id, status: 'approved' })
                  }
                  className="min-h-11 flex-1 rounded-[var(--glass-radius-sm)] bg-green-600 px-4 py-2 text-sm font-semibold !text-white transition-all hover:translate-y-[-1px] hover:bg-green-700"
                >
                  Aprobar
                </button>
                <button
                  type="button"
                  onClick={() =>
                    decideStory.mutate({ storyId: s.id, status: 'rejected' })
                  }
                  className="glass-card-soft min-h-11 flex-1 rounded-[var(--glass-radius-sm)] border-2 border-red-600 px-4 py-2 text-sm font-semibold text-red-600 transition-all hover:translate-y-[-1px] hover:bg-red-50/60"
                >
                  Rechazar
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
