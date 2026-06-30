import { useEffect, useRef, useState, useCallback } from 'react'
import { Link } from '@tanstack/react-router'
import { X, ChevronLeft, ChevronRight, Volume2, VolumeX } from 'lucide-react'

import type { StoryTrayPro } from '#/server/audio-stories'

// ponytail: IG-stories-style fullscreen audio viewer. The tray is hidden once
// the viewer opens (only the current clip shows); auto-advance runs clip→clip
// then pro→pro, then closes. Tap zones overlay the whole area (left third =
// prev, right third = next, center = pause/resume) — same muscle memory as IG.
// Mobile back-button is handled by pushing a history entry on mount: back
// (system gesture), the ✕ button, and Escape all call history.back(), which
// fires popstate → onClose. This keeps the browser history consistent (no
// stale entries if the user navigates away mid-story).

// ponytail: deterministic warm gradient per pro (no profile photos yet —
// gradient + initial is the avatar substitute). Keyed by proId so a given pro
// always gets the same background across sessions. Palette is calm/supportive,
// not the urgent reds of the medical chrome.
const GRADIENTS = [
  'linear-gradient(160deg, #4a4e69 0%, #9a8c98 100%)',
  'linear-gradient(160deg, #355070 0%, #6a7b8c 100%)',
  'linear-gradient(160deg, #5d4e6d 0%, #8a7090 100%)',
  'linear-gradient(160deg, #3d5a5a 0%, #7a9e9e 100%)',
  'linear-gradient(160deg, #6b5d4e 0%, #a8957c 100%)',
  'linear-gradient(160deg, #4e5d6b 0%, #7c8e9e 100%)',
]

function gradientFor(proId: number): string {
  return GRADIENTS[proId % GRADIENTS.length]
}

function initialOf(name: string): string {
  return name.trim().charAt(0).toUpperCase() || '?'
}

function modalityLabel(m: StoryTrayPro['modality']): string {
  return m === 'remote'
    ? 'Atención online'
    : m === 'both'
      ? 'Presencial y online'
      : 'Atención presencial'
}

