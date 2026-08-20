import { createFileRoute, redirect, Link } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { notify } from '#/lib/notifications'
import { track } from '#/lib/analytics-client'
import { Skeleton } from '#/components/ui/skeleton'
import { Button } from '#/components/ui/button'
import {
  getMyProfessional,
  getCurrentUser,
  setAvailabilityMode,
  COMMON_TIMEZONES,
  defaultTimezoneForCountry,
  WEEKDAY_LABEL_ES,
} from '#/server/professionals'
import type {
  ScheduleSlot,
  AvailabilityMode,
} from '#/server/professionals'
import { FieldShell, inputCls } from '#/components/professional-form'
import { noindexHead } from '#/lib/seo'

export const Route = createFileRoute('/profesional/disponibilidad')({
  beforeLoad: async () => {
    const user = await getCurrentUser()
    if (!user) {
      throw redirect({ to: '/profesional/login' })
    }
  },
  // ponytail: CSR-only — auth-gated, no crawler value. Split out of the panel
  // so the hub stays a simple menu.
  ssr: false,
  head: noindexHead,
  component: DisponibilidadPage,
})

type MyPro = Awaited<ReturnType<typeof getMyProfessional>>

function DisponibilidadPage() {
  const { data: me, isLoading } = useQuery({
    queryKey: ['my-professional'],
    queryFn: () => getMyProfessional(),
  })
  const { data: user } = useQuery({
    queryKey: ['me'],
    queryFn: () => getCurrentUser(),
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
        Disponibilidad
      </h1>
      <div className="section-underline mt-2" />
      <p className="mt-3 text-sm text-[var(--medi-text-secondary)]">
        Cómo y cuándo apareces para los pacientes en el directorio.
      </p>

      {isLoading && (
        <div className="mt-4 flex flex-col gap-3" aria-busy="true">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      )}

      {me && (
        <>
          {/* ponytail: content-only pros don't provide direct service — show the
              collaborator note instead of the availability controls. */}
          {me.providesService === false ? (
            <div className="glass-card-soft mt-6 rounded-[var(--glass-radius-sm)] p-5 text-center text-sm text-[var(--medi-text-secondary)]">
              <p className="font-semibold text-[var(--medi-primary)]">
                Colaborador de contenido
              </p>
              <p className="mt-1">
                Aportas audios a Voces que acompañan. No apareces en el
                directorio de servicio.
              </p>
            </div>
          ) : (
            <>
              {me.verifiedStatus !== 'verified' && (
                <p className="glass-card-soft mt-4 rounded-[var(--glass-radius-sm)] bg-amber-50/60 px-3 py-2 text-sm text-amber-800">
                  Tu credencial está en revisión. Puedes configurar tu
                  disponibilidad ahora, pero se activará cuando un
                  administrador apruebe tu registro.
                </p>
              )}
              <AvailabilitySection me={me} actorId={user?.id} />
            </>
          )}
        </>
      )}
    </main>
  )
}

// ponytail: minutes ↔ "HH:MM" for the schedule grid's <input type="time">.
function minToTime(m: number): string {
  const h = Math.floor(m / 60)
  const mm = m % 60
  return `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`
}
function timeToMin(t: string): number {
  const [h, m] = t.split(':').map(Number)
  if (!Number.isFinite(h) || !Number.isFinite(m)) return 0
  return Math.min(1440, Math.max(0, h * 60 + m))
}

const AVAILABILITY_MODE_OPTIONS: { value: AvailabilityMode; label: string }[] = [
  { value: 'always', label: 'Siempre disponible' },
  { value: 'scheduled', label: 'Por horario' },
  { value: 'inactive', label: 'No disponible' },
]

// ponytail: duration toggle options for video-call bookings. Values are
// strings to match setAvailabilityModeSchema's zod enum; labels are the
// Spanish display. Mirrors APPOINTMENT_DURATION_OPTIONS in the server fn.
const DURATION_OPTIONS: { value: string; label: string }[] = [
  { value: '15', label: '15 min' },
  { value: '30', label: '30 min' },
  { value: '45', label: '45 min' },
  { value: '60', label: '60 min' },
]

// ponytail: three-state availability (F1). Replaces the old ON/OFF toggle.
// 'always'/'inactive' are one-tap; 'scheduled' reveals a weekly grid of
// {start,end} slots per day + a timezone select. Plain controlled state (like
// SocialsSection); setAvailabilityMode persists + sets `available` server-side.
function AvailabilitySection({
  me,
  actorId,
}: {
  me: NonNullable<MyPro>
  actorId?: string
}) {
  const qc = useQueryClient()
  const initialTz = me.timezone ?? defaultTimezoneForCountry(me.country)
  const [mode, setMode] = useState<AvailabilityMode>(me.availabilityMode)
  const [slots, setSlots] = useState<ScheduleSlot[]>(me.availabilitySchedule)
  const [timezone, setTimezone] = useState(initialTz)
  // ponytail: durations the pro offers for video-call bookings. Stored as
  // strings ('15','30','45','60') to match the zod enum in
  // setAvailabilityModeSchema. Seeded from me.appointmentDurations (numbers),
  // converted to strings. parseAppointmentDurations already defaults to [45]
  // on empty/garbage, so this is always a non-empty array.
  const initialDurations = me.appointmentDurations.map(String)
  const [durations, setDurations] = useState<string[]>(initialDurations)

  const save = useMutation({
    mutationFn: (vars: {
      mode: AvailabilityMode
      schedule: ScheduleSlot[]
      timezone: string
      durations: Array<'15' | '30' | '45' | '60'>
    }) => setAvailabilityMode({ data: vars }),
    onSuccess: () => {
      if (actorId) {
        track({ event: 'availability_save', category: 'pro', actorId })
      }
      qc.invalidateQueries({ queryKey: ['my-professional'] })
      notify({ type: 'success', title: 'Disponibilidad guardada' })
    },
    onError: () =>
      notify({
        type: 'error',
        title: 'No se pudo guardar',
        body: 'Inténtalo de nuevo.',
      }),
  })

  // ponytail: only dirty if the mode changed, or (in scheduled mode) slots/tz/
  // durations changed. Switching to always/inactive discards the grid server-
  // side, so slot edits don't count when not in scheduled mode. Durations
  // persist across mode switches server-side, but only count toward dirty in
  // scheduled mode (the only mode where they're editable + meaningful).
  const dirty =
    mode !== me.availabilityMode ||
    (mode === 'scheduled' &&
      (JSON.stringify(slots) !== JSON.stringify(me.availabilitySchedule) ||
        timezone !== initialTz ||
        JSON.stringify(durations) !== JSON.stringify(initialDurations)))

  function submit() {
    // ponytail: never send an empty durations array — the schema refine
    // rejects it, and a pro who cleared all toggles should keep the default
    // rather than fail the save. The filter narrows state strings to the
    // schema's literal union (state is only ever fed from the option list or
    // the server-parsed column, both already constrained).
    const safeDurations = durations.length ? durations : ['45']
    save.mutate({
      mode,
      schedule: mode === 'scheduled' ? slots : [],
      timezone,
      durations: (mode === 'scheduled' ? safeDurations : ['45']).filter(
        (d): d is '15' | '30' | '45' | '60' =>
          ['15', '30', '45', '60'].includes(d),
      ),
    })
  }

  // ponytail: Mon-first display order (d=0 is Domingo).
  const DAYS_MON_FIRST = [1, 2, 3, 4, 5, 6, 0]
  function addSlot(day: number) {
    setSlots((s) => [...s, { d: day, s: 540, e: 1020 }])
  }
  function updateSlot(flatIndex: number, patch: Partial<ScheduleSlot>) {
    setSlots((s) =>
      s.map((sl, i) => (i === flatIndex ? { ...sl, ...patch } : sl)),
    )
  }
  function removeSlot(flatIndex: number) {
    setSlots((s) => s.filter((_, i) => i !== flatIndex))
  }

  return (
    <section className="glass-card-soft mt-6 rounded-[var(--glass-radius-sm)] p-4">
      <div className="mt-1 grid grid-cols-3 gap-2">
        {AVAILABILITY_MODE_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            aria-pressed={mode === opt.value}
            onClick={() => {
              if (actorId && mode !== opt.value) {
                track({
                  event: 'availability_mode_change',
                  category: 'pro',
                  actorId,
                  param1: opt.value,
                })
              }
              setMode(opt.value)
            }}
            className={
              'min-h-11 rounded-[var(--glass-radius-sm)] border px-2 py-2 text-xs font-medium transition-all ' +
              (mode === opt.value
                ? 'border-[var(--medi-secondary)] bg-[var(--medi-secondary)] text-white'
                : 'border-[var(--medi-border)] text-[var(--medi-text-secondary)] hover:translate-y-[-1px]')
            }
          >
            {opt.label}
          </button>
        ))}
      </div>

      {mode === 'always' && (
        <p className="mt-3 text-sm text-[var(--medi-text-secondary)]">
          Apareces siempre como disponible.
        </p>
      )}
      {mode === 'inactive' && (
        <p className="mt-3 text-sm text-[var(--medi-text-secondary)]">
          No apareces en el directorio hasta que vuelvas a activarte.
        </p>
      )}

      {mode === 'scheduled' && (
        <div className="mt-3 flex flex-col gap-2">
          <FieldShell label="Zona horaria" errors={[]}>
            <select
              className={inputCls}
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
            >
              {COMMON_TIMEZONES.map((tz) => (
                <option key={tz} value={tz}>
                  {tz}
                </option>
              ))}
            </select>
          </FieldShell>

          {/* ponytail: durations the pro offers for video-call bookings.
              Multi-select via aria-pressed toggle buttons (same pattern as the
              availability-mode buttons above and the tag-select component).
              At least one must stay selected — clearing the last one is a no-op
              (the schema refine + the submit() guard both enforce [45] as the
              floor). Only relevant when the scheduling feature flag is on, but
              shown regardless so a pro can configure ahead of rollout. */}
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-[var(--medi-text-primary)]">
              Duraciones de videollamada
            </span>
            <span className="text-xs text-[var(--medi-text-secondary)]">
              Elige qué sesiones ofrecer. La persona elegirá una al agendar.
            </span>
            <div className="mt-1 grid grid-cols-4 gap-2">
              {DURATION_OPTIONS.map((opt) => {
                const pressed = durations.includes(opt.value)
                return (
                  <button
                    key={opt.value}
                    type="button"
                    aria-pressed={pressed}
                    onClick={() =>
                      setDurations((cur) =>
                        pressed
                          ? cur.filter((d) => d !== opt.value)
                          : [...cur, opt.value],
                      )
                    }
                    className={
                      'min-h-10 rounded-[var(--glass-radius-sm)] border px-2 py-1 text-xs font-medium transition-all ' +
                      (pressed
                        ? 'border-[var(--medi-secondary)] bg-[var(--medi-secondary)] text-white'
                        : 'border-[var(--medi-border)] text-[var(--medi-text-secondary)] hover:translate-y-[-1px]')
                    }
                  >
                    {opt.label}
                  </button>
                )
              })}
            </div>
          </label>

          {DAYS_MON_FIRST.map((day) => {
            const daySlots = slots
              .map((s, i) => ({ s, i }))
              .filter(({ s }) => s.d === day)
              .sort((a, b) => a.s.s - b.s.s)
            return (
              <div
                key={day}
                className="rounded-[var(--glass-radius-sm)] border border-[var(--medi-border)] p-2"
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-[var(--medi-text-primary)]">
                    {WEEKDAY_LABEL_ES[day]}
                  </span>
                  <button
                    type="button"
                    onClick={() => addSlot(day)}
                    className="text-xs font-medium text-[var(--medi-secondary)] hover:underline"
                  >
                    + Añadir
                  </button>
                </div>
                {daySlots.length === 0 ? (
                  <p className="mt-1 text-xs text-[var(--medi-text-secondary)]">
                    Sin horario
                  </p>
                ) : (
                  <ul className="mt-1 flex flex-col gap-1">
                    {daySlots.map(({ s, i }) => (
                      <li key={i} className="flex items-center gap-2">
                        <input
                          type="time"
                          className="glass-input h-9 px-2 text-sm"
                          value={minToTime(s.s)}
                          onChange={(e) =>
                            updateSlot(i, { s: timeToMin(e.target.value) })
                          }
                          aria-label="Inicio"
                        />
                        <span className="text-xs text-[var(--medi-text-secondary)]">
                          –
                        </span>
                        <input
                          type="time"
                          className="glass-input h-9 px-2 text-sm"
                          value={minToTime(s.e)}
                          onChange={(e) =>
                            updateSlot(i, { e: timeToMin(e.target.value) })
                          }
                          aria-label="Fin"
                        />
                        <button
                          type="button"
                          onClick={() => removeSlot(i)}
                          aria-label="Quitar horario"
                          className="text-xs text-red-600 hover:underline"
                        >
                          ✕
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )
          })}
        </div>
      )}

      <Button
        type="button"
        onClick={submit}
        disabled={!dirty || save.isPending}
        className="glass-primary mt-3 min-h-11 w-full !text-white disabled:opacity-50"
      >
        {save.isPending ? 'Guardando…' : 'Guardar disponibilidad'}
      </Button>
    </section>
  )
}
