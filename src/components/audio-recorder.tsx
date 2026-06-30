import { useEffect, useRef, useState } from 'react'

import type { StoryAudioMime } from '#/server/audio-stories'

// ponytail: pure value/onChange component (no TanStack Form generics —
// mirrors CertificateInput in professional-form.tsx so it can be consumed by
// any form without the `any` escape a form-aware component would need).
// Two capture modes: in-browser MediaRecorder (no lib, native) and file
// upload fallback. Both produce the same value shape the uploadMyStory server
// fn expects.

export type StoryAudioValue = {
  mime: StoryAudioMime
  durationSec: number
  data: string // base64 (no data: prefix)
}

// ponytail: keep these in sync with the server (src/server/audio-stories.ts).
// The server re-validates, so a mismatch is a UX hint, not a security hole.
const ALLOWED_MIME: ReadonlySet<StoryAudioMime> = new Set<StoryAudioMime>([
  'audio/webm',
  'audio/mp4',
  'audio/mpeg',
  'audio/ogg',
])
const MAX_SECONDS = 180
const MAX_BYTES = 3 * 1024 * 1024
const TARGET_SECONDS = 90

type Phase = 'idle' | 'recording' | 'captured' | 'error'

// ponytail: MediaRecorder + isTypeSupported aren't in every browser (Safari
// <14.1, older iOS), and the DOM lib types them as always-present. Feature-
// detect at module scope so the UI can hide the Record button up-front
// instead of failing mid-flow. SSR-safe (runs in module scope during SSR —
// guard with typeof check).
const supportsMediaRecorder =
  typeof window !== 'undefined' &&
  typeof MediaRecorder !== 'undefined' &&
  typeof navigator !== 'undefined' &&
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  (navigator.mediaDevices != null) &&
  typeof navigator.mediaDevices.getUserMedia === 'function'

// ponytail: MediaRecorder may report a codec-suffixed mime like
// "audio/webm;codecs=opus" — strip the params so we match ALLOWED_MIME (and
// the server enum). Always lowercased + trimmed for honest comparison.
function normalizeMime(raw: string): string {
  return (raw.split(';')[0] ?? '').trim().toLowerCase()
}

// ponytail: pick the best mime the browser will record. WebM/Opus is the
// speech-optimized default (Chrome/Firefox); Safari only offers MP4/AAC.
// Returns '' to let the browser choose its default if none of ours match.
function pickRecordMime(): string {
  if (typeof window === 'undefined' || typeof MediaRecorder === 'undefined')
    return ''
  const candidates = ['audio/webm', 'audio/mp4', 'audio/mpeg']
  for (const c of candidates) {
    try {
      if (MediaRecorder.isTypeSupported(c)) return c
    } catch {
      /* isTypeSupported can throw on exotic mimes; try the next */
    }
  }
  return ''
}

