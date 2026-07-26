import { createFileRoute, redirect, Link } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { CalendarOff, Video } from 'lucide-react'
import { notify } from '#/lib/notifications'
import { APPOINTMENTS_ENABLED } from '#/lib/features'
import { Button } from '#/components/ui/button'
import { Skeleton } from '#/components/ui/skeleton'
import { Badge } from '#/components/ui/badge'
import { getCurrentUser, getMyProfessional } from '#/server/professionals'
import {
  getMyAppointmentsPro,
  getAppointmentForJoin,
  cancelAppointment
  
} from '#/server/appointments'
import type {AppointmentListItem} from '#/server/appointments';
import { noindexHead } from '#/lib/seo'

export const Route = createFileRoute('/profesional/sesiones')({
  beforeLoad: async () => {
    // ponytail: gate on the client feature flag — bounce to /profesional/panel
    // when off. The server fns also gate (the real security boundary).
    if (!APPOINTMENTS_ENABLED) {
      throw redirect({ to: '/profesional/panel' })
    }
    const user = await getCurrentUser()
    if (!user) {
      throw redirect({ to: '/profesional/login' })
    }
  },
  // ponytail: CSR-only — auth-gated pro view, no crawler value.
  ssr: false,
  head: noindexHead,
  component: ProSesionesPage,
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

function isUpcoming(a: AppointmentListItem): boolean {
  return a.status === 'booked' && a.endAt > Date.now()
}

function ProSesionesPage() {
  const qc = useQueryClient()
  // ponytail: beforeLoad guarantees a session + the pro's existence is
  // verified server-side in getMyAppointmentsPro, so no enabled:!!me gate —
  // firing both queries in parallel avoids the serial round-trip delay.
  const { data: me } = useQuery({
    queryKey: ['my-professional'],
    queryFn: () => getMyProfessional(),
  })
  const { data, isLoading } = useQuery({
    queryKey: ['my-appointments-pro'],
    queryFn: () => getMyAppointmentsPro(),
  })

  const join = useMutation({
    mutationFn: (id: number) => getAppointmentForJoin({ data: { id } }),
    onSuccess: (res) => {
      window.open(res.meetingUrl, '_blank', 'noopener,noreferrer')
    },
    onError: () =>
      notify({
        type: 'error',
        title: 'No se pudo abrir la videollamada',
        body: 'Inténtalo de nuevo.',
      }),
  })

  const cancel = useMutation({
    mutationFn: (id: number) => cancelAppointment({ data: { id } }),
    onSuccess: () => {
      notify({ type: 'success', title: 'Cita cancelada', body: 'Avisamos a la persona por correo.' })
      qc.invalidateQueries({ queryKey: ['my-appointments-pro'] })
    },
    onError: () =>
      notify({ type: 'error', title: 'No se pudo cancelar', body: 'Inténtalo de nuevo.' }),
  })

  const appts = data?.appointments ?? []
  const upcoming = appts.filter(isUpcoming)
  const past = appts.filter((a) => !isUpcoming(a)).reverse()
  const proTz = me?.timezone ?? 'America/Caracas'

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
        Videollamadas agendadas
      </h1>
      <div className="section-underline mt-2" />
      <p className="mt-3 text-sm text-[var(--medi-text-secondary)]">
        Sesiones que las personas han reservado contigo. Únete desde el botón.
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
            No tienes videollamadas agendadas
          </p>
          <p className="mt-1 text-sm text-[var(--medi-text-secondary)]">
            Cuando alguien reserve una sesión contigo, aparecerá aquí.
          </p>
          <p className="mt-3 text-xs text-[var(--medi-text-secondary)]">
            Para recibir reservas, mantén tu disponibilidad en modo{' '}
            <Link to="/profesional/disponibilidad" className="font-semibold text-[var(--medi-secondary)]">
              «Por horario»
            </Link>{' '}
            y tu modalidad en «A distancia» o «Ambas».
          </p>
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
                  <li key={a.id} className="glass-card rounded-[var(--glass-radius-sm)] p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-[var(--medi-text-primary)]">
                          {a.clientName}
                        </p>
                        <p className="mt-0.5 text-sm text-[var(--medi-text-secondary)]">
                          {formatDateTime(a.startAt, proTz)}
                        </p>
                        <p className="mt-0.5 text-xs text-[var(--medi-text-secondary)]">
                          {a.durationMin} min · {a.clientEmail}
                        </p>
                      </div>
                      <Badge>Videollamada</Badge>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button size="sm" onClick={() => join.mutate(a.id)} disabled={join.isPending}>
                        Unirse
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          if (confirm('¿Cancelar esta cita? Se le avisará a la persona.')) {
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
                        {a.clientName}
                      </p>
                      <p className="text-xs text-[var(--medi-text-secondary)]">
                        {formatDateTime(a.startAt, proTz)}
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
