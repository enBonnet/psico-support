import { createFileRoute, redirect, Link } from '@tanstack/react-router'
import { useState } from 'react'
import type { ReactNode } from 'react'
import { useForm } from '@tanstack/react-form'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

import { getCurrentUser } from '#/server/professionals'
import {
  listMyFollowUps,
  createMyFollowUp,
  updateMyFollowUp,
  deleteMyFollowUp,
  followUpCreateSchema,
  ACTION_TAKEN_OPTIONS,
  RISK_LEVELS,
  FOLLOWUP_STATUSES,
} from '#/server/follow-ups'
import type {
  MyFollowUp,
  RiskLevel,
  FollowupStatus,
  FollowUpInput,
} from '#/server/follow-ups'
import { PhoneInput } from '#/components/phone-input'
import { Input } from '#/components/ui/input'
import { Button } from '#/components/ui/button'
import { notify } from '#/lib/notifications'

export const Route = createFileRoute('/profesional/seguimiento')({
  beforeLoad: async () => {
    const user = await getCurrentUser()
    if (!user) {
      throw redirect({ to: '/profesional/login' })
    }
  },
  // ponytail: CSR-only — auth-gated, private to the pro, no crawler value.
  ssr: false,
  component: SeguimientoPage,
})

// ponytail: Spanish labels for the enum values, single source for list + form.
const RISK_LABEL: Record<RiskLevel, string> = {
  none: 'Sin riesgo',
  watch: 'Vigilar',
  urgent: 'Urgente',
}
const STATUS_LABEL: Record<FollowupStatus, string> = {
  open: 'Abierto',
  contacted: 'Contactado',
  closed: 'Cerrado',
}

const PAGE_SIZE = 12