function fmtTime(sec: number): string {
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

export function AudioRecorder({
  value,
  onChange,
}: {
  value: StoryAudioValue | null
  onChange: (v: StoryAudioValue | null) => void
}) {
  const [phase, setPhase] = useState<Phase>('idle')
  const [elapsed, setElapsed] = useState(0)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const startedAtRef = useRef(0)

  // ponytail: stop every MediaStreamTrack on teardown so the mic indicator
  // light turns off — failing to stop tracks is the #1 MediaRecorder leak.
  function stopStream() {
    if (streamRef.current) {
      for (const t of streamRef.current.getTracks()) t.stop()
      streamRef.current = null
    }
  }
  function clearTimer() {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
  }

  useEffect(() => {
    // ponytail: if we unmount mid-recording (user navigates away), stop the
    // mic + timer. The recorder's onstop won't fire after teardown; that's
    // fine — an abandoned recording is dropped, not uploaded.
    return () => {
      clearTimer()
      stopStream()
      // ponytail: if we unmount mid-recording, stop the recorder so its
      // onstop doesn't fire after teardown and try to setState on a gone
      // component. An abandoned recording is dropped, not uploaded.
      try {
        if (
          recorderRef.current &&
          recorderRef.current.state !== 'inactive'
        ) {
          recorderRef.current.stop()
        }
      } catch {
        /* ignore */
      }
    }
  }, [])

  async function startRecording() {
    setErrorMsg(null)
    if (!supportsMediaRecorder) {
      setErrorMsg(
        'Tu navegador no permite grabar aquí. Usa “Subir archivo” en su lugar.',
      )
      setPhase('error')
      return
    }
    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: false,
      })
    } catch {
      setErrorMsg(
        'No pudimos acceder al micrófono. Revisa los permisos del navegador o sube un archivo.',
      )
      setPhase('error')
      return
    }
    streamRef.current = stream

    const mime = pickRecordMime()
    let recorder: MediaRecorder
    try {
      recorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream)
    } catch {
      stopStream()
      setErrorMsg('No pudimos iniciar la grabación. Sube un archivo en su lugar.')
      setPhase('error')
      return
    }
    recorderRef.current = recorder
    chunksRef.current = []
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data)
    }
    recorder.onstop = () => {
      // ponytail: prefer the recorder's actual mime (may differ from the
      // requested one on exotic browsers). Fall back to the first chunk's
      // type, then to the requested mime, then to a generic. Strip codec
      // params (e.g. "audio/webm;codecs=opus") via normalizeMime.
      const rawType =
        recorder.mimeType || chunksRef.current[0]?.type || mime || 'audio/webm'
      const blob = new Blob(chunksRef.current, { type: normalizeMime(rawType) })
      stopStream()
      finalizeBlob(blob)
    }

    startedAtRef.current = Date.now()
    setElapsed(0)
    setPhase('recording')
    recorder.start()
    timerRef.current = setInterval(() => {
      const sec = Math.floor((Date.now() - startedAtRef.current) / 1000)
      setElapsed(sec)
      if (sec >= MAX_SECONDS) stopRecording()
    }, 250)
  }

  function stopRecording() {
    clearTimer()
    const r = recorderRef.current
    if (r && r.state !== 'inactive') {
      try {
        r.stop()
      } catch {
        /* ignore */
      }
    }
  }

  // ponytail: shared finalize for both record + upload paths. Reads the blob
  // as base64, validates size, computes duration (recorded = wall clock;
  // uploaded = decoded from <audio> metadata before this fn is called).
  function finalizeBlob(blob: Blob, durationOverride?: number) {
    const mime = normalizeMime(blob.type) as StoryAudioMime
    if (!ALLOWED_MIME.has(mime)) {
      setErrorMsg('Formato no soportado. Usa WebM, MP4, MP3 u OGG.')
      setPhase('error')
      return
    }
    if (blob.size > MAX_BYTES) {
      setErrorMsg('El audio supera los 3 MB. Graba un fragmento más corto.')
      setPhase('error')
      return
    }
    const reader = new FileReader()
    reader.onerror = () => {
      setErrorMsg('No se pudo leer el audio.')
      setPhase('error')
    }
    reader.onload = () => {
      const result = String(reader.result ?? '')
      const comma = result.indexOf(',')
      const data = comma >= 0 ? result.slice(comma + 1) : result
      const durationSec =
        durationOverride ??
        (Math.floor((Date.now() - startedAtRef.current) / 1000) || 1)
      onChange({ mime, durationSec, data })
      setPhase('captured')
    }
    reader.readAsDataURL(blob)
  }

  async function onFile(file: File | undefined) {
    if (!file) return
    setErrorMsg(null)
    const mime = normalizeMime(file.type) as StoryAudioMime
    if (!ALLOWED_MIME.has(mime)) {
      setErrorMsg('Formato no soportado. Usa WebM, MP4, MP3 u OGG.')
      setPhase('error')
      return
    }
    if (file.size > MAX_BYTES) {
      setErrorMsg('El archivo supera los 3 MB.')
      setPhase('error')
      return
    }
    // ponytail: read duration by loading metadata into a detached <audio>.
    // Have to read it before finalizing so durationSec lands in the value.
    const durationSec = await readDuration(file)
    if (durationSec > MAX_SECONDS) {
      setErrorMsg(`El audio dura más de ${MAX_SECONDS} segundos.`)
      setPhase('error')
      return
    }
    finalizeBlob(file, durationSec || 1)
  }

  function clear() {
    onChange(null)
    setPhase('idle')
    setElapsed(0)
    setErrorMsg(null)
  }

  // ── captured (have a value) ──
  if (value && phase === 'captured') {
    // ponytail: object URL is cheaper than re-base64-decoding for preview;
    // we already have the value locked in onChange so a revoke on unmount is
    // fine. Re-create per render is wasteful — memoize in a ref keyed by data
    // length to avoid churn on re-renders.
    return <CapturedPreview value={value} onClear={clear} onRedo={clear} />
  }

  if (phase === 'recording') {
    const overTarget = elapsed >= TARGET_SECONDS
    const nearMax = elapsed >= MAX_SECONDS - 30
    return (
      <div className="flex flex-col gap-2">
        <div className="glass-input flex h-14 items-center justify-between gap-3 px-4">
          <span className="flex items-center gap-2 text-sm font-medium text-red-600">
            <span className="size-2.5 animate-pulse rounded-full bg-red-500" />
            Grabando
          </span>
          <span
            className={`text-sm font-mono font-semibold tabular-nums ${
              nearMax
                ? 'text-red-600'
                : overTarget
                  ? 'text-amber-600'
                  : 'text-[var(--medi-text-primary)]'
            }`}
          >
            {fmtTime(elapsed)} / 3:00
          </span>
          <button
            type="button"
            onClick={stopRecording}
            className="glass-primary rounded-[var(--glass-radius-sm)] px-3 py-1.5 text-sm font-semibold !text-white"
          >
            Detener
          </button>
        </div>
        <p className="text-xs text-[var(--medi-text-secondary)]">
          Idealmente 1:30. Se detiene solo a los 3:00.
        </p>
      </div>
    )
  }

  // ── idle / error ──
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col gap-2 sm:flex-row">
        {supportsMediaRecorder && (
          <button
            type="button"
            onClick={startRecording}
            className="glass-primary flex min-h-12 flex-1 items-center justify-center gap-2 rounded-[var(--glass-radius-sm)] px-4 py-2 text-sm font-semibold !text-white transition-all hover:translate-y-[-1px]"
          >
            <span className="size-2.5 rounded-full bg-white/90" />
            Grabar
          </button>
        )}
        <label className="glass-card-soft flex min-h-12 flex-1 cursor-pointer items-center justify-center gap-2 rounded-[var(--glass-radius-sm)] px-4 py-2 text-sm font-semibold text-[var(--medi-primary)] transition-all hover:translate-y-[-1px]">
          Subir archivo
          <input
            type="file"
            accept="audio/webm,audio/mp4,audio/mpeg,audio/ogg"
            onChange={(e) => onFile(e.target.files?.[0])}
            className="hidden"
          />
        </label>
      </div>
      {errorMsg && (
        <p className="glass-card-soft rounded-[var(--glass-radius-sm)] px-3 py-2 text-sm text-red-700">
          {errorMsg}
        </p>
      )}
      <p className="text-xs text-[var(--medi-text-secondary)]">
        Mensaje corto de apoyo: 1–3 min (idealmente 1:30). Máx. 3 MB. WebM,
        MP4, MP3 u OGG.
      </p>
    </div>
  )
}

