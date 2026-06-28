import { useState } from 'react'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { z } from 'zod'
import { useSuspenseQuery } from '@tanstack/react-query'
import { Shuffle, Search, X, ChevronDown, SlidersHorizontal } from 'lucide-react'

import {
  listProfessionals,
  pickRandomProfessional,
  POPULATION_OPTIONS,
  PAGE_SIZE_DEFAULT,
} from '#/server/professionals'
import type { PublicProfessional } from '#/server/professionals'
import { VENEZUELA_ESTADOS, ESTADO_CIUDADES } from '#/server/locations'
import { notify } from '#/lib/notifications'
import { seoHead } from '#/lib/seo'

// ponytail: bare URL (no ?modality=) used to 500 — default to in_person so
// direct entry resolves instead of throwing on the missing search param.
// Every filter is URL-synced so a search is shareable + SSR-friendly; page
// is 1-based and resets to 1 whenever a filter changes (handled in the UI).
// Filters are plain optional strings (defaulted to '') — they only feed
// eq()/like() server-side where '' is treated as "no filter", so we pass
// them straight through with no `|| undefined` coercion.
const searchSchema = z.object({
  modality: z.enum(['in_person', 'remote']).default('in_person'),
  q: z.string().optional().default(''),
  estado: z.string().optional().default(''),
  ciudad: z.string().optional().default(''),
  population: z.string().optional().default(''),
  page: z.number().int().min(1).default(1),
})

type Filters = {
  modality: 'in_person' | 'remote'
  q: string
  estado: string
  ciudad: string
  population: string
  page: number
}

export const Route = createFileRoute('/ayuda/profesionales/')({
  validateSearch: searchSchema,
  // ponytail: loaderDeps drive both the SSR loader and the suspense query
  // key — including every filter here means a filter change refetches.
  loaderDeps: ({ search }) => ({
    modality: search.modality,
    q: search.q,
    estado: search.estado,
    ciudad: search.ciudad,
    population: search.population,
    page: search.page,
  }),
  loader: async ({ deps }) => {
    const initial = await listProfessionals({
      data: {
        modality: deps.modality,
        q: deps.q,
        estado: deps.estado,
        ciudad: deps.ciudad,
        population: deps.population,
        page: deps.page,
        pageSize: PAGE_SIZE_DEFAULT,
      },
    })
    return { initial, filters: deps }
  },
  // ponytail: head() declared after loader so its loaderData param resolves
  // against the loader's inferred return (declaring it earlier collapsed the
  // route's generics). head has no `search` in context, so read the active
  // modality from loaderData.filters — a shared list link previews the right
  // intent (in-person vs remote are different searches).
  head: ({ loaderData }) => {
    const modality = loaderData?.filters.modality ?? 'in_person'
    return seoHead({
      title:
        modality === 'remote'
          ? 'Contención a Distancia — Psicólogos Verificados'
          : 'Asistencia Presencial — Psicólogos Verificados',
      description:
        'Directorio de psicólogos verificados. Filtra por estado, ciudad o población y contacta directamente por WhatsApp.',
      path: `/ayuda/profesionales?modality=${modality}`,
    })
  },
  component: ProfessionalsList,
})

