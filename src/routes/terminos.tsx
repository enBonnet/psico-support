import { createFileRoute, Link } from '@tanstack/react-router'
import { LifeBuoy, ShieldCheck, HeartHandshake, Ban, Mail } from 'lucide-react'
import { seoHead } from '#/lib/seo'

// ponytail: placeholders — el psicólogo supervisor debe reemplazar estos valores
// antes de deployar. Centralizados aquí para editar en un solo lugar. El correo
// de soporte/verificación lo monitorea el equipo del psicólogo supervisor.
const SUPERVISOR = {
  role: 'Psicólogo supervisor',
  name: '[Nombre del psicólogo supervisor]',
  credential: '[Nº de colegiación y país]',
}
const SUPPORT_EMAIL = 'soporte@psicoayudaven.com'

export const Route = createFileRoute('/terminos')({
  // ponytail: SSR (default) — contenido estático, compartible y relevante para
  // SEO/credibilidad. Sin loader: es copy puro, sin lecturas a D1.
  head: () =>
    seoHead({
      title: 'Términos para profesionales',
      description:
        'Términos y condiciones para psicólogos que participan en PsicoAyudaVen: plataforma sin fines de lucro, apoyo gratuito, prohibición de cobros y supervisión clínica.',
      path: '/terminos',
    }),
  component: TerminosPage,
})

