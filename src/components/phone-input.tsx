// ponytail: shared phone (WhatsApp-style) input — country <select> + tel input
// with formatWhatsapp. Extracted from the inline copy in completar.tsx/registro
// so the follow-up form (and any future surface) reuses it. Plain controlled
// props (no TanStack Form generics — same escape CertificateInput uses) so it
// composes inside any form. The two registration routes keep their inline copy
// for now (separate optional refactor) to keep this change small.

import { PAIS_OPTIONS } from '#/server/locations'
import {
  DIAL_CODE,
  FieldShell,
  formatWhatsapp,
  inputCls,
} from '#/components/professional-form'

export function PhoneInput({
  country,
  phone,
  onCountryChange,
  onPhoneChange,
  countryError,
  phoneError,
  countryLabel = 'País del teléfono',
  phoneLabel = 'Teléfono / WhatsApp',
  disabled = false,
}: {
  country: string
  phone: string
  onCountryChange: (c: string) => void
  onPhoneChange: (p: string) => void
  countryError?: string
  phoneError?: string
  countryLabel?: string
  phoneLabel?: string
  disabled?: boolean
}) {
  return (
    <>
      <FieldShell
        label={countryLabel}
        errors={countryError ? [{ message: countryError }] : []}
      >
        <select
          className={inputCls}
          value={country}
          disabled={disabled}
          onChange={(e) => {
            onCountryChange(e.target.value)
            // ponytail: re-format the existing phone with the new dial code so
            // the displayed number stays consistent with the selected country.
            onPhoneChange(formatWhatsapp(phone, e.target.value))
          }}
        >
          <option value="" disabled>
            Selecciona…
          </option>
          {PAIS_OPTIONS.map((c) => (
            <option key={c} value={c}>
              {c} ({DIAL_CODE[c] ?? '+'})
            </option>
          ))}
        </select>
      </FieldShell>

      <FieldShell
        label={phoneLabel}
        errors={phoneError ? [{ message: phoneError }] : []}
      >
        <input
          type="tel"
          inputMode="tel"
          autoCapitalize="none"
          className={inputCls}
          value={phone}
          disabled={disabled}
          onChange={(e) =>
            onPhoneChange(formatWhatsapp(e.target.value, country))
          }
        />
      </FieldShell>
    </>
  )
}
