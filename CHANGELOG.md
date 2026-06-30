# Changelog

All notable changes to **psico-support** are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
