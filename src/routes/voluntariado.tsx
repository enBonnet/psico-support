import { createFileRoute, Link } from '@tanstack/react-router'
import {
  HeartHandshake,
  Globe,
  Scale,
  Ban,
  FileSignature,
  ShieldX,
  Mail,
} from 'lucide-react'
import { seoHead } from '#/lib/seo'

export const Route = createFileRoute('/voluntariado')({
  // ponytail: SSR (default) — documento de referencia estable, compartible y
  // relevante para SEO/credibilidad. Sin loader: es copy puro.
  head: () =>
    seoHead({
      title: 'Marco para voluntariado',
      description:
        'Marco de acompañamiento psicoemocional voluntario y transfronterizo: qué es y qué no es, encuadre, régimen de responsabilidad, vínculo de voluntariado y carta de adhesión.',
      path: '/voluntariado',
    }),
  component: VoluntariadoPage,
})

const SUPPORT_EMAIL = 'soporte@psicoayudaven.com'

function VoluntariadoPage() {
  return (
    <main className="page-wrap flex min-h-[100dvh] flex-col py-6">
      <Link
        to="/"
        className="inline-flex items-center gap-1 self-start py-2 text-base font-medium text-[var(--medi-secondary)]"
        aria-label="Atrás"
      >
        ‹ Atrás
      </Link>

      <p className="section-kicker mt-6">Voluntariado</p>
      <h1 className="mt-2 text-2xl font-bold text-[var(--medi-text-primary)]">
        Marco para voluntariado
      </h1>
      <div className="section-underline mt-2" />
      <p className="mt-4 text-sm text-[var(--medi-text-secondary)]">
        Este marco describe el modelo de{' '}
        <strong>
          acompañamiento psicoemocional voluntario y transfronterizo
        </strong>{' '}
        hacia el que avanza el proyecto: personas con formación en salud mental,
        desde cualquier parte del mundo, acompañan de forma gratuita a quienes
        enfrentan una emergencia humanitaria en Venezuela.
      </p>
      {/* ponytail: aviso de transición — el directorio de profesionales
          verificados sigue operativo con sus propios términos (/terminos).
          No mezclar ambos marcos en la cabeza del usuario. */}
      <p className="mt-2 rounded-[var(--glass-radius-sm)] bg-[rgba(25,155,238,0.1)] p-3 text-sm text-[var(--medi-text-secondary)]">
        Mientras este modelo se incorpora, el{' '}
        <Link
          to="/terminos"
          className="font-semibold text-[var(--medi-secondary)] underline"
        >
          directorio de profesionales verificados
        </Link>{' '}
        sigue operativo con sus propios términos.
      </p>

      <div className="mt-8 flex flex-col gap-4">
        {/* ── Naturaleza del servicio ── */}
        <section className="glass-card p-5">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-[var(--medi-text-primary)]">
            <HeartHandshake
              aria-hidden="true"
              className="size-5 text-[var(--medi-secondary)]"
            />
            Naturaleza del servicio
          </h2>

          <p className="mt-3 text-sm font-medium text-[var(--medi-text-primary)]">
            Qué es
          </p>
          <ul className="mt-1 space-y-2 text-sm leading-relaxed text-[var(--medi-text-secondary)]">
            {[
              'Acompañamiento psicoemocional de primer nivel, voluntario y gratuito, para personas afectadas por una situación de desastre o emergencia humanitaria en Venezuela.',
              'Una intervención breve orientada a la contención, la escucha activa, la estabilización emocional inmediata y la orientación hacia recursos y rutas de atención.',
              'Un servicio prestado a distancia por personas con formación en salud mental que actúan como voluntarias.',
            ].map((line) => (
              <li key={line} className="flex gap-2">
                <span
                  aria-hidden="true"
                  className="mt-2 size-1.5 shrink-0 rounded-full bg-[var(--medi-secondary)]"
                />
                <span>{line}</span>
              </li>
            ))}
          </ul>

          <p className="mt-4 text-sm font-medium text-[var(--medi-text-primary)]">
            Qué no es
          </p>
          <ul className="mt-1 space-y-2 text-sm leading-relaxed text-[var(--medi-text-secondary)]">
            {[
              'No es psicoterapia, ni tratamiento clínico, ni diagnóstico psicológico o psiquiátrico.',
              'No es ejercicio profesional regulado en el territorio donde se encuentra la persona acompañada.',
              'No sustituye a los sistemas de salud, protección civil o emergencia locales, ni actúa como intermediario oficial ante ellos.',
              'No implica una relación médico-paciente ni genera un expediente clínico en sentido formal.',
            ].map((line) => (
              <li key={line} className="flex gap-2">
                <Ban
                  aria-hidden="true"
                  className="mt-0.5 size-4 shrink-0 text-[var(--notif-error)]"
                />
                <span>{line}</span>
              </li>
            ))}
          </ul>
        </section>

        {/* ── Encuadre transfronterizo ── */}
        <section className="glass-card p-5">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-[var(--medi-text-primary)]">
            <Globe
              aria-hidden="true"
              className="size-5 text-[var(--medi-secondary)]"
            />
            Encuadre transfronterizo
          </h2>
          <ul className="mt-3 space-y-2 text-sm leading-relaxed text-[var(--medi-text-secondary)]">
            {[
              'Quien acompaña puede estar en cualquier país; quien es acompañado está, en su mayoría, en Venezuela.',
              'El acompañamiento no se presenta como ejercicio profesional regulado en territorio venezolano, ni como representación legal ni como actuación en nombre de instituciones venezolanas.',
              'El servicio es gratuito: no hay cobro ni contraprestación económica.',
              'Ninguna comunicación del proyecto promete resultados, garantiza protección o se presenta como autoridad médica o legal.',
            ].map((line) => (
              <li key={line} className="flex gap-2">
                <span
                  aria-hidden="true"
                  className="mt-2 size-1.5 shrink-0 rounded-full bg-[var(--medi-secondary)]"
                />
                <span>{line}</span>
              </li>
            ))}
          </ul>
        </section>

        {/* ── Régimen de responsabilidad ── */}
        <section className="glass-card p-5">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-[var(--medi-text-primary)]">
            <Scale
              aria-hidden="true"
              className="size-5 text-[var(--medi-secondary)]"
            />
            Régimen de responsabilidad
          </h2>

          <p className="mt-3 text-sm font-medium text-[var(--medi-text-primary)]">
            Del proyecto
          </p>
          <p className="mt-1 text-sm leading-relaxed text-[var(--medi-text-secondary)]">
            El proyecto se compromete a mantener un protocolo de actuación
            claro, a capacitar a cada persona voluntaria antes de su primer
            caso, a sostener un circuito de supervisión y derivación funcional y
            a reaccionar con diligencia ante cualquier señal de riesgo. Es una{' '}
            <strong>responsabilidad de medios</strong> — hacer lo razonable y
            documentable para prevenir el daño — y no de resultados: nadie puede
            garantizar el bienestar final de la persona acompañada.
          </p>

          <p className="mt-4 text-sm font-medium text-[var(--medi-text-primary)]">
            De cada persona voluntaria
          </p>
          <ul className="mt-1 space-y-2 text-sm leading-relaxed text-[var(--medi-text-secondary)]">
            {[
              'Actuar dentro de los límites de su formación y del protocolo.',
              'No ofrecer diagnósticos ni indicaciones clínicas o médicas.',
              'Escalar oportunamente cuando aparece una señal de alarma.',
              'Resguardar la confidencialidad de lo compartido.',
            ].map((line) => (
              <li key={line} className="flex gap-2">
                <span
                  aria-hidden="true"
                  className="mt-2 size-1.5 shrink-0 rounded-full bg-[var(--medi-secondary)]"
                />
                <span>{line}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-sm leading-relaxed text-[var(--medi-text-secondary)]">
            Una persona voluntaria que actúa dentro del protocolo y deriva a
            tiempo está cubierta por el marco institucional; quien se aparta del
            protocolo por iniciativa propia —ofreciendo diagnóstico,
            prescribiendo o prometiendo resultados— asume un riesgo que el marco
            colectivo no está diseñado para cubrir.
          </p>
        </section>

        {/* ── Deslinde frente a terceros ── */}
        <section className="glass-card p-5">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-[var(--medi-text-primary)]">
            <ShieldX
              aria-hidden="true"
              className="size-5 text-[var(--notif-error)]"
            />
            Deslinde frente a terceros
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-[var(--medi-text-secondary)]">
            El acompañamiento no sustituye a los servicios de emergencia, salud
            o protección oficiales. Ante una situación de riesgo vital
            inmediato, la persona debe ser dirigida a esos servicios en primer
            lugar. Esta línea es también una guía honesta sobre los límites
            reales de una intervención virtual y voluntaria.
          </p>
        </section>

        {/* ── Vínculo de voluntariado ── */}
        <section className="glass-card p-5">
          <h2 className="text-lg font-semibold text-[var(--medi-text-primary)]">
            Naturaleza del vínculo de voluntariado
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-[var(--medi-text-secondary)]">
            La participación es <strong>voluntaria</strong> y no constituye una
            relación laboral: no genera subordinación, horario fijo obligatorio
            ni remuneración, y puede terminar en cualquier momento por
            cualquiera de las dos partes sin obligaciones adicionales. Esto
            protege también al voluntario: su compromiso es libre y revocable,
            coherente con el espíritu del trabajo humanitario.
          </p>
        </section>

        {/* ── Carta de adhesión ── */}
        <section className="glass-card p-5">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-[var(--medi-text-primary)]">
            <FileSignature
              aria-hidden="true"
              className="size-5 text-[var(--medi-secondary)]"
            />
            Carta de adhesión
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-[var(--medi-text-secondary)]">
            Al adherirte como persona voluntaria, declaras haber leído y
            comprendido este marco y el protocolo operativo, y confirmas lo
            siguiente:
          </p>
          {/* ponytail: bloque destacado — el párrafo que el voluntario acepta.
              Redactado en presente/infinitivo para encajar cuando se habilite
              el flujo de adhesión (aún como deuda de producto). */}
          <blockquote className="mt-3 rounded-[var(--glass-radius-sm)] bg-[rgba(25,155,238,0.1)] p-4 text-sm leading-relaxed text-[var(--medi-text-primary)]">
            Mi participación es <strong>voluntaria</strong> y{' '}
            <strong>no laboral</strong>, sin remuneración, subordinación u
            horario obligatorio, y puedo terminarla en cualquier momento. Me
            comprometo a actuar dentro del protocolo, a no ofrecer diagnósticos
            ni indicaciones clínicas o médicas, y a derivar oportunamente ante
            cualquier señal de alarma. Entiendo que el acompañamiento{' '}
            <strong>
              no constituye ejercicio profesional regulado en Venezuela
            </strong>{' '}
            ni sustituye a los servicios de emergencia, salud o protección
            oficiales.
          </blockquote>
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
            Para dudas sobre este marco o sobre el voluntariado, escríbenos a{' '}
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
        Este documento es informativo y no constituye asesoría legal. Algunas
        decisiones (como el registro formal del proyecto) permanecen abiertas y
        se validarán con asesoría legal venezolana actualizada.
      </footer>
    </main>
  )
}
