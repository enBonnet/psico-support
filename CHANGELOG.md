# Changelog

All notable changes to **psico-support** are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.15.0] - 2026-07-01

### Changed
- **Panel profesional rediseñado como menú de accesos**: `/profesional/panel` deja de ser una sola pantalla larga con todos los formularios apilados y pasa a ser un **hub de tarjetas descriptivas** (icono + título + subtítulo + estado actual), siguiendo el mismo patrón que `/cuenta` y `/ayuda`. Pensado para usuarios con poca familiarity tecnológica: una decisión por pantalla en lugar de seis formularios en un solo scroll.
  - El **estado de verificación** pasa de una línea pequeña a un **banner destacado** (es la principal duda del profesional).
  - Cada tarjeta muestra una **vista previa del estado actual** sin necesidad de abrirla: la tarjeta de Disponibilidad muestra el modo (Siempre / Por horario / No disponible); la de Seguimiento, el conteo de abiertos; la de Audios, `N/2`.
  - Los formularios grandes se mueven a sus propias rutas enfocadas, cada una con enlace "‹ Panel" para volver:
    - `/profesional/perfil` — datos del directorio (nombre, credencial, especialidad, ubicación, teléfono) + **documentos de respaldo** (los ex "Documentos de apoyo", ahora como subsección aquí).
    - `/profesional/presentacion` — foto de perfil + redes sociales.
    - `/profesional/disponibilidad` — modo de disponibilidad + grilla semanal (oculta para colaboradores de contenido, que ven una nota explicativa).
    - `/profesional/audios` — grabadora y lista de "Voces que acompañan" (se mantiene el gate por verificación).
  - Soporte por WhatsApp y eliminación de cuenta quedan **en línea** en el hub (acciones únicas, no merecen ruta propia).
  - Sin cambios de API/base de datos → **sin migración**. Soporte y eliminación de cuenta mantienen su comportamiento anterior.


## [1.14.0] - 2026-06-30

### Added
- **Documentos de apoyo (certificados adicionales)**: los profesionales pueden adjuntar **varios documentos adicionales** además del título/certificado de egreso — credenciales, especializaciones, constancias de colegiación, lo que acelere la verificación. Repetible (hasta 6), mismo PDF/imagen + 5 MB por archivo que el certificado principal.
  - Disponible en el **registro** (`/profesional/registro` y `/profesional/completar`) y, como el resto de propiedades editables, se gestiona desde el **panel** (`/profesional/panel` → "Documentos de apoyo"): subir, ver y eliminar, con conteo `N/6`.
  - El **admin** ve cada documento como un enlace en la ficha de revisión (junto al certificado principal).
  - Nueva tabla `professional_documents` (migración `0015`, aditiva, no breaking). R2 bajo `support-docs/{professionalId}/{uuid}.{ext}`.
  - Ruta `/media/document/$` **owner-or-admin**: el profesional ve los suyos desde el panel; el admin, desde la ficha. No públicos (son credenciales personales, como el certificado principal). `Cache-Control: private`.
  - Subida **best-effort** en el registro (un fallo de almacenamiento nunca bloquea el alta, igual que el certificado principal).

