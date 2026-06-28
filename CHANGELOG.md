# Changelog

All notable changes to **psico-support** are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[Unreleased]: https://github.com/anomalyco/psico-support/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/anomalyco/psico-support/releases/tag/v1.0.0