function toDateInputValue(d: Date | null): string {
  return d ? new Date(d).toISOString().slice(0, 10) : ''
}
function formatDate(d: Date | null): string {
  if (!d) return ''
  return new Date(d).toLocaleDateString('es-VE', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

function SeguimientoPage() {
  const qc = useQueryClient()
  // ponytail: filters are local state, not URL-synced — this list is private/
  // personal (unlike the public directory), so back-button shareability is YAGNI.
  const [q, setQ] = useState('')
  const [status, setStatus] = useState<FollowupStatus | ''>('')
  const [riskLevel, setRiskLevel] = useState<RiskLevel | ''>('')
  const [page, setPage] = useState(1)
  // ponytail: editing = null (list) | 'new' | existing row. Seeding the form
  // from the row object (keyed by id so it remounts fresh on switch).
  const [editing, setEditing] = useState<MyFollowUp | 'new' | null>(null)

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['my-followups', q, status, riskLevel, page],
    queryFn: () =>
      listMyFollowUps({
        data: {
          q: q || undefined,
          status: status || undefined,
          riskLevel: riskLevel || undefined,
          page,
          pageSize: PAGE_SIZE,
        },
      }),
  })

  const rows = data?.rows ?? []
  const total = data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  const del = useMutation({
    mutationFn: (id: number) => deleteMyFollowUp({ data: { id } }),
    onSuccess: () => {
      notify({ type: 'success', title: 'Seguimiento eliminado' })
      qc.invalidateQueries({ queryKey: ['my-followups'] })
    },
    onError: () =>
      notify({
        type: 'error',
        title: 'No se pudo eliminar',
        body: 'Inténtalo de nuevo.',
      }),
  })

  return (
    <main className="page-wrap flex min-h-[100dvh] flex-col py-6">
      <Link
        to="/profesional/panel"
        className="inline-flex items-center gap-1 self-start py-2 text-base font-medium text-[var(--medi-secondary)]"
      >
        ‹ Panel
      </Link>

      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-[var(--medi-text-primary)]">
          Seguimiento clínico
        </h1>
        {editing === null && (
          <Button
            type="button"
            variant="glassPrimary"
            onClick={() => setEditing('new')}
          >
            + Nuevo
          </Button>
        )}
      </div>
      <div className="section-underline mt-2" />
      <p className="mt-3 text-sm text-[var(--medi-text-secondary)]">
        Registro privado de las personas que has atendido. Solo tú ves estos
        registros.
      </p>

      {editing !== null ? (
        <FollowUpForm
          key={editing === 'new' ? 'new' : editing.id}
          existing={editing === 'new' ? null : editing}
          onDone={() => setEditing(null)}
        />
      ) : (
        <>
          {/* ── Filtros ── */}
          <div className="glass-card mt-5 flex flex-col gap-2 p-3 sm:flex-row sm:items-center">
            <input
              type="search"
              inputMode="search"
              value={q}
              onChange={(e) => {
                setQ(e.target.value)
                setPage(1)
              }}
              placeholder="Buscar por teléfono, nombre o motivo…"
              aria-label="Buscar seguimientos"
              className="glass-input h-11 w-full px-3 text-base sm:flex-1"
            />
            <select
              value={status}
              onChange={(e) => {
                setStatus(e.target.value as FollowupStatus | '')
                setPage(1)
              }}
              aria-label="Filtrar por estado"
              className="glass-input h-11 w-full px-3 text-base sm:w-40"
            >
              <option value="">Todo estado</option>
              {FOLLOWUP_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABEL[s]}
                </option>
              ))}
            </select>
            <select
              value={riskLevel}
              onChange={(e) => {
                setRiskLevel(e.target.value as RiskLevel | '')
                setPage(1)
              }}
              aria-label="Filtrar por riesgo"
              className="glass-input h-11 w-full px-3 text-base sm:w-40"
            >
              <option value="">Todo riesgo</option>
              {RISK_LEVELS.map((r) => (
                <option key={r} value={r}>
                  {RISK_LABEL[r]}
                </option>
              ))}
            </select>
          </div>

          {/* ── Lista ── */}
          <ul className="mt-3 flex flex-col gap-2 pb-8">
            {isLoading ? (
              <li className="glass-card-soft p-4 text-sm text-[var(--medi-text-secondary)]">
                Cargando…
              </li>
            ) : rows.length === 0 ? (
              <li className="glass-card-soft p-5 text-center text-sm text-[var(--medi-text-secondary)]">
                {q || status || riskLevel
                  ? 'No hay registros que coincidan con tu búsqueda.'
                  : 'Aún no tienes seguimientos. Pulsa “Nuevo” para crear el primero.'}
              </li>
            ) : (
              rows.map((r) => (
                <li key={r.id} className="glass-card p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold text-[var(--medi-text-primary)]">
                        {r.name || '(sin nombre)'}
                      </p>
                      <a
                        href={`tel:${r.phone.replace(/[^\d+]/g, '')}`}
                        className="text-sm text-[var(--medi-secondary)] hover:underline"
                      >
                        {r.phone}
                      </a>
                      {r.reason && (
                        <p className="mt-1 line-clamp-2 text-sm text-[var(--medi-text-secondary)]">
                          {r.reason}
                        </p>
                      )}
                      {r.actionTaken.length > 0 && (
                        <p className="mt-1 text-xs text-[var(--medi-text-secondary)]">
                          {r.actionTaken.join(' · ')}
                        </p>
                      )}
                      {r.nextContactAt && (
                        <p className="mt-1 text-xs font-medium text-[var(--medi-primary)]">
                          Próximo contacto: {formatDate(r.nextContactAt)}
                        </p>
                      )}
                    </div>
                    <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                      <RiskPill level={r.riskLevel} />
                      <span className="glass-pill px-2 py-0.5 text-xs font-medium text-[var(--medi-text-secondary)]">
                        {STATUS_LABEL[r.status]}
                      </span>
                    </div>
                  </div>
                  {r.notes && (
                    <p className="mt-2 whitespace-pre-wrap border-t border-[var(--medi-border)] pt-2 text-sm text-[var(--medi-text-secondary)]">
                      {r.notes}
                    </p>
                  )}
                  <div className="mt-3 flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setEditing(r)}
                      className="text-sm font-medium text-[var(--medi-secondary)] hover:underline"
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (
                          window.confirm(
                            '¿Eliminar este seguimiento? No se puede deshacer.',
                          )
                        )
                          del.mutate(r.id)
                      }}
                      disabled={del.isPending}
                      className="text-sm font-medium text-red-600 hover:underline disabled:opacity-50"
                    >
                      Eliminar
                    </button>
                    <span className="ml-auto text-xs text-[var(--medi-text-secondary)]">
                      {formatDate(r.createdAt)}
                      {isFetching ? ' · …' : ''}
                    </span>
                  </div>
                </li>
              ))
            )}
          </ul>

          {/* ── Paginación ── */}
          {totalPages > 1 && (
            <div className="mt-auto flex items-center justify-center gap-4 pb-6 text-sm">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="glass-pill px-4 py-2 font-medium text-[var(--medi-text-primary)] disabled:opacity-40"
              >
                ‹ Anterior
              </button>
              <span className="text-[var(--medi-text-secondary)]">
                Página {page} de {totalPages}
              </span>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="glass-pill px-4 py-2 font-medium text-[var(--medi-text-primary)] disabled:opacity-40"
              >
                Siguiente ›
              </button>
            </div>
          )}
        </>
      )}
    </main>
  )
}

