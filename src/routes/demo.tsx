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
  Users,
  AudioLines,
  BarChart3,
  Download,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { seoHead } from '#/lib/seo'
import { APP_VERSION } from '#/lib/version'

// ponytail: /demo is a public, shareable, SEO-valuable static walkthrough —
// mirrors the shape of /como-funciona (SSR, seoHead, glass-card sections,
// local Step helper). Two render targets in one route:
//   1) .demo-screen  → the on-screen visual tour (always visible on screen,
//                      hidden on print).
//   2) .demo-print   → a condensed full-manual block (hidden on screen,
//                      visible only when printing). "Descargar PDF" calls
//                      window.print(); the print stylesheet hides everything
//                      else (app chrome + the tour) so the saved PDF is the
//                      manual. One source of truth on the page, no second
//                      route, no PDF dependency.
export const Route = createFileRoute('/demo')({
  head: () =>
    seoHead({
      title: 'Tour guiado por la plataforma',
      description:
        'Recorre Psico Ayuda Venezuela paso a paso: cómo recibir ayuda, cómo se verifica cada psicólogo y cómo se administra la plataforma. Incluye manual descargable en PDF.',
      path: '/demo',
    }),
  component: DemoPage,
})

const pillClass =
  'glass-pill inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-[var(--medi-primary)] transition-all hover:translate-y-[-1px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--medi-secondary)]'

// ── On-screen tour step ──────────────────────────────────────────────────
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

