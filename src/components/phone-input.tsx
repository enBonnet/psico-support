// ponytail: shared phone (WhatsApp-style) input — country <select> + tel input
// with formatWhatsapp. Used by all four phone-bearing forms: the pro
// registration routes (registro/completar), the profile edit (perfil), and the
// follow-up form (seguimiento). Plain controlled props (no TanStack Form
// generics — same escape CertificateInput / TagSelect use) so it composes
// inside any form. When the country changes, the existing phone is re-formatted
// with the new dial code via onPhoneChange(formatWhatsapp(phone, country)) —
// this mirrors the hand-rolled setFieldValue('whatsapp', …) the registration
// routes used to inline.

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
  phoneRequired = false,
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
  // ponytail: the phone (whatsapp) field is required in the registration
  // schemas but the country is optional — callers pass phoneRequired so the
  // asterisk lands on the right label.
  phoneRequired?: boolean
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
        required={phoneRequired}
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
