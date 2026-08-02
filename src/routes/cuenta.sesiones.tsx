import { createFileRoute, redirect, Link, useNavigate } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Video, CalendarOff, CalendarPlus, CalendarClock } from 'lucide-react'
import { notify } from '#/lib/notifications'
import { track } from '#/lib/analytics-client'
import { APPOINTMENTS_ENABLED } from '#/lib/features'
import { Button } from '#/components/ui/button'
import { Skeleton } from '#/components/ui/skeleton'
import { Badge } from '#/components/ui/badge'
import { getCurrentUser } from '#/server/professionals'
import {
  getMyAppointmentsClient,
  getAppointmentForJoin,
  cancelAppointment
} from '#/server/appointments'
import type { AppointmentListItem } from '#/server/appointments'
import { noindexHead } from '#/lib/seo'

// ponytail: C1b (healthcare-ui audit) — client-side .ics generator for the
// "Add to calendar" button on upcoming appointments. Koruux Cat. 3: "save the
// appointment to a digital calendar." The confirmation email already attaches
// a server-built .ics (buildIcsAttachment in src/server/email.ts), but the
// user who lands on /cuenta/sesiones after booking has no in-app way to add it
// to their calendar without digging through email. This generates a minimal,
// standards-compliant VEVENT and returns a data: URL the browser downloads.
// No meetingUrl (the list item intentionally omits it for security — the join
// link is resolved separately via getAppointmentForJoin); the calendar event
// points the user back to the app to join. UTC times with the Z suffix keep
// it tz-safe without needing VTIMEZONE blocks.
function buildIcsDataUrl(a: AppointmentListItem): string {
  const fmtUtc = (ms: number) =>
    new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//PsicoAyudaVen//Appointment//ES',
    'BEGIN:VEVENT',
    `UID:psico-apt-${a.id}@psicoayudaven.com`,
    `DTSTAMP:${fmtUtc(Date.now())}Z`,
    `DTSTART:${fmtUtc(a.startAt)}Z`,
    `DTEND:${fmtUtc(a.endAt)}Z`,
    `SUMMARY:Videollamada con ${a.professionalName}`,
    'DESCRIPTION:Sesión de apoyo psicológico a través de PsicoAyudaVen. Únete desde la app unos minutos antes de la hora.',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n')
  // ponytail: encodeURIComponent + data:text/calendar so the blob downloads
  // as a .ics file on iOS/Android/desktop. The filename is set via the <a
  // download> attribute in the component, not here.
  return `data:text/calendar;charset=utf8,${encodeURIComponent(ics)}`
}

export const Route = createFileRoute('/cuenta/sesiones')({
  beforeLoad: async () => {
    // ponytail: gate on the client feature flag — bounce to /cuenta when off
    // so a deep link or stale tab doesn't strand the user. The server fns
    // also gate (the real security boundary).
    if (!APPOINTMENTS_ENABLED) {
      throw redirect({ to: '/cuenta' })
    }
    const user = await getCurrentUser()
    if (!user) {
      // ponytail: redirect to /signup (not /profesional/login) — this is the
      // help-seeker side. Better Auth's signup carries a callbackURL so the
      // user lands back here after auth.
      throw redirect({ to: '/signup' })
    }
  },
  // ponytail: CSR-only — auth-gated, no crawler value.
  ssr: false,
  head: noindexHead,
  component: SesionesPage,
})

// ponytail: format in the VIEWER's browser tz (no timeZone option → Intl uses
// the runtime default). The stored clientTz is hard-coded to America/Caracas
// (MVP — no per-user tz column), so passing it here would show Caracas time
// to a user abroad, mismatching the slot they picked on the booking page
// (which formats in the browser tz). Omitting timeZone keeps both surfaces
// consistent. Note: this route is ssr:false, so there's no hydration mismatch.
function formatDateTime(ms: number): string {
  try {
    return new Intl.DateTimeFormat('es-VE', {
      weekday: 'short', day: 'numeric', month: 'short',
      hour: '2-digit', minute: '2-digit', hour12: true,
    }).format(new Date(ms))
  } catch {
    return new Date(ms).toLocaleString('es-VE')
  }
}

