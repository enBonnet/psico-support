import { createFileRoute, Link } from '@tanstack/react-router'
import { z } from 'zod'
import { useSuspenseQuery } from '@tanstack/react-query'

import { listProfessionals } from '#/server/professionals'
import type { PublicProfessional } from '#/server/professionals'

// ponytail: bare URL (no ?modality=) used to 500 — default to in_person so
// direct entry resolves instead of throwing on the missing search param.
const searchSchema = z.object({
  modality: z.enum(['in_person', 'remote']).default('in_person'),
})

export const Route = createFileRoute('/ayuda/profesionales/')({
  validateSearch: searchSchema,
  loaderDeps: ({ search }) => ({ modality: search.modality }),
  loader: async ({ deps }) => {
    const initial = await listProfessionals({
      data: { modality: deps.modality },
    })
    return { initial, modality: deps.modality }
  },
  component: ProfessionalsList,
})

function ProfessionalsList() {
  const deps = Route.useLoaderData()
  const modality = deps.modality
  const { data } = useSuspenseQuery({
    queryKey: ['professionals', modality],
    queryFn: () => listProfessionals({ data: { modality } }),
    initialData: deps.initial,
    refetchInterval: 20_000,
    staleTime: 15_000,
  })

  const title =
    modality === 'in_person'
      ? 'Asistencia Presencial'
      : 'Contención a Distancia'

  return (
    <main className="page-wrap flex min-h-[100dvh] flex-col py-4">
      <Link
        to="/ayuda"
        className="inline-flex items-center gap-1 self-start py-2 text-base font-medium text-[var(--medi-secondary)]"
        aria-label="Atrás"
      >
        ‹ Atrás
      </Link>

      <div className="glass-bar sticky top-0 z-10 -mx-4 rounded-[var(--glass-radius-sm)] px-4 py-3">
        <h1 className="text-xl font-bold text-[var(--medi-text-primary)]">
          Profesionales Verificados
        </h1>
        <p className="text-sm text-[var(--medi-text-secondary)]">{title}</p>
      </div>

      <ul className="mt-4 flex flex-col gap-3 pb-8">
        {data.length === 0 ? (
          <li className="glass-card-soft p-5 text-center text-[var(--medi-text-secondary)]">
            No hay profesionales en esta modalidad en este momento.
          </li>
        ) : (
          data.map((p) => <ProfessionalCard key={p.id} p={p} />)
        )}
      </ul>
    </main>
  )
}

function ProfessionalCard({ p }: { p: PublicProfessional }) {
  const href = p.whatsapp.startsWith('+')
    ? `https://wa.me/${p.whatsapp.slice(1)}`
    : `https://wa.me/${p.whatsapp}`

  return (
    <li className="glass-card p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-lg font-semibold text-[var(--medi-text-primary)]">
            {p.name}
          </p>
          <p className="mt-0.5 text-sm text-[var(--medi-text-secondary)]">
            {p.country === 'Venezuela'
              ? [p.estado, p.ciudad].filter(Boolean).join(', ')
              : p.country}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <BadgeFPV />
          <StatusPill available={p.available} />
        </div>
      </div>
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        // ponytail: !important so white wins over the unlayered `a { color }`
        // rule in styles.css (unlayered beats layered utilities in tw v4),
        // in both default and hover states.
        className="mt-4 flex min-h-12 w-full items-center justify-center rounded-[var(--glass-radius-sm)] bg-green-600 px-4 py-3 text-base font-semibold !text-white transition-all hover:translate-y-[-1px] hover:bg-green-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--medi-secondary)]"
      >
        Contactar por WhatsApp
      </a>
    </li>
  )
}

function StatusPill({ available }: { available: boolean }) {
  return available ? (
    <span
      className="glass-pill inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-green-700"
      title="Disponible ahora"
    >
      <span className="size-2 rounded-full bg-green-500" />
      En línea
    </span>
  ) : (
    <span
      className="glass-pill inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-amber-700"
      title="No conectado"
    >
      <span className="size-2 rounded-full bg-amber-500" />
      No conectado
    </span>
  )
}

function BadgeFPV() {
  return (
    <span className="glass-pill px-2.5 py-1 text-xs font-semibold text-[var(--medi-primary)]">
      FPV Verificado
    </span>
  )
}
