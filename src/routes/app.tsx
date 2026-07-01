import { createFileRoute, Link } from '@tanstack/react-router'
import {
  MoreVertical,
  Plus,
  Share,
  Smartphone,
  WifiOff,
  Zap,
} from 'lucide-react'
import { seoHead } from '#/lib/seo'

// ponytail: SSR (default) — static install guide, no DB/loader. Shareable so
// OG meta should land in initial HTML. The dynamic one-tap prompt already lives
// in <InstallCard/> on the home page; this page is the manual reference.

export const Route = createFileRoute('/app')({
  head: () =>
    seoHead({
      title: 'Instalar la app',
      description:
        'Cómo instalar la app de PsicoAyudaVen en tu celular Android o iPhone: acceso rápido desde tu pantalla de inicio y uso sin conexión.',
      path: '/app',
    }),
  component: AppInstallPage,
})

const BENEFITS = [
  { icon: Zap, text: 'Acceso rápido desde tu pantalla de inicio' },
  { icon: WifiOff, text: 'Funciona sin conexión a internet' },
  { icon: Smartphone, text: 'Experiencia a pantalla completa, como una app' },
] as const

// ponytail: literal numbered badge instead of a CSS counter rule — two sections,
// four steps each. A counter would need a style to own; one span per step reads
// clearly and keeps the guide in a single file.
function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span
        aria-hidden="true"
        className="flex size-6 shrink-0 items-center justify-center rounded-full bg-[var(--medi-primary)] text-xs font-bold text-white"
      >
        {n}
      </span>
      <span className="pt-0.5 text-sm leading-relaxed text-[var(--medi-text-secondary)]">
        {children}
      </span>
    </li>
  )
}

function AppInstallPage() {
  return (
    <main className="page-wrap flex min-h-[100dvh] flex-col py-6">
      <Link
        to="/"
        className="inline-flex items-center gap-1 self-start py-2 text-base font-medium text-[var(--medi-secondary)]"
        aria-label="Atrás"
      >
        ‹ Atrás
      </Link>

      <header className="mt-6">
        <p className="section-kicker">Instalar la app</p>
        <h1 className="mt-2 text-2xl font-bold leading-tight text-[var(--medi-primary)] sm:text-3xl">
          Lleva la ayuda siempre contigo
        </h1>
        <div className="section-underline mt-2" />
        <p className="mt-4 text-base text-[var(--medi-text-secondary)]">
          PsicoAyudaVen funciona como una app en tu celular. Instálala una vez y
          tendrás acceso rápido y uso sin conexión.
        </p>
      </header>

      <ul className="mt-6 flex flex-col gap-2">
        {BENEFITS.map(({ icon: Icon, text }) => (
          <li
            key={text}
            className="glass-card-soft flex items-center gap-3 rounded-[var(--glass-radius-sm)] px-4 py-3"
          >
            <Icon
              aria-hidden="true"
              className="size-5 shrink-0 text-[var(--medi-secondary)]"
            />
            <span className="text-sm font-medium text-[var(--medi-text-primary)]">
              {text}
            </span>
          </li>
        ))}
      </ul>

      <div className="mt-8 flex flex-col gap-4">
        <section className="glass-card p-5">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-[var(--medi-text-primary)]">
            <Smartphone
              aria-hidden="true"
              className="size-5 text-[var(--medi-secondary)]"
            />
            Android (Chrome)
          </h2>
          <ol className="mt-4 flex flex-col gap-3">
            <Step n={1}>
              Abre{' '}
              <span className="font-medium text-[var(--medi-text-primary)]">
                psicoayudaven.com
              </span>{' '}
              en Google Chrome.
            </Step>
            <Step n={2}>
              Toca el menú{' '}
              <MoreVertical
                aria-hidden="true"
                className="inline size-4 align-text-bottom"
              />{' '}
              (arriba a la derecha).
            </Step>
            <Step n={3}>
              Selecciona{' '}
              <span className="font-medium text-[var(--medi-text-primary)]">
                Agregar a pantalla de inicio
              </span>{' '}
              o <span className="font-medium">Instalar aplicación</span>.
            </Step>
            <Step n={4}>Confirma. El ícono aparecerá en tu pantalla de inicio.</Step>
          </ol>
        </section>

        <section className="glass-card p-5">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-[var(--medi-text-primary)]">
            <Smartphone
              aria-hidden="true"
              className="size-5 text-[var(--medi-secondary)]"
            />
            iPhone (Safari)
          </h2>
          <ol className="mt-4 flex flex-col gap-3">
            <Step n={1}>
              Abre{' '}
              <span className="font-medium text-[var(--medi-text-primary)]">
                psicoayudaven.com
              </span>{' '}
              en Safari.
            </Step>
            <Step n={2}>
              Toca el botón Compartir{' '}
              <Share
                aria-hidden="true"
                className="inline size-4 align-text-bottom"
              />{' '}
              (abajo).
            </Step>
            <Step n={3}>
              Elige{' '}
              <span className="inline-flex items-center gap-1 font-medium text-[var(--medi-text-primary)]">
                <Plus aria-hidden="true" className="size-3.5" />
                Agregar a pantalla de inicio
              </span>
              .
            </Step>
            <Step n={4}>Confirma. El ícono aparecerá en tu pantalla de inicio.</Step>
          </ol>
        </section>
      </div>

      <p className="mt-6 text-center text-xs text-[var(--medi-text-secondary)]">
        También puedes instalarla desde el botón «Instalar» en la página de
        inicio cuando aparezca.
      </p>

      <Link
        to="/"
        aria-label="Volver al inicio"
        className="mt-4 block rounded-[var(--glass-radius-sm)] px-4 py-3 text-center text-sm text-[var(--medi-text-secondary)] transition-all hover:translate-y-[-1px]"
      >
        ‹ Volver al inicio
      </Link>
    </main>
  )
}