### Deploy (esta release incluye migración)
- `npx wrangler d1 migrations apply psico-support-db --remote` **y** `--local` (gotcha #1 — `npm run deploy` **no** aplica migraciones). Migración `0015` (tabla `professional_documents`) — aditiva, **no breaking**.
- `npx wrangler d1 migrations list psico-support-db --remote` para confirmar que no queda nada pendiente.
- `npm version minor` ya aplicado (1.13.1 → 1.14.0). Sin bump del cache del SW (release compatible; SWR + `skipWaiting` refresca clientes instalados en un reload).

## [1.13.1] - 2026-06-30

### Added
- **Aclaración "persona real" en la home**: callout bajo el título que deja claro que los mensajes los leen y responden psicólogos verificados, no bots ni inteligencia artificial.

### Deploy
- Sin migraciones (solo copy en la home). `npm run deploy`.

## [1.13.0] - 2026-06-30

### Added
- **Disponibilidad por horario (tres estados, F1)**: el profesional elige entre **Siempre disponible** (siempre visible), **Por horario** (bloques de días y horas + zona horaria) o **No disponible** (fuera del directorio). Reemplaza el interruptor ON/OFF manual. La disponibilidad se **deriva en tiempo real** del horario en cada render (el directorio refresca cada 20 s; el perfil lo calcula el SSR del Worker con `Intl.DateTimeFormat`), por lo que **no hay cron ni lag**. La insignia del directorio y del perfil muestra "Siempre disponible" / "Disponible ahora" / "Vuelve {día} HH:MM" / "No disponible" / "No conectado". El orden del directorio pasa a alfabético (la insignia por tarjeta ya comunica el estado actual). Columnas `availability_mode` (default `'always'`, de modo que la migración **mantiene a todos visibles** y los registros nuevos aparecen al verificarse), `availability_schedule` (JSON de bloques `{d,s,e}`) y `timezone` (IANA, por defecto según país). El booleano `available` queda dormido como columna. Diseño y decisiones cerradas en `docs/design-scheduling-profile-followups.md`. Migración `0014`.
- **Edición del perfil profesional desde el panel (F2)**: el profesional edita nombre, credencial, especializaciones (población/enfoque/áreas), modalidad, ubicación y WhatsApp desde `/profesional/panel`. Reutiliza `registerStep2Schema` (DRY, vía `registerStep2Object`) + `proEditableFields` (compartido con el alta, sin drift). Cambiar el **número de colegiación o su país reinicia la verificación** (`verifiedStatus → 'pending'`, evita el "carné cambiado tras verificar"). El nombre se sincroniza con el `user` de auth. Sin migración (todas las columnas ya existían).
- **Seguimiento clínico (F3)**: nueva ruta privada `/profesional/seguimiento` donde el profesional registra a las personas que atiende. Campo requerido: **teléfono** (con el mismo input de país+formato que el WhatsApp del registro). Opcionales: nombre, motivo, **nivel de riesgo** (Sin riesgo / Vigilar / **Urgente**, triaje clínico simplificado tipo C-SSRS; "Urgente" muestra un recordatorio de derivación), **acción realizada** (etiquetas PFA: Escucha activa / Información sobre afrontamiento / Estabilización / Apoyo social / Derivación), estado, próximo contacto y notas. **Privado por profesional**: toda query filtra `WHERE professional_id = <mi pro>` desde la sesión; **sin acceso público ni de admin** (privacidad a nivel app — el deployer puede leer D1 directamente). Nueva tabla `follow_ups` (migración `0013`).
- **`<PhoneInput>` compartido**: input de teléfono (país + formato WhatsApp) extraído a `src/components/phone-input.tsx`, usado por el seguimiento y la edición de perfil.

### Changed
- `getMyProfessional` y `getPublicProfessional` devuelven ahora los campos de disponibilidad (`availabilityMode`/`availabilitySchedule` parseado/`timezone`) y los editables del perfil; `PublicProfessional` reemplaza `available: boolean` por los tres campos de disponibilidad.
- Eliminado `setAvailability` (interruptor ON/OFF) — reemplazado por `setAvailabilityMode`.

### Deploy (esta release incluye migraciones)
- `npx wrangler d1 migrations apply psico-support-db --remote` **y** `--local` (gotcha #1 — `npm run deploy` **no** aplica migraciones). Dos migraciones: `0013` (tabla `follow_ups`) y `0014` (`availability_mode` / `availability_schedule` / `timezone` en `professionals`) — todas aditivas (nueva tabla + columnas nullable / con default), **no breaking**.
- `npx wrangler d1 migrations list psico-support-db --remote` para confirmar que no queda nada pendiente.
- `npm version minor` (1.12.0 → 1.13.0). Sin bump del cache del SW (release compatible; SWR + `skipWaiting` refresca clientes instalados en un reload).

## [1.12.0] - 2026-06-30

### Added
- **Ruta `/app` — cómo instalar la PWA**: guía paso a paso para instalar la app en Android (Chrome) e iPhone (Safari), con los beneficios (acceso rápido, uso sin conexión, experiencia a pantalla completa). La tarjeta "Instalar app" del inicio ahora enlaza ahí. SSR, contenido estático; la sugerencia de instalación dinámica sigue en la home (`InstallCard`).
- **Estado `disabled` (suspensión temporal de profesionales)**: un profesional verificado puede ser suspendido por un administrador si hay dudas con sus credenciales, y reactivado después. Reutiliza `verified_status` (nuevo valor `disabled`): como TODA query pública filtra `verified_status='verified'`, un pro suspendido desaparece automáticamente del directorio, del conteo, de su perfil (404) y de la bandeja de audios — sin cláusulas WHERE extra. El profesional sigue pudiendo iniciar sesión y ve un aviso "Suspendido" en su panel (transparencia, no bloqueo).
- **Profesionales "solo creador de contenido" (`provides_service=false`)**: categoría para quienes aportan audios a *Voces que acompañan* pero no atienden directamente. Verificados, pero excluidos del directorio, del conteo y del perfil público. La bandeja de audios sigue filtrando por `verified_status` (no por `provides_service`), así que sus clips sí aparecen. Asignado solo por el admin (no en el registro, para no añadir fricción al signup). Columna `provides_service` (migración `0010`).
- **Herramienta de auditoría de credenciales en `/admin`**: la gestión de profesionales pasa a ser una sola lista unificada (reemplaza la cola de pendientes + el roster de verificados) con **búsqueda** (nombre / correo / nº de colegiación), **filtros por estado** (Todos / Pendientes / Verificados / Suspendidos / Rechazados) y **paginación** (8 por página, `placeholderData: keepPreviousData` para transición suave). Cada tarjeta muestra la credencial completa (colegiación, especializaciones, ubicación, contacto), un **botón de contacto por WhatsApp** directo, el **certificado adjunto** (nueva ruta `/media/certificate/$`, solo admin, abre el PDF/imagen inline), y las acciones según el estado: Aprobar / Rechazar / Suspender / Reactivar / Eliminar (con confirmación nativa al eliminar). Acciones con mutación optimista vía `setQueriesData` de clave parcial (D1 es eventualmente consistente entre requests). La sección de **Usuarios** también ganó búsqueda + paginación.
- **Vista previa del certificado en el registro**: al subir el título/certificado en `/profesional/registro` y `/profesional/completar`, se muestra una vista previa en vivo (imagen como miniatura, PDF embebido vía `<object>` con fallback "Abrir documento"). Usa un *object URL* del archivo (`URL.createObjectURL`) en vez de un `data:` URL, porque Chrome bloquea la navegación top-level a `data:` — un enlace "Abrir" construido desde `data:` descargaría en vez de abrir. Se revoca al quitar/desmontar.
- **Avatares de profesionales**: foto de perfil opcional, subida desde el panel del profesional (post-registro, nunca en el registro para no añadir fricción al signup). Se muestra en el perfil público (`/ayuda/profesionales/$id`) con fallback a iniciales. Almacenada en R2 (`avatars/{proId}/{uuid}.{ext}`), servida por la ruta pública `/media/avatar/$` (como los audios: pública, clave UUID inadivinable; NO admin-auth como los certificados). Solo imágenes (JPG/PNG/WEBP), máx. 2 MB. Componente compartido `<Avatar>` (perfil + panel). Columna `avatar_key` (migración `0011`).
- **Redes sociales en el perfil (X, Instagram, TikTok)**: el profesional añade sus handles desde el panel (acepta cualquier forma — `@user`, `https://x.com/user`, `x.com/user` — normalizado a handle limpio en el servidor). Se muestran **solo en el perfil público** como fila de iconos de marca (SVG inline — lucide no trae TikTok y solo el pájaro viejo de Twitter). Además se emiten como `sameAs` en el JSON-LD `schema.org/Person` del perfil (la ranura canónica que lee el Knowledge Graph de Google para vincular identidades). `socialLinks()` es fuente única para los `<a>` visibles Y el `sameAs`, así no pueden diverger. Columnas `social_x` / `social_instagram` / `social_tiktok` (migración `0012`).
- **Vanity cortas `/ayudame` y `/ya`**: redirigen al directorio remoto, igual que `/psicologos`. El objeto de búsqueda normalizado ahora vive en una constante compartida (`REMOTE_DIRECTORY_SEARCH`) para que las tres vanity no diverguen.

### Changed
- `countVerifiedProfessionals` y `buildProfessionalWhere` (directorio + selección aleatoria) excluyen ahora `provides_service=false` — los "solo contenido" no cuentan para el stat de la home ni aparecen como contacto de servicio.
- Eliminados `listPending` y `listManagedProfessionals` (código muerto / reemplazado por la `listAllProfessionals` unificada).

### Deploy (esta release incluye migraciones)
- `npx wrangler d1 migrations apply psico-support-db --remote` **y** `--local` (gotcha #1 — `npm run deploy` **no** aplica migraciones; fuente recurrente de incidentes). Tres migraciones: `0010` (`provides_service`), `0011` (`avatar_key`), `0012` (`social_x` / `social_instagram` / `social_tiktok`) — todas aditivas (columnas nullable / valor de enum sobre columna TEXT existente), **no breaking**.
- `npx wrangler d1 migrations list psico-support-db --remote` para confirmar que no queda nada pendiente.
- `npm version minor` (1.11.0 → 1.12.0). Sin bump del cache del SW (release compatible; SWR + `skipWaiting` refresca clientes instalados en un reload).

## [1.11.0] - 2026-06-30

### Added
- **Voces que acompañan (ruta `/apoyo`)**: nueva sección de la app donde cualquier persona —sin iniciar sesión— puede escuchar mensajes cortos en voz de psicólogos verificados, al estilo de *historias de Instagram* pero en audio. El formato es **lean-back**: una bandeja horizontal de profesionales; al tocar uno se abre un visor a pantalla completa que **avanza solo** (clip → clip → siguiente profesional → siguiente…) con barras de progreso segmentadas, zonas de toque (izquierda = anterior, derecha = siguiente, centro = pausa), y navegación por teclado (←/→/espacio/escape). Hay además un botón **"Solo necesito escuchar algo"** que arranca desde el primer profesional y reproduce todo seguido — para quien llega en crisis y no quiere decidir. La secuencia misma de voces es el mensaje: "no estás solo". Vínculo desde el inicio (cuarta tarjeta, icono `Headphones`) y desde `/ayuda` (debajo de la elección de modalidad, como alternativa de acompañamiento inmediato).

  - **Grabación desde el panel del profesional**: en `/profesional/panel`, sección **"Mis audios de apoyo"**. Grabación **nativa en el navegador** vía `MediaRecorder` (sin librerías; Chrome/Firefox producen WebM/Opus, Safari MP4/AAC), con fallback de **subida de archivo** para navegadores sin soporte. Captura: idealmente 1:30, máximo 3:00 (el cronómetro avisa en ámbar a los 90s y se detiene solo a los 180s); máximo 3 MB. Cada profesional puede tener **1–2 audios** activos (pendientes + aprobados); para reemplazar, elimina uno y graba de nuevo. Vista previa `<audio>` y eliminación directa (borra la fila + el objeto en R2).
  - **Revisión administrativa**: los audios pasan por `/admin` antes de publicarse, igual que la verificación de credenciales — mismo patrón de mutación optimista, misma cola de revisión. El panel de admin gana una sección "Audios de apoyo — revisión" con reproductor + Aprobar/Rechazar.
  - **Sin caducidad (decisión de producto)**: a diferencia de las historias reales de IG, los audios no expiran — viven hasta que el profesional los elimina o reemplaza. Encaja mejor con un contexto terapéutico (un mensaje que ayuda hoy puede ayudar en tres días) y libera a los psicólogos de re-grabar a diario. El visor secuencial y auto-avance —lo que presta la sensación IG— se conserva intacto.
  - **Moderación antes que publicación**: la verificación del profesional ya valedera como filtro de confianza; el contenido de audio es superficie nueva en una app para población vulnerable, así que cada clip se revisa antes de salir. Las claves de audio pendiente/rechazado **nunca salen del servidor** (las URLs públicas solo se construyen para clips aprobados), y los UUID de las claves R2 son inadivinables, así que una URL adivinada simplemente 404.

  **Detalles técnicos**: nueva tabla `audio_stories` (migración `0009_slim_spencer_smythe.sql`) con índice compuesto `(professional_id, status)` que cubre las tres queries calientes (bandeja pública `status='approved'`, conteo de capo `status IN (pending,approved)`, cola de admin `status='pending'`). **Esta release sí cambia la base de datos** — a diferencia de 1.7–1.10; ver instrucciones de deploy más abajo. Ruta pública de lectura `/media/audio/$` que streamea desde R2 con `Cache-Control: public, max-age=31536000, immutable` (las claves son write-once + UUID, así que cacheable para siempre) y `Accept-Ranges: bytes` para hacer scrub; R2 guarda el `contentType` en `httpMetadata` al subir, así que la reproducción no necesita tocar la DB. Subida base64-through-server-fn (reutiliza el patrón del certificado; su comentario `ponytail:` ya nombraba el techo de ≤5MB — Opus@64kbps ocupa ~720KB por 90s, trivial para redes móviles venezolanas). El path de actualización nombrado: presigned direct-to-R2 cuando llegue video (Fase 2).

### Changed
- **CTAs urgentes ahora dirigen a la modalidad remota**: todos los puntos donde empujamos a la persona a buscar ayuda *ahora mismo* enrutaban a la selección de modalidad o (silenciosamente) a la lista presencial — `CrisisBanner` ("¿Es una emergencia?"), `ProCta` ("Hablar con un profesional ahora", pie de cada herramienta de `/recursos`), el botón principal del inicio ("Necesito Ayuda Ahora") y el estado vacío de `/apoyo` ("Buscar un psicólogo ahora"). Ahora todos fijan `modality=remote` y van directos al directorio remoto. Razón: solo lo remoto (WhatsApp) es on-demand; lo presencial son brigadas (por ubicación, no instantáneo). Quien llega en crisis nunca debe caer en una lista presencial vacía. La página de selección `/ayuda` sigue accesible vía la pestaña de navegación "Ayuda" y el enlace "Buscar ayuda" de `/acerca-de` (no son CTAs urgentes).
- **Renombrado "Contención a Distancia" → "Asistencia a Distancia"**: ahora espeja "Asistencia Presencial" (ambos "Asistencia [modalidad]"). Actualizado en el botón de `/ayuda`, el título/meta de la página del directorio, y el cuerpo de `/acerca-de`. Sin rastros de "Contención" en la app.
- **Reordenado `/ayuda`**: "Asistencia a Distancia" arriba, "Asistencia Presencial" debajo, "Voces que acompañan" al final. Los tres botones normalizados a un mismo estilo (`glass-card`, `min-h-24`, `p-5`, icono `size-9`, título `text-lg`) — antes el de Voces era más chico y con estilo distinto.
- **"Asistencia Presencial" sin mención a La Guaira**: el subtítulo pasó de "Brigadas en zonas críticas (La Guaira)" a "Brigadas en zonas críticas en todo el país" — el apoyo presencial ahora se considera a nivel nacional, no atado a una región. (Las entradas `La Guaira` en `src/server/locations.ts` son datos geográficos reales — un estado de Venezuela — y se mantienen.)
- **Nueva ruta vanity `/psicologos`**: redirige (307) al directorio remoto con todos los filtros normalizados — una URL corta y compartible para marketing/materiales (`psicoayudaven.com/psicologos`). SSR, sin componente (`beforeLoad` lanza el redirect antes de renderizar), así crawlers y previsualizaciones de enlace la siguen sin JS.

### Deploy (esta release incluye migración)
- `npx wrangler d1 migrations apply psico-support-db --remote` **y** `--local` (gotcha #1 — `npm run deploy` **no** aplica migraciones; fuente recurrente de incidentes).
- `npx wrangler d1 migrations list psico-support-db --remote` para confirmar que no queda nada pendiente.
- `npm version minor` ya aplicado (1.10.0 → 1.11.0). Sin bump del cache del SW (release compatible; SWR + `skipWaiting` refresca clientes instalados en un reload). El SW hará runtime SWR de los audios reproducidos — deseable aquí (un mensaje escuchado una vez se repoduce offline a las 3am); techo nombrado en comentarios para cuando llegue video y los tamaños crezcan.

## [1.10.0] - 2026-06-30

### Added
- **Autochequeo emocional (ruta `/recursos/autochequeo`)**: nuevo cuestionario de autoevaluación para que cada persona identifique cómo está emocionalmente y si podría necesitar apoyo profesional. Es la primera herramienta basada en **protocolos validados**: una **puerta de riesgo agudo** (2 ítems derivados del **ASQ** — *Ask Suicide-Screening Questions*, NIMH, dominio público) seguida del **K6** (*Kessler-6*, escala de distress psicológico de la *WHO World Mental Health Survey*, 6 ítems, 0-24, dominio público, traducción validada al español). La puerta aguda se pregunta **primero**: cualquier "Sí" detiene el cuestionario y muestra de inmediato una pantalla de crisis con el CTA "Hablar con un profesional ahora" + el banner de emergencia. Si no hay riesgo agudo, el K6 produce una banda interpretativa (0-4 bienestar / 5-12 moderado / 13+ alto) con recomendaciones a medida (herramientas de autocuidado, considerar hablar con un profesional, o contacto directo con el directorio). Diseñado como **state machine CSR** (como `enraizamiento`), **efímero**: las respuestas se quedan en el dispositivo, no se guardan ni envían (almacenar puntajes de salud mental agregaría migración + manejo de PII sensible + acoplamiento a auth; la privacidad es una característica). Reutiliza `CrisisBanner` + `ProCta` en **cada fase** para que la red de seguridad esté siempre al alcance. Añadido como primera tarjeta del hub `/recursos` (icono `ClipboardCheck`, "Para ti"). Sin cambios de base de datos ni de SW (release compatible; SWR + `skipWaiting` refresca clientes instalados en un reload).

## [1.9.0] - 2026-06-30

### Added
- **Herramientas de autocuidado (ruta `/recursos`)**: nueva sección de la app con recursos gratuitos para el bienestar emocional propio o para acompañar a otras personas en crisis. Acceso desde una tercera tarjeta en el inicio (`/`) — "Herramientas de Autocuidado" — entre los CTA existentes, sin tocar la navegación global (las 3 pestañas Inicio/Ayuda/Cuenta se mantienen). Cuatro herramientas en esta primera versión, todas funcionando sin conexión una vez visitadas (el SW ya hace runtime SWR de los GET same-origin):

  - **`/recursos/respirar`** (CSR): ejercicio interactivo de **respiración cuadrada 4-4-4-4** con un orbe animado que crece/mengua según la fase (inhala, sostén, exhala, sostén), contador por segundos y botón comenzar/detener. Pensado para pánico y ansiedad aguda.
  - **`/recursos/enraizamiento`** (CSR): técnica **5-4-3-2-1** paso a paso (5 cosas que ves, 4 que tocas, 3 que escuchas, 2 que hueles, 1 que saboreas) con barra de progreso y navegación anterior/siguiente. Para volver al presente.
  - **`/recursos/reacciones-normales`** (**SSR**): psicoeducación sobre qué reacciones son habituales tras una emergencia/desastre (insomnio, recuerdos intrusos, irritabilidad, etc.), qué suele ayudar y **cuándo conviene buscar ayuda profesional**. SSR para SEO y compartir (la gente busca "¿es normal sentir esto después de un desastre?").
  - **`/recursos/primeros-auxilios`** (**SSR**): guía de **Primeros Auxilios Psicológicos** basada en el modelo de la OMS (Mirar, Escuchar, Conectar) para que personas sin formación clínica puedan acompañar a alguien en crisis; incluye una sección "Qué evitar". SSR por su alto valor de compartido (WhatsApp) y SEO.

  Cada herramienta termina con un CTA "Hablar con un profesional ahora" → `/ayuda/profesionales` (nunca es un callejón sin salida) y un banner de emergencia que apunta a servicios de emergencia locales + el directorio. **No existe un número de crisis nacional en Venezuela**, así que el banner no inventa ninguno: solo añadir una línea concreta con fuente oficial verificada. Componentes compartidos `CrisisBanner` y `ProCta` extraídos para que el mensaje de seguridad (descargo "no sustituye atención profesional") no derive entre páginas. Sin cambios de base de datos ni de SW (release compatible; SWR + `skipWaiting` refresca clientes instalados en un reload).

### Changed
- **Iconos en los CTA del inicio**: los botones "Necesito Ayuda Ahora" (LifeBuoy) y "Ofrezco Ayuda (Soy Psicólogo)" (Stethoscope) ahora llevan icono con el mismo espaciado (`gap-2`) que la nueva tarjeta "Herramientas de Autocuidado" (HeartPulse), unificando el lenguaje visual de las tres entradas del landing.

## [1.8.0] - 2026-06-30

### Added
- **Ruta `/social` para invitar profesionales**: nueva página pública pensada para compartir en redes sociales y sumar psicólogos a la red. SSR (no `ssr:false`) para que los metadatos OG/Twitter caigan en el HTML inicial y la vista previa del enlace se renderice al compartirla (WhatsApp, X, Facebook, etc.); reutiliza `seoHead()` con título/descripción orientados a profesionales. La página explica el valor de sumarse (verificación gratuita de la colegiatura, disponibilidad y modalidad a discreción del profesional, servicio gratuito y confidencial), con CTA directo a `/profesional/registro`. Incluye botones de compartir nativos: enlaces de intent de WhatsApp / X / Facebook, un botón "Copiar enlace" (con notificación iOS-style vía `notify()`), y el botón nativo `navigator.share()` (Web Share API) cuando el dispositivo lo soporta — en móviles abre la hoja de compartir del sistema en lugar de obligar a elegir plataforma. Sin cambios de base de datos ni de SW (compatible; SWR + `skipWaiting` refresca clientes instalados en un reload).

### Fixed
- Aprobar/rechazar un profesional desde el panel de admin a veces requería un segundo click para que la lista se actualizara. Causa: D1 es eventualmente consistente entre requests, y el `GET listPending` posterior al `POST reviewProfessional` podía leer una réplica *stale* que aún mostraba la fila como pendiente. Ahora se hace la actualización optimista en `onMutate` (se remueve/quita la fila de la UI al instante) para que el cambio se refleje en el primer click.

## [1.7.0] - 2026-06-30

### Added
- **Conteo de profesionales verificados en el inicio y el panel de admin**: la página principal (`/`) ahora muestra "Más de N profesionales verificados" debajo del subtítulo, como prueba social para quien llega al sitio. El número se redondea hacia abajo al múltiplo de 10 más cercano (p. ej. con 23 verificados dice "Más de 20") — es honesto (el pool sí es mayor que N) y estable frente a la variación de una unidad. La línea se oculta por completo cuando el claim redondeado es menor a 10 (pool pequeño o DB vacía/local sin datos), para no mostrar un hero "triste". El panel de administración (`/admin`) muestra el conteo exacto (sin redondear) debajo del título, junto a las validaciones pendientes; se actualiza al aprobar un profesional. Nueva función servidor pública `countVerifiedProfessionals` que hace un `COUNT(*) WHERE verifiedStatus = 'verified'` (1 fila, sin volcar la tabla). El landing lee la cuenta vía SSR (loader de la ruta, sin flash). Sin cambios de base de datos ni de SW (compatible; SWR + `skipWaiting` refresca clientes instalados en un reload).

## [1.6.0] - 2026-06-29

### Added
- **Sugerencia de instalación de la PWA**: la página principal (`/`) ahora detecta cuando la app no está instalada y muestra una tarjeta sutil "Instalar app" junto a los CTA. En Chrome/Edge/Android/escritorio captura el evento `beforeinstallprompt` y ofrece un botón *Instalar* que dispara el prompt nativo del navegador; en iOS Safari (que no permite instalación programática) muestra la pista estática "Compartir → Agregar a pantalla de inicio". Se oculta si ya está instalada (`display-mode: standalone` / `navigator.standalone`) y la X de cerrar persiste en `localStorage` (no repregunta). Hook reutilizable `useInstallPrompt()` y componente `<InstallCard/>` en `src/lib/install-prompt.tsx`. Sin cambios de base de datos ni de SW (compatible; SWR + `skipWaiting` refresca clientes instalados en un reload).

## [1.5.1] - 2026-06-29

### Added
- **Soporte y sugerencias para profesionales**: el panel del profesional (`/profesional/panel`) ahora incluye un acceso directo para contactar al equipo por WhatsApp con un mensaje pre-escrito (`Hola, soy {nombre} te escribo por medio de psicoayudaven.`). Aparece solo cuando el profesional tiene registro (usa su nombre guardado). Busca aumentar la transparencia y la confianza: canal directo para dudas, sugerencias o reportes de problemas. Sin cambios de base de datos ni de SW (compatible; se refresca con SWR + `skipWaiting`).

## [1.5.0] - 2026-06-29

### Added
- **Certificado opcional en el registro profesional**: en `/profesional/registro` y `/profesional/completar` (sección *Credencial profesional*), los profesionales pueden adjuntar de forma opcional su **título universitario** o **certificado de egreso** (PDF, JPG, PNG o WEBP, máx. 5 MB) para agilizar la verificación. El archivo se almacena en **R2** (binding `MEDIA`, bucket `psico-support-media`); en la base solo se guarda la clave del objeto (`certificate_key`, migración `0008`). La verificación principal sigue siendo el número de colegiación contra el registro público; el documento es complementario. El copiado de la sección se reescribió para dejar claro que el número es obligatorio y el documento opcional. `listPending` ahora expone `certificateKey` para futura visualización por administradores.

## [1.4.1] - 2026-06-29

### Fixed
- Después de registrarse, los usuarios (cuenta básica y profesionales) rebotaban de vuelta al login. Causa: el `beforeLoad` del panel llamaba a `getCurrentUser()` antes de que la cookie de sesión se propagara (la misma carrera que ya se arregló en el login en 1.3.3), o —en el caso del profesional— el flujo nunca iniciaba sesión en absoluto (lo mandaba al login a hacerlo a mano). Fix: ambos registros ahora hacen un `await authClient.getSession()` real (garantiza la cookie) e invalidan el caché `['me']` antes de navegar. El registro básico lleva a `/cuenta`. El registro profesional inicia sesión en el cliente, notifica que la cuenta queda "en revisión" hasta que un administrador la active, y lleva al `/profesional/panel` (si el inicio de sesión fallara por una carrera transitoria, cae al login como red de seguridad — la cuenta ya está creada).

## [1.4.0] - 2026-06-29

### Added
- Dos ejes de especialización nuevos en el registro profesional, ortogonales a la edad (`population`): **poblaciones específicas** (`focusGroups`: Oncológica, Neurodivergentes, Cuidadores, Comunidad LGBTQ+) y **áreas de intervención** (`practiceAreas`: Duelo, Violencia (género/intrafamiliar), Adicciones, Intervención en crisis, Ansiedad y depresión). Ambas opcionales. Se muestran en el directorio, el perfil público (incluyendo OG/JSON-LD `knowsAbout`) y el panel de administración, y se pueden filtrar (dos `<select>` nuevos en el directorio). Migración `0007` con `DEFAULT '[]'` (backfill de filas existentes).

## [1.3.5] - 2026-06-29

### Changed
- Nombre de la PWA unificado: `name` también es ahora `Psicoayudaven` (era `Red de Apoyo Psicológico Venezuela`). Android usa `name` para el prompt de instalación, el app drawer y la etiqueta del icono; ahora coincide con iOS (`short_name`). El nombre descriptivo se conserva en el `<title>` del navegador y los metadatos SEO no cambian.

## [1.3.4] - 2026-06-29

### Changed
- Nombre corto de la PWA: `short_name` ahora es `Psicoayudaven` (era `Apoyo Psicológico`, que iOS mostraba colapsado como "ApoyoPsicologico" en la etiqueta del icono). El `name` completo se mantiene para la splash screen.

## [1.3.3] - 2026-06-29

### Fixed
- Error "Ups, algo salió mal" justo después de iniciar sesión (se arreglaba al refrescar). Causa: condición de carrera entre `signIn.email` (que setea la cookie de sesión en su respuesta) y el `beforeLoad` del panel, que llama a `getCurrentUser()` antes de que la cookie se propagara por completo → el guardia leía `null` y rebotaba, o un server-fn transitorio disparaba el error boundary del router. Fix: tras un login exitoso, se hace `await authClient.getSession()` (round-trip real que garantiza la cookie) y se invalida el caché `['me']` antes de `navigate`, para que el guardia del panel y `cuenta` lean la sesión autenticada.

## [1.3.2] - 2026-06-29

### Fixed
- Redirección HTTP → HTTPS faltante: `http://psicoayudaven.com` se servía directamente (200) sin redirigir a HTTPS. Ahora el worker responde 301 al equivalente `https://` (preserva ruta + query). Detecta el esquema real vía `CF-Visitor` / `X-Forwarded-Proto`; solo redirige cuando detecta explícitamente `http`, así `wrangler dev` y el prerender del shell en build siguen funcionando (no tienen esos headers y antes el redirect rompía la generación del `_shell.html`).

## [1.3.1] - 2026-06-29

### Added
- Página 404 en español (`NotFound`) como `defaultNotFoundComponent` del router. Cierra el warning de dev del perfil (lanza `notFound()` para ids desconocidos/no verificados) que caía al `<p>Not Found</p>` genérico de TanStack Router.

### Changed
- Documentación: `AGENTS.md` y `README.md` actualizados para reflejar el SSR selectivo (mayoría CSR, perfil SSR), la PWA con _shell_ offline y el flujo de prueba local (`npm run build && npx wrangler dev`). Nuevas notas de gotchas sobre `ssr:false` vs `spa.enabled`, el _shell_ generado por build y el service worker hand-rolled.

## [1.3.0] - 2026-06-29

### Added
- PWA offline completa: la app ahora arranca desde un *shell* estático (`/_shell`) aunque se abra sin conexión por primera vez. Generación del shell en build vía `tanstackStart({ spa })`.
- Service worker con *navigation fallback* al shell y precache del shell + manifiesto + iconos, además del SWR en tiempo de ejecución existente. Las navegaciones offline ya no caen en la página de error del navegador; el router monta desde el shell.
- `<link rel="manifest">` en el `<head>` (antes el manifiesto solo se descubría por auto-probe).

### Changed
- El shell caché del service worker ahora también sirve datos conocidos offline (SWR sobre los RPC GET de las server functions: directorio, sesión, etc.) ya que las funciones de lectura son `GET`.

### Fixed
- Inicio en frío offline: antes fallaba con la página de error del navegador por falta de shell cacheable; ahora arranca la app.

## [1.2.0] - 2026-06-29

### Changed
- Rendering model: la mayoría de las rutas ahora se renderizan en el cliente (CSR) en vez de SSR (`ssr: false` selectivo). Sigue habiendo un worker de Cloudflare para las server functions, Better Auth y D1 — sin cambios en la API ni en la base de datos. Primera pintura de las rutas interactivas (panel, admin, registro, login, cuenta, directorio) ahora muestra el spinner de carga mientras resuelven `beforeLoad`/`loader` en el cliente.
- Se mantiene SSR en `/ayuda/profesionales/$id` (perfil) para que scrapers y vistas previas de WhatsApp/redes sigan recibiendo los metadatos OG + JSON-LD reales en el HTML inicial.

### Added
- Componente de carga compartido (`RoutePending`) como `defaultPendingComponent` del router para cubrir el gap de primera pintura de las rutas CSR.

### Fixed
- `public/sw.js`: la clave `CACHE` estaba desfasada (`1.0.0` frente a la versión del paquete). Alineada con la nueva versión; el cambio de forma del shell CSR invalida de una vez a los clientes PWA instalados.

## [1.1.2] - 2026-06-29

### Added
- Página "Acerca de Psicoayudaven" (`/acerca-de`): misión del proyecto y enlaces a GitHub (código abierto bajo licencia MIT), Build4Venezuela y el autor (enbonnet.com), en glass pills coherentes con el diseño.
- El footer del landing ahora es una burbuja clickeable que lleva a la nueva página "Acerca de Psicoayudaven".

### Fixed
- Changelog: enlaces de release corregidos a la organización correcta del repositorio (`enBonnet`).

## [1.1.1] - 2026-06-28

### Fixed
- Sign-in: button now stays in its loading state through navigation to the panel (awaited), so the first click no longer looks idle during the panel's loader latency.
- Sign-out: both the cuenta and panel buttons now disable + show "Cerrando…/Saliendo…", only redirect on success, and surface an error notification on failure.

## [1.1.0] - 2026-06-28

### Added
- Skeleton loading states for the admin, cuenta, and profesional panel pages.

### Fixed
- Mobile password-manager autofill on the professional login: missing `name` attributes caused autofilled credentials to be submitted empty.

## [1.0.0] - 2026-06-28

Initial production release of the disaster-response psychological-support
platform connecting people in Venezuela with verified psychologists.

### Added
- Public directory of verified psychologists with filter/search/paginate.
- Per-professional profile pages with SEO + share (Spanish copy).
- Professional registration, login, profile completion, and availability panel.
- Admin panel for verification and user management.
- Better Auth (email/password); admin role via DB `user.role`.
- Installable PWA with offline app shell (stale-while-revalidate service worker).
- Cloudflare Workers + D1 (SQLite) backend via TanStack Start (SSR).

[Unreleased]: https://github.com/enBonnet/psico-support/compare/v1.1.2...HEAD
[1.1.2]: https://github.com/enBonnet/psico-support/releases/tag/v1.1.2
[1.1.1]: https://github.com/enBonnet/psico-support/releases/tag/v1.1.1
[1.1.0]: https://github.com/enBonnet/psico-support/releases/tag/v1.1.0
[1.0.0]: https://github.com/enBonnet/psico-support/releases/tag/v1.0.0