function ProfessionalsList() {
  const deps = Route.useLoaderData()
  const filters = deps.filters
  const navigate = useNavigate({ from: Route.id })
  const [picking, setPicking] = useState(false)
  // ponytail: filters collapsed by default — the summary row shows what's
  // active so the user never loses track of why the list looks the way it does.
  const [filtersOpen, setFiltersOpen] = useState(false)

  const { data } = useSuspenseQuery({
    queryKey: [
      'professionals',
      filters.modality,
      filters.q,
      filters.estado,
      filters.ciudad,
      filters.population,
      filters.page,
    ],
    queryFn: () =>
      listProfessionals({
        data: {
          modality: filters.modality,
          q: filters.q,
          estado: filters.estado,
          ciudad: filters.ciudad,
          population: filters.population,
          page: filters.page,
          pageSize: PAGE_SIZE_DEFAULT,
        },
      }),
    initialData: deps.initial,
    refetchInterval: 20_000,
    staleTime: 15_000,
  })

  const totalPages = Math.max(1, Math.ceil(data.total / PAGE_SIZE_DEFAULT))
  const hasActiveFilters =
    filters.q || filters.estado || filters.ciudad || filters.population

  // ponytail: human-readable list of the active filters for the collapsed
  // summary. Quoted term for the name search, plain labels for the rest.
  const activeFilterParts: string[] = []
  if (filters.q) activeFilterParts.push(`“${filters.q}”`)
  if (filters.estado) activeFilterParts.push(filters.estado)
  if (filters.ciudad) activeFilterParts.push(filters.ciudad)
  if (filters.population) activeFilterParts.push(filters.population)
  const filterSummary = activeFilterParts.join(' · ')

  // ponytail: every filter change writes through the URL via navigate();
  // page resets to 1 so the user never lands on an out-of-range page after
  // narrowing. The setter merges onto the current search.
  function setFilter(patch: Partial<Filters>) {
    void navigate({
      search: (prev) => ({ ...prev, ...patch, page: 1 }),
    })
  }
  function clearFilters() {
    void navigate({
      search: (prev) => ({
        ...prev,
        q: '',
        estado: '',
        ciudad: '',
        population: '',
        page: 1,
      }),
    })
  }

  async function contactRandom() {
    setPicking(true)
    try {
      const picked = await pickRandomProfessional({
        data: {
          modality: filters.modality,
          q: filters.q,
          estado: filters.estado,
          ciudad: filters.ciudad,
          population: filters.population,
        },
      })
      if (!picked) {
        notify({
          type: 'info',
          title: 'Sin resultados',
          body: 'No hay profesionales que coincidan con tu búsqueda.',
        })
        return
      }
      const digits = picked.whatsapp.replace(/\D/g, '')
      const text = encodeURIComponent(
        'Hola, te escribo por medio de psicoayudaven.',
      )
      window.open(
        `https://wa.me/${digits}?text=${text}`,
        '_blank',
        'noopener,noreferrer',
      )
    } catch {
      notify({
        type: 'error',
        title: 'Algo salió mal',
        body: 'No pudimos buscar un profesional. Inténtalo de nuevo.',
      })
    } finally {
      setPicking(false)
    }
  }

  const title =
    filters.modality === 'in_person'
      ? 'Asistencia Presencial'
      : 'Contención a Distancia'

  // ponytail: ciudades is estado-scoped. Cast the lookup to | undefined so
  // the ?? [] is type-honest — without noUncheckedIndexedAccess, TS thinks
  // Record<string,V>[k] is always present, but '' / unknown keys return
  // undefined at runtime.
  const ciudades = (
    ESTADO_CIUDADES as Record<string, readonly string[] | undefined>
  )[filters.estado] ?? []

  return (
    <main className="page-wrap flex min-h-[100dvh] flex-col py-4">
      <Link
        to="/ayuda"
        className="inline-flex items-center gap-1 self-start py-2 text-base font-medium text-[var(--medi-secondary)]"
        aria-label="Atrás"
      >
        ‹ Atrás
      </Link>

      <div className="glass-bar sticky top-[env(safe-area-inset-top,0px)] z-10 rounded-[var(--glass-radius-sm)] px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-xl font-bold text-[var(--medi-text-primary)]">
              Profesionales Verificados
            </h1>
            <p className="text-sm text-[var(--medi-text-secondary)]">
              {title}
            </p>
          </div>
          <button
            type="button"
            onClick={contactRandom}
            disabled={picking}
            className="glass-primary inline-flex shrink-0 items-center gap-2 rounded-[var(--glass-radius-sm)] px-3 py-2 text-sm font-semibold transition-all hover:translate-y-[-1px] disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--medi-secondary)]"
            title="Contactar a un profesional verificado al azar"
          >
            <Shuffle className="size-4" aria-hidden="true" />
            {picking ? 'Buscando…' : 'Al azar'}
          </button>
        </div>
      </div>

      {/* ── Filtros ── */}
      <div className="glass-card mt-3 p-3">
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => setFiltersOpen((v) => !v)}
            aria-expanded={filtersOpen}
            aria-controls="filtros-panel"
            className="flex min-w-0 flex-1 items-center gap-2 text-left"
          >
            <SlidersHorizontal
              className="size-4 shrink-0 text-[var(--medi-secondary)]"
              aria-hidden="true"
            />
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-[var(--medi-text-primary)]">
                Filtros
              </span>
              <span className="block truncate text-xs text-[var(--medi-text-secondary)]">
                {hasActiveFilters
                  ? filterSummary
                  : 'Buscar, estado, ciudad o edad'}
              </span>
            </span>
          </button>
          <div className="flex shrink-0 items-center gap-2">
            {hasActiveFilters && (
              <button
                type="button"
                onClick={clearFilters}
                className="text-sm font-medium text-[var(--medi-secondary)] underline-offset-2 hover:underline"
              >
                Limpiar
              </button>
            )}
            <button
              type="button"
              onClick={() => setFiltersOpen((v) => !v)}
              aria-label={filtersOpen ? 'Cerrar filtros' : 'Abrir filtros'}
              className="rounded-full p-1 text-[var(--medi-text-secondary)] hover:text-[var(--medi-text-primary)]"
            >
              <ChevronDown
                className={`size-5 transition-transform ${filtersOpen ? 'rotate-180' : ''}`}
                aria-hidden="true"
              />
            </button>
          </div>
        </div>

        {filtersOpen && (
          <div className="mt-3 flex flex-col gap-2" id="filtros-panel">
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--medi-text-secondary)]"
                aria-hidden="true"
              />
              <input
                type="search"
                inputMode="search"
                value={filters.q}
                onChange={(e) => setFilter({ q: e.target.value })}
                placeholder="Buscar por nombre…"
                aria-label="Buscar por nombre"
                className="glass-input h-12 w-full pl-9 pr-9 text-base"
              />
              {filters.q && (
                <button
                  type="button"
                  onClick={() => setFilter({ q: '' })}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-[var(--medi-text-secondary)] hover:text-[var(--medi-text-primary)]"
                  aria-label="Borrar búsqueda"
                >
                  <X className="size-4" />
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <select
                value={filters.estado}
                onChange={(e) =>
                  // ponytail: reset ciudad when estado changes — the ciudad list
                  // is estado-scoped, a stale value would filter to nothing.
                  setFilter({ estado: e.target.value, ciudad: '' })
                }
                aria-label="Filtrar por estado"
                className="glass-input h-12 w-full px-3 text-base"
              >
                <option value="">Todos los estados</option>
                {VENEZUELA_ESTADOS.map((e) => (
                  <option key={e} value={e}>
                    {e}
                  </option>
                ))}
              </select>

              <select
                value={filters.ciudad}
                onChange={(e) => setFilter({ ciudad: e.target.value })}
                disabled={!filters.estado}
                aria-label="Filtrar por ciudad"
                className="glass-input h-12 w-full px-3 text-base disabled:opacity-50"
              >
                <option value="">
                  {filters.estado ? 'Todas las ciudades' : 'Primero el estado'}
                </option>
                {ciudades.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>

              <select
                value={filters.population}
                onChange={(e) => setFilter({ population: e.target.value })}
                aria-label="Filtrar por población"
                className="glass-input h-12 w-full px-3 text-base"
              >
                <option value="">Todas las edades</option>
                {POPULATION_OPTIONS.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}
      </div>

      <ul className="mt-4 flex flex-col gap-3 pb-8">
        {data.rows.length === 0 ? (
          <li className="glass-card-soft p-5 text-center text-[var(--medi-text-secondary)]">
            {hasActiveFilters
              ? 'No hay profesionales que coincidan con tu búsqueda.'
              : 'No hay profesionales en esta modalidad en este momento.'}
          </li>
        ) : (
          data.rows.map((p) => <ProfessionalCard key={p.id} p={p} />)
        )}
      </ul>

      {/* ── Paginación ── */}
      {totalPages > 1 && (
        <div className="mt-auto flex items-center justify-center gap-4 pb-6 text-sm">
          <button
            type="button"
            disabled={filters.page <= 1}
            onClick={() =>
              void navigate({
                search: (prev) => ({ ...prev, page: prev.page - 1 }),
              })
            }
            className="glass-pill px-4 py-2 font-medium text-[var(--medi-text-primary)] disabled:cursor-not-allowed disabled:opacity-40"
          >
            ‹ Anterior
          </button>
          <span className="text-[var(--medi-text-secondary)]">
            Página {filters.page} de {totalPages}
          </span>
          <button
            type="button"
            disabled={filters.page >= totalPages}
            onClick={() =>
              void navigate({
                search: (prev) => ({ ...prev, page: prev.page + 1 }),
              })
            }
            className="glass-pill px-4 py-2 font-medium text-[var(--medi-text-primary)] disabled:cursor-not-allowed disabled:opacity-40"
          >
            Siguiente ›
          </button>
        </div>
      )}
    </main>
  )
}

function ProfessionalCard({ p }: { p: PublicProfessional }) {
  // ponytail: wa.me wants digits only (no +, no spaces). Stored format is
  // "+58 1234567890", so strip everything but \d. Default message pre-fills
  // the chat so the professional knows where the lead came from.
  const digits = p.whatsapp.replace(/\D/g, '')
  const text = encodeURIComponent('Hola, te escribo por medio de psicoayudaven.')
  const href = `https://wa.me/${digits}?text=${text}`

  return (
    <li className="glass-card p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <Link
            to="/ayuda/profesionales/$id"
            params={{ id: String(p.id) }}
            className="truncate text-lg font-semibold text-[var(--medi-text-primary)] underline-offset-2 hover:underline"
            // ponytail: name links to the per-pro profile (shareable + SEO);
            // the WhatsApp button below stays the primary contact CTA.
          >
            {p.name}
          </Link>
          <p className="mt-0.5 text-sm text-[var(--medi-text-secondary)]">
            {p.country === 'Venezuela'
              ? [p.estado, p.ciudad].filter(Boolean).join(', ')
              : p.country}
          </p>
          {p.population.length > 0 && (
            <p className="mt-0.5 text-xs text-[var(--medi-text-secondary)]">
              Atiende: {p.population.join(', ')}
            </p>
          )}
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
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
      Confirmado
    </span>
  )
}