export function AudioStoryViewer({
  tray,
  startPro,
  onClose,
}: {
  tray: StoryTrayPro[]
  startPro: number
  onClose: () => void
}) {
  const [proIndex, setProIndex] = useState(
    Math.max(0, Math.min(startPro, tray.length - 1)),
  )
  const [clipIndex, setClipIndex] = useState(0)
  const [progress, setProgress] = useState(0) // 0..1 within current clip
  const [paused, setPaused] = useState(false)
  const [muted, setMuted] = useState(false)
  const [needsTap, setNeedsTap] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const closedRef = useRef(false)

  const currentPro = tray[proIndex]
  const currentClip = currentPro.clips[clipIndex]

  // ponytail: one cleanup fn so every close path (button, Escape, back, last-
  // clip-ends) funnels through it. Guarded by closedRef so a double-close
  // (e.g. Escape after the ✕ already popped history) is a no-op.
  const close = useCallback(() => {
    if (closedRef.current) return
    closedRef.current = true
    onClose()
  }, [onClose])

  // ponytail: advance one clip; if the pro's set is exhausted, advance to the
  // next pro; if the tray is exhausted, close. Returns false when there's
  // nowhere to go (used by the prev/next tap logic).
  const goNext = useCallback(() => {
    if (closedRef.current) return
    const pro = tray[proIndex]
    if (clipIndex < pro.clips.length - 1) {
      setClipIndex((i) => i + 1)
      setProgress(0)
      return
    }
    if (proIndex < tray.length - 1) {
      setProIndex((i) => i + 1)
      setClipIndex(0)
      setProgress(0)
      return
    }
    close()
  }, [tray, proIndex, clipIndex, close])

  const goPrev = useCallback(() => {
    if (closedRef.current) return
    if (clipIndex > 0) {
      setClipIndex((i) => i - 1)
      setProgress(0)
      return
    }
    if (proIndex > 0) {
      setProIndex((i) => i - 1)
      setClipIndex(tray[proIndex - 1].clips.length - 1)
      setProgress(0)
    }
  }, [tray, proIndex, clipIndex])

  // ponytail: push a history entry on mount so the system back gesture closes
  // the viewer instead of leaving the app. popstate (back gesture OR our own
  // history.back() call from the ✕ / Escape) → close(). On unmount, if we got
  // here without popstate firing (parent removed us directly), pop the stale
  // entry so the history stack doesn't grow on each open.
  useEffect(() => {
    window.history.pushState({ audioStoryViewer: true }, '')
    const onPop = () => close()
    window.addEventListener('popstate', onPop)
    return () => {
      window.removeEventListener('popstate', onPop)
    }
  }, [close])

  // ponytail: Escape → history.back() (which fires popstate → close). Doing it
  // this way (instead of calling onClose directly) keeps the pushed history
  // entry consumed, so the next back gesture doesn't re-trigger anything.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') window.history.back()
      else if (e.key === 'ArrowRight') goNext()
      else if (e.key === 'ArrowLeft') goPrev()
      else if (e.key === ' ') {
        e.preventDefault()
        togglePause()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [goNext, goPrev])

  // ponytail: when the clip changes (advance / prev / initial), reset the
  // audio element and kick off playback. Reset paused to false so a new clip
  // plays even if the user paused the previous one — matches IG.
  useEffect(() => {
    setPaused(false)
    setProgress(0)
    const a = audioRef.current
    if (!a) return
    // ponytail: load() forces the new src even if the <audio> element is
    // reused across clips (same src would otherwise cache state).
    a.load()
    a.play().then(
      () => setNeedsTap(false),
      () => {
        // ponytail: autoplay blocked (no prior user gesture on this element,
        // or browser policy). Show a tap-to-play overlay. The opening tap on
        // the tray IS a gesture, but some browsers are stricter on the first
        // play() of a freshly-loaded src.
        setNeedsTap(true)
      },
    )
  }, [proIndex, clipIndex, currentClip])

  function togglePause() {
    const a = audioRef.current
    if (!a) return
    if (a.paused) {
      a.play().then(() => {
        setPaused(false)
        setNeedsTap(false)
      }, () => setNeedsTap(true))
    } else {
      a.pause()
      setPaused(true)
    }
  }

  function onTimeUpdate() {
    const a = audioRef.current
    if (!a || !Number.isFinite(a.duration) || a.duration === 0) return
    setProgress(Math.min(1, a.currentTime / a.duration))
  }

  function onEnded() {
    setProgress(1)
    goNext()
  }

  function tapZone(e: React.MouseEvent<HTMLDivElement>) {
    // ponytail: ignore taps that land on an interactive child (buttons, links,
    // the audio controls). These call stopPropagation in their own handlers,
    // but be defensive — a tap on the attribution link should navigate, not
    // advance.
    const target = e.target as HTMLElement
    if (target.closest('a, button, audio')) return
    const x = e.clientX
    const w = window.innerWidth
    if (x < w / 3) goPrev()
    else if (x > (2 * w) / 3) goNext()
    else togglePause()
  }

  // ponytail: invariant — the viewer is only mounted by the tray route when
  // tray is non-empty, and proIndex/clipIndex are always kept in bounds by
  // the advance/prev logic above + the clamped startPro. So currentPro and
  // currentClip are always defined; no defensive null-guard needed.
  return (
    <div
      className="fixed inset-0 z-[200] flex flex-col bg-black"
      role="dialog"
      aria-modal="true"
      aria-label={`Audio de ${currentPro.name}`}
    >
      {/* Background gradient (per-pro) */}
      <div
        className="absolute inset-0"
        style={{ background: gradientFor(currentPro.professionalId) }}
        aria-hidden="true"
      />

      {/* Tap zones overlay (left/center/right) */}
      <div
        className="absolute inset-0 flex"
        onClick={tapZone}
        aria-hidden="true"
      >
        <span className="h-full flex-1" />
        <span className="h-full flex-1" />
        <span className="h-full flex-1" />
      </div>

      {/* ── Top: progress segments + close ── */}
      <div className="relative z-10 flex items-center gap-1 px-3 pt-[max(env(safe-area-inset-top),0.75rem)]">
        <div className="flex flex-1 flex-col gap-1">
          <div className="flex gap-1">
            {currentPro.clips.map((c, i) => (
              <div
                key={c.id}
                className="h-1 flex-1 overflow-hidden rounded-full bg-white/30"
              >
                <div
                  className="h-full bg-white transition-[width] duration-200 ease-linear"
                  style={{
                    width:
                      i < clipIndex
                        ? '100%'
                        : i === clipIndex
                          ? `${Math.round(progress * 100)}%`
                          : '0%',
                  }}
                />
              </div>
            ))}
          </div>
          {/* Attribution row */}
          <div className="flex items-center justify-between pt-1">
            <Link
              to="/ayuda/profesionales/$id"
              params={{ id: String(currentPro.professionalId) }}
              onClick={() => window.history.back()}
              className="flex items-center gap-2 text-left"
            >
              <span className="flex size-9 items-center justify-center rounded-full bg-white/25 text-sm font-bold !text-white backdrop-blur-sm">
                {initialOf(currentPro.name)}
              </span>
              <span className="flex flex-col">
                <span className="text-sm font-semibold !text-white">
                  {currentPro.name}
                </span>
                <span className="text-[11px] text-white/75">
                  Psicólogo verificado · {modalityLabel(currentPro.modality)}
                </span>
              </span>
            </Link>
            <button
              type="button"
              onClick={() => window.history.back()}
              aria-label="Cerrar"
              className="rounded-full p-2 text-white/90 transition-colors hover:bg-white/15"
            >
              <X className="size-6" />
            </button>
          </div>
        </div>
      </div>

      {/* ── Center: title overlay + big initial avatar ── */}
      <div className="relative z-0 flex flex-1 flex-col items-center justify-center px-6 text-center">
        <div className="pointer-events-none mb-4 flex size-24 items-center justify-center rounded-full bg-white/15 text-4xl font-bold !text-white backdrop-blur-sm">
          {initialOf(currentPro.name)}
        </div>
        {currentClip.title && (
          <p className="pointer-events-none max-w-md text-lg font-medium !text-white">
            {currentClip.title}
          </p>
        )}
        {paused && (
          <p className="pointer-events-none mt-4 text-sm !text-white/80">
            En pausa — toca el centro para seguir
          </p>
        )}
        {needsTap && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              togglePause()
            }}
            className="glass-primary mt-4 rounded-full px-5 py-2 text-sm font-semibold !text-white"
          >
            Toca para escuchar
          </button>
        )}
      </div>

      {/* ── Bottom: controls (mute / prev / pause / next) ── */}
      <div className="relative z-10 flex items-center justify-center gap-3 pb-[max(env(safe-area-inset-bottom),1rem)] pt-2">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            goPrev()
          }}
          disabled={proIndex === 0 && clipIndex === 0}
          aria-label="Anterior"
          className="rounded-full p-2 text-white/90 transition-colors hover:bg-white/15 disabled:opacity-30"
        >
          <ChevronLeft className="size-6" />
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            togglePause()
          }}
          aria-label={paused ? 'Reproducir' : 'Pausar'}
          className="rounded-full p-3 text-white/90 transition-colors hover:bg-white/15"
        >
          {paused ? (
            <svg
              viewBox="0 0 24 24"
              fill="currentColor"
              className="size-6"
              aria-hidden="true"
            >
              <path d="M8 5v14l11-7z" />
            </svg>
          ) : (
            <svg
              viewBox="0 0 24 24"
              fill="currentColor"
              className="size-6"
              aria-hidden="true"
            >
              <path d="M6 5h4v14H6zM14 5h4v14h-4z" />
            </svg>
          )}
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            setMuted((m) => !m)
            if (audioRef.current) audioRef.current.muted = !muted
          }}
          aria-label={muted ? 'Activar sonido' : 'Silenciar'}
          className="rounded-full p-2 text-white/90 transition-colors hover:bg-white/15"
        >
          {muted ? (
            <VolumeX className="size-6" />
          ) : (
            <Volume2 className="size-6" />
          )}
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            goNext()
          }}
          aria-label="Siguiente"
          className="rounded-full p-2 text-white/90 transition-colors hover:bg-white/15"
        >
          <ChevronRight className="size-6" />
        </button>
      </div>

      {/* ponytail: the actual audio element is invisible — the UI drives it
          via ref. src changes per clip; the effect above calls load() + play()
          on clip change. muted is mirrored into the element on toggle. */}
      <audio
        ref={audioRef}
        src={currentClip.url}
        onTimeUpdate={onTimeUpdate}
        onEnded={onEnded}
        onPause={() => setPaused(true)}
        onPlay={() => setPaused(false)}
        className="hidden"
        preload="auto"
      />
    </div>
  )
}
