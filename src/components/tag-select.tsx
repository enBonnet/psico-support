// ponytail: shared multi-select tag buttons for the pro forms. Used by
// registro.tsx, completar.tsx, and perfil.tsx for the four specialization
// axes (population, focusGroups, practiceAreas, specializedAreas). Plain
// value + onChange + errors props so it composes with both useState (perfil)
// and TanStack Form's <form.Field> (registro/completar) — same escape as
// CertificateInput / PhoneInput. The button markup, aria-pressed pattern,
// and selected/unselected class strings live here once instead of being
// copy-pasted into five <form.Field> blocks per route.

import { FieldShell } from '#/components/professional-form'

export const tagButtonCls = (selected: boolean): string =>
  'min-h-11 rounded-[var(--glass-radius-sm)] border px-4 py-2 text-sm font-medium transition-all ' +
  (selected
    ? 'border-[var(--medi-secondary)] bg-[var(--medi-secondary)] text-white'
    : 'border-[var(--medi-border)] text-[var(--medi-text-secondary)] hover:translate-y-[-1px]')

export function TagSelect({
  label,
  options,
  value,
  onChange,
  errors = [],
}: {
  label: string
  options: readonly string[]
  value: string[]
  onChange: (v: string[]) => void
  errors?: unknown[]
}) {
  return (
    <FieldShell label={label} errors={errors}>
      <div className="flex flex-wrap gap-2">
        {options.map((opt) => {
          const selected = value.includes(opt)
          return (
            <button
              key={opt}
              type="button"
              aria-pressed={selected}
              onClick={() =>
                onChange(
                  selected ? value.filter((v) => v !== opt) : [...value, opt],
                )
              }
              className={tagButtonCls(selected)}
            >
              {opt}
            </button>
          )
        })}
      </div>
    </FieldShell>
  )
}