function DemoPage() {
  return (
    <main className="page-wrap flex min-h-[100dvh] flex-col py-6">
      {/* ── Header (hidden on print) ── */}
      <div className="demo-no-print flex items-center justify-between gap-3">
        <Link
          to="/"
          className="inline-flex items-center gap-1 py-2 text-base font-medium text-[var(--medi-secondary)]"
          aria-label="Atrás"
        >
          ‹ Atrás
        </Link>
        <button
          type="button"
          onClick={() => window.print()}
          className={pillClass}
        >
          <Download aria-hidden="true" className="size-4" />
          Descargar PDF
        </button>
      </div>

      {/* ── On-screen tour ── */}
      <div className="demo-screen mt-6">
        <p className="section-kicker">Tour guiado</p>
        <h1 className="mt-2 text-2xl font-bold text-[var(--medi-text-primary)]">
          Cómo funciona Psico Ayuda Venezuela
        </h1>
        <div className="section-underline mt-2" />
        <p className="mt-4 text-base text-[var(--medi-text-secondary)]">
          Recorre la plataforma en pocos minutos. Al final puedes descargar el
          manual completo en PDF con el botón de arriba.
        </p>

        <div className="mt-8 flex flex-col gap-4">
          {/* ── Help-seeker ── */}
          <section className="glass-card p-5">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-[var(--medi-text-primary)]">
              <LifeBuoy aria-hidden="true" className="size-5 text-[var(--medi-secondary)]" />
              Si necesitas ayuda
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-[var(--medi-text-secondary)]">
              No necesitas cuenta ni dar datos. Te responde una persona real, el
              servicio es gratuito y confidencial.
            </p>
            <ol className="mt-4 flex flex-col gap-3">
              <Step n={1} icon={Search} title="Busca un profesional">
                Entra al{' '}
                <Link to="/ayuda/profesionales" search={{ modality: 'remote' }} className="font-semibold text-[var(--medi-secondary)]">
                  directorio
                </Link>{' '}
                y filtra por estado, modalidad o especialidad. Solo verás
                psicólogos verificados.
              </Step>
              <Step n={2} icon={MessageCircle} title="Escríbele por WhatsApp">
                Abre el perfil del psicólogo que elijas y toca el botón verde de
                WhatsApp. La conversación continúa en tu teléfono, privada y
                directa.
              </Step>
              <Step n={3} icon={Headphones} title="O escucha Voces que acompañan">
                Si prefieres algo más tranquilo, en{' '}
                <Link to="/apoyo" className="font-semibold text-[var(--medi-secondary)]">Voces que acompañan</Link>{' '}
                los psicólogos comparten mensajes en voz para acompañarte.
              </Step>
              <Step n={4} icon={HeartPulse} title="Usa las herramientas de autocuidado">
                Ejercicios de respiración, enraizamiento y un autochequeo
                emocional privado, en{' '}
                <Link to="/recursos" className="font-semibold text-[var(--medi-secondary)]">Herramientas de autocuidado</Link>.
              </Step>
            </ol>
            <div className="mt-4">
              <Link to="/ayuda/profesionales" search={{ modality: 'remote' }} className={pillClass}>
                <LifeBuoy aria-hidden="true" className="size-4" />
                Buscar ayuda ahora
              </Link>
            </div>
          </section>

          {/* ── Professional ── */}
          <section className="glass-card p-5">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-[var(--medi-text-primary)]">
              <Stethoscope aria-hidden="true" className="size-5 text-[var(--medi-secondary)]" />
              Si eres psicólogo
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-[var(--medi-text-secondary)]">
              Verificamos tus credenciales antes de publicarte, para que las
              personas sepan que quien los atiende está habilitado.
            </p>
            <ol className="mt-4 flex flex-col gap-3">
              <Step n={1} icon={Stethoscope} title="Regístrate">
                Completa tu{' '}
                <Link to="/profesional/registro" className="font-semibold text-[var(--medi-secondary)]">registro</Link>{' '}
                con tus datos, número de colegiación y WhatsApp.
              </Step>
              <Step n={2} icon={BadgeCheck} title="Verificamos tu credencial">
                Un administrador confirma tu colegiación en el registro del
                colegio o universidad que te certificó.
              </Step>
              <Step n={3} icon={CalendarClock} title="Activa tu disponibilidad">
                Desde tu{' '}
                <Link to="/profesional/panel" className="font-semibold text-[var(--medi-secondary)]">panel</Link>{' '}
                controlas cuándo estás disponible y editas tu perfil.
              </Step>
              <Step n={4} icon={UserCog} title="Atiende a quien te escribe">
                Las personas te contactan por WhatsApp desde tu perfil público.
              </Step>
            </ol>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <Link to="/profesional/registro" className={pillClass}>
                <Stethoscope aria-hidden="true" className="size-4" />
                Quiero registrarme
              </Link>
              <Link to="/terminos" className="text-sm font-medium text-[var(--medi-secondary)] hover:underline">
                Términos para profesionales
              </Link>
            </div>
          </section>

          {/* ── Admin ── */}
          <section className="glass-card p-5">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-[var(--medi-text-primary)]">
              <ShieldCheck aria-hidden="true" className="size-5 text-[var(--medi-secondary)]" />
              Si administras la plataforma
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-[var(--medi-text-secondary)]">
              El panel de administración solo está disponible para cuentas con
              rol administrador.
            </p>
            <ol className="mt-4 flex flex-col gap-3">
              <Step n={1} icon={BadgeCheck} title="Revisa y aprueba profesionales">
                En{' '}
                <Link to="/admin" className="font-semibold text-[var(--medi-secondary)]">Administración</Link>{' '}
                ves cada solicitud con su credencial y documentos, y decides:
                aprobar, rechazar, suspender o eliminar.
              </Step>
              <Step n={2} icon={AudioLines} title="Modera los audios de apoyo">
                Aprobando o rechazando los audios que los psicólogos graban para
                Voces que acompañan.
              </Step>
              <Step n={3} icon={Users} title="Gestiona usuarios">
                Promueve cuentas de confianza a administrador cuando haga falta.
              </Step>
              <Step n={4} icon={BarChart3} title="Revisa la analítica">
                En <code className="font-mono">/admin/analitica</code> ves
                embudos, retención y estado operacional de la plataforma.
              </Step>
            </ol>
          </section>
        </div>

        <footer className="glass-card-soft mt-6 rounded-[var(--glass-radius-sm)] px-4 py-3 text-center text-sm text-[var(--medi-text-secondary)]">
          ¿Quieres el documento completo?{' '}
          <button
            type="button"
            onClick={() => window.print()}
            className="font-medium text-[var(--medi-secondary)] hover:underline"
          >
            Descarga el manual en PDF
          </button>
          {' '}con todos los detalles y preguntas frecuentes.
        </footer>
      </div>

      {/* ── Print-only manual block ──
          Hidden on screen, visible only when printing. A condensed version of
          docs/manual-usuario.md — the tour above already covers the on-screen
          story; this adds the FAQ, limits table, and full contact block so the
          PDF is a complete standalone document. Keep these two in rough sync
          when the manual changes. */}
      <PrintManual />
    </main>
  )
}