function isUpcoming(a: AppointmentListItem): boolean {
  return a.status === 'booked' && a.endAt > Date.now()
}

function SesionesPage() {
  const qc = useQueryClient()
  const navigate = useNavigate()
  // ponytail: beforeLoad already guarantees a logged-in user (redirects to
  // /signup otherwise), so the appointments query fires immediately without
  // an `enabled: !!me` gate — that gate caused an unnecessary extra round-trip
  // delay (wait for getCurrentUser, then fire the list query).
  const { data, isLoading } = useQuery({
    queryKey: ['my-appointments-client'],
    queryFn: () => getMyAppointmentsClient(),
  })

  const join = useMutation({
    mutationFn: (id: number) => getAppointmentForJoin({ data: { id } }),
    onSuccess: (res) => {
      // ponytail: the list payload (AppointmentListItem) intentionally omits
      // meetingUrl — it's resolved only via this getAppointmentForJoin() call,
      // which re-checks the caller is a participant AND the status is 'booked'
      // before returning the Jitsi link. So a stale list never leaks the URL,
      // and a cancelled appointment can't be joined.
      window.open(res.meetingUrl, '_blank', 'noopener,noreferrer')
    },
    onError: () =>
      notify({
        type: 'error',
        title: 'No se pudo abrir la videollamada',
        body: 'Inténtalo de nuevo más cerca de la hora de la cita.',
      }),
  })

  const cancel = useMutation({
    mutationFn: (id: number) => cancelAppointment({ data: { id } }),
    onSuccess: () => {
      notify({ type: 'success', title: 'Cita cancelada', body: 'Avisamos al profesional por correo.' })
      qc.invalidateQueries({ queryKey: ['my-appointments-client'] })
    },
    onError: () =>
      notify({ type: 'error', title: 'No se pudo cancelar', body: 'Inténtalo de nuevo.' }),
  })

  const appts = data?.appointments ?? []
  const upcoming = appts.filter(isUpcoming)
  const past = appts.filter((a) => !isUpcoming(a)).reverse()

  // ponytail: C1c (healthcare-ui audit) — simple reschedule as cancel-then-
  // rebook. Koruux Cat. 3: "flexibility to reschedule or cancel appointments
  // easily." A proper rescheduleAppointment server fn (atomic slot move) is
  // the upgrade path; for now this cancels the current booking (reusing the
  // existing cancelAppointment fn + its emails) and navigates to the booking
  // route so the user picks a new slot. Honest UX: the user re-picks, the pro
  // gets a cancellation email + a new booking email. No new server fn needed.
  function reschedule(a: AppointmentListItem) {
    if (
      !confirm(
        `¿Cambiar el horario de tu cita con ${a.professionalName}? Se cancelará la cita actual y te llevaremos a elegir un nuevo horario.`,
      )
    ) {
      return
    }
    track({ event: 'cta_click', category: 'public', param1: 'reschedule_intent' })
    // ponytail: cancel first; the cancel mutation's onSuccess invalidates the
    // list. We navigate in a microtask after the cancel fires so the booking
    // route loads fresh slots (the old booking's slot is freed server-side
    // once cancelAppointment flips the row to 'cancelled').
    cancel.mutate(a.id, {
      onSuccess: () => {
        navigate({
          to: '/cuenta/sesiones/agendar/$proId',
          params: { proId: String(a.professionalId) },
        })
      },
    })
  }

  return (
    <main className="page-wrap flex min-h-[100dvh] flex-col py-6">
      <Link
        to="/cuenta"
        className="inline-flex items-center gap-1 self-start py-2 text-base font-medium text-[var(--medi-secondary)]"
        aria-label="Volver a mi cuenta"
      >
        ‹ Mi cuenta
      </Link>

      <h1 className="text-2xl font-bold text-[var(--medi-text-primary)]">
        Mis videollamadas
      </h1>
      <div className="section-underline mt-2" />
      <p className="mt-3 text-sm text-[var(--medi-text-secondary)]">
        Aquí están tus sesiones agendadas. Únete desde el botón unos minutos antes de la hora.
      </p>

      {isLoading ? (
        <div className="mt-4 flex flex-col gap-3" aria-busy="true">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : appts.length === 0 ? (
        <div className="glass-card-soft mt-6 rounded-[var(--glass-radius-sm)] p-8 text-center">
          <Video className="mx-auto size-10 text-[var(--medi-secondary)]" />
          <p className="mt-3 font-semibold text-[var(--medi-text-primary)]">
            Aún no tienes videollamadas agendadas
          </p>
          <p className="mt-1 text-sm text-[var(--medi-text-secondary)]">
            Busca un profesional y agenda una sesión cuando estés listo.
          </p>
          <Button asChild className="mt-4">
            <Link to="/ayuda/profesionales">Buscar profesionales</Link>
          </Button>
        </div>
      ) : (
        <>
          {upcoming.length > 0 && (
            <section className="mt-6">
              <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-[var(--medi-text-secondary)]">
                Próximas
              </h2>
              <ul className="flex flex-col gap-3">
                {upcoming.map((a) => (
                  <li
                    key={a.id}
                    className="glass-card rounded-[var(--glass-radius-sm)] p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-[var(--medi-text-primary)]">
                          {a.professionalName}
                        </p>
                        <p className="mt-0.5 text-sm text-[var(--medi-text-secondary)]">
                          {formatDateTime(a.startAt)}
                        </p>
                        <p className="mt-0.5 text-xs text-[var(--medi-text-secondary)]">
                          Duración: {a.durationMin} min
                        </p>
                      </div>
                      <Badge>Videollamada</Badge>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        onClick={() => join.mutate(a.id)}
                        disabled={join.isPending}
                      >
                        Unirse
                      </Button>
                      {/* ponytail: C1b (healthcare-ui audit) — in-app "Add to
                          calendar". Generates a .ics download via a data: URL
                          (buildIcsDataUrl above). The confirmation email
                          already attaches a server-built .ics, but this
                          surfaces it in-app so a user who lands here after
                          booking doesn't need to dig through email. */}
                      <Button asChild size="sm" variant="outline">
                        <a
                          href={buildIcsDataUrl(a)}
                          download={`psicoayuda-cita-${a.id}.ics`}
                          onClick={() =>
                            track({
                              event: 'cta_click',
                              category: 'public',
                              param1: 'add_to_calendar',
                            })
                          }
                        >
                          <CalendarPlus className="size-4" /> Calendario
                        </a>
                      </Button>
                      {/* ponytail: C1c (healthcare-ui audit) — simple reschedule
                          (cancel-then-rebook). See reschedule() above. */}
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => reschedule(a)}
                        disabled={cancel.isPending}
                      >
                        <CalendarClock className="size-4" /> Cambiar horario
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          if (
                            confirm(
                              '¿Cancelar esta cita? Se le avisará al profesional.',
                            )
                          ) {
                            cancel.mutate(a.id)
                          }
                        }}
                        disabled={cancel.isPending}
                      >
                        <CalendarOff className="size-4" /> Cancelar
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {past.length > 0 && (
            <section className="mt-8">
              <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-[var(--medi-text-secondary)]">
                Historial
              </h2>
              <ul className="flex flex-col gap-2">
                {past.map((a) => (
                  <li
                    key={a.id}
                    className="glass-card-soft flex items-center justify-between gap-3 rounded-[var(--glass-radius-sm)] p-3"
                  >
                    <div>
                      <p className="text-sm font-medium text-[var(--medi-text-primary)]">
                        {a.professionalName}
                      </p>
                      <p className="text-xs text-[var(--medi-text-secondary)]">
                        {formatDateTime(a.startAt)}
                      </p>
                    </div>
                    <Badge variant={a.status === 'cancelled' ? 'destructive' : 'secondary'}>
                      {a.status === 'cancelled' ? 'Cancelada' : 'Finalizada'}
                    </Badge>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </main>
  )
}