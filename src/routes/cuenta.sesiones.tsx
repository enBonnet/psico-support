import { createFileRoute, redirect, Link } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Video, CalendarOff, LogIn } from 'lucide-react'
import { notify } from '#/lib/notifications'
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
import type {AppointmentView} from '#/server/appointments';
import { noindexHead } from '#/lib/seo'

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

function formatDateTime(ms: number, tz?: string | null): string {
  try {
    return new Intl.DateTimeFormat('es-VE', {
      timeZone: tz ?? undefined,
      weekday: 'short', day: 'numeric', month: 'short',
      hour: '2-digit', minute: '2-digit', hour12: true,
    }).format(new Date(ms))
  } catch {
    return new Date(ms).toLocaleString('es-VE')
  }
}

function isUpcoming(a: AppointmentView): boolean {
  return a.status === 'booked' && a.endAt > Date.now()
}

function SesionesPage() {
  const qc = useQueryClient()
  const { data: me } = useQuery({
    queryKey: ['me'],
    queryFn: () => getCurrentUser(),
  })
  const { data, isLoading } = useQuery({
    queryKey: ['my-appointments-client'],
    queryFn: () => getMyAppointmentsClient(),
    enabled: !!me,
  })

  const join = useMutation({
    mutationFn: (id: number) => getAppointmentForJoin({ data: { id } }),
    onSuccess: (res) => {
      // ponytail: open the meeting URL in a new tab. We resolve it server-side
      // (instead of embedding meetingUrl in the list payload) so the link is
      // only ever returned to a participant of the appointment.
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
                          {formatDateTime(a.startAt, a.clientTz)}
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
                        {formatDateTime(a.startAt, a.clientTz)}
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

      {!me && (
        <div className="glass-card-soft mt-6 flex items-center gap-3 rounded-[var(--glass-radius-sm)] p-4">
          <LogIn className="size-5 text-[var(--medi-secondary)]" />
          <p className="text-sm text-[var(--medi-text-secondary)]">
            Inicia sesión para ver y agendar tus videollamadas.
          </p>
        </div>
      )}
    </main>
  )
}
