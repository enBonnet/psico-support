import { createFileRoute, redirect, Link, useNavigate } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'
import { notify } from '#/lib/notifications'
import { track } from '#/lib/analytics-client'
import { APPOINTMENTS_ENABLED } from '#/lib/features'
import { Button } from '#/components/ui/button'
import { Skeleton } from '#/components/ui/skeleton'
import { getCurrentUser, getPublicProfessional } from '#/server/professionals'
import { getAvailableSlots, createAppointment } from '#/server/appointments'
import type { BookableSlot } from '#/server/appointments'
import { noindexHead } from '#/lib/seo'

export const Route = createFileRoute('/cuenta/sesiones/agendar/$proId')({
  beforeLoad: async ({ params }) => {
    // ponytail: gate the booking flow on the client feature flag. When off,
    // bounce to /cuenta so a deep link or stale tab doesn't strand the user.
    // The server fns also gate (the real security boundary), so even a direct
    // call can't create a booking.
    if (!APPOINTMENTS_ENABLED) {
      throw redirect({ to: '/cuenta' })
    }
    const user = await getCurrentUser()
    if (!user) {
      // ponytail: carry the booking path as callbackURL so /signup returns
      // the user here after auth (validated same-origin in the signup route).
      throw redirect({
        to: '/signup',
        search: { callbackURL: `/cuenta/sesiones/agendar/${params.proId}` },
      })
    }
  },
  // ponytail: CSR-only — auth-gated booking flow.
  ssr: false,
  head: noindexHead,
  component: AgendarPage,
})

// ponytail: format a slot start in the viewer's tz (browser default). The slot
// is stored as UTC ms; we render wall-clock time where the user actually is.
const timeFmt = new Intl.DateTimeFormat('es-VE', {
  hour: '2-digit', minute: '2-digit', hour12: true,
})
const dayKeyFmt = new Intl.DateTimeFormat('en-CA', {
  year: 'numeric', month: '2-digit', day: '2-digit',
})
const dayLabelFmt = new Intl.DateTimeFormat('es-VE', {
  weekday: 'long', day: 'numeric', month: 'long',
})

type DayGroup = { key: string; label: string; slots: BookableSlot[] }

function groupByDay(slots: BookableSlot[]): DayGroup[] {
  const map = new Map<string, DayGroup>()
  for (const s of slots) {
    const d = new Date(s.startMs)
    const key = dayKeyFmt.format(d)
    if (!map.has(key)) {
      map.set(key, { key, label: dayLabelFmt.format(d), slots: [] })
    }
    map.get(key)!.slots.push(s)
  }
  return [...map.values()]
}

// ponytail: a selection is the (startMs, durationMin) pair — two slots at the
// same start but different durations are distinct offerings. null = nothing
// selected yet.
type Selection = { startMs: number; durationMin: number }

