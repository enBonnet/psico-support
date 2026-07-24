import { useState, useEffect, useRef } from 'react'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { z } from 'zod'
import { useQuery, keepPreviousData } from '@tanstack/react-query'
import {
  Shuffle,
  Search,
  X,
  ChevronDown,
  SlidersHorizontal,
  Wind,
} from 'lucide-react'

import {
  listProfessionals,
  pickRandomProfessional,
  isActiveNow,
  isContactableNow,
  nextStartLabel,
  formatScheduleHuman,
  POPULATION_OPTIONS,
  FOCUS_GROUP_OPTIONS,
  PRACTICE_AREA_OPTIONS,
  PAGE_SIZE_DEFAULT,
} from '#/server/professionals'
import type {
  PublicProfessional,
  AvailabilityMode,
  ScheduleSlot,
} from '#/server/professionals'
import { VENEZUELA_ESTADOS, ESTADO_CIUDADES } from '#/server/locations'
import { notify } from '#/lib/notifications'
import { track, trackProContact, trackProContactRandom } from '#/lib/analytics-client'
import { useDebounced } from '#/lib/hooks/use-debounced'
import { whatsappHref } from '#/lib/whatsapp'
import { seoHead } from '#/lib/seo'
import { Skeleton } from '#/components/ui/skeleton'

// ponytail: filters used to live in the URL and feed loaderDeps, so every
// keystroke / dropdown change rewrote the URL → re-ran the route loader →
// flipped the router into pending state → the full-screen RoutePending
// spinner replaced the page (and unmounted the input). It felt like a page
// reload per keystroke.
//
// Now: only `modality` is URL-driven (it changes the whole page + head()),
// plus `page` for pagination shareability. The rest (q, estado, ciudad,
// population, focusGroups, practiceAreas) are local component state seeded
// ONCE from the URL on mount, so an existing deep-link like ?q=Ana&estado=Zulia
// still resolves on first load but refining the filters no longer navigates.
// The list is served by a useQuery with placeholderData: keepPreviousData, so
// any change (keystroke, select, page turn) keeps the previous rows visible
// instead of suspending. q is debounced; the dropdowns/page refetch at once.
const searchSchema = z.object({
  modality: z.enum(['in_person', 'remote']).default('in_person'),
  // ponytail: these are read once to seed local state (deep-link support),
  // not watched. Kept as plain strings — '' means "no filter" server-side.
  q: z.string().optional().default(''),
  estado: z.string().optional().default(''),
  ciudad: z.string().optional().default(''),
  population: z.string().optional().default(''),
  focusGroups: z.string().optional().default(''),
  practiceAreas: z.string().optional().default(''),
  page: z.number().int().min(1).default(1),
})

// ponytail: stable keys for the first-load skeleton cards. PAGE_SIZE_DEFAULT
// would overshoot (12) — 4 mirrors a typical above-the-fold count and keeps
// the skeleton list cheap.
const DIRECTORY_SKELETONS = [0, 1, 2, 3] as const

type Filters = {
  q: string
  estado: string
  ciudad: string
  population: string
  focusGroups: string
  practiceAreas: string
  page: number
}

export const Route = createFileRoute('/ayuda/profesionales/')({
  validateSearch: searchSchema,
  // ponytail: CSR-only — interactive directory that polls via TanStack Query
  // (refetchInterval). No crawler value (the per-pro profile route is the
  // shareable/SEO surface, and it stays SSR).
  ssr: false,
  // ponytail: head() needs the active modality to render the right title/OG,
  // but head() context has no `search` (gotcha #3) — it only has loaderData.
  // The loader returns just the modality (no fetch → no RoutePending flash on
  // mount). loaderDeps carries ONLY modality — it's stable across filter
  // edits (filters live in component state now), so this loader runs once on
  // entry and never re-fires while refining. The live list data is owned
  // entirely by the component's useQuery (placeholderData keeps previous rows
  // during filter/page changes).
  loaderDeps: ({ search }) => ({ modality: search.modality }),
  loader: async ({ deps }) => ({ modality: deps.modality }),
  head: ({ loaderData }) => {
    const modality = loaderData?.modality ?? 'in_person'
    return seoHead({
      title:
        modality === 'remote'
          ? 'Asistencia a distancia — psicólogos verificados'
          : 'Asistencia presencial — psicólogos verificados',
      description:
        'Directorio de psicólogos verificados. Filtra por estado, ciudad o población y contacta directamente por WhatsApp.',
      path: `/ayuda/profesionales?modality=${modality}`,
    })
  },
  component: ProfessionalsList,
})

