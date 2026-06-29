# Red de Apoyo Psicológico Venezuela

Plataforma de apoyo psicológico para respuesta a emergencias en Venezuela. Conecta a personas que necesitan contención emocional con psicólogos verificados, y permite a los profesionales registrarse, subir sus credenciales y gestionar su disponibilidad.

**Producción:** [psicoayudaven.com](https://psicoayudaven.com)

## Características

- **Ruta de paciente** (`/ayuda`): acceso rápido a ayuda presencial o a distancia.
- **Directorio de profesionales** (`/ayuda/profesionales`): psicólogos verificados con estado en línea y contacto directo por WhatsApp. Los disponibles aparecen primero. Grilla de 2 columnas en escritorio.
- **Perfil profesional** (`/ayuda/profesionales/$id`): página pública por profesional con SEO (Open Graph, Twitter Cards, JSON-LD) y botón **Compartir** (Web Share API → portapapeles).
- **Registro de profesionales** (`/profesional/registro`): formulario en dos pasos. La credencial es un único número de colegiación agnóstico de país (+ colegio certificador opcional). Soporta psicólogos dentro y fuera de Venezuela.
- **Panel del profesional** (`/profesional/panel`): activar/desactivar disponibilidad ("En línea" / "No conectado").
- **Panel de administración** (`/admin`): revisar y verificar o rechazar registros. Acceso basado en base de datos (columna `user.role`).
- **Centro de cuenta** (`/cuenta`): hub según rol (login, panel, admin, cerrar sesión).
- **SEO** en todas las páginas públicas (títulos, descripciones, Open Graph, canonical vía `src/lib/seo.ts`).
- **Autenticación** con Better Auth (email + contraseña).
- UI _mobile-first_ con estética _liquid glass_ sobre la paleta Medicall. Navegación: barra inferior en móvil, barra superior en escritorio.

## Stack técnico

- [TanStack Start](https://tanstack.com/start) (React 19, SSR selectivo — la mayoría CSR, perfil SSR) + TanStack Router / Query / Form
- [Cloudflare Workers](https://workers.cloudflare.com/) + [D1](https://developers.cloudflare.com/d1/) (SQLite)
- [Better Auth](https://www.better-auth.com/) — email/contraseña, admin basado en BD
- [Drizzle ORM](https://orm.drizzle.team/) + drizzle-kit (migraciones)
- [Tailwind CSS v4](https://tailwindcss.com/) + componentes UI propios
- [Zod](https://zod.dev/) para validación
- **PWA** instalable con _shell_ offline + service worker
- [Sentry](https://sentry.io) (opcional)

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
| `VITE_SENTRY_DSN`    | no        | DSN de Sentry para el cliente                                             |

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

## Despliegue (Cloudflare)

Los bindings de D1 y el dominio están en `wrangler.jsonc`.

```bash
# 1. Recursos (una sola vez); copia el database_id devuelto a wrangler.jsonc
npx wrangler d1 create psico-support-db

# 2. Secretos
npx wrangler secret put BETTER_AUTH_SECRET
npx wrangler secret put BETTER_AUTH_URL        # https://tu-dominio.com
npx wrangler secret put VITE_SENTRY_DSN        # opcional

# 3. Desplegar
npm run deploy

# 4. Migraciones a remoto  ⚠️ paso separado, NO incluido en `npm run deploy`
npx wrangler d1 migrations apply psico-support-db --remote
npx wrangler d1 migrations list psico-support-db --remote   # debe quedar vacío
```

> **Importante:** `npm run deploy` solo sube código; **no** aplica migraciones
> de D1. Tras cualquier cambio en `src/db/schema.ts`, aplica las migraciones a
> remoto con el paso 4 o la app fallará en producción (`no such column` /
> `NOT NULL`) aunque funcione en local.

## Estructura

```
src/
  routes/
    ayuda/               # ruta de paciente + directorio + perfil profesional
      profesionales/
        index.tsx        # directorio (filtro/búsqueda/paginación)
        $id.tsx          # perfil público por profesional (SEO + compartir)
    profesional/         # registro (2 pasos), login, panel
    admin/               # panel de administración
    cuenta.tsx           # hub de cuenta según rol
    api/auth/$           # handler de Better Auth
  server/                # server functions (profesionales, ubicaciones)
  lib/seo.ts             # helpers SEO (OG/Twitter/canonical + JSON-LD)
  lib/notifications.tsx  # notificaciones fire-and-forget estilo iOS
  db/                    # esquema Drizzle + cliente D1
  components/            # bottom-tabs (BottomTabs + DesktopNav), ui/*
drizzle/                 # migraciones SQL (vía wrangler, no drizzle-kit)
```

## Notas

- El registro desacopla país de residencia, país de la credencial y país de WhatsApp, para soportar psicólogos venezolanos dentro y fuera del país.
- La credencial es un único número de colegiación (+ colegio certificador opcional); el archivo de imagen y el binding de R2 se retiraron.
- Los mensajes de error al usuario están en español; nunca se filtran detalles de SQL al cliente.
- **Para agentes de IA y contribuyentes:** ver [`AGENTS.md`](./AGENTS.md) (comandos, estructura, gotchas) y [`docs/ui-style.md`](./docs/ui-style.md) (sistema de diseño _liquid glass_).
