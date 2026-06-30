import { useEffect, useState } from 'react'
import { Download, Share, X } from 'lucide-react'

// ponytail: BeforeInstallPromptEvent isn't in the TS DOM lib (still
// Chromium-only as of 2025). Minimal shape — platforms/toUUID omitted since we
// never read them. If it standardizes, drop this and use the lib type.
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const DISMISS_KEY = 'install-prompt-dismissed-v1'

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  // navigator.standalone is iOS Safari's signal (no BeforeInstallPrompt).
  const nav = navigator as Navigator & { standalone?: boolean }
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    nav.standalone === true
  )
}

// ponytail: iOS Safari never fires beforeinstallprompt (Apple doesn't allow
// programmatic install). Detect it so we can show the static "tap Share →
// Add to Home Screen" hint instead of a dead button. iPadOS reports as Mac,
// hence the touch-points check. Ceiling: misses third-party iOS browsers that
// themselves support install — rare, and they'd just see no card.
function isIOSSafari(): boolean {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent
  const isIOS =
    /iPhone|iPad|iPod/.test(ua) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  return isIOS && /WebKit/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua)
}

function readDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISS_KEY) === '1'
  } catch {
    return false
  }
}

export interface InstallPromptState {
  visible: boolean
  ios: boolean
  promptInstall: () => Promise<void>
  dismiss: () => void
}

// ponytail: hook owns all three installability signals (deferred prompt,
// installed state, iOS hint). The home page just reads .visible. One source
// of truth so the same logic could back a banner in __root later without
// re-detecting.
export function useInstallPrompt(): InstallPromptState {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(
    null,
  )
  const [ios, setIos] = useState(false)
  const [dismissed, setDismissed] = useState(false)
  const [installed, setInstalled] = useState(false)

  useEffect(() => {
    setDismissed(readDismissed())
    setInstalled(isStandalone())
    setIos(isIOSSafari())

    const onBip = (e: Event) => {
      e.preventDefault()
      setDeferred(e as BeforeInstallPromptEvent)
    }
    const onInstalled = () => {
      setDeferred(null)
      setInstalled(true)
    }
    window.addEventListener('beforeinstallprompt', onBip)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onBip)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  const visible = !installed && !dismissed && (deferred !== null || ios)

  return {
    visible,
    ios,
    promptInstall: async () => {
      if (!deferred) return
      await deferred.prompt()
      await deferred.userChoice
      setDeferred(null)
    },
    dismiss: () => {
      try {
        localStorage.setItem(DISMISS_KEY, '1')
      } catch {
        // private mode — just hide for this session
      }
      setDismissed(true)
    },
  }
}

// ponytail: one card, two affordances — Chromium shows the Install button
// (promptInstall), iOS shows the Share hint. Same dismiss X for both.
// Rendered on the home page as a low-key alternative to the two primary CTAs.
export function InstallCard() {
  const { visible, ios, promptInstall, dismiss } = useInstallPrompt()
  if (!visible) return null

  return (
    <div className="glass-card-soft mt-6 flex items-center gap-3 rounded-[var(--glass-radius-sm)] px-4 py-3 rise-in">
      {ios ? (
        <Share className="size-5 shrink-0 text-[var(--medi-secondary)]" />
      ) : (
        <Download className="size-5 shrink-0 text-[var(--medi-secondary)]" />
      )}
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-[var(--medi-primary)]">
          Instalar app
        </p>
        <p className="truncate text-xs text-[var(--medi-text-secondary)]">
          {ios
            ? 'Toca Compartir → Agregar a pantalla de inicio'
            : 'Acceso rápido y uso sin conexión'}
        </p>
      </div>
      {!ios && (
        <button
          type="button"
          onClick={promptInstall}
          className="shrink-0 rounded-[var(--glass-radius-pill)] bg-[var(--medi-primary)] px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-[var(--medi-primary-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--medi-secondary)]"
        >
          Instalar
        </button>
      )}
      <button
        type="button"
        onClick={dismiss}
        aria-label="Cerrar sugerencia"
        className="flex shrink-0 size-7 items-center justify-center rounded-full text-[var(--medi-text-secondary)] opacity-70 transition-opacity hover:opacity-100"
      >
        <X className="size-4" />
      </button>
    </div>
  )
}
