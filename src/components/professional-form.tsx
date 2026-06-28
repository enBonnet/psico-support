import type { ReactNode } from 'react'

// ponytail: shared, form-independent helpers used by BOTH the one-shot
// professional signup (registro.tsx) and the "add professional profile"
// flow for logged-in users (completar.tsx). The actual <form.Field> JSX is
// NOT shared — TanStack Form's ReactFormApi has ~12 invariant type params,
// so a shared form-consuming component would need `any` everywhere. We keep
// the markup in each route and share only these pure pieces. If you change
// the professional field set, update BOTH routes.

export const inputCls = 'glass-input h-12 w-full px-3 text-base'

// ponytail: country -> dial code for WhatsApp formatting. Only the countries
// listed in PAIS_OPTIONS. "Otro" falls back to raw digits.
export const DIAL_CODE: Record<string, string> = {
  Venezuela: '+58',
  Argentina: '+54',
  Bolivia: '+591',
  Brasil: '+55',
  Canadá: '+1',
  Chile: '+56',
  Colombia: '+57',
  'Costa Rica': '+506',
  Cuba: '+53',
  Ecuador: '+593',
  'El Salvador': '+503',
  'Estados Unidos': '+1',
  Guatemala: '+502',
  Honduras: '+504',
  México: '+52',
  Nicaragua: '+505',
  Panamá: '+507',
  Paraguay: '+595',
  Perú: '+51',
  'Puerto Rico': '+1',
  'República Dominicana': '+1',
  Uruguay: '+598',
  Otro: '',
}

// WhatsApp: keep the country's dial code + digits, grouped for readability.
// ponytail: naive grouping, not a full libphonenumber.
export function formatWhatsapp(raw: string, country: string): string {
  const dial = DIAL_CODE[country] ?? ''
  const cleaned = raw.replace(/[^\d+]/g, '')
  // strip a leading dial code if present so we don't double it
  let digits = cleaned
  if (dial && digits.startsWith(dial.replace(/\s/g, ''))) {
    digits = digits.slice(dial.replace(/\s/g, '').length)
  } else if (digits.startsWith('+')) {
    // keep the +NN as-is (user typed international form)
    const plus = digits.indexOf('+')
    const rest = digits.slice(plus + 1).replace(/\D/g, '')
    return '+' + rest
  }
  digits = digits.replace(/\D/g, '').slice(0, 11)
  if (!digits) return dial ? dial + ' ' : ''
  return dial ? `${dial} ${digits}` : digits
}

// ponytail: flatten TanStack Form's errors (array OR object of {path: {message}})
// into a {path, message} list. Typed `unknown` so the narrowing checks stay
// meaningful to the linter (a concrete type would flag them as redundant).
export function collectFormErrors(
  errors: unknown,
): { path: string; message: string }[] {
  const flat: Record<string, unknown> = {}
  if (Array.isArray(errors)) {
    for (const e of errors) {
      if (e && typeof e === 'object') Object.assign(flat, e)
    }
  } else if (errors && typeof errors === 'object') {
    Object.assign(flat, errors)
  }
  const out: { path: string; message: string }[] = []
  for (const [path, raw] of Object.entries(flat)) {
    const message =
      typeof raw === 'object' && raw !== null && 'message' in raw
        ? String((raw as { message?: unknown }).message)
        : typeof raw === 'string'
          ? raw
          : 'Inválido'
    out.push({ path, message })
  }
  return out
}

export function SectionHeader({ children }: { children: ReactNode }) {
  return (
    <h2 className="mt-4 border-b border-[var(--medi-border)] pb-1 text-sm font-semibold uppercase tracking-wide text-[var(--medi-text-secondary)]">
      {children}
    </h2>
  )
}

export function FieldShell({
  label,
  errors,
  children,
}: {
  label: string
  errors: unknown[]
  children: ReactNode
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-sm font-medium text-[var(--medi-text-primary)]">
        {label}
      </span>
      {children}
      {errors.length > 0 && (
        <span className="text-sm text-red-600">
          {(errors[0] as { message?: string }).message ?? 'Inválido'}
        </span>
      )}
    </label>
  )
}