function RiskPill({ level }: { level: RiskLevel }) {
  if (level === 'none') return null
  const urgent = level === 'urgent'
  return (
    <span
      className={`glass-pill inline-flex items-center gap-1 px-2 py-0.5 text-xs font-semibold ${
        urgent
          ? 'bg-red-100/70 text-red-800'
          : 'bg-amber-100/70 text-amber-800'
      }`}
      title={urgent ? 'Riesgo urgente — derivar' : 'Vigilar'}
    >
      <span
        className={`size-2 rounded-full ${urgent ? 'bg-red-500' : 'bg-amber-500'}`}
      />
      {RISK_LABEL[level]}
    </span>
  )
}

// ponytail: create/edit form. TanStack Form + followUpCreateSchema validation
// (same pattern as completar.tsx). Keyed by id/'new' by the parent so it
// remounts with fresh defaults on switch. The update call appends the id.
function FollowUpForm({
  existing,
  onDone,
}: {
  existing: MyFollowUp | null
  onDone: () => void
}) {
  const qc = useQueryClient()
  const [submitError, setSubmitError] = useState<string | null>(null)

  const create = useMutation({
    mutationFn: (vars: FollowUpInput) => createMyFollowUp({ data: vars }),
    onSuccess: () => {
      notify({ type: 'success', title: 'Seguimiento guardado' })
      qc.invalidateQueries({ queryKey: ['my-followups'] })
      onDone()
    },
    onError: (err: Error) => setSubmitError(err.message),
  })
  const update = useMutation({
    mutationFn: (vars: FollowUpInput & { id: number }) =>
      updateMyFollowUp({ data: vars }),
    onSuccess: () => {
      notify({ type: 'success', title: 'Seguimiento actualizado' })
      qc.invalidateQueries({ queryKey: ['my-followups'] })
      onDone()
    },
    onError: (err: Error) => setSubmitError(err.message),
  })

  const form = useForm({
    defaultValues: {
      phone: existing?.phone ?? '',
      phoneCountry: existing?.phoneCountry ?? '',
      name: existing?.name ?? '',
      reason: existing?.reason ?? '',
      riskLevel: existing?.riskLevel ?? 'none',
      actionTaken: existing?.actionTaken ?? [],
      status: existing?.status ?? 'open',
      notes: existing?.notes ?? '',
      nextContactAt: existing ? toDateInputValue(existing.nextContactAt) : '',
    },
    validators: {
      onChange: ({ value }) => {
        const res = followUpCreateSchema.safeParse(value)
        if (res.success) return undefined
        return Object.fromEntries(
          res.error.issues.map((i) => [i.path.join('.'), i.message]),
        )
      },
    },
    onSubmit: ({ value }) => {
      const res = followUpCreateSchema.safeParse(value)
      if (!res.success) {
        setSubmitError('Revisa los campos marcados.')
        return
      }
      setSubmitError(null)
      if (existing) update.mutate({ ...res.data, id: existing.id })
      else create.mutate(res.data)
    },
  })

  const pending = create.isPending || update.isPending

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        form.handleSubmit()
      }}
      className="glass-card mt-5 flex flex-col gap-4 p-4 pb-8"
      noValidate
    >
      <h2 className="text-lg font-bold text-[var(--medi-text-primary)]">
        {existing ? 'Editar seguimiento' : 'Nuevo seguimiento'}
      </h2>

      <form.Field name="phoneCountry">
        {(countryField) => (
          <form.Field name="phone">
            {(phoneField) => (
              <PhoneInput
                country={countryField.state.value}
                phone={phoneField.state.value}
                onCountryChange={(c) => countryField.handleChange(c)}
                onPhoneChange={(p) => phoneField.handleChange(p)}
                countryError={firstError(countryField.state.meta.errors)}
                phoneError={firstError(phoneField.state.meta.errors)}
              />
            )}
          </form.Field>
        )}
      </form.Field>

      <form.Field name="name">
        {(field) => (
          <FormField label="Nombre (opcional)" error={field.state.meta.errors}>
            <Input
              value={field.state.value}
              onChange={(e) => field.handleChange(e.target.value)}
              onBlur={field.handleBlur}
              placeholder="Cómo se llama la persona"
            />
          </FormField>
        )}
      </form.Field>

      <form.Field name="reason">
        {(field) => (
          <FormField
            label="Motivo de consulta (opcional)"
            error={field.state.meta.errors}
          >
            <textarea
              className="glass-input min-h-20 w-full px-3 py-2 text-base"
              value={field.state.value}
              onChange={(e) => field.handleChange(e.target.value)}
              onBlur={field.handleBlur}
            />
          </FormField>
        )}
      </form.Field>

      <form.Field name="riskLevel">
        {(field) => (
          <FormField label="Nivel de riesgo" error={field.state.meta.errors}>
            <select
              className="glass-input h-12 w-full px-3 text-base"
              value={field.state.value}
              onChange={(e) =>
                field.handleChange(e.target.value as RiskLevel)
              }
              onBlur={field.handleBlur}
            >
              {RISK_LEVELS.map((r) => (
                <option key={r} value={r}>
                  {RISK_LABEL[r]}
                </option>
              ))}
            </select>
            {field.state.value === 'urgent' && (
              <p className="mt-1 rounded-[var(--glass-radius-sm)] bg-red-50/70 px-3 py-2 text-sm text-red-800">
                Riesgo urgente: recuerda derivar a urgencias o a la línea de
                crisis correspondiente.
              </p>
            )}
          </FormField>
        )}
      </form.Field>

      <form.Field name="actionTaken">
        {(field) => (
          <FormField label="Acción realizada (opcional)" error={field.state.meta.errors}>
            <div className="flex flex-wrap gap-2">
              {ACTION_TAKEN_OPTIONS.map((opt) => {
                const selected = field.state.value.includes(opt)
                return (
                  <button
                    key={opt}
                    type="button"
                    aria-pressed={selected}
                    onClick={() =>
                      field.handleChange(
                        selected
                          ? field.state.value.filter((v: string) => v !== opt)
                          : [...field.state.value, opt],
                      )
                    }
                    className={
                      'min-h-11 rounded-[var(--glass-radius-sm)] border px-4 py-2 text-sm font-medium transition-all ' +
                      (selected
                        ? 'border-[var(--medi-secondary)] bg-[var(--medi-secondary)] text-white'
                        : 'border-[var(--medi-border)] text-[var(--medi-text-secondary)] hover:translate-y-[-1px]')
                    }
                  >
                    {opt}
                  </button>
                )
              })}
            </div>
          </FormField>
        )}
      </form.Field>

      <form.Field name="status">
        {(field) => (
          <FormField label="Estado" error={field.state.meta.errors}>
            <select
              className="glass-input h-12 w-full px-3 text-base"
              value={field.state.value}
              onChange={(e) =>
                field.handleChange(e.target.value as FollowupStatus)
              }
              onBlur={field.handleBlur}
            >
              {FOLLOWUP_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABEL[s]}
                </option>
              ))}
            </select>
          </FormField>
        )}
      </form.Field>

      <form.Field name="nextContactAt">
        {(field) => (
          <FormField
            label="Próximo contacto (opcional)"
            error={field.state.meta.errors}
          >
            <input
              type="date"
              className="glass-input h-12 w-full px-3 text-base"
              value={field.state.value}
              onChange={(e) => field.handleChange(e.target.value)}
              onBlur={field.handleBlur}
            />
          </FormField>
        )}
      </form.Field>

      <form.Field name="notes">
        {(field) => (
          <FormField label="Notas (opcional)" error={field.state.meta.errors}>
            <textarea
              className="glass-input min-h-28 w-full px-3 py-2 text-base"
              value={field.state.value}
              onChange={(e) => field.handleChange(e.target.value)}
              onBlur={field.handleBlur}
            />
          </FormField>
        )}
      </form.Field>

      {submitError && (
        <p className="glass-card-soft rounded-[var(--glass-radius-sm)] px-3 py-2 text-sm text-red-700">
          {submitError}
        </p>
      )}

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button
          type="button"
          variant="ghost"
          onClick={onDone}
          disabled={pending}
        >
          Cancelar
        </Button>
        <Button
          type="submit"
          variant="glassPrimary"
          disabled={pending}
          className="min-h-12 !text-white"
        >
          {pending ? 'Guardando…' : existing ? 'Guardar cambios' : 'Guardar'}
        </Button>
      </div>
    </form>
  )
}

// ponytail: tiny label+error wrapper, local to this route (mirrors FieldShell
// but tuned for this form's vertical rhythm). Kept inline rather than imported
// so the error-text styling matches the rest of this page.
function FormField({
  label,
  error,
  children,
}: {
  label: string
  error: unknown[]
  children: ReactNode
}) {
  const msg =
    error.length > 0
      ? ((error[0] as { message?: string }).message ?? 'Inválido')
      : null
  return (
    <label className="flex flex-col gap-1">
      <span className="text-sm font-medium text-[var(--medi-text-primary)]">
        {label}
      </span>
      {children}
      {msg && <span className="text-sm text-red-600">{msg}</span>}
    </label>
  )
}

// ponytail: pull the first error message off TanStack Form's meta.errors
// (array OR object shape). Typed unknown to keep narrowing honest.
function firstError(errors: unknown[]): string | undefined {
  if (errors.length === 0) return undefined
  const first = errors[0] as { message?: string } | undefined
  return first?.message
}
