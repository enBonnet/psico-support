import { createFileRoute, Link } from '@tanstack/react-router'
import { seoHead } from '#/lib/seo'
import { CrisisBanner } from '#/components/crisis-banner'
import { ProCta } from '#/components/pro-cta'

// ponytail: SSR — content-heavy, shareable, the kind of page people Google
// ("¿es normal sentir esto después de un desastre?") or forward on WhatsApp.
// prose (typography plugin) handles long-form readability; a couple of
// minimal arbitrary overrides align heading color with the medical palette.
export const Route = createFileRoute('/recursos/reacciones-normales')({
  head: () =>
    seoHead({
      title: 'Reacciones normales tras una crisis',
      description:
        'Es normal sentir miedo, insomnio o ira después de una emergencia. Conoce qué reacciones son habituales y cuándo conviene buscar ayuda profesional.',
      path: '/recursos/reacciones-normales',
    }),
  component: ReaccionesNormales,
})

function ReaccionesNormales() {
  return (
    <main className="page-wrap flex min-h-[100dvh] flex-col py-6">
      <Link
        to="/recursos"
        className="inline-flex items-center gap-1 self-start py-2 text-base font-medium text-[var(--medi-secondary)]"
        aria-label="Atrás"
      >
        ‹ Atrás
      </Link>

      <p className="section-kicker mt-6">Psicoeducación</p>
      <h1 className="mt-2 text-2xl font-bold text-[var(--medi-text-primary)]">
        Reacciones normales tras una crisis
      </h1>
      <div className="section-underline mt-2" />

      <div className="glass-card mt-6 p-5">
        <div className="prose prose-sm max-w-none prose-headings:text-[var(--medi-primary)] prose-strong:text-[var(--medi-text-primary)] prose-a:text-[var(--medi-secondary)]">
          <p>
            Después de una emergencia, un desastre o una experiencia muy
            estresante, es <strong>común y normal</strong> tener reacciones
            intensas. No significan que estés perdiendo el control: son
            reacciones de una persona normal a una situación anormal.
          </p>

          <h2>Reacciones que suelen aparecer</h2>
          <ul>
            <li>Dificultad para dormir, pesadillas o insomnio.</li>
            <li>
              Recuerdos o pensamientos intrusos sobre lo ocurrido (incluyendo
              olores, sonidos o imágenes).
            </li>
            <li>Irritabilidad, enojo o cambios de humor.</li>
            <li>Tristeza, llanto fácil o sensación de vacío.</li>
            <li>Miedo, ansiedad, hipervigilancia o sobresaltos fáciles.</li>
            <li>
              Culpa (por lo que hiciste o por sobrevivir cuando otros no).
            </li>
            <li>
              Tensión física, dolores de cabeza, fatiga, opresión en el pecho o
              malestar digestivo.
            </li>
            <li>
              Sensación de embotamiento, desconexión o de que “todo es irreal”.
            </li>
            <li>Dificultad para concentrarte o para tomar decisiones.</li>
            <li>Aislamiento o desinterés por actividades habituales.</li>
          </ul>

          <h2>Lo que suele ayudar</h2>
          <ul>
            <li>
              <strong>Volver a una rutina básica</strong>: dormir, comer y
              hidratarte a horas regulares.
            </li>
            <li>
              <strong>Hablar con personas de confianza</strong> cuando te sientas
              listo, sin forzarte.
            </li>
            <li>
              <strong>Movimiento y respiración</strong>: caminar y los ejercicios
              de respiración regulan el sistema nervioso.
            </li>
            <li>
              <strong>Limitar la exposición a noticias e imágenes</strong> del
              evento, sobre todo antes de dormir.
            </li>
            <li>
              <strong>Aceptar tus emociones</strong> en lugar de combatirlas.
            </li>
          </ul>

          <div className="not-prose rounded-[var(--glass-radius-sm)] border-l-4 border-[var(--medi-secondary)] bg-[rgba(23,140,239,0.06)] p-4">
            <p className="m-0 text-sm text-[var(--medi-text-secondary)]">
              En la mayoría de las personas estas reacciones disminuyen
              gradualmente en las semanas siguientes, especialmente con apoyo y
              descanso.
            </p>
          </div>

          <h2>¿Cuándo conviene buscar ayuda profesional?</h2>
          <p>Considera hablar con un psicólogo si:</p>
          <ul>
            <li>Las reacciones no disminuyen después de varias semanas.</li>
            <li>
              Se intensifican o interfieren con tu vida diaria (trabajo,
              estudio, relaciones, autocuidado).
            </li>
            <li>
              Tienes pensamientos de hacerte daño, dañar a otros, o sientes que
              no quieres seguir.
            </li>
            <li>Recurres a sustancias (alcohol, drogas) para lidiar con ello.</li>
            <li>Sientes que no puedes funcionar ni con apoyo cercano.</li>
          </ul>
          <p>
            Pedir ayuda es un acto de cuidado, no de debilidad. Puedes hacerlo
            en cualquier momento.
          </p>
        </div>
      </div>

      <div className="mt-6 flex flex-col gap-4">
        <CrisisBanner />
        <ProCta />
      </div>
    </main>
  )
}
