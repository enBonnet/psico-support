import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useEffect } from 'react'
import {
  HeartPulse,
  Brain,
  HeartHandshake,
  BriefcaseBusiness,
  Flower2,
  Sparkles,
  UsersRound,
  LifeBuoy,
} from 'lucide-react'
import { track } from '#/lib/analytics-client'
import { seoHead } from '#/lib/seo'
import { SPECIALIZED_AREA_OPTIONS } from '#/lib/professional-shared'

// ponytail: per-category icon + one-line description shown under the label.
// Kept inline (not in the shared const) because this is presentation, not data
// — #/lib/professional-shared's SPECIALIZED_AREA_OPTIONS stays the single
// source of truth for
// valid tags; this map only chooses how to render each. Keys must stay in sync
// with SPECIALIZED_AREA_OPTIONS (tsc doesn't enforce it across files; a typo
// would silently fall through to the Sparkles default — keep them aligned).
const AREA_META: Record<
  (typeof SPECIALIZED_AREA_OPTIONS)[number],
  { icon: typeof HeartPulse; desc: string }
> = {
  Duelo: {
    icon: Flower2,
    desc: 'Pérdida de un ser querido, una relación, un empleo o un proyecto de vida.',
  },
  'Personas Cuidadoras': {
    icon: HeartHandshake,
    desc: 'Acompañamiento a quien cuida a otra persona: familia, paciente crónico o dependiente.',
  },
  'Personas Neurodivergentes': {
    icon: Brain,
    desc: 'TEA, TDAH, dislexia y otras neurodivergencias, en clave de fortalezas.',
  },
  Oncológica: {
    icon: LifeBuoy,
    desc: 'Apoyo emocional frente al cáncer, propio o de un familiar.',
  },
  'Diversidad funcional': {
    icon: UsersRound,
    desc: 'Discapacidades físicas, sensoriales o intelectuales y su entorno.',
  },
  Suicidio: {
    icon: HeartPulse,
    desc: 'Pensamientos de muerte o suicidio. Aquí te escuchamos sin juicio.',
  },
  'Acompañamiento y fortalecimiento laboral': {
    icon: BriefcaseBusiness,
    desc: 'Estrés, burnout, conflictos en el trabajo o búsqueda de rumbo profesional.',
  },
  'Trauma y Estrés post Traumático': {
    icon: Sparkles,
    desc: 'Tras un evento traumático: terremoto, violencia, accidente o pérdida abrupta.',
  },
}

export const Route = createFileRoute('/ayuda/especifica')({
  // ponytail: SSR default — this is a content page with SEO value (help-seekers
  // searching "psicólogo duelo" or "psicólogo trauma Venezuela" should land here
  // or step through here to the directory). No loader needed; categories are
  // static, baked into the component.
  head: () =>
    seoHead({
      title: 'Necesito ayuda específica — psicólogos por área',
      description:
        '¿Vives duelo, trauma, ansiedad laboral, cuidas a alguien, o tienes pensamientos de muerte? Te conectamos con psicólogos verificados especializados en cada área.',
      path: '/ayuda/especifica',
    }),
  component: SpecificHelp,
})

function SpecificHelp() {
  const navigate = useNavigate()

  // ponytail: fire once per CSR mount so we can measure how many help-seekers
  // reach the specific-needs triage (vs. the general "ayuda ahora" path).
  useEffect(() => {
    track({ event: 'especifica_view', category: 'public' })
  }, [])

  // ponytail: send the help-seeker to the existing directory with the chosen
  // specialized tag pre-filtered. modality defaults to 'remote' (the lower-
  // friction path — matches the landing's "ayuda ahora" which also opens
  // WhatsApp directly). They can switch to in_person from the directory.
  // The directory's WHERE clause surfaces both inclusive AND exclusive pros
  // when `specialized` is set, so the entire specialized pool is reachable
  // here even though exclusive pros are hidden from default browse.
  function go(area: (typeof SPECIALIZED_AREA_OPTIONS)[number]) {
    track({
      event: 'especifica_select',
      category: 'public',
      param1: area,
    })
    navigate({
      to: '/ayuda/profesionales',
      search: { modality: 'remote', specialized: area },
    })
  }

  return (
    <main className="page-wrap flex min-h-[100dvh] flex-col py-6">
      <Link
        to="/"
        className="inline-flex items-center gap-1 self-start py-2 text-base font-medium text-[var(--medi-secondary)]"
        aria-label="Atrás"
      >
        ‹ Atrás
      </Link>

      <h1 className="mt-6 text-2xl font-bold text-[var(--medi-text-primary)]">
        ¿En qué área necesitas apoyo?
      </h1>
      <div className="section-underline mt-2" />
      <p className="mt-3 text-sm text-[var(--medi-text-secondary)]">
        Elige el área en la que estás ahora. Te llevamos a psicólogos verificados
        que se especializan en esa área.
      </p>

      <div className="mt-8 flex flex-col gap-3">
        {SPECIALIZED_AREA_OPTIONS.map((area) => {
          const meta = AREA_META[area]
          const Icon = meta.icon
          return (
            <button
              key={area}
              type="button"
              onClick={() => go(area)}
              className="glass-card flex min-h-20 w-full items-center gap-4 p-4 text-left transition-all hover:translate-y-[-1px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--medi-secondary)]"
            >
              <Icon className="size-8 shrink-0 text-[var(--medi-secondary)]" />
              <span className="flex flex-col">
                <span className="text-base font-semibold text-[var(--medi-text-primary)]">
                  {area}
                </span>
                <span className="mt-0.5 text-sm text-[var(--medi-text-secondary)]">
                  {meta.desc}
                </span>
              </span>
            </button>
          )
        })}
      </div>

      {/* ponytail: if you're in immediate suicidal crisis, the directory path
          is not the fastest route — point to the resources/crisis line first.
          Kept short and non-alarmist so it doesn't crowd the page. */}
      <p className="mt-8 text-xs text-[var(--medi-text-secondary)]">
        Si sientes que tu vida o la de alguien está en riesgo inmediato, llama
        a la línea de emergencias de tu localidad o acude al centro de salud más
        cercano.
      </p>
    </main>
  )
}