function TerminosPage() {
  return (
    <main className="page-wrap flex min-h-[100dvh] flex-col py-6">
      <Link
        to="/"
        className="inline-flex items-center gap-1 self-start py-2 text-base font-medium text-[var(--medi-secondary)]"
        aria-label="Atrás"
      >
        ‹ Atrás
      </Link>

      <p className="section-kicker mt-6">Términos y condiciones</p>
      <h1 className="mt-2 text-2xl font-bold text-[var(--medi-text-primary)]">
        Términos para profesionales
      </h1>
      <div className="section-underline mt-2" />
      <p className="mt-4 text-sm text-[var(--medi-text-secondary)]">
        Estos términos regulan la participación de psicólogos en PsicoAyudaVen.
        Al registrarte y ofrecer tu apoyo a través de la plataforma, declaras
        haberlos leído y aceptado.
      </p>

      <div className="mt-8 flex flex-col gap-4">
        {/* ── Naturaleza de la plataforma ── */}
        <section className="glass-card p-5">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-[var(--medi-text-primary)]">
            <HeartHandshake
              aria-hidden="true"
              className="size-5 text-[var(--medi-secondary)]"
            />
            Una plataforma sin fines de lucro
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-[var(--medi-text-secondary)]">
            PsicoAyudaVen es una iniciativa <strong>sin fines de lucro</strong>,
            creada para conectar a personas afectadas por la emergencia de los
            sismos en Venezuela con psicólogos verificados. No se cobra por el
            acceso, no se vende ningún servicio a través de la plataforma y no
            persigue beneficio económico alguno.
          </p>
        </section>

        {/* ── Rol de la plataforma ── */}
        <section className="glass-card p-5">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-[var(--medi-text-primary)]">
            <LifeBuoy
              aria-hidden="true"
              className="size-5 text-[var(--medi-secondary)]"
            />
            Somos una plataforma de conexión
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-[var(--medi-text-secondary)]">
            PsicoAyudaVen funciona como un <strong>directorio verificado</strong>{' '}
            que facilita el contacto, por WhatsApp, entre la persona que busca
            apoyo y el psicólogo. La plataforma no presta los servicios
            psicológicos, no interviene en la consulta y no establece relación
            clínica alguna con las personas atendidas. Cada profesional presta
            su servicio de forma <strong>independiente</strong> y es el único
            responsable de su ejercicio y de sus actos profesionales.
          </p>
        </section>

        {/* ── Supervisión clínica ── */}
        <section className="glass-card p-5">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-[var(--medi-text-primary)]">
            <ShieldCheck
              aria-hidden="true"
              className="size-5 text-[var(--medi-secondary)]"
            />
            Verificación y supervisión clínica
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-[var(--medi-text-secondary)]">
            La verificación de las credenciales (colegiación y formación) y la
            supervisión de los estándares clínicos de la plataforma están a cargo
            de un profesional responsable:{' '}
            <strong>{SUPERVISOR.name}</strong> ({SUPERVISOR.credential}), quien
            actúa como {SUPERVISOR.role}. Esto asegura que quienes aparecen en el
            directorio estén habilitados para ejercer y da credibilidad a las
            personas que confían en la plataforma.
          </p>
        </section>

        {/* ── Gratuidad y prohibición de cobros ── */}
        <section className="glass-card p-5">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-[var(--medi-text-primary)]">
            <Ban
              aria-hidden="true"
              className="size-5 text-[var(--notif-error)]"
            />
            El apoyo es gratuito: no se cobra
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-[var(--medi-text-secondary)]">
            La ayuda brindada a través de PsicoAyudaVen es{' '}
            <strong>gratuita</strong>. Los profesionales que participan{' '}
            <strong>no deben cobrar</strong> por las intervenciones, consultas o
            acompañamientos que se inicien mediante la plataforma. Cobrar por
            este apoyo contradice el propósito solidario de la iniciativa y puede
            derivar en la suspensión o eliminación del perfil.
          </p>
          <p className="mt-3 rounded-[var(--glass-radius-sm)] border-l-4 border-[var(--notif-error)] bg-[rgba(220,38,38,0.06)] p-3 text-sm text-[var(--medi-text-secondary)]">
            Si un psicólogo te solicita pago a cambio de la ayuda de esta
            plataforma, repórtalo de inmediato a{' '}
            <a
              href={`mailto:${SUPPORT_EMAIL}`}
              className="font-semibold text-[var(--medi-secondary)] underline"
            >
              {SUPPORT_EMAIL}
            </a>
            .
          </p>
        </section>

        {/* ── No captación de clientes ── */}
        <section className="glass-card p-5">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-[var(--medi-text-primary)]">
            <HeartHandshake
              aria-hidden="true"
              className="size-5 text-[var(--medi-secondary)]"
            />
            No es para captar clientes privados
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-[var(--medi-text-secondary)]">
            La plataforma existe para ofrecer acompañamiento solidario a quienes
            enfrentan las consecuencias de la tragedia. No es un canal para que
            los profesionales consigan pacientes privados ni para fomentar
            relaciones comerciales. El contacto que se genera aquí debe
            entenderse como apoyo ante la emergencia, no como publicidad o
            captación de clientela.
          </p>
        </section>

        {/* ── Responsabilidades del profesional ── */}
        <section className="glass-card p-5">
          <h2 className="text-lg font-semibold text-[var(--medi-text-primary)]">
            Compromisos del profesional
          </h2>
          <ul className="mt-3 space-y-2 text-sm leading-relaxed text-[var(--medi-text-secondary)]">
            {[
              'Ejercer dentro del alcance de mi habilitación profesional y formación.',
              'Mantener la confidencialidad y el secreto profesional en cada contacto.',
              'No cobrar por las intervenciones iniciadas a través de la plataforma.',
              'Tratar a cada persona con respeto, sin discriminar y sin imponer creencias.',
              'Derivar a servicios de urgencia cuando la situación lo requiera.',
              'Brindar información veraz sobre mis credenciales y mantenerlas actualizadas.',
            ].map((line) => (
              <li key={line} className="flex gap-2">
                <span
                  aria-hidden="true"
                  className="mt-2 size-1.5 shrink-0 rounded-full"
                  style={{ backgroundColor: 'var(--medi-secondary)' }}
                />
                <span>{line}</span>
              </li>
            ))}
          </ul>
        </section>

        {/* ── Consentimiento ── */}
        <section className="glass-card p-5">
          <h2 className="text-lg font-semibold text-[var(--medi-text-primary)]">
            Consentimiento
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-[var(--medi-text-secondary)]">
            Al registrarte en PsicoAyudaVen y publicar tu disponibilidad,
            declaras haber leído, comprendido y aceptado estos términos, así como
            comprometerte a cumplirlos. El equipo de la plataforma se reserva el
            derecho de suspender o retirar el acceso de quienes incumplan lo
            aquí establecido.
          </p>
        </section>

        {/* ── Contacto ── */}
        <section className="glass-card p-5">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-[var(--medi-text-primary)]">
            <Mail
              aria-hidden="true"
              className="size-5 text-[var(--medi-secondary)]"
            />
            Contacto y reportes
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-[var(--medi-text-secondary)]">
            Para dudas, sugerencias o reportes (incluido el cobro indebido por
            una intervención), escríbenos a{' '}
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
        Este documento es informativo y no constituye asesoría legal. PsicoAyudaVen
        puede actualizar estos términos; la versión vigente es la publicada en
        esta página.
      </footer>
    </main>
  )
}
