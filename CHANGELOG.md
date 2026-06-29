# Changelog

All notable changes to **psico-support** are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
