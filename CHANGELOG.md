# Changelog

All notable changes to **psico-support** are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
