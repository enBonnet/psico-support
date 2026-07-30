# PsicoAyudaVen — Red de Apoyo Psicológico Venezuela

Plataforma de apoyo psicológico para respuesta a emergencias en Venezuela.
Conecta a personas que necesitan contención emocional con psicólogos
verificados, y permite a los profesionales registrarse, subir sus credenciales
y gestionar su disponibilidad.

**Producción:** [psicoayudaven.com](https://psicoayudaven.com) ·
**Código abierto (MIT)** · Parte de Build4Venezuela.

## Características

### Para quien busca ayuda

- **Ruta de paciente** (`/ayuda`): elección entre asistencia presencial
  (brigadas) o a distancia (WhatsApp).
- **Directorio de profesionales** (`/ayuda/profesionales`): psicólogos
  verificados con insignia de disponibilidad en vivo, ordenados para que los
  contactables ahora aparezcan primero. Filtro/búsqueda/paginación, 2 columnas
  en escritorio, y botón **"Contactar al azar"** (flotante en móvil).
- **Perfil profesional** (`/ayuda/profesionales/$id`): página pública por
  profesional con SEO (Open Graph, Twitter Cards, JSON-LD `schema.org/Person`),
  avatar, redes sociales y botón **Compartir** (Web Share API → portapapeles).
- **Voces que acompañan** (`/apoyo`): clips cortos en voz de psicólogos
  verificados, en un visor auto-avance estilo historias de Instagram — para
  quien llega en crisis y solo necesita escuchar algo.
- **Herramientas de autocuidado** (`/recursos`): ejercicios interactivos
  (respiración cuadrada, técnica 5-4-3-2-1), un autochequeo basado en los
  protocolos validados ASQ + K6, y psicoeducación (Primeros Auxilios
  Psicológicos de la OMS, reacciones normales tras una emergencia).
- **Derivación a autocuidado** cuando no hay profesionales disponibles, para
  que nadie se quede en un callejón sin salida.

### Para profesionales

- **Registro** (`/profesional/registro`): dos pasos. Credencial = número de
  colegiación agnóstico de país + colegio certificador opcional, con
  **certificado de egreso** opcional y **documentos de apoyo** (hasta 6) que
  aceleran la verificación. Soporta psicólogos dentro y fuera de Venezuela.
- **Panel** (`/profesional/panel`): hub de tarjetas — perfil, presentación
  (foto + redes), disponibilidad, audios, seguimiento clínico. Cada tarjeta
  muestra una vista previa del estado actual sin abrirla.
- **Disponibilidad por horario** (`/profesional/disponibilidad`): tres modos
  (Siempre disponible / Por horario / No disponible). La disponibilidad **se
  deriva en tiempo real** del horario en cada render — sin cron ni lag.
- **Voces que acompañan** (`/profesional/audios`): grabadora nativa en el
  navegador (`MediaRecorder`) con fallback de subida de archivo. Hasta 2 audios
  por profesional, revisados por el admin antes de publicarse.
- **Seguimiento clínico** (`/profesional/seguimiento`): registro privado de
  las personas atendidas (teléfono, motivo, triaje de riesgo tipo C-SSRS,
  acción PFA, estado, próximo contacto, notas). **Privado por profesional** —
  ni el admin ni el público tienen acceso.

### Para administración

- **Panel de administración** (`/admin`): cola de verificación unificada con
  búsqueda, filtros por estado y paginación. Aprobar / rechazar / suspender /
  reactivar / eliminar, contacto directo por WhatsApp, vista del certificado y
  documentos de respaldo. Sección de revisión de audios. Gestión de usuarios.
  Acceso basado en la BD (columna `user.role`), no por variable de entorno.

### Transversales

- **Recuperación de contraseña** (`/recuperar`): flujo nativo de Better Auth
  con respuesta anti-enumeración, invalidación de sesiones y vista dedicada
  para enlaces caducados.
- **PWA** instalable con _shell_ offline + service worker (cold-open sin
  conexión, instalación sugerida, vanity URLs cortas).
- **SEO** en todas las páginas públicas (títulos, descripciones, Open Graph,
  canonical vía `src/lib/seo.ts`).
- **Autenticación** con Better Auth (email + contraseña).
- UI _mobile-first_ con estética _liquid glass_ sobre la paleta Medicall.
  Navegación: barra inferior en móvil, barra superior en escritorio.
- **Telemetría**: monitor de errores Sentry (cliente + worker) y analítica de
  producto con Cloudflare Analytics Engine — ambas opcionales/best-effort.

## Stack técnico

- [TanStack Start](https://tanstack.com/start) (React 19, SSR selectivo — la
  mayoría CSR, perfil SSR) + TanStack Router / Query / Form
- [Cloudflare Workers](https://workers.cloudflare.com/) con:
  - [D1](https://developers.cloudflare.com/d1/) (SQLite) — base de datos
  - [R2](https://developers.cloudflare.com/r2/) — certificados, documentos de
    apoyo, audios, avatares (`binding MEDIA`, bucket `psico-support-media`)
  - [Analytics Engine](https://developers.cloudflare.com/analytics/analytics-engine/)
    — analítica de producto (`binding ANALYTICS`, dataset `psico_events`)
  - [Email Service](https://developers.cloudflare.com/email-routing/email-worker/)
    — correo transaccional, p. ej. recuperación de contraseña (`binding EMAIL`)
- [Better Auth](https://www.better-auth.com/) — email/contraseña, admin basado
  en BD
- [Drizzle ORM](https://orm.drizzle.team/) + drizzle-kit (migraciones)
- [Tailwind CSS v4](https://tailwindcss.com/) + componentes UI propios
- [Zod](https://zod.dev/) para validación
- [Sentry](https://sentry.io) (`@sentry/cloudflare` + `@sentry/tanstackstart-react`)
  — opcional vía `VITE_SENTRY_DSN`

## Desarrollo local

```bash
npm install
cp .env.example .env.local           # completa los valores
npx wrangler d1 migrations apply psico-support-db --local
npm run dev                          # http://localhost:3000
```

La BD local se guarda en `dev.db` (ignorado por git).

### Probar la PWA localmente

El service worker y el _shell_ offline solo se activan en build de producción
(en `npm run dev` no hay SW, a propósito). Para probar la PWA (instalabilidad,
modo offline, _cold open_ sin conexión):

```bash
npm run build && npx wrangler dev --port 3000
```

Abre `http://localhost:3000`, recarga fuerte y revisa DevTools → Application
→ Manifest / Service Workers. localhost se trata como contexto seguro, así
que la instalación funciona igual que en producción.

### Variables de entorno

Copia `.env.example` a `.env.local` y completa:

| Variable             | Requerida | Descripción                                                               |
| -------------------- | --------- | ------------------------------------------------------------------------- |
| `BETTER_AUTH_SECRET` | sí        | Secreto para firmar sesiones. Genera con `npx -y @better-auth/cli secret` |
| `BETTER_AUTH_URL`    | sí        | URL base pública (local: `http://localhost:3000`)                         |
| `DATABASE_URL`       | sí        | Ruta a la BD SQLite local (p. ej. `file:./dev.db`)                        |
| `VITE_SENTRY_DSN`    | no        | DSN de Sentry para el cliente y el worker (sin él, Sentry queda inactivo) |
| `SENTRY_AUTH_TOKEN`  | no        | Token para subir source maps en build/deploy                              |

> Los bindings `DB`, `MEDIA`, `ANALYTICS` y `EMAIL` se declaran en
> `wrangler.jsonc` y existen automáticamente en `wrangler dev`/deploy — no
> requieren variables de entorno.

### Base de datos

Las migraciones viven en `drizzle/`. Tras editar `src/db/schema.ts`:

```bash
npm run db:generate                                         # crea el SQL en drizzle/
npx wrangler d1 migrations apply psico-support-db --local   # aplica en local
```

### Dar permisos de administrador

El admin se define en la BD (`user.role`), no por variable de entorno:

```sql
UPDATE user SET role = 'admin' WHERE email = 'tu@correo.com';
```

## Scripts

Referencia completa de `package.json`. Los que tocan la BD de **runtime**
(`.wrangler/state/...`) se distinguen de los que solo tocan `dev.db`
(herramienta de drizzle-kit).

### Desarrollo y build

| Script             | Comando                              | Descripción                                                                       |
| ------------------ | ------------------------------------ | --------------------------------------------------------------------------------- |
| `dev`              | `node scripts/db-check.mjs && dotenv -e .env.local -- vite dev --port 3000` | Servidor de desarrollo en `:3000`. Antes arranca `db-check` (avisa si falta el    |
|                    |                                      | esquema runtime) y carga `.env.local` vía `dotenv-cli`. **No activa el SW.**       |
| `build`            | `vite build`                         | Build de producción (SSR + cliente) y prerenderiza `/_shell` (necesita miniflare; |
|                    |                                      | CI usa `CLOUDFLARE_VITE_FORCE_LOCAL=true`).                                       |
| `preview`          | `vite preview`                       | Sirve el build de producción localmente.                                          |
| `generate-routes`  | `tsr generate`                       | Regenera `routeTree.gen.ts` desde `src/routes/` (normalmente corre automático en  |
|                    |                                      | dev/build; útil para forzarlo).                                                   |

### Calidad de código

| Script    | Comando                            | Descripción                                                       |
| --------- | ---------------------------------- | ----------------------------------------------------------------- |
| `lint`    | `eslint`                           | Linter.                                                           |
| `format`  | `prettier --write . && eslint --fix` | Formatea todo y aplica fixes de lint automáticos.               |
| `check`   | `prettier --check .`               | Verifica formato sin escribir (CI / git hook).                    |
| `test`    | `vitest run`                       | Suite de tests. (Actualmente no hay archivos de test; ver AGENTS.) |

> No hay script de typecheck. Usa `npx tsc --noEmit`. Existe un error de
> tipado preexistente en `drizzle.config.ts` ajeno al código de la app.

### Despliegue

| Script    | Comando                              | Descripción                                                |
| --------- | ------------------------------------ | ---------------------------------------------------------- |
| `deploy`  | `npm run build && wrangler deploy`   | Sube código a Cloudflare. **No aplica migraciones D1**     |
|           |                                      | (ver paso 5 del despliegue más abajo).                     |

### Base de datos — esquema y migraciones (drizzle-kit, BD `dev.db`)

Estos operan sobre `dev.db` (`DATABASE_URL`), el objetivo de introspección de
drizzle-kit, **no** la BD runtime que sirve `wrangler dev`.

| Script          | Comando              | Descripción                                                              |
| --------------- | -------------------- | ------------------------------------------------------------------------ |
| `db:generate`   | `drizzle-kit generate` | Crea `drizzle/000N_*.sql` a partir de cambios en `src/db/schema.ts`.   |
| `db:migrate`    | `drizzle-kit migrate`  | Aplica migraciones con el migrador de drizzle-kit (sobre `dev.db`).     |
| `db:push`       | `drizzle-kit push`     | Empuja el esquema directamente, sin generar archivos de migración.      |
| `db:pull`       | `drizzle-kit pull`     | Introspecta la BD y regenera el esquema (útil para sincronizar).        |
| `db:studio`     | `drizzle-kit studio`   | Abre Drizzle Studio (GUI contra `dev.db`).                              |

Para aplicar migraciones a la BD runtime de verdad, usa wrangler:

```bash
npx wrangler d1 migrations apply psico-support-db --local   # local runtime
npx wrangler d1 migrations apply psico-support-db --remote  # producción
```

### Base de datos — runtime (wrangler)

| Script               | Descripción                                                                                          |
| -------------------- | ---------------------------------------------------------------------------------------------------- |
| `db:status`          | Comprueba que la BD runtime (`scripts/db-check.mjs`) tenga esquema aplicado. Solo lectura. No arranca |
|                      | wrangler. Lo corre `npm run dev` como preflight.                                                     |
| `db:seed`            | Puebla la BD runtime local con fixtures (`scripts/seed-local.ts`): un admin + profesionales en todos |
|                      | los estados. Idempotente por email; `--reset` limpia todo primero; contraseña por defecto            |
|                      | `password123`. Requiere migraciones aplicadas antes.                                                 |
| `db:pull-prod`       | Vuelca la BD D1 de **producción** en la runtime local, **sanitizada de PII**                         |
|                      | (`scripts/pull-prod-sanitized.mjs`): emails anonimizados (salvo admins), contraseñas/tokens reset,   |
|                      | WhatsApp falseados, PII clínico borrado. Ideal tras un `git clean -fdx`. `--dry-run` imprime el reporte pero igualmente sobrescribe la BD runtime local.    |
|                      | El SQL crudo de prod se borra siempre al terminar (nunca persiste en disco).                         |
| `db:reset-passwords` | Pone una contraseña única en todas las cuentas `credential` locales                                  |
|                      | (`scripts/reset-local-passwords.ts`) para poder loguearte como cualquier usuario sin saber su clave.  |
|                      | `--email` para uno solo, `--dry-run` para ver sin escribir. Hash scrypt compatible con Better Auth.  |

### Analítica y docs

| Script                 | Descripción                                                                              |
| ---------------------- | ---------------------------------------------------------------------------------------- |
| `analytics`            | Consulta Analytics Engine desde la terminal (`scripts/analytics.ts`). Requiere           |
|                        | `CF_ACCOUNT_ID` + `CF_ANALYTICS_TOKEN` en `.env.local`. Ej.: `npm run analytics -- funnel`. |
| `analytics:dashboard`  | Dashboard HTML local en `:8788` (`scripts/analytics-dashboard.ts`) con las mismas        |
|                        | consultas que el CLI. El token nunca llega al navegador (SQL corre server-side).          |
| `docs`                 | Sirve la carpeta `docs/` (incluido el diagrama `app-map.html`) en `:4173` y la abre en   |
|                        | el navegador (`scripts/serve-docs.mjs`). Sin dependencias. `--port`/`--no-open`.         |

## Despliegue (Cloudflare)

Los bindings de D1, R2, Analytics Engine y Email, y el dominio, están en
`wrangler.jsonc`.

```bash
# 1. Recursos (una sola vez); copia los IDs devueltos a wrangler.jsonc
npx wrangler d1 create psico-support-db
npx wrangler r2 bucket create psico-support-media

# 2. Secretos
npx wrangler secret put BETTER_AUTH_SECRET
npx wrangler secret put BETTER_AUTH_URL        # https://tu-dominio.com
npx wrangler secret put VITE_SENTRY_DSN        # opcional

# 3. Onboarding del Email Service (una sola vez, por dashboard)
#    Compute > Email Service > Email Sending > Onboard Domain para
#    psicoayudaven.com (registros SPF/DKIM/DMARC que muestre). Hasta que se
#    complete, env.EMAIL.send() rechaza en runtime (dominio no verificado).

# 4. Desplegar
npm run deploy

# 5. Migraciones a remoto  ⚠️ paso separado, NO incluido en `npm run deploy`
npx wrangler d1 migrations apply psico-support-db --remote
npx wrangler d1 migrations list psico-support-db --remote   # debe quedar vacío
```

> **Importante:** `npm run deploy` solo sube código; **no** aplica migraciones
> de D1. Tras cualquier cambio en `src/db/schema.ts`, aplica las migraciones a
> remoto con el paso 5 o la app fallará en producción (`no such column` /
> `NOT NULL`) aunque funcione en local.

## Estructura

```
src/
  routes/
    ayuda/               # ruta de paciente + directorio + perfil profesional
      profesionales/
        index.tsx        # directorio (filtro/búsqueda/paginación) — CSR
        $id.tsx          # perfil público por profesional (SEO + compartir) — SSR
    profesional/         # registro (2 pasos), login, panel + sub-rutas enfocadas
                          # (perfil, presentación, disponibilidad, audios, seguimiento)
    admin/               # verificación + revisión de audios + gestión de usuarios
    recursos/            # herramientas de autocuidado (respirar, enraizamiento,
                          # autochequeo, psicoeducación SSR)
    apoyo/               # "Voces que acompañan" (bandeja de audios)
    cuenta.tsx           # hub de cuenta según rol
    recuperar.tsx        # recuperación de contraseña
    {psicologos,ayudame,ya}.tsx   # vanity → directorio remoto (307 server-side)
    media/$              # rutas que sirven R2 (avatar, audio, certificado, documento)
    api/auth/$           # handler de Better Auth
  server/                # server functions
    professionals.ts     #   profesionales (lista, alta, disponibilidad, admin)
    audio-stories.ts     #   "Voces que acompañan"
    follow-ups.ts        #   seguimiento clínico (privado por profesional)
    analytics.ts         #   catálogo de eventos + writeEvent() + track() auth-free
    locations.ts         #   mapa de estados y ciudades de Venezuela
  lib/
    sentry.ts            # getSentryDsn() + getSentryInitOptions() (compartido)
    analytics-client.ts  # track() tipado, fire-and-forget, seguro para SSR
    seo.ts               # helpers SEO (OG/Twitter/canonical + JSON-LD)
    notifications.tsx    # notificaciones fire-and-forget estilo iOS
    install-prompt.tsx   # detección de instalación PWA
  components/            # bottom-tabs (BottomTabs + DesktopNav), ui/*, tag-select,
                          # phone-input, avatar, …
  server.ts              # entrada del Worker (httpsRedirect + Sentry.withSentry)
  instrument.client.ts   # Sentry.init (cliente)
  db/                    # esquema Drizzle + cliente D1
drizzle/                 # migraciones SQL (vía wrangler, no drizzle-kit)
public/
  sw.js                  # service worker hand-rolled (fallback de navegación +
                          # precache del shell + SWR en runtime)
```

## Notas

- El registro desacopla país de residencia, país de la credencial y país de
  WhatsApp, para soportar psicólogos venezolanos dentro y fuera del país.
- La credencial es un único número de colegiación (+ colegio certificador
  opcional). El **certificado de egreso** y los **documentos de apoyo** son
  opcionales y se guardan en R2 (`support-docs/`, `certificates/`).
- **Cuatro ejes ortogonales de especialización** (`src/server/professionals.ts`,
  option sets `as const`): `population` (edad), `focusGroups` (poblaciones
  específicas), `practiceAreas` (áreas de intervención) y `specializedAreas`
  (áreas sensibles — Duelo, Trauma, Suicidio, etc.). Cada uno es un array JSON
  en D1 y se surfacea en el registro, el panel, el directorio (filtros),
  el perfil público, la meta SEO y el JSON-LD `knowsAbout`. Las áreas
  específicas tienen además un `specialization_mode` (`inclusive`/`exclusive`):
  un profesional exclusivo solo aparece cuando un buscador filtra por una de
  sus áreas — nunca en el directorio general ni en "Necesito ayuda ahora".
- Los componentes de formulario compartidos (`<PhoneInput>`, `<TagSelect>`,
  `<CertificateInput>`) viven en `src/components/` y se reutilizan entre
  registro, completar y perfil para que el alta y la edición nunca diverjan.
- Los mensajes de error al usuario están en español; nunca se filtran detalles
  de SQL al cliente.
- La analítica de producto es **fire-and-forget**: un fallo de escritura nunca
  rompe la funcionalidad instrumentada. El catálogo de eventos vive en
  `src/server/analytics.ts` (`TRACKED_EVENTS`); los nombres son inmutables.
- **Para agentes de IA y contribuyentes:** ver [`AGENTS.md`](./AGENTS.md)
  (comandos, estructura, gotchas) y [`docs/ui-style.md`](./docs/ui-style.md)
  (sistema de diseño _liquid glass_).