// ── Print-only manual ────────────────────────────────────────────────────
// ponytail: rendered into the DOM always (so it's available to window.print()
// without a round-trip), but visually hidden on screen via .demo-print CSS
// (display:none) and only revealed in @media print. ceiling: duplicates a
// subset of docs/manual-usuario.md; if the manual drifts, this PDF block
// drifts too. Acceptable for a low-churn reference doc — promote to a single
// MD-rendered source if it starts being maintained by two people.
function PrintManual() {
  return (
    <article className="demo-print" aria-hidden="true">
      <header>
        <h1>Manual de usuario</h1>
        <p>
          <strong>Psico Ayuda Venezuela</strong> — Red gratuita y confidencial de
          apoyo psicológico
        </p>
        <p>
          Versión de la aplicación: {APP_VERSION}
          <br />
          Sitio: https://psicoayudaven.com
          <br />
          Soporte: soporte@psicoayudaven.com
        </p>
      </header>

      <h2>Parte I — Personas que buscan ayuda</h2>
      <h3>¿Qué es PsicoAyudaVen?</h3>
      <p>
        Una red gratuita y confidencial que conecta a personas afectadas por la
        contingencia en Venezuela con psicólogos verificados. Te responde una
        persona real, sin bots ni inteligencia artificial.
      </p>
      <ul>
        <li>No necesitas cuenta para recibir ayuda.</li>
        <li>El apoyo es gratuito. Si alguien te cobra, repórtalo a soporte@psicoayudaven.com.</li>
        <li>Es confidencial. La conversación ocurre por WhatsApp.</li>
        <li>Las herramientas de autocuidado funcionan sin conexión.</li>
      </ul>

      <h3>Cómo pedir ayuda ahora mismo</h3>
      <p>
        En la página de inicio verás el botón <strong>«Necesito ayuda ahora»</strong>.
        Al pulsarlo, la plataforma busca un psicólogo disponible y abre WhatsApp
        con un mensaje ya escrito:
      </p>
      <blockquote>
        Hola {`{nombre}`}, te escribo desde PsicoAyudaVen. Necesito hablar con
        alguien ahora mismo. ¿Tienes un momento para conversar?
      </blockquote>
      <p>
        Si nadie está disponible, verás un aviso y la plataforma te llevará al
        directorio para que elijas tú.
      </p>

      <h3>Buscar un profesional en el directorio</h3>
      <p>
        En la sección <strong>Ayuda</strong> verás el encabezado «Profesionales
        verificados» y un botón «Contactar al azar». Pulsa «Abrir filtros» para
        filtrar por:
      </p>
      <ul>
        <li><strong>Búsqueda por nombre</strong></li>
        <li><strong>Estado</strong> y <strong>ciudad</strong></li>
        <li><strong>Edad / Población:</strong> Niños, Adolescentes, Adultos, Adultos mayores</li>
        <li><strong>Población específica:</strong> Oncológica, Neurodivergentes, Cuidadores, Comunidad LGBTQ+</li>
        <li><strong>Área de intervención:</strong> Duelo, Violencia, Adicciones, Intervención en crisis, Ansiedad y depresión</li>
      </ul>
      <p>
        La lista se actualiza cada 20 segundos. Cada tarjeta muestra nombre,
        ubicación, especialidad y un indicador de disponibilidad (Siempre
        disponible / Disponible ahora / Vuelve… / No conectado), más el botón
        verde «Contactar por WhatsApp».
      </p>

      <h3>Ver el perfil de un profesional</h3>
      <p>
        Pulsa el nombre para abrir el perfil completo: foto, badges, modalidad
        (online, presencial o ambas), horario, a quién atiende y botón de
        contacto. Desde ahí puedes compartir el perfil con «Compartir perfil».
      </p>

      <h3>Voces que acompañan</h3>
      <p>
        Mensajes en voz de psicólogos verificados. Pulsa «Solo necesito escuchar
        algo» para que se reproduzcan en secuencia, o elige una voz concreta.
        Avanza sola de un clip al otro.
      </p>

      <h3>Herramientas de autocuidado</h3>
      <p>En la sección «Herramientas de autocuidado» encontrarás:</p>
      <ul>
        <li><strong>Autochequeo emocional</strong> — 8 preguntas privadas sobre cómo te has sentido.</li>
        <li><strong>Respiración calmante</strong> — ejercicio 4-4-4-4 para reducir ansiedad.</li>
        <li><strong>Técnica de enraizamiento</strong> — 5 anclas para volver al presente.</li>
        <li><strong>Reacciones normales tras una crisis</strong> — psicoeducación.</li>
        <li><strong>Primeros auxilios psicológicos</strong> — cómo ayudar a otros.</li>
      </ul>
      <p>
        <em>Esto es un autochequeo educativo y no sustituye un diagnóstico
        profesional. Si te preocupa tu bienestar, habla con un psicólogo.</em>
      </p>

      <h3>Instalar la aplicación</h3>
      <p>
        En Android (Chrome): abre la web, pulsa «Instalar app» o usa el menú →
        «Agregar a pantalla de inicio». En iPhone/iPad (Safari): botón Compartir
        → «Agregar a pantalla de inicio».
      </p>

      <h2>Parte II — Psicólogos y psicólogas</h2>
      <h3>Términos importantes</h3>
      <ul>
        <li>El apoyo es gratuito: no se debe cobrar.</li>
        <li>No es para captar clientes privados.</li>
        <li>Confidencialidad y secreto profesional en cada contacto.</li>
        <li>Derivar a urgencias cuando la situación lo requiera.</li>
      </ul>

      <h3>Registro (dos pasos)</h3>
      <p>
        <strong>Paso 1 — Datos de la cuenta:</strong> nombre, correo, contraseña
        (mínimo 8 caracteres) y aceptar los términos.
      </p>
      <p>
        <strong>Paso 2 — Perfil profesional:</strong> ubicación (país, estado,
        ciudad), credencial (país del colegio, número de colegiación, documentos
        opcionales), especialización (a quién atiendes, poblaciones, áreas) y
        contacto (modalidad y WhatsApp).
      </p>
      <p>
        Tras enviar verás: «Cuenta creada — en revisión. Un administrador
        activará tu perfil».
      </p>

      <h3>Tu panel</h3>
      <p>Desde el panel entras a cada sección:</p>
      <ul>
        <li><strong>Perfil profesional</strong> — editar datos.</li>
        <li><strong>Foto y redes sociales</strong> — tu imagen y enlaces.</li>
        <li><strong>Disponibilidad</strong> — cuándo pueden contactarte.</li>
        <li><strong>Seguimiento clínico</strong> — notas privadas.</li>
        <li><strong>Mis audios de apoyo</strong> — grabar para Voces que acompañan.</li>
      </ul>

      <h3>Disponibilidad</h3>
      <p>Tres modos:</p>
      <ul>
        <li><strong>Siempre disponible</strong> — apareces siempre.</li>
        <li><strong>Por horario</strong> — disponible solo en tu franja (por defecto Caracas).</li>
        <li><strong>No disponible</strong> — no apareces hasta que vuelvas a activarte.</li>
      </ul>

      <h3>Audios para Voces que acompañan</h3>
      <p>
        Mensajes cortos (idealmente 1:30, máximo 3 min y 3 MB; hasta 2 audios
        por profesional; formatos WebM/MP4/MP3/OGG). Cada audio pasa por
        revisión antes de publicarse.
      </p>

      <h3>Seguimiento clínico</h3>
      <p>
        Registro privado de las personas que atiendes. Solo tú ves estos
        registros. Campos: teléfono, nombre, motivo, nivel de riesgo, acción,
        estado, próximo contacto y notas. Búsqueda y filtros por estado y
        riesgo.
      </p>

      <h3>Estados de verificación</h3>
      <ul>
        <li><strong>En revisión</strong> — pendiente de aprobación.</li>
        <li><strong>Verificado</strong> — aprobado, ya apareces en el directorio.</li>
        <li><strong>Rechazado</strong> — la solicitud no fue aprobada.</li>
        <li><strong>Suspendido</strong> — cuenta pausada por un administrador.</li>
        <li><strong>Eliminado</strong> — tú mismo borraste tu perfil profesional.</li>
      </ul>

      <h2>Parte III — Administradores</h2>
      <h3>Acceso</h3>
      <p>
        El panel está en <code className="font-mono">/admin</code>. Solo entran
        cuentas con rol administrador. El primer administrador se promueve
        desde la base de datos; los siguientes los promueve un administrador
        existente desde la sección Usuarios.
      </p>

      <h3>Revisar profesionales</h3>
      <p>
        Busca por nombre, correo o número de colegiación. Filtra por estado
        (Todos, Pendientes, Verificados, Suspendidos, Rechazados). Cada tarjeta
        muestra credencial, documentos, modalidad y WhatsApp. Acciones según el
        estado:
      </p>
      <ul>
        <li><strong>En revisión:</strong> Aprobar / Rechazar.</li>
        <li><strong>Verificado:</strong> Suspender / Eliminar.</li>
        <li><strong>Suspendido:</strong> Reactivar / Eliminar.</li>
        <li><strong>Rechazado:</strong> Aprobar / Eliminar.</li>
      </ul>
      <p>
        El interruptor «Presta servicio» decide si el profesional aparece en el
        directorio (activo) o queda como colaborador de contenido solo para
        audios (inactivo).
      </p>

      <h3>Audios y usuarios</h3>
      <p>
        En «Audios de apoyo — revisión» apruebas o rechazas cada clip. En
        «Usuarios» promueves cuentas a administrador (no existe la acción de
        quitar el rol, por diseño).
      </p>

      <h3>Analítica</h3>
      <p>
        En <code className="font-mono">/admin/analitica</code> (URL directa, sin
        enlace visible en el panel): KPIs, embudos, engagement, retención y
        estado operacional. Ventana de tiempo: 24h / 7d / 30d / 90d.
      </p>

      <h2>Anexo — Límites y tamaños máximos</h2>
      <table>
        <thead>
          <tr><th>Recurso</th><th>Límite</th><th>Formatos</th></tr>
        </thead>
        <tbody>
          <tr><td>Contraseña</td><td>mínimo 8 caracteres</td><td>—</td></tr>
          <tr><td>Número de colegiación</td><td>mínimo 2 caracteres</td><td>—</td></tr>
          <tr><td>WhatsApp / teléfono</td><td>mínimo 8 dígitos</td><td>—</td></tr>
          <tr><td>Título o certificado</td><td>máximo 5 MB</td><td>PDF, JPG, PNG, WEBP</td></tr>
          <tr><td>Documentos adicionales</td><td>hasta 6 archivos, 5 MB cada uno</td><td>PDF, JPG, PNG, WEBP</td></tr>
          <tr><td>Foto de perfil</td><td>máximo 2 MB</td><td>JPG, PNG, WEBP</td></tr>
          <tr><td>Audio (duración)</td><td>máximo 3 min (ideal 1:30)</td><td>WebM, MP4, MP3, OGG</td></tr>
          <tr><td>Audio (tamaño)</td><td>máximo 3 MB</td><td>WebM, MP4, MP3, OGG</td></tr>
          <tr><td>Audios por profesional</td><td>2 (aprobados o en revisión)</td><td>—</td></tr>
          <tr><td>Enlace de recuperación</td><td>válido 30 minutos, un solo uso</td><td>—</td></tr>
        </tbody>
      </table>

      <h2>Contacto y soporte</h2>
      <ul>
        <li>Soporte general y reportes: soporte@psicoayudaven.com</li>
        <li>WhatsApp de soporte para profesionales: botón «Escribir por WhatsApp» en tu panel.</li>
        <li>Para emergencias: acude al centro de salud más cercano o llama a tu servicio de emergencias local. Esta plataforma no es un servicio de urgencias.</li>
      </ul>
    </article>
  )
}
