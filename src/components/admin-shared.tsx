// ponytail: shared bits between the admin routes. Kept small on purpose — the
// row type is derived from the server fn so it can't drift, STATUS_META is the
// badge styling used by both the list card and the detail header, and
// SectionSearch + Pager are the generic list utilities reused by the
// Profesionales and Usuarios sub-routes. ACTION_BTN stays duplicated where
// needed (a one-liner className string; not worth a shared import for two call
// sites).

import { Search } from 'lucide-react'
import type { listAllProfessionals } from '#/server/professionals'

// ponytail: derived list type so the optimistic setQueriesData in the
// Profesionales sub-route and the detail route's getProfessionalForAdmin
// consumer stay typed without exporting a DTO from the server module. The
// detail route's getProfessionalForAdmin returns the SAME row shape (mirrors
// the list select), so this type covers both.
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

// ponytail: search input with a leading magnifier icon. Shared by the
// Profesionales and Usuarios sub-routes. glass-input h-12 + text-base matches
// inputCls so the box renders at the same height as other form inputs on the
// page; pl-9 leaves room for the leading icon. No visible label — this is a
// compact filter control (deliberately different from the FieldShell pattern),
// so it uses placeholder + aria-label.
export function SectionSearch({
  value,
  onChange,
  placeholder,
  ariaLabel,
}: {
  value: string
  onChange: (v: string) => void
  placeholder: string
  ariaLabel?: string
}) {
  return (
    <div className="relative">
      <Search
        aria-hidden="true"
        className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--medi-text-secondary)]"
      />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={ariaLabel ?? placeholder}
        className="glass-input h-12 w-full pl-9 pr-3 text-base"
      />
    </div>
  )
}

// ponytail: prev/next pager. Hidden when there's a single page (no nav needed).
// page is 1-based; pages derived from total/pageSize. Reused by the
// Profesionales and Usuarios sub-routes.
export function Pager({
  page,
  total,
  pageSize,
  onPageChange,
}: {
  page: number
  total: number
  pageSize: number
  onPageChange: (p: number) => void
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize))
  if (pages <= 1) return null
  const pagerBtn =
    'flex size-9 items-center justify-center rounded-[var(--glass-radius-sm)] glass-card-soft text-[var(--medi-primary)] transition-all hover:translate-y-[-1px] disabled:opacity-40 disabled:hover:translate-y-0'
  return (
    <div className="mt-3 flex items-center justify-center gap-3 text-sm text-[var(--medi-text-secondary)]">
      <button
        type="button"
        disabled={page <= 1}
        onClick={() => onPageChange(page - 1)}
        aria-label="Página anterior"
        className={pagerBtn}
      >
        ‹
      </button>
      <span>
        Página {page} de {pages}
      </span>
      <button
        type="button"
        disabled={page >= pages}
        onClick={() => onPageChange(page + 1)}
        aria-label="Página siguiente"
        className={pagerBtn}
      >
        ›
      </button>
    </div>
  )
}
