import { createFileRoute, Link } from '@tanstack/react-router'
import { MapPin, Users } from 'lucide-react'
import { seoHead } from '#/lib/seo'

export const Route = createFileRoute('/equipo')({
  // ponytail: SSR (default) — contenido estático, compartible y relevante para
  // credibilidad. Sin loader: es copy puro. Misma forma que /acerca-de y
  // /terminos.
  head: () =>
    seoHead({
      title: 'Equipo · PsicoAyudaVen',
      description:
        'Un equipo multidisciplinario entre Venezuela, Chile, Perú, Colombia, México y España detrás de PsicoAyudaVen: psicología, trabajo social, salud mental, estrategia y desarrollo.',
      path: '/equipo',
    }),
  component: EquipoPage,
})

// ponytail: equipo como array de datos, no JSX suelto. Añadir/quitar gente es
// un append aquí — el render es un .map. Sin fotos (se pidió minimal: nombre +
// rol + país + enlaces). Los países van en español (el sitio es es_VE).
type Member = {
  name: string
  role?: string
  country?: string
  links?: { label: string; href: string }[]
}

const TEAM: Member[] = [
  {
    name: 'Mariangela Manganiello',
    role: 'Licenciada en psicología y terapeuta de parejas. Titulada en Venezuela y revalidada en la Universidad de Chile.',
    country: 'Venezuela · Chile',
  },
  {
    name: 'Carol Cayotopa Díaz',
    role: 'Trabajadora social y magíster en cooperación internacional al desarrollo',
    country: 'Perú · España',
  },
  {
    name: 'David Álvarez',
    role: 'Unidos Hoy',
    country: 'Colombia',
  },
  {
    name: 'Claudia Gómez y Claudia Ruiz',
    role: 'Directoras de C7 Salud Mental',
    country: 'México',
  },
  {
    name: 'Marcela Tabares',
    country: 'Colombia',
  },
  {
    name: 'Gabriela Luigi',
  },
  {
    name: 'Carol Monroe',
  },
  {
    name: 'Leonardo Rincón',
    country: 'España',
  },
  {
    name: 'Isy Soto',
    country: 'México',
  },
  {
    name: 'Ender Bonnet',
    role: 'Desarrollo',
    links: [{ label: 'enbonnet.com', href: 'https://enbonnet.com' }],
  },
]

function EquipoPage() {
  return (
    <main className="page-wrap flex min-h-[100dvh] flex-col py-6">
      <Link
        to="/"
        className="inline-flex items-center gap-1 self-start py-2 text-base font-medium text-[var(--medi-secondary)]"
        aria-label="Atrás"
      >
        ‹ Atrás
      </Link>

      <p className="section-kicker mt-6">Equipo</p>
      <h1 className="mt-2 text-2xl font-bold text-[var(--medi-text-primary)]">
        Las personas detrás de PsicoAyudaVen
      </h1>
      <div className="section-underline mt-2" />

      <p className="mt-4 text-base text-[var(--medi-text-secondary)]">
        Un equipo multidisciplinario entre Venezuela, Chile, Perú, Colombia,
        México y España que articula psicología, trabajo social, salud mental,
        estrategia y desarrollo para sostener esta red de apoyo.
      </p>

      <section className="glass-card mt-8 p-5">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-[var(--medi-text-primary)]">
          <Users
            aria-hidden="true"
            className="size-5 text-[var(--medi-secondary)]"
          />
          Quiénes somos
        </h2>
        <ul className="mt-4 flex flex-col divide-y divide-[var(--medi-line)]">
          {TEAM.map((m) => (
            <li
              key={m.name}
              className="flex flex-col gap-1 py-4 first:pt-0 last:pb-0"
            >
              <span className="text-base font-semibold text-[var(--medi-text-primary)]">
                {m.name}
              </span>
              {m.role && (
                <span className="text-sm font-medium text-[var(--medi-secondary)]">
                  {m.role}
                </span>
              )}
              {m.country && (
                <span className="flex items-center gap-1 text-sm text-[var(--medi-text-secondary)]">
                  <MapPin
                    aria-hidden="true"
                    className="size-3.5 shrink-0"
                  />
                  {m.country}
                </span>
              )}
              {m.links && m.links.length > 0 && (
                <span className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
                  {m.links.map((l) => (
                    <a
                      key={l.href}
                      href={l.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm font-medium text-[var(--medi-secondary)] hover:underline"
                    >
                      {l.label}
                    </a>
                  ))}
                </span>
              )}
            </li>
          ))}
        </ul>
      </section>

      <footer className="glass-card-soft mt-6 rounded-[var(--glass-radius-sm)] px-4 py-3 text-center text-sm text-[var(--medi-text-secondary)]">
        ¿Quieres sumarte al equipo o colaborar?{' '}
        <Link
          to="/acerca-de"
          className="font-medium text-[var(--medi-secondary)] hover:underline"
        >
          Conoce más sobre el proyecto
        </Link>
      </footer>
    </main>
  )
}
