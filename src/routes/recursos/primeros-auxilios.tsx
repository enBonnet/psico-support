import { createFileRoute, Link } from '@tanstack/react-router'
import { Eye, Ear, Link2 } from 'lucide-react'
import { seoHead } from '#/lib/seo'
import { CrisisBanner } from '#/components/crisis-banner'
import { ProCta } from '#/components/pro-cta'

// ponytail: SSR — the "help someone else" page; high share value (people
// forward PFA guides on WhatsApp during a crisis) and SEO-relevant. Content
// follows the WHO/IASC Psychological First Aid framework (Mirar, Escuchar,
// Conectar / Look-Listen-Link) — kept faithful to the standard field guide,
// no invented clinical claims.
export const Route = createFileRoute('/recursos/primeros-auxilios')({
  head: () =>
    seoHead({
      title: 'Primeros Auxilios Psicológicos (PAP)',
      description:
        'Guía práctica de Primeros Auxilios Psicológicos para acompañar a alguien en crisis: Mirar, Escuchar y Conectar. Qué hacer y qué evitar.',
      path: '/recursos/primeros-auxilios',
    }),
  component: PrimerosAuxilios,
})

interface PfaStep {
  icon: typeof Eye
  title: string
  items: string[]
}
const PFA: readonly PfaStep[] = [
  {
    icon: Eye,
    title: '1. Mirar',
    items: [
      'Comprueba la seguridad tuya y de la persona antes de acercarte.',
      'Identifica necesidades urgentes o evidentes (lesiones, frío, sed).',
      'Detecta a quienes puedan necesitar ayuda extra para acceder a los servicios: niños, adultos mayores, personas con discapacidad o embarazadas.',
    ],
  },
  {
    icon: Ear,
    title: '2. Escuchar',
    items: [
      'Acércate con calma y respeto, a su ritmo.',
      'Pregunta por sus necesidades y preocupaciones inmediatas.',
      'Escucha sin interrumpir ni juzgar.',
      'Ayuda a la persona a calmarse: tu presencia, un vaso de agua o un lugar tranquilo suelen ser más útiles que cualquier consejo.',
    ],
  },
  {
    icon: Link2,
    title: '3. Conectar',
    items: [
      'Ayuda a cubrir necesidades básicas: alimento, abrigo, información.',
      'Facilita el contacto con familiares o seres queridos.',
      'Protege de más daño: evita exposiciones públicas, cámaras o medios.',
      'Da información correcta y verificada; evita repetir rumores.',
      'Conecta con ayuda profesional y servicios disponibles cuando lo necesite.',
    ],
  },
]

function PrimerosAuxilios() {
  return (
    <main className="page-wrap flex min-h-[100dvh] flex-col py-6">
      <Link
        to="/recursos"
        className="inline-flex items-center gap-1 self-start py-2 text-base font-medium text-[var(--medi-secondary)]"
        aria-label="Atrás"
      >
        ‹ Atrás
      </Link>

      <p className="section-kicker mt-6">Para ayudar a otros</p>
      <h1 className="mt-2 text-2xl font-bold text-[var(--medi-text-primary)]">
        Primeros Auxilios Psicológicos (PAP)
      </h1>
      <div className="section-underline mt-2" />

      <p className="mt-4 text-sm text-[var(--medi-text-secondary)]">
        Los Primeros Auxilios Psicológicos son una forma humana y práctica de
        acompañar a alguien que vive una crisis. No requieren formación clínica:
        se basan en tres pasos sencillos.
      </p>

      <div className="mt-6 flex flex-col gap-4">
        {PFA.map((step) => {
          const Icon = step.icon
          return (
            <section key={step.title} className="glass-card p-5">
              <h2 className="flex items-center gap-2 text-lg font-semibold text-[var(--medi-text-primary)]">
                <Icon
                  aria-hidden="true"
                  className="size-5 shrink-0 text-[var(--medi-secondary)]"
                />
                {step.title}
              </h2>
              <ul className="mt-3 space-y-2">
                {step.items.map((it) => (
                  <li
                    key={it}
                    className="flex gap-2 text-sm leading-relaxed text-[var(--medi-text-secondary)]"
                  >
                    <span
                      aria-hidden="true"
                      className="mt-2 size-1.5 shrink-0 rounded-full"
                      style={{ backgroundColor: 'var(--medi-secondary)' }}
                    />
                    <span>{it}</span>
                  </li>
                ))}
              </ul>
            </section>
          )
        })}
      </div>

      <section className="glass-card mt-4 p-5">
        <h2 className="text-lg font-semibold text-[var(--medi-text-primary)]">
          Qué evitar
        </h2>
        <ul className="mt-3 space-y-2">
          {[
            'No obligues a nadie a contar su historia.',
            'No minimices lo que siente con frases como “todo va a estar bien”.',
            'No hagas promesas que no puedes cumplir.',
            'No des información falsa o inventada.',
            'No tomes decisiones por la persona sin su consentimiento.',
          ].map((it) => (
            <li
              key={it}
              className="flex gap-2 text-sm leading-relaxed text-[var(--medi-text-secondary)]"
            >
              <span
                aria-hidden="true"
                className="mt-2 size-1.5 shrink-0 rounded-full"
                style={{ backgroundColor: 'var(--notif-warning)' }}
              />
              <span>{it}</span>
            </li>
          ))}
        </ul>
      </section>

      <p className="mt-4 text-xs text-[var(--medi-text-secondary)]">
        Esta guía resume los principios de los Primeros Auxilios Psicológicos
        basados en el modelo de la OMS (Mirar, Escuchar, Conectar). No
        convierte a quien la lee en profesional de salud mental.
      </p>

      <div className="mt-6 flex flex-col gap-4">
        <CrisisBanner />
        <ProCta />
      </div>
    </main>
  )
}
