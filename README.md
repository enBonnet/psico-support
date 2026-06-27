# Red de Apoyo Psicológico Venezuela

Plataforma de apoyo psicológico para respuesta a emergencias en Venezuela. Conecta a personas que necesitan contención emocional con psicólogos verificados, y permite a los profesionales registrarse, subir sus credenciales y gestionar su disponibilidad.

**Producción:** [psicoayudaven.com](https://psicoayudaven.com)

## Características

- **Ruta de paciente** (`/ayuda`): acceso rápido a ayuda presencial o a distancia.
- **Directorio de profesionales** (`/ayuda/profesionales`): psicólogos verificados con estado en línea y contacto directo por WhatsApp. Los disponibles aparecen primero.
- **Registro de profesionales** (`/profesional/registro`): formulario en dos pasos. Soporta psicólogos dentro y fuera de Venezuela (cédula, FPV y colegio regional dependen del país de la credencial). El archivo de credencial se sube a R2.
- **Panel del profesional** (`/profesional/panel`): activar/desactivar disponibilidad ("En línea" / "No conectado").
- **Panel de administración** (`/admin`): revisar y verificar o rechazar registros. Acceso basado en base de datos (columna `user.role`).
- **Autenticación** con Better Auth (email + contraseña).
- UI *mobile-first* con estética *liquid glass* sobre la paleta Medicall.

## Stack técnico

- [TanStack Start](https://tanstack.com/start) (React 19, SSR) + TanStack Router / Query / Form
- [Cloudflare Workers](https://workers.cloudflare.com/) + [D1](https://developers.cloudflare.com/d1/) (SQLite) + [R2](https://developers.cloudflare.com/r2/) (credenciales)
- [Better Auth](https://www.better-auth.com/) — email/contraseña, admin basado en BD
- [Drizzle ORM](https://orm.drizzle.team/) + drizzle-kit (migraciones)
- [Tailwind CSS v4](https://tailwindcss.com/) + componentes UI propios
- [Zod](https://zod.dev/) para validación
- [Sentry](https://sentry.io) (opcional)

## Desarrollo local

```bash
npm install
cp .env.example .env.local           # completa los valores
npx wrangler d1 migrations apply psico-support-db --local
npm run dev                          # http://localhost:3000
```

La BD local se guarda en `dev.db` (ignorado por git).

### Variables de entorno

Copia `.env.example` a `.env.local` y completa:

| Variable | Requerida | Descripción |
|---|---|---|
| `BETTER_AUTH_SECRET` | sí | Secreto para firmar sesiones. Genera con `npx -y @better-auth/cli secret` |
| `BETTER_AUTH_URL` | sí | URL base pública (local: `http://localhost:3000`) |
| `DATABASE_URL` | sí | Ruta a la BD SQLite local (p. ej. `file:./dev.db`) |
| `VITE_SENTRY_DSN` | no | DSN de Sentry para el cliente |

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

Los bindings de D1/R2 y el dominio están en `wrangler.jsonc`.

```bash
# 1. Recursos (una sola vez); copia el database_id devuelto a wrangler.jsonc
npx wrangler d1 create psico-support-db
npx wrangler r2 bucket create psico-support-credentials

# 2. Migraciones a remoto
npx wrangler d1 migrations apply psico-support-db --remote

# 3. Secretos
npx wrangler secret put BETTER_AUTH_SECRET
npx wrangler secret put BETTER_AUTH_URL        # https://tu-dominio.com
npx wrangler secret put VITE_SENTRY_DSN        # opcional

# 4. Desplegar
npm run deploy
```

## Estructura

```
src/
  routes/
    ayuda/               # ruta de paciente + directorio de profesionales
    profesional/         # registro (2 pasos), login, panel
    admin/               # panel de administración
    api/
      auth/$             # handler de Better Auth
      credential/upload  # subida de credenciales a R2
  server/                # server functions (profesionales, ubicaciones)
  db/                    # esquema Drizzle + cliente D1
  lib/auth.ts            # configuración Better Auth
  components/ui/         # button, card, badge, input, switch, label
drizzle/                 # migraciones SQL
```

## Notas

- El registro desacopla país de residencia, país de la credencial y país de WhatsApp, para soportar psicólogos venezolanos dentro y fuera del país.
- Los mensajes de error al usuario están en español; nunca se filtran detalles de SQL al cliente.
