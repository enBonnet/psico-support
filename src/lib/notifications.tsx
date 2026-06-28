import { Store, useStore } from '@tanstack/react-store'
import { CheckCircle2, Info, AlertTriangle, XCircle, X } from 'lucide-react'

// ponytail: iOS-style fire-and-forget notifications. Ephemeral — no DB, no
// persistence. notify() from anywhere pushes onto a queue; a top-mounted
// stack renders glass banners that drop in, auto-dismiss, and swipe/tap
// away. Max 4 visible (oldest dropped) so a flood can't bury the UI.
// Upgrade path: if cross-user delivery (admin→pro while offline) is needed,
// add a `notifications` table + a fetchUnread server fn and emit on write;
// the notify() surface stays the same.

export type NotificationType = 'info' | 'success' | 'warning' | 'error'

export interface AppNotification {
  id: number
  type: NotificationType
  title: string
  body?: string
  duration: number // ms; 0 = sticky (won't auto-dismiss)
}

interface NotifState {
  items: AppNotification[]
  // ponytail: ids mid-exit-animation; kept in the DOM until the slide-up
  // finishes so dismissal reads as iOS, not a snap-disappear.
  leaving: number[]
}

const MAX_VISIBLE = 4
const DEFAULT_DURATION = 5000
const EXIT_MS = 320

export const notificationStore = new Store<NotifState>({
  items: [],
  leaving: [],
})

let _seq = 1

export function notify(input: {
  type?: NotificationType
  title: string
  body?: string
  duration?: number
}): number {
  const item: AppNotification = {
    id: _seq++,
    type: input.type ?? 'info',
    title: input.title,
    body: input.body,
    duration: input.duration ?? DEFAULT_DURATION,
  }
  notificationStore.setState((s) => ({
    ...s,
    items: [...s.items, item].slice(-MAX_VISIBLE),
  }))
  if (item.duration > 0) {
    setTimeout(() => dismiss(item.id), item.duration)
  }
  return item.id
}

export function dismiss(id: number): void {
  const s = notificationStore.state
  if (!s.items.some((i) => i.id === id) || s.leaving.includes(id)) return
  notificationStore.setState((st) => ({
    ...st,
    leaving: [...st.leaving, id],
  }))
  setTimeout(() => {
    notificationStore.setState((st) => ({
      items: st.items.filter((i) => i.id !== id),
      leaving: st.leaving.filter((x) => x !== id),
    }))
  }, EXIT_MS)
}

const ICONS: Record<NotificationType, React.FC<{ className?: string }>> = {
  success: CheckCircle2,
  info: Info,
  warning: AlertTriangle,
  error: XCircle,
}

const ACCENT: Record<NotificationType, string> = {
  success: 'var(--notif-success)',
  info: 'var(--medi-secondary)',
  warning: 'var(--notif-warning)',
  error: 'var(--notif-error)',
}

export function NotificationStack() {
  const items = useStore(notificationStore, (s) => s.items)
  const leaving = useStore(notificationStore, (s) => s.leaving)

  if (items.length === 0) return null

  return (
    <div
      className="notif-stack"
      role="region"
      aria-label="Notificaciones"
      aria-live="polite"
    >
      {items.map((n) => {
        const Icon = ICONS[n.type]
        const isLeaving = leaving.includes(n.id)
        return (
          <div
            key={n.id}
            className={`notif-banner glass-card${
              isLeaving ? ' is-leaving' : ''
            }`}
            style={
              {
                '--notif-accent': ACCENT[n.type],
              } as React.CSSProperties
            }
            role="status"
            onClick={() => dismiss(n.id)}
          >
            <span className="notif-icon" style={{ color: ACCENT[n.type] }}>
              <Icon className="size-6" />
            </span>
            <div className="notif-content">
              <p className="notif-title">{n.title}</p>
              {n.body && <p className="notif-body">{n.body}</p>}
            </div>
            <button
              type="button"
              className="notif-close"
              aria-label="Cerrar notificación"
              onClick={(e) => {
                e.stopPropagation()
                dismiss(n.id)
              }}
            >
              <X className="size-4" />
            </button>
          </div>
        )
      })}
    </div>
  )
}