function ProfessionalsList() {
  // ponytail: modality is URL-driven (changes the whole page + head()). The
  // other filters + page are local state seeded once from the URL below, so
  // a shared deep-link still resolves on first load.
  const { modality } = Route.useSearch()
  const navigate = useNavigate({ from: Route.id })

  // ponytail: seed local filter state from the URL ONCE. Subsequent edits
  // mutate this state directly (no navigation), which is what stops the
  // per-keystroke loader re-run. useState initializer ignores later URL
  // changes — that's intended: refining filters shouldn't rewrite the URL.
  const initial = Route.useSearch()
  const [q, setQ] = useState(initial.q)
  const [estado, setEstado] = useState(initial.estado)
  const [ciudad, setCiudad] = useState(initial.ciudad)
  const [population, setPopulation] = useState(initial.population)
  const [focusGroups, setFocusGroups] = useState(initial.focusGroups)
  const [practiceAreas, setPracticeAreas] = useState(initial.practiceAreas)
  const [page, setPage] = useState(initial.page)

  const [picking, setPicking] = useState(false)
  // ponytail: filters collapsed by default — the summary row shows what's
  // active so the user never loses track of why the list looks the way it does.
  const [filtersOpen, setFiltersOpen] = useState(false)

  // ponytail: debounce only the free-text search (dropdowns commit at once).
  // 300ms matches typical "stopped typing" cadence; see use-debounced.ts.
  const debouncedQ = useDebounced(q)
  const searchTracked = useRef(false)
  const viewedModality = useRef<string | null>(null)

  // ponytail: placeholderData: keepPreviousData keeps the previous rows on
  // screen while a new filter/page fetch is in flight, so the list never
  // blanks or suspends to a spinner during refinement — the core UX fix.
  // refetchInterval keeps availability badges fresh (20s poll), unchanged.
  const { data, isLoading, isError, isFetching, refetch } = useQuery({
    queryKey: [
      'professionals',
      modality,
      debouncedQ,
      estado,
      ciudad,
      population,
      focusGroups,
      practiceAreas,
      page,
    ],
    queryFn: () =>
      listProfessionals({
        data: {
          modality,
          q: debouncedQ,
          estado,
          ciudad,
          population,
          focusGroups,
          practiceAreas,
          page,
          pageSize: PAGE_SIZE_DEFAULT,
        },
      }),
    // ponytail: refetchInterval only refetches after a successful fetch, so a
    // transient D1 timeout (WEB-3) left the directory stuck on infinite
    // skeletons with no auto-retry. retry: 3 closes that gap — TanStack Query
    // retries the failed query a few times (with backoff) before declaring
    // isError, turning most D1 DO resets into a delayed-but-successful load
    // instead of a stuck page. The isError branch below handles the rest.
    retry: 3,
    placeholderData: keepPreviousData,
    refetchInterval: 20_000,
    staleTime: 15_000,
  })

  const total = data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE_DEFAULT))

  useEffect(() => {
    if (isLoading || viewedModality.current === modality) return
    viewedModality.current = modality
    track({
      event: 'directory_view',
      category: 'public',
      param1: modality,
      value: total,
    })
  }, [modality, total, isLoading])

  useEffect(() => {
    if (!searchTracked.current) {
      searchTracked.current = true
      return
    }
    if (debouncedQ) {
      track({
        event: 'directory_search',
        category: 'public',
        param1: debouncedQ,
      })
    }
  }, [debouncedQ])

  const hasActiveFilters =
    q ||
    estado ||
    ciudad ||
    population ||
    focusGroups ||
    practiceAreas

  // ponytail: human-readable list of the active filters for the collapsed
  // summary. Quoted term for the name search, plain labels for the rest.
  const activeFilterParts: string[] = []
  if (q) activeFilterParts.push(`“${q}”`)
  if (estado) activeFilterParts.push(estado)
  if (ciudad) activeFilterParts.push(ciudad)
  if (population) activeFilterParts.push(population)
  if (focusGroups) activeFilterParts.push(focusGroups)
  if (practiceAreas) activeFilterParts.push(practiceAreas)
  const filterSummary = activeFilterParts.join(' · ')

  // ponytail: filter setters reset page → 1 (narrowing can shorten the list).
  // Pure local state; no navigation. Page changes update local state too and,
  // for shareability, also write `page` into the URL.
  function patchFilter(patch: Partial<Omit<Filters, 'page'>>) {
    setPage(1)
    for (const [key, value] of Object.entries(patch)) {
      if (key === 'q' || !value) continue
      track({
        event: 'directory_filter',
        category: 'public',
        param1: key,
        param2: String(value),
      })
    }
    if (patch.q !== undefined) setQ(patch.q)
    if (patch.estado !== undefined) setEstado(patch.estado)
    if (patch.ciudad !== undefined) setCiudad(patch.ciudad)
    if (patch.population !== undefined) setPopulation(patch.population)
    if (patch.focusGroups !== undefined) setFocusGroups(patch.focusGroups)
    if (patch.practiceAreas !== undefined) setPracticeAreas(patch.practiceAreas)
  }
  function clearFilters() {
    track({ event: 'directory_clear', category: 'public' })
    setQ('')
    setEstado('')
    setCiudad('')
    setPopulation('')
    setFocusGroups('')
    setPracticeAreas('')
    setPage(1)
  }
  function goPage(next: number) {
    track({ event: 'directory_page', category: 'public', value: next })
    setPage(next)
    // ponytail: page is the only filter kept shareable in the URL — lets a
    // user land on a specific page of results. modality already lives there.
    void navigate({ search: (prev) => ({ ...prev, page: next }) })
  }

  async function contactRandom() {
    setPicking(true)
    try {
      const picked = await pickRandomProfessional({
        data: {
          modality,
          q: debouncedQ,
          estado,
          ciudad,
          population,
          focusGroups,
          practiceAreas,
        },
      })
      if (!picked) {
        notify({
          type: 'info',
          title: 'Sin resultados',
          body: 'Ningún profesional está disponible en este momento. Inténtalo más tarde.',
        })
        return
      }
      trackProContactRandom({
        proId: picked.id,
        modality,
      })
      const href = whatsappHref(picked.whatsapp, picked.name)
      if (!href) {
        notify({
          type: 'error',
          title: 'Algo salió mal',
          body: 'No pudimos abrir WhatsApp. Inténtalo de nuevo.',
        })
        return
      }
      window.open(href, '_blank', 'noopener,noreferrer')
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
    modality === 'in_person'
      ? 'Asistencia presencial'
      : 'Asistencia a distancia'

  // ponytail: ciudades is estado-scoped. Cast the lookup to | undefined so
  // the ?? [] is type-honest — without noUncheckedIndexedAccess, TS thinks
  // Record<string,V>[k] is always present, but '' / unknown keys return
  // undefined at runtime.
  const ciudades = (
    ESTADO_CIUDADES as Record<string, readonly string[] | undefined>
  )[estado] ?? []

  return (
    <main className="page-wrap page-wrap--wide flex min-h-[100dvh] flex-col py-4">
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
              Profesionales verificados
            </h1>
            <p className="text-sm text-[var(--medi-text-secondary)]">
              {title}
            </p>
          </div>
          {/* ponytail: Al azar lives in the header on desktop only. On mobile
              it becomes a floating button above the bottom tabs (bigger, easier
              to tap with a thumb) — see the FAB near the end of this component. */}
          <button
            type="button"
            onClick={contactRandom}
            disabled={picking || !data?.anyAvailableNow}
            className="glass-primary hidden md:inline-flex shrink-0 items-center gap-2 rounded-[var(--glass-radius-sm)] px-3 py-2 text-sm font-semibold transition-all hover:translate-y-[-1px] disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--medi-secondary)]"
            title={
              data?.anyAvailableNow
                ? 'Contactar a un profesional verificado al azar'
                : 'Ningún profesional disponible en este momento'
            }
          >
            <Shuffle className="size-4" aria-hidden="true" />
            {picking ? 'Buscando…' : 'Contactar al azar'}
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
                  : 'Buscar, estado, ciudad, edad, población o área'}
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
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Buscar por nombre…"
                aria-label="Buscar por nombre"
                className="glass-input h-12 w-full pl-9 pr-9 text-base"
              />
              {q && (
                <button
                  type="button"
                  onClick={() => patchFilter({ q: '' })}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-[var(--medi-text-secondary)] hover:text-[var(--medi-text-primary)]"
                  aria-label="Borrar búsqueda"
                >
                  <X className="size-4" />
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              <select
                value={estado}
                onChange={(e) =>
                  // ponytail: reset ciudad when estado changes — the ciudad list
                  // is estado-scoped, a stale value would filter to nothing.
                  patchFilter({ estado: e.target.value, ciudad: '' })
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
                value={ciudad}
                onChange={(e) => patchFilter({ ciudad: e.target.value })}
                disabled={!estado}
                aria-label="Filtrar por ciudad"
                className="glass-input h-12 w-full px-3 text-base disabled:opacity-50"
              >
                <option value="">
                  {estado ? 'Todas las ciudades' : 'Primero el estado'}
                </option>
                {ciudades.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>

              <select
                value={population}
                onChange={(e) => patchFilter({ population: e.target.value })}
                aria-label="Filtrar por edad"
                className="glass-input h-12 w-full px-3 text-base"
              >
                <option value="">Todas las edades</option>
                {POPULATION_OPTIONS.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>

              <select
                value={focusGroups}
                onChange={(e) => patchFilter({ focusGroups: e.target.value })}
                aria-label="Filtrar por población específica"
                className="glass-input h-12 w-full px-3 text-base"
              >
                <option value="">Cualquier población</option>
                {FOCUS_GROUP_OPTIONS.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>

              <select
                value={practiceAreas}
                onChange={(e) => patchFilter({ practiceAreas: e.target.value })}
                aria-label="Filtrar por área de intervención"
                className="glass-input h-12 w-full px-3 text-base"
              >
                <option value="">Cualquier área</option>
                {PRACTICE_AREA_OPTIONS.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}
      </div>

      {/* ── Resultados ── */}
      <ul className="mt-4 grid grid-cols-1 gap-3 pb-8 md:grid-cols-2">
        {isError && !data ? (
          // ponytail: cold-load failure (e.g. transient D1 DO reset, WEB-3).
          // keepPreviousData isn't available on the very first fetch, so without
          // this branch the directory fell through to the skeleton branch below
          // and stayed there forever — refetchInterval doesn't fire on failed
          // queries, leaving a help-seeker staring at a stuck loading grid with
          // no path forward. Offer an explicit retry (refetch()) plus a fallback
          // to self-care tools so nobody leaves empty-handed during an outage.
          <li className="glass-card-soft p-5 text-center md:col-span-2">
            <p className="text-[var(--medi-text-secondary)]">
              No pudimos cargar el directorio. Revisa tu conexión e inténtalo de
              nuevo.
            </p>
            <div className="mt-4 flex flex-col items-center gap-3">
              <button
                type="button"
                disabled={isFetching}
                onClick={() => {
                  track({ event: 'directory_retry', category: 'public' })
                  refetch()
                }}
                className="glass-primary inline-flex min-h-12 items-center justify-center rounded-[var(--glass-radius)] px-6 py-3 text-base font-semibold text-white transition-all hover:translate-y-[-1px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--medi-secondary)] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isFetching ? 'Reintentando…' : 'Reintentar'}
              </button>
              <Link
                to="/recursos"
                className="inline-flex items-center gap-2 rounded-[var(--glass-radius-sm)] bg-green-600 px-4 py-2.5 text-sm font-semibold !text-white transition-all hover:translate-y-[-1px] hover:bg-green-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--medi-secondary)]"
              >
                <Wind className="size-4" aria-hidden="true" />
                Probar herramientas de autocuidado
              </Link>
            </div>
          </li>
        ) : isLoading || !data ? (
          // ponytail: only on the very first load (no placeholderData yet).
          // Any later filter/page change keeps the previous rows via
          // keepPreviousData, so skeletons never reappear during refinement.
          <>
            {DIRECTORY_SKELETONS.map((i) => (
              <li key={i} className="glass-card p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-5 w-40" />
                    <Skeleton className="h-4 w-28" />
                    <Skeleton className="h-3 w-52" />
                  </div>
                  <Skeleton className="h-6 w-28 rounded-full" />
                </div>
                <Skeleton className="mt-4 h-12 w-full" />
              </li>
            ))}
          </>
        ) : data.rows.length === 0 ? (
          <li className="glass-card-soft p-5 text-center md:col-span-2">
            <p className="text-[var(--medi-text-secondary)]">
              {hasActiveFilters
                ? 'No hay profesionales que coincidan con tu búsqueda.'
                : 'No hay profesionales en esta modalidad en este momento.'}
            </p>
            {/* ponytail: no results at all → steer to self-help (/recursos) so
                the user leaves with something actionable, not a dead end. */}
            <Link
              to="/recursos"
              className="mt-4 inline-flex items-center gap-2 rounded-[var(--glass-radius-sm)] bg-green-600 px-4 py-2.5 text-sm font-semibold !text-white transition-all hover:translate-y-[-1px] hover:bg-green-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--medi-secondary)]"
            >
              <Wind className="size-4" aria-hidden="true" />
              Probar herramientas de autocuidado
            </Link>
          </li>
        ) : !data.anyAvailableNow ? (
          // ponytail: results exist but none contactable right now — keep the
          // list visible (they can still browse + message for later) but show a
          // self-care nudge above the grid so the user isn't stuck waiting.
          <>
            <li className="glass-card-soft flex flex-col items-center gap-2 p-4 text-center md:col-span-2">
              <p className="text-sm text-[var(--medi-text-secondary)]">
                Ningún profesional está disponible en este momento. Mientras
                tanto, puedes usar nuestras herramientas de autocuidado.
              </p>
              <Link
                to="/recursos"
                className="inline-flex items-center gap-2 rounded-[var(--glass-radius-sm)] bg-green-600 px-4 py-2.5 text-sm font-semibold !text-white transition-all hover:translate-y-[-1px] hover:bg-green-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--medi-secondary)]"
              >
                <Wind className="size-4" aria-hidden="true" />
                Probar herramientas de autocuidado
              </Link>
            </li>
            {data.rows.map((p) => (
              <ProfessionalCard key={p.id} p={p} />
            ))}
          </>
        ) : (
          data.rows.map((p) => <ProfessionalCard key={p.id} p={p} />)
        )}
      </ul>

      {/* ── Paginación ── */}
      {data && totalPages > 1 && (
        <div className="mt-auto flex items-center justify-center gap-4 pb-28 text-sm md:pb-6">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => goPage(page - 1)}
            className="glass-pill px-4 py-2 font-medium text-[var(--medi-text-primary)] disabled:cursor-not-allowed disabled:opacity-40"
          >
            ‹ Anterior
          </button>
          <span className="text-[var(--medi-text-secondary)]">
            Página {page} de {totalPages}
          </span>
          <button
            type="button"
            disabled={page >= totalPages}
            onClick={() => goPage(page + 1)}
            className="glass-pill px-4 py-2 font-medium text-[var(--medi-text-primary)] disabled:cursor-not-allowed disabled:opacity-40"
          >
            Siguiente ›
          </button>
        </div>
      )}

      {/* ponytail: mobile-only floating "Al azar" button, anchored above the
          bottom tab bar so the thumb reaches it without fighting the tabs. The
          z-index sits below the bottom tabs (40) but above cards; position uses
          the safe-area inset so it clears the home indicator on notched phones.
          Display is toggled with utilities (md:hidden) — the unlayered FAB styles
          in styles.css intentionally do NOT set display (tw v4 unlayered-beats-
          layered gotcha). Desktop keeps the inline header button above. */}
      <button
        type="button"
        onClick={contactRandom}
        disabled={picking || !data?.anyAvailableNow}
        aria-label={
          data?.anyAvailableNow
            ? 'Contactar a un profesional verificado al azar'
            : 'Ningún profesional disponible en este momento'
        }
        title={
          data?.anyAvailableNow
            ? 'Contactar a un profesional verificado al azar'
            : 'Ningún profesional disponible en este momento'
        }
        className="fab-random glass-primary md:hidden"
      >
        <Shuffle className="size-6" aria-hidden="true" />
        <span>{picking ? 'Buscando…' : 'Contactar al azar'}</span>
      </button>
    </main>
  )
}

function ProfessionalCard({ p }: { p: PublicProfessional }) {
  // ponytail: wa.me deep-link + pre-filled message. See src/lib/whatsapp.ts —
  // single source of truth for the copy and URL shape across all four contact
  // entry points. Non-null: verified pros pass a validated whatsapp (≥8
  // digits) at registration, so whatsappHref can't return null here in
  // practice. contactable gates the link: inactive / fuera de horario →
  // disabled; the badge on the card already shows when they'll be back.
  const href = whatsappHref(p.whatsapp, p.name)!
  // ponytail: el contacto se habilita solo si el pro es contactable ahora
  // (always | scheduled dentro de horario). inactive / fuera de horario →
  // deshabilitado; el badge de la tarjeta ya muestra cuándo vuelve a estar.
  const contactable = isContactableNow(
    p.availabilityMode,
    p.availabilitySchedule,
    p.timezone ?? 'America/Caracas',
  )

  return (
    <li className="glass-card skip-when-offscreen p-4">
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
          {[...p.focusGroups, ...p.practiceAreas].length > 0 && (
            <p className="mt-0.5 text-xs text-[var(--medi-text-secondary)]">
              Enfoque:{' '}
              {[...p.focusGroups, ...p.practiceAreas].join(' · ')}
            </p>
          )}
          {p.availabilityMode === 'scheduled' &&
            p.availabilitySchedule.length > 0 && (
              <p className="mt-0.5 text-xs text-[var(--medi-text-secondary)]">
                Horario: {formatScheduleHuman(p.availabilitySchedule)}
              </p>
            )}
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <BadgeFPV />
          <AvailabilityBadge
            mode={p.availabilityMode}
            schedule={p.availabilitySchedule}
            timezone={p.timezone}
          />
        </div>
      </div>
      {contactable ? (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() =>
            trackProContact({
              proId: p.id,
              source: 'directory',
            })
          }
          // ponytail: !important so white wins over the unlayered `a { color }`
          // rule in styles.css (unlayered beats layered utilities in tw v4),
          // in both default and hover states.
          className="mt-4 flex min-h-12 w-full items-center justify-center rounded-[var(--glass-radius-sm)] bg-green-600 px-4 py-3 text-base font-semibold !text-white transition-all hover:translate-y-[-1px] hover:bg-green-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--medi-secondary)]"
        >
          Contactar por WhatsApp
        </a>
      ) : (
        <span
          aria-disabled="true"
          className="mt-4 flex min-h-12 w-full cursor-not-allowed items-center justify-center rounded-[var(--glass-radius-sm)] bg-[var(--glass-tint-soft)] px-4 py-3 text-base font-semibold text-[var(--medi-text-secondary)]"
        >
          No disponible ahora
        </span>
      )}
    </li>
  )
}

function AvailabilityBadge({
  mode,
  schedule,
  timezone,
}: {
  mode: AvailabilityMode
  schedule: ScheduleSlot[]
  timezone: string | null
}) {
  // ponytail: live-computed at render — the directory polls every 20s so the
  // badge re-evaluates as windows cross. 'always' = Siempre disponible;
  // 'inactive' = No conectado; 'scheduled' = Disponible ahora / Vuelve… / No disponible.
  const tz = timezone ?? 'America/Caracas'
  if (mode === 'always') {
    return (
      <span
        className="glass-pill inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-green-700"
        title="Siempre disponible"
      >
        <span className="size-2 rounded-full bg-green-500" />
        Siempre disponible
      </span>
    )
  }
  if (mode === 'inactive') {
    return (
      <span
        className="glass-pill inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-[var(--medi-text-secondary)]"
        title="No conectado"
      >
        <span className="size-2 rounded-full bg-slate-400" />
        No conectado
      </span>
    )
  }
  if (isActiveNow(schedule, tz)) {
    return (
      <span
        className="glass-pill inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-green-700"
        title="Disponible ahora"
      >
        <span className="size-2 rounded-full bg-green-500" />
        Disponible ahora
      </span>
    )
  }
  const label = nextStartLabel(schedule, tz)
  return (
    <span
      className="glass-pill inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-amber-700"
      title={label ?? 'No disponible'}
    >
      <span className="size-2 rounded-full bg-amber-500" />
      {label ?? 'No disponible'}
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
