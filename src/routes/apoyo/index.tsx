import { useState, useEffect, useMemo, useRef } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { Headphones, Play } from 'lucide-react'

import { listStoryTray } from '#/server/audio-stories'
import type { StoryTrayPro, StoryClipCategory } from '#/server/audio-stories'
import { publicAvatarUrl } from '#/server/professionals'
import { AudioStoryViewer } from '#/components/audio-story-viewer'
import { track } from '#/lib/analytics-client'
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
        'Escucha mensajes en voz de psicólogos verificados, agrupados por lo que necesitas: cuentos, respiración, dormir, ánimo y más.',
      path: '/apoyo',
    }),
  component: ApoyoPage,
})

// ponytail: a category section is the union of the category's display copy +
// the subset of pros who have ≥1 clip in that category (each pro scoped to
// only that category's clips, so the viewer plays just that section). The
// "Otros audios" bucket uses category=null + a synthetic title/description.
type CategorySection = {
  key: string // category slug, or '__otros__' for the uncategorized bucket
  category: StoryClipCategory | null
  title: string
  description: string
  pros: StoryTrayPro[]
}

function ApoyoPage() {
  const { data: tray = [], isLoading } = useQuery({
    queryKey: ['story-tray'],
    queryFn: () => listStoryTray(),
    staleTime: 30_000,
  })
  // ponytail: null = viewer closed; { sectionIndex, proIndex } = viewer open
  // scoped to that category section, starting at that pro within it.
  const [viewer, setViewer] = useState<{
    sectionIndex: number
    proIndex: number
  } | null>(null)

  useEffect(() => {
    track({ event: 'apoyo_view', category: 'public' })
  }, [])

  // ponytail: derive category sections from the flat tray. Each pro appears
  // once per section with ONLY that category's clips — the viewer then plays
  // just that section. Categorized sections are ordered by the admin-managed
  // sortOrder (ascending) so the admin's "orden — menor = más arriba" control
  // actually governs the public page; "Otros audios" always lands last.
  const sections = useMemo<CategorySection[]>(() => {
    const byKey = new Map<string, CategorySection>()
    const otrosClipsByPro = new Map<number, StoryTrayPro>()
    for (const pro of tray) {
      // bucket this pro's clips by category
      const clipsByCat = new Map<number, StoryTrayPro>()
      const otrosClips: StoryTrayPro['clips'] = []
      for (const clip of pro.clips) {
        if (clip.category) {
          const existing = clipsByCat.get(clip.category.id)
          if (existing) {
            existing.clips.push(clip)
          } else {
            clipsByCat.set(clip.category.id, {
              ...pro,
              clips: [clip],
            })
          }
        } else {
          otrosClips.push(clip)
        }
      }
      for (const scopedPro of clipsByCat.values()) {
        const cat = scopedPro.clips[0].category!
        let section = byKey.get(cat.slug)
        if (!section) {
          section = {
            key: cat.slug,
            category: cat,
            title: cat.title,
            description: cat.description,
            pros: [],
          }
          byKey.set(cat.slug, section)
        }
        section.pros.push(scopedPro)
      }
      if (otrosClips.length > 0) {
        otrosClipsByPro.set(pro.professionalId, { ...pro, clips: otrosClips })
      }
    }
    // ponytail: sort categorized sections by the admin-managed sortOrder
    // (ascending), falling back to id for stability. "Otros audios" is appended
    // after the sort so it always sits at the bottom regardless of sort keys.
    const result = Array.from(byKey.values()).sort(
      (a, b) =>
        (a.category?.sortOrder ?? 0) - (b.category?.sortOrder ?? 0) ||
        (a.category?.id ?? 0) - (b.category?.id ?? 0),
    )
    if (otrosClipsByPro.size > 0) {
      result.push({
        key: '__otros__',
        category: null,
        title: 'Otros audios',
        description: 'Mensajes que no encajan en una categoría específica.',
        pros: Array.from(otrosClipsByPro.values()),
      })
    }
    return result
  }, [tray])

  const totalClips = tray.reduce((n, p) => n + p.clips.length, 0)
  const sectionRefs = useRef<(HTMLElement | null)[]>([])

  function scrollToSection(i: number) {
    sectionRefs.current[i]?.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    })
  }

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
          Mensajes en voz de psicólogos verificados, agrupados por lo que
          necesitas. Toca una categoría o empieza desde donde estés.
        </p>
      </header>

      {isLoading ? (
        <div className="mt-8 flex flex-col gap-4" aria-busy="true">
          <div className="glass-card h-16 w-full animate-pulse rounded-[var(--glass-radius-sm)]" />
          <div className="flex flex-wrap gap-2">
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-9 w-28 animate-pulse rounded-full bg-[var(--medi-border)]/40"
              />
            ))}
          </div>
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
          {/* Catch-all: lean-back "I don't know what I need, just play me
              something" — plays every clip across every category. */}
          <button
            type="button"
            onClick={() => {
              track({ event: 'audio_play_all', category: 'public' })
              // ponytail: build a flat "all clips" section by passing the full
              // tray scoped to section 0. We synthesize a virtual section list
              // for the viewer by treating the whole tray as one section.
              setViewer({ sectionIndex: -1, proIndex: 0 })
            }}
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

          {/* Category chips: jump-to-section for each non-empty category. */}
          <div className="mt-6 flex flex-wrap gap-2">
            {sections.map((s, i) => (
              <button
                key={s.key}
                type="button"
                onClick={() => scrollToSection(i)}
                className="glass-card-soft rounded-full px-3 py-1.5 text-xs font-semibold text-[var(--medi-primary)] transition-all hover:translate-y-[-1px]"
              >
                {s.title}
              </button>
            ))}
          </div>

          {/* Category sections: one per category with ≥1 clip, in
              first-appearance order (so a category surfaces the moment a pro
              contributes to it). Each shows title + description + a tray of
              pros scoped to that category's clips. */}
          {sections.map((section, i) => (
            <section
              key={section.key}
              ref={(el) => {
                sectionRefs.current[i] = el
              }}
              className="mt-8 scroll-mt-4"
            >
              <h2 className="border-b border-[var(--medi-border)] pb-1 text-sm font-semibold uppercase tracking-wide text-[var(--medi-text-secondary)]">
                {section.title}
              </h2>
              <p className="mt-2 text-sm text-[var(--medi-text-secondary)]">
                {section.description}
              </p>
              <ul className="mt-4 flex gap-4 overflow-x-auto pb-4">
                {section.pros.map((pro, j) => (
                  <li key={pro.professionalId} className="shrink-0">
                    <TrayAvatar
                      pro={pro}
                      onClick={() => {
                        if (section.category) {
                          track({
                            event: 'audio_play_category',
                            category: 'public',
                            param1: section.category.slug,
                          })
                        } else {
                          track({
                            event: 'audio_play_pro',
                            category: 'public',
                            param1: String(pro.professionalId),
                            value: j,
                          })
                        }
                        setViewer({ sectionIndex: i, proIndex: j })
                      }}
                    />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </>
      )}

      {(() => {
        // ponytail: compute the viewer's tray once. If a background refetch of
        // ['story-tray'] (staleTime 30s + refetch-on-focus) drops the open
        // section while the viewer is mounted, the effective tray becomes []
        // — the viewer dereferences tray[proIndex].clips[clipIndex]
        // unguarded and would throw. Guard by not rendering it on empty.
        if (!viewer) return null
        const viewerTray =
          viewer.sectionIndex === -1
            ? tray
            : sections[viewer.sectionIndex]?.pros ?? []
        if (viewerTray.length === 0) return null
        return (
          <AudioStoryViewer
            tray={viewerTray}
            startPro={viewer.proIndex}
            onClose={() => setViewer(null)}
          />
        )
      })()}
    </main>
  )
}

// ponytail: tray avatar — gradient ring (matches the viewer's per-pro gradient
// intent without importing the helper; the gradient here is purely cosmetic,
// the viewer recomputes its own). Photo when uploaded, else initial. Clip
// count badge anchored bottom-right.
function TrayAvatar({
  pro,
  onClick,
}: {
  pro: StoryTrayPro
  onClick: () => void
}) {
  const initial = pro.name.trim().charAt(0).toUpperCase() || '?'
  const url = pro.avatarKey ? publicAvatarUrl(pro.avatarKey) : null
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-20 flex-col items-center gap-1.5 text-center focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--medi-secondary)]"
      aria-label={`Escuchar audio de ${pro.name}`}
    >
      {/* ponytail: outer span is the badge's positioning context and must NOT
          clip (overflow-visible) — the clip-count badge sits at -bottom-1
          -right-1, half outside the circle. The inner wrapper clips the photo
          to the circle instead. */}
      <span className="relative flex size-20 items-center justify-center rounded-full bg-gradient-to-br from-[var(--medi-primary)] to-[var(--medi-secondary)] text-2xl font-bold !text-white shadow-md transition-transform hover:scale-105">
        <span className="absolute inset-0 overflow-hidden rounded-full">
          {url ? (
            <img
              src={url}
              alt=""
              className="h-full w-full object-cover"
              loading="lazy"
            />
          ) : (
            <span className="flex h-full w-full items-center justify-center">
              {initial}
            </span>
          )}
        </span>
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
