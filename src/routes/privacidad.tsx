import { createFileRoute, Link } from '@tanstack/react-router'
import {
  Database,
  Clock,
  Server,
  ShieldAlert,
  Scale,
  Lock,
  Mail,
} from 'lucide-react'
import { seoHead } from '#/lib/seo'

export const Route = createFileRoute('/privacidad')({
  // ponytail: SSR (default) — contenido estático, compartible y relevante para
  // SEO/credibilidad. Sin loader: es copy puro, sin lecturas a D1.
  head: () =>
    seoHead({
      title: 'Política de datos',
      description:
        'Cómo trata PsicoAyudaVen tus datos personales: qué recopilamos, cuánto tiempo se conservan, dónde viven, qué pasa ante una filtración y qué régimen jurídico aplica (LOPDP Venezuela).',
      path: '/privacidad',
    }),
  component: PrivacidadPage,
})

const SUPPORT_EMAIL = 'soporte@psicoayudaven.com'

function PrivacidadPage() {
  return (
    <main className="page-wrap flex min-h-[100dvh] flex-col py-6">
      <Link
        to="/"
        className="inline-flex items-center gap-1 self-start py-2 text-base font-medium text-[var(--medi-secondary)]"
        aria-label="Atrás"
      >
        ‹ Atrás
      </Link>

      <p className="section-kicker mt-6">Política de datos</p>
      <h1 className="mt-2 text-2xl font-bold text-[var(--medi-text-primary)]">
        Cómo tratamos tu información
      </h1>
      <div className="section-underline mt-2" />
      <p className="mt-4 text-sm text-[var(--medi-text-secondary)]">
        Esta política describe qué datos tratamos, por qué, cuánto los
        conservamos y qué derechos tienes. Aplica a todo el sitio, tanto al
        directorio de profesionales verificados como al acompañamiento
        psicoemocional voluntario que se está incorporando.
      </p>

      <div className="mt-8 flex flex-col gap-4">
        {/* ── Qué datos tratamos ── */}
        <section className="glass-card p-5">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-[var(--medi-text-primary)]">
            <Database
              aria-hidden="true"
              className="size-5 text-[var(--medi-secondary)]"
            />
            Qué datos tratamos
          </h2>

          <p className="mt-3 text-sm font-medium text-[var(--medi-text-primary)]">
            Directorio de profesionales verificados
          </p>
          <p className="mt-1 text-sm leading-relaxed text-[var(--medi-text-secondary)]">
            De quienes se registran como profesionales: nombre, especialidad,
            ubicación y WhatsApp de contacto (visibles en el perfil público),
            además del número de colegiación y los documentos de respaldo que
            solo ve el equipo de verificación. De quienes buscan ayuda: no
            pedimos cuenta ni datos para contactar a un profesional.
          </p>

          <p className="mt-4 text-sm font-medium text-[var(--medi-text-primary)]">
            Acompañamiento psicoemocional voluntario
          </p>
          <p className="mt-1 text-sm leading-relaxed text-[var(--medi-text-secondary)]">
            Cuando una persona recibe acompañamiento, registramos un{' '}
            <strong>código de sesión</strong> (no el nombre completo), los datos
            de contacto del voluntario que la acompaña y, si surge una señal de
            alarma, el registro de la derivación con hora, canal y respuesta
            obtenida.
          </p>
        </section>

        {/* ── Periodo de retención ── */}
        <section className="glass-card p-5">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-[var(--medi-text-primary)]">
            <Clock
              aria-hidden="true"
              className="size-5 text-[var(--medi-secondary)]"
            />
            Por cuánto conservamos los datos
          </h2>
          <ul className="mt-3 space-y-2 text-sm leading-relaxed text-[var(--medi-text-secondary)]">
            <li className="flex gap-2">
              <span
                aria-hidden="true"
                className="mt-2 size-1.5 shrink-0 rounded-full bg-[var(--medi-secondary)]"
              />
              <span>
                <strong>Directorio:</strong> los datos del profesional se
                conservan mientras su cuenta esté activa. Al eliminarla, deja de
                ser visible de inmediato y se borra el perfil público.
              </span>
            </li>
            <li className="flex gap-2">
              <span
                aria-hidden="true"
                className="mt-2 size-1.5 shrink-0 rounded-full bg-[var(--medi-secondary)]"
              />
              <span>
                <strong>Acompañamiento voluntario:</strong>{' '}
                {/* ponytail: plazo de retención orientativo (12 meses tras el
                    último contacto). Pendiente de validación legal y de la
                    implementación del flujo de borrado — no afirmar borrado
                    automático hasta que ambos existan. Coherente con la
                    postura de /voluntariado y del documento de lineamientos. */}
                los registros de sesión se conservan por un periodo orientativo
                de hasta 12 meses después del último contacto. El plazo exacto y
                el procedimiento de eliminación están pendientes de validación
                legal; si una obligación aplicable exige conservarlos por más
                tiempo, se mantendrán únicamente lo necesario para cumplirla.
              </span>
            </li>
          </ul>
        </section>

        {/* ── Dónde viven los datos ── */}
        <section className="glass-card p-5">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-[var(--medi-text-primary)]">
            <Server
              aria-hidden="true"
              className="size-5 text-[var(--medi-secondary)]"
            />
            Dónde viven los datos
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-[var(--medi-text-secondary)]">
            La plataforma corre en <strong>Cloudflare</strong>: almacenamiento
            cifrado en reposo (D1 para datos de texto, R2 para binarios como
            documentos y audios) y tráfico cifrado en tránsito (HTTPS) en toda
            la plataforma. El acceso técnico está limitado al coordinador y al
            equipo de verificación/supervisión. No vendemos ni compartimos tu
            información con terceros.
          </p>
          <p className="mt-2 flex items-center gap-2 text-sm leading-relaxed text-[var(--medi-text-secondary)]">
            <Lock
              aria-hidden="true"
              className="size-4 shrink-0 text-[var(--medi-secondary)]"
            />
            La conversación con un profesional ocurre en WhatsApp, fuera de
            nuestros servidores.
          </p>
        </section>

        {/* ── Filtración o acceso no autorizado ── */}
        <section className="glass-card p-5">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-[var(--medi-text-primary)]">
            <ShieldAlert
              aria-hidden="true"
              className="size-5 text-[var(--notif-error)]"
            />
            Si ocurre una filtración o acceso no autorizado
          </h2>
          <ol className="mt-3 flex flex-col gap-2 text-sm leading-relaxed text-[var(--medi-text-secondary)]">
            {[
              'Detectar: identificamos el alcance y los datos afectados.',
              'Contener: cerramos el acceso comprometido lo antes posible.',
              'Registrar: documentamos qué pasó, cuándo y qué se vio afectado.',
              'Notificar: avisamos a las personas afectadas cuando proceda según la normativa aplicable.',
              'Revisar: ajustamos los controles para evitar que se repita.',
            ].map((line, i) => (
              <li key={line} className="flex gap-2">
                <span
                  aria-hidden="true"
                  className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-[var(--medi-secondary)] text-xs font-bold text-white"
                >
                  {i + 1}
                </span>
                <span>{line}</span>
              </li>
            ))}
          </ol>
        </section>

        {/* ── Régimen aplicable ── */}
        <section className="glass-card p-5">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-[var(--medi-text-primary)]">
            <Scale
              aria-hidden="true"
              className="size-5 text-[var(--medi-secondary)]"
            />
            Régimen aplicable
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-[var(--medi-text-secondary)]">
            Las personas acompañadas están, en su mayoría, en territorio
            venezolano, por lo que se toma como referencia la{' '}
            <strong>
              Ley Especial de Protección de Datos Personales de Venezuela
            </strong>
            . Cada persona voluntaria queda además sujeta a la legislación de
            protección de datos del país desde donde actúa.
          </p>
          {/* ponytail: el régimen aplicable y los derechos quedan sujetos a
              revisión legal formal con asesoría venezolana actualizada (LOPDP
              + Ley de Fiscalización de ONG 2024), igual que la postura de
              registro en /voluntariado. No presentar como zanjado. */}
          <p className="mt-2 rounded-[var(--glass-radius-sm)] border-l-4 border-[var(--medi-secondary)] bg-[rgba(99,102,241,0.06)] p-3 text-sm leading-relaxed text-[var(--medi-text-secondary)]">
            Este es el marco de referencia que seguimos mientras el proyecto
            formaliza su postura legal y de registro. Tanto el régimen aplicable
            como el alcance de los derechos quedan sujetos a validación con una
            persona abogada con conocimiento del derecho venezolano vigente.
          </p>
          <p className="mt-2 text-sm leading-relaxed text-[var(--medi-text-secondary)]">
            Tienes derecho a conocer qué datos tuyos tratamos, a corregirlos y a
            solicitar su eliminación. Para ejercerlos, escríbenos a{' '}
            <a
              href={`mailto:${SUPPORT_EMAIL}`}
              className="font-semibold text-[var(--medi-secondary)] underline"
            >
              {SUPPORT_EMAIL}
            </a>
            .
          </p>
        </section>

        {/* ── Contacto ── */}
        <section className="glass-card p-5">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-[var(--medi-text-primary)]">
            <Mail
              aria-hidden="true"
              className="size-5 text-[var(--medi-secondary)]"
            />
            Contacto
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-[var(--medi-text-secondary)]">
            Para dudas, solicitudes o reportes sobre tus datos, escríbenos a{' '}
            <a
              href={`mailto:${SUPPORT_EMAIL}`}
              className="font-semibold text-[var(--medi-secondary)] underline"
            >
              {SUPPORT_EMAIL}
            </a>
            .
          </p>
        </section>
      </div>

      <footer className="glass-card-soft mt-6 rounded-[var(--glass-radius-sm)] px-4 py-3 text-center text-xs text-[var(--medi-text-secondary)]">
        Este documento es informativo y no constituye asesoría legal.
        PsicoAyudaVen puede actualizar esta política; la versión vigente es la
        publicada en esta página.
      </footer>
    </main>
  )
}