function AgendarPage() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const proId = Number(Route.useParams().proId)
  const [selected, setSelected] = useState<Selection | null>(null)
  // ponytail: active duration tab. Defaults to the pro's first offered
  // duration once data loads (see the useMemo below). When the pro offers only
  // one duration, no tabs render and this stays at that single value.
  const [durationTab, setDurationTab] = useState<number | null>(null)

  const { data: me } = useQuery({
    queryKey: ['me'],
    queryFn: () => getCurrentUser(),
  })
  const { data: pro } = useQuery({
    queryKey: ['public-professional', proId],
    queryFn: () => getPublicProfessional({ data: { id: proId } }),
    enabled: Number.isFinite(proId) && proId > 0,
  })
  const { data, isLoading } = useQuery({
    queryKey: ['available-slots', proId],
    queryFn: () => getAvailableSlots({ data: { proId } }),
    enabled: !!me && Number.isFinite(proId) && proId > 0,
  })

  // ponytail: seed the duration tab from the pro's offered durations once
  // data arrives. Subsequent changes are user-driven.
  useEffect(() => {
    if (durationTab === null && data?.durations.length) {
      setDurationTab(data.durations[0])
    }
  }, [data?.durations, durationTab])

  const book = useMutation({
    mutationFn: (sel: Selection) =>
      createAppointment({
        data: { proId, startMs: sel.startMs, durationMin: sel.durationMin },
      }),
    onSuccess: () => {
      notify({
        type: 'success',
        title: '¡Videollamada agendada!',
        body: 'Te enviamos los detalles y el enlace por correo.',
        duration: 6000,
      })
      qc.invalidateQueries({ queryKey: ['my-appointments-client'] })
      navigate({ to: '/cuenta/sesiones' })
    },
    onError: (err: Error) =>
      notify({
        type: 'error',
        title: 'No se pudo agendar',
        body: err.message || 'Inténtalo de nuevo.',
      }),
  })

  // ponytail: filter slots to the active duration tab before grouping. The
  // server returns slots for all offered durations; the tab isolates one.
  const groups = useMemo(() => {
    if (!data?.slots || durationTab === null) return []
    const forTab = data.slots.filter((s) => s.durationMin === durationTab)
    return groupByDay(forTab)
  }, [data?.slots, durationTab])

  // Track funnel entry once per pro page mount — UNLESS the user just clicked
  // the "Agendar videollamada" CTA on the profile (which already fired the
  // event and set a sessionStorage flag). This avoids double-counting the
  // normal profile → agendar path. The flag is cleared after reading so a
  // manual reload of the agendar page DOES track (genuine re-entry).
  // ponytail: depend on me?.id (a stable primitive), NOT the me object —
  // React Query returns a fresh object on every refetch (window focus,
  // reconnect), which would re-run this effect and re-fire the intent event
  // after the sessionStorage flag was already consumed. The id only changes
  // when the actual signed-in user changes.
  const meId = me?.id
  useEffect(() => {
    if (!meId) return
    let alreadyTracked = false
    try {
      const key = `appt-intent:${proId}`
      if (sessionStorage.getItem(key)) {
        alreadyTracked = true
        sessionStorage.removeItem(key)
      }
    } catch {
      /* sessionStorage unavailable — track to avoid under-counting */
    }
    if (!alreadyTracked) {
      track({ event: 'appointment_intent', category: 'public', param1: String(proId), actorId: meId })
    }
  }, [meId, proId])

  const offeredDurations = data?.durations ?? []
  const showTabs = offeredDurations.length > 1
  const selectedLabel =
    selected === null
      ? 'Confirmar cita'
      : `Confirmar cita de ${selected.durationMin} min`

  return (
    <main className="page-wrap flex min-h-[100dvh] flex-col py-6">
      <Link
        to="/cuenta/sesiones"
        className="inline-flex items-center gap-1 self-start py-2 text-base font-medium text-[var(--medi-secondary)]"
        aria-label="Volver a mis videollamadas"
      >
        ‹ Mis videollamadas
      </Link>

      <h1 className="text-2xl font-bold text-[var(--medi-text-primary)]">
        Agendar videollamada
      </h1>
      <div className="section-underline mt-2" />
      {pro && (
        <p className="mt-3 text-sm text-[var(--medi-text-secondary)]">
          Con <strong className="text-[var(--medi-text-primary)]">{pro.name}</strong>
          {offeredDurations.length > 0 && (
            <> · sesiones de {offeredDurations.join(', ')} min</>
          )}
        </p>
      )}

      {isLoading ? (
        <div className="mt-4 flex flex-col gap-3" aria-busy="true">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      ) : !data ? null : data.reason === 'always' ? (
        <div className="glass-card-soft mt-6 rounded-[var(--glass-radius-sm)] p-6 text-center">
          <p className="font-semibold text-[var(--medi-text-primary)]">
            Este profesional está disponible ahora mismo
          </p>
          <p className="mt-1 text-sm text-[var(--medi-text-secondary)]">
            No ofrece agenda por horario. Escríbele directamente por WhatsApp para una atención inmediata.
          </p>
          {pro && (
            <Button asChild className="mt-4">
              <Link to="/ayuda/profesionales/$id" params={{ id: String(proId) }}>
                Ir al perfil
              </Link>
            </Button>
          )}
        </div>
      ) : data.reason === 'inactive' ? (
        <div className="glass-card-soft mt-6 rounded-[var(--glass-radius-sm)] p-6 text-center">
          <p className="font-semibold text-[var(--medi-text-primary)]">
            Este profesional no está disponible
          </p>
          <p className="mt-1 text-sm text-[var(--medi-text-secondary)]">
            Puedes buscar otro profesional o volver más tarde.
          </p>
        </div>
      ) : groups.length === 0 ? (
        <div className="glass-card-soft mt-6 rounded-[var(--glass-radius-sm)] p-6 text-center">
          <p className="font-semibold text-[var(--medi-text-primary)]">
            No hay horarios disponibles en los próximos días
          </p>
          <p className="mt-1 text-sm text-[var(--medi-text-secondary)]">
            Vuelve a revisar en unos días o busca otro profesional.
          </p>
        </div>
      ) : (
        <div className="mt-6 flex flex-col gap-5">
          {/* ponytail: duration tabs — only when the pro offers more than one
              length. Selecting a tab filters the day groups below to that
              duration. When only one duration is offered, no tabs render and
              the groups show all slots (which are all that duration anyway). */}
          {showTabs && (
            <div className="flex flex-wrap gap-2" role="tablist" aria-label="Duración de la sesión">
              {offeredDurations.map((d) => {
                const active = durationTab === d
                return (
                  <button
                    key={d}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => {
                      setDurationTab(d)
                      setSelected(null)
                    }}
                    className={
                      'min-h-9 rounded-full border px-3 py-1 text-xs font-medium transition-all ' +
                      (active
                        ? 'border-[var(--medi-secondary)] bg-[var(--medi-secondary)] text-white'
                        : 'border-[var(--medi-border)] text-[var(--medi-text-secondary)] hover:translate-y-[-1px]')
                    }
                  >
                    {d} min
                  </button>
                )
              })}
            </div>
          )}

          {groups.map((g) => (
            <div key={g.key}>
              <h2 className="mb-2 text-sm font-semibold capitalize text-[var(--medi-text-primary)]">
                {g.label}
              </h2>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                {g.slots.map((s) => {
                  // ponytail: a slot is selected if BOTH startMs and durationMin
                  // match — two slots at the same start but different durations
                  // are distinct. Assign to a local first so the linter doesn't
                  // flag the second optional chain as redundant narrowing.
                  const sel = selected
                  const isSel =
                    sel !== null &&
                    sel.startMs === s.startMs &&
                    sel.durationMin === s.durationMin
                  return (
                    <button
                      key={`${s.startMs}:${s.durationMin}`}
                      type="button"
                      onClick={() =>
                        setSelected({ startMs: s.startMs, durationMin: s.durationMin })
                      }
                      className={
                        'glass-card-soft rounded-[var(--glass-radius-sm)] px-2 py-3 text-center text-sm font-medium transition-all hover:translate-y-[-1px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--medi-secondary)] ' +
                        (isSel
                          ? '!bg-[var(--medi-primary)] !text-white'
                          : 'text-[var(--medi-text-primary)]')
                      }
                    >
                      {timeFmt.format(new Date(s.startMs))}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}

          <div className="sticky bottom-4 mt-2">
            <Button
              size="lg"
              className="w-full"
              disabled={selected === null || book.isPending}
              onClick={() => selected !== null && book.mutate(selected)}
            >
              {book.isPending ? 'Agendando…' : selectedLabel}
            </Button>
          </div>
        </div>
      )}
    </main>
  )
}
