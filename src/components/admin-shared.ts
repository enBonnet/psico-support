// ponytail: shared bits between the admin professional list (/admin) and the
// per-pro review/edit detail route (/admin/profesionales/$id). Kept tiny on
// purpose — the row type is derived from the server fn so it can't drift, and
// STATUS_META is the badge styling used by both the list card and the detail
// header. ACTION_BTN is duplicated where needed (it's a one-liner className
// string; not worth a shared import for two call sites).

import type { listAllProfessionals } from '#/server/professionals'

// ponytail: derived list type so the optimistic setQueriesData in /admin and
// the detail route's getProfessionalForAdmin consumer stay typed without
// exporting a DTO from the server module. The detail route's
// getProfessionalForAdmin returns the SAME row shape (mirrors the list select),
// so this type covers both.
export type AdminProList = Awaited<ReturnType<typeof listAllProfessionals>>
export type AdminPro = AdminProList['rows'][number]

// ponytail: status → {label, badge} for both the list card and the detail
// header. badge is a Tailwind text-color class (matches the existing list
// styling). 'deleted' is kept for totality though listAllProfessionals
// excludes those rows.
export const STATUS_META: Record<
  AdminPro['verifiedStatus'],
  { label: string; badge: string }
> = {
  pending: { label: 'En revisión', badge: 'text-amber-700' },
  verified: { label: 'Verificado', badge: 'text-green-700' },
  disabled: { label: 'Suspendido', badge: 'text-red-700' },
  rejected: { label: 'Rechazado', badge: 'text-red-700' },
  deleted: { label: 'Eliminado', badge: 'text-red-700' },
}