// ponytail: separate component so the preview URL is memoized by value
// identity, not recreated on every parent re-render. Revoke on unmount or
// when the value changes to avoid leaking object URLs.
function CapturedPreview({
  value,
  onClear,
  onRedo,
}: {
  value: StoryAudioValue
  onClear: () => void
  onRedo: () => void
}) {
  const urlRef = useRef<string | null>(null)
  const keyRef = useRef<string>('')
  const key = `${value.mime}:${value.data.length}`
  if (key !== keyRef.current) {
    if (urlRef.current) URL.revokeObjectURL(urlRef.current)
    const bin = atob(value.data)
    const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    urlRef.current = URL.createObjectURL(new Blob([bytes], { type: value.mime }))
    keyRef.current = key
  }
  useEffect(() => {
    return () => {
      if (urlRef.current) URL.revokeObjectURL(urlRef.current)
    }
  }, [])
  return (
    <div className="flex flex-col gap-2">
      <audio
        controls
        src={urlRef.current ?? undefined}
        className="w-full"
        aria-label="Vista previa del audio"
      />
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onRedo}
          className="glass-card-soft min-h-11 flex-1 rounded-[var(--glass-radius-sm)] px-3 py-2 text-sm font-semibold text-[var(--medi-primary)]"
        >
          Grabar de nuevo
        </button>
        <button
          type="button"
          onClick={onClear}
          className="min-h-11 flex-1 rounded-[var(--glass-radius-sm)] border border-red-300 px-3 py-2 text-sm font-semibold text-red-700"
        >
          Quitar
        </button>
      </div>
    </div>
  )
}

// ponytail: read a File's duration by loading metadata into a detached
// <audio>. Resolves 0 if metadata is unreadable (some WebM/Opom encodings
// lack a fast-start duration header) — caller falls back to 1s so the row is
// still valid; the server re-validates the ceiling from the client-reported
// value (not a security boundary since it's the pro's own content).
function readDuration(file: File): Promise<number> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file)
    const audio = document.createElement('audio')
    audio.preload = 'metadata'
    let done = false
    const finish = (v: number) => {
      if (done) return
      done = true
      URL.revokeObjectURL(url)
      resolve(v)
    }
    audio.onloadedmetadata = () => finish(Math.floor(audio.duration) || 0)
    audio.onerror = () => finish(0)
    // ponytail: belt-and-braces timeout — some encodings never fire
    // loadedmetadata; don't hang the upload flow waiting.
    setTimeout(() => finish(0), 4000)
    audio.src = url
  })
}
