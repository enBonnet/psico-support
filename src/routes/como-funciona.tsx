import { createFileRoute, Link } from '@tanstack/react-router'
import {
  LifeBuoy,
  Search,
  MessageCircle,
  Headphones,
  HeartPulse,
  Stethoscope,
  BadgeCheck,
  CalendarClock,
  UserCog,
  ShieldCheck,
  Lock,
  KeyRound,
  EyeOff,
  Server,
  Trash2,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { seoHead } from '#/lib/seo'

export const Route = createFileRoute('/como-funciona')({
  head: () =>
    seoHead({
      title: 'Cómo funciona Psicoayudaven',
      description:
        'Conoce cómo usar la plataforma para recibir ayuda psicológica, cómo funciona para psicólogos verificados y cómo protegemos tus datos.',
      path: '/como-funciona',
    }),
  component: HowItWorksPage,
})

// ponytail: tiny step-list helper, local to this page. A <ol> of glass rows
// with a leading index badge + icon. No new component file — one consumer.
function Step({
  n,
  icon: Icon,
  title,
  children,
}: {
  n: number
  icon: LucideIcon
  title: string
  children: React.ReactNode
}) {
  return (
    <li className="glass-card-soft flex gap-3 rounded-[var(--glass-radius-sm)] p-4">
      <span
        aria-hidden="true"
        className="flex size-7 shrink-0 items-center justify-center rounded-full bg-[var(--medi-secondary)] text-sm font-bold text-white"
      >
        {n}
      </span>
      <div className="min-w-0">
        <p className="flex items-center gap-2 font-semibold text-[var(--medi-text-primary)]">
          <Icon aria-hidden="true" className="size-4 text-[var(--medi-secondary)]" />
          {title}
        </p>
        <p className="mt-1 text-sm leading-relaxed text-[var(--medi-text-secondary)]">
          {children}
        </p>
      </div>
    </li>
  )
}

const pillClass =
  'glass-pill inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-[var(--medi-primary)] transition-all hover:translate-y-[-1px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--medi-secondary)]'

function HowItWorksPage() {
  return (
    <main className="page-wrap flex min-h-[100dvh] flex-col py-6">
      <Link
        to="/"
        className="inline-flex items-center gap-1 self-start py-2 text-base font-medium text-[var(--medi-secondary)]"
        aria-label="Atrás"
      >
        ‹ Atrás
      </Link>

      <p className="section-kicker mt-6">Cómo funciona</p>
      <h1 className="mt-2 text-2xl font-bold text-[var(--medi-text-primary)]">
        Cómo funciona Psicoayudaven
      </h1>
      <div className="section-underline mt-2" />
      <p className="mt-4 text-base text-[var(--medi-text-secondary)]">
        Una red de psicólogos verificados que acompaña a personas en Venezuela.
        Aquí explicamos cómo recibir ayuda, cómo se verifica cada profesional y
        cómo cuidamos tu información.
      </p>

      <div className="mt-8 flex flex-col gap-4">
        {/* ── Para personas que buscan ayuda ── */}
        <section className="glass-card p-5">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-[var(--medi-text-primary)]">
            <LifeBuoy
              aria-hidden="true"
              className="size-5 text-[var(--medi-secondary)]"
            />
            Si necesitas ayuda
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-[var(--medi-text-secondary)]">
            No necesitas crear una cuenta ni dar tus datos. Atienden personas
            reales —sin bots ni inteligencia artificial— y el servicio es
            gratuito y confidencial.
          </p>
          <ol className="mt-4 flex flex-col gap-3">
            <Step n={1} icon={Search} title="Busca un profesional">
              Entra a{' '}
              <Link
                to="/ayuda/profesionales"
                search={{ modality: 'remote' }}
                className="font-semibold text-[var(--medi-secondary)]"
              >
                Necesito Ayuda Ahora
              </Link>{' '}
              y filtra por estado, modalidad o especialidad. Solo verás
              psicólogos con su cédula y colegiación ya verificadas.
            </Step>
            <Step n={2} icon={MessageCircle} title="Escríbele por WhatsApp">
              Abre el perfil del psicólogo que elijas y toca el botón de
              WhatsApp. La conversación continúa en tu teléfono, de forma
              privada y directa con esa persona.
            </Step>
            <Step n={3} icon={Headphones} title="O escucha Voces que acompañan">
              Si prefieres algo más tranquilo, en{' '}
              <Link
                to="/apoyo"
                className="font-semibold text-[var(--medi-secondary)]"
              >
                Voces que acompañan
              </Link>{' '}
              los psicólogos comparten mensajes en voz cortos para acompañarte.
            </Step>
            <Step n={4} icon={HeartPulse} title="Usa las herramientas de autocuidado">
              En{' '}
              <Link
                to="/recursos"
                className="font-semibold text-[var(--medi-secondary)]"
              >
                Herramientas de Autocuidado
              </Link>{' '}
              encontrarás ejercicios de respiración, técnicas de enraizamiento y
              un autochequeo emocional privado.
            </Step>
          </ol>
          <div className="mt-4">
            <Link to="/ayuda/profesionales" search={{ modality: 'remote' }} className={pillClass}>
              <LifeBuoy aria-hidden="true" className="size-4" />
              Buscar ayuda ahora
            </Link>
          </div>
        </section>

        {/* ── Para profesionales ── */}
        <section className="glass-card p-5">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-[var(--medi-text-primary)]">
            <Stethoscope
              aria-hidden="true"
              className="size-5 text-[var(--medi-secondary)]"
            />
            Si eres psicólogo
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-[var(--medi-text-secondary)]">
            Verificamos tus credenciales antes de publicarte, para que las
            personas sepan que quien los atiende está habilitado.
          </p>
          <ol className="mt-4 flex flex-col gap-3">
            <Step n={1} icon={Stethoscope} title="Regístrate">
              Completa tu{' '}
              <Link
                to="/profesional/registro"
                className="font-semibold text-[var(--medi-secondary)]"
              >
                registro
              </Link>{' '}
              con tus datos, número de colegiación y WhatsApp de contacto. Puedes
              adjuntar tu título para agilizar la revisión.
            </Step>
            <Step n={2} icon={BadgeCheck} title="Verificamos tu credencial">
              Un administrador confirma tu número de colegiación en el registro
              del colegio o universidad que te certificó. Hasta entonces tu
              perfil queda en revisión y no es público.
            </Step>
            <Step n={3} icon={CalendarClock} title="Activa tu disponibilidad">
              Desde tu{' '}
              <Link
                to="/profesional/panel"
                className="font-semibold text-[var(--medi-secondary)]"
              >
                panel
              </Link>{' '}
              controlas cuándo estás disponible: siempre, por horario agendado,
              o inactivo. También editas tu perfil y publicas audios.
            </Step>
            <Step n={4} icon={UserCog} title="Atiende a quien te escribe">
              Las personas te contactan por WhatsApp desde tu perfil público.
              Tú decides cómo y cuándo responder.
            </Step>
          </ol>
          <div className="mt-4">
            <Link to="/profesional/registro" className={pillClass}>
              <Stethoscope aria-hidden="true" className="size-4" />
              Quiero registrarme
            </Link>
          </div>
        </section>

        {/* ── Seguridad y privacidad ── */}
        <section className="glass-card p-5">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-[var(--medi-text-primary)]">
            <ShieldCheck
              aria-hidden="true"
              className="size-5 text-[var(--medi-secondary)]"
            />
            Seguridad y privacidad de tus datos
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-[var(--medi-text-secondary)]">
            Tu confianza es lo primero. Esto es cómo tratamos tu información.
          </p>
          <ul className="mt-4 flex flex-col gap-3">
            <li className="glass-card-soft flex gap-3 rounded-[var(--glass-radius-sm)] p-4">
              <EyeOff
                aria-hidden="true"
                className="size-5 shrink-0 text-[var(--medi-secondary)]"
              />
              <p className="text-sm leading-relaxed text-[var(--medi-text-secondary)]">
                <span className="font-semibold text-[var(--medi-text-primary)]">
                  No necesitas cuenta para recibir ayuda.
                </span>{' '}
                Puedes buscar y contactar psicólogos sin registrarte ni
                entregar tus datos.
              </p>
            </li>
            <li className="glass-card-soft flex gap-3 rounded-[var(--glass-radius-sm)] p-4">
              <KeyRound
                aria-hidden="true"
                className="size-5 shrink-0 text-[var(--medi-secondary)]"
              />
              <p className="text-sm leading-relaxed text-[var(--medi-text-secondary)]">
                <span className="font-semibold text-[var(--medi-text-primary)]">
                  Contraseñas protegidas.
                </span>{' '}
                Las contraseñas se almacenan cifradas (con hash) y nunca se
                muestran en texto plano, ni siquiera a los administradores.
              </p>
            </li>
            <li className="glass-card-soft flex gap-3 rounded-[var(--glass-radius-sm)] p-4">
              <EyeOff
                aria-hidden="true"
                className="size-5 shrink-0 text-[var(--medi-secondary)]"
              />
              <p className="text-sm leading-relaxed text-[var(--medi-text-secondary)]">
                <span className="font-semibold text-[var(--medi-text-primary)]">
                  Lo público es lo mínimo necesario.
                </span>{' '}
                Tu perfil público solo muestra nombre, especialidad, ubicación y
                WhatsApp. Tu número de colegiación y documentos solo los ve el
                equipo de verificación.
              </p>
            </li>
            <li className="glass-card-soft flex gap-3 rounded-[var(--glass-radius-sm)] p-4">
              <Lock
                aria-hidden="true"
                className="size-5 shrink-0 text-[var(--medi-secondary)]"
              />
              <p className="text-sm leading-relaxed text-[var(--medi-text-secondary)]">
                <span className="font-semibold text-[var(--medi-text-primary)]">
                  Conexión cifrada.
                </span>{' '}
                Todo el tráfico viaja por HTTPS y la conversación con tu
                psicólogo ocurre en WhatsApp, fuera de nuestros servidores.
              </p>
            </li>
            <li className="glass-card-soft flex gap-3 rounded-[var(--glass-radius-sm)] p-4">
              <Server
                aria-hidden="true"
                className="size-5 shrink-0 text-[var(--medi-secondary)]"
              />
              <p className="text-sm leading-relaxed text-[var(--medi-text-secondary)]">
                <span className="font-semibold text-[var(--medi-text-primary)]">
                  Datos en infraestructura segura.
                </span>{' '}
                La plataforma corre en Cloudflare, con almacenamiento cifrado en
                reposo y sin vender ni compartir tu información con terceros.
              </p>
            </li>
            <li className="glass-card-soft flex gap-3 rounded-[var(--glass-radius-sm)] p-4">
              <Trash2
                aria-hidden="true"
                className="size-5 shrink-0 text-[var(--medi-secondary)]"
              />
              <p className="text-sm leading-relaxed text-[var(--medi-text-secondary)]">
                <span className="font-semibold text-[var(--medi-text-primary)]">
                  Tú controlas tu cuenta.
                </span>{' '}
                Como profesional puedes editar o eliminar tu cuenta cuando
                quieras desde el panel; al eliminarla, dejas de ser visible de
                inmediato.
              </p>
            </li>
          </ul>
        </section>
      </div>

      <footer className="glass-card-soft mt-6 rounded-[var(--glass-radius-sm)] px-4 py-3 text-center text-sm text-[var(--medi-text-secondary)]">
        ¿Dudas sobre la plataforma?{' '}
        <Link
          to="/acerca-de"
          className="font-medium text-[var(--medi-secondary)] hover:underline"
        >
          Acerca de Psicoayudaven
        </Link>
      </footer>
    </main>
  )
}
