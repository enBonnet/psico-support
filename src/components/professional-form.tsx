import { useEffect, useRef, useState } from 'react'
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

// ponytail: optional título / certificado de egreso upload. Plain value +
// onChange props (no TanStack Form generics) so it can be shared by both
// registration routes without the `any` escape the form-consuming components
// would need. base64 transport matches certificateSchema in the server fn.
export const CERTIFICATE_ACCEPT = '.pdf,image/jpeg,image/png,image/webp'
export const CERTIFICATE_MAX_BYTES = 5 * 1024 * 1024
const CERT_ALLOWED = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
])

export type CertificateValue = { data: string; type: string }

export function readFileAsCertificate(file: File): Promise<CertificateValue> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('No se pudo leer el archivo.'))
    reader.onload = () => {
      const result = String(reader.result ?? '')
      const comma = result.indexOf(',')
      // ponytail: strip the "data:<mime>;base64," prefix; server gets raw b64.
      const data = comma >= 0 ? result.slice(comma + 1) : result
      resolve({ data, type: file.type })
    }
    reader.readAsDataURL(file)
  })
}

export function CertificateInput({
  value,
  onChange,
}: {
  value: CertificateValue | null
  onChange: (v: CertificateValue | null) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [fileName, setFileName] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  // ponytail: object URL for the just-selected file, used to render a live
  // preview. Prefer this over a data: URL rebuilt from value.data — object
  // URLs navigate/embed reliably in <img>/<object>/<a target=_blank> across
  // browsers, whereas Chrome blocks top-level navigation to data: URLs (a PDF
  // "Abrir" link built from a data URL would download instead of open). The
  // base64 in `value` still drives the transport to the server; the object URL
  // is a view-only side-state. Revoked on clear + unmount to avoid leaks.
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl)
    }
  }, [previewUrl])

  async function handleFile(file: File | undefined) {
    if (!file) return
    if (!CERT_ALLOWED.has(file.type)) {
      setError('Solo PDF, JPG, PNG o WEBP.')
      return
    }
    if (file.size > CERTIFICATE_MAX_BYTES) {
      setError('El archivo supera los 5 MB.')
      return
    }
    try {
      const next = URL.createObjectURL(file)
      if (previewUrl) URL.revokeObjectURL(previewUrl)
      setPreviewUrl(next)
      onChange(await readFileAsCertificate(file))
      setFileName(file.name)
      setError(null)
    } catch {
      setError('No se pudo leer el archivo.')
    }
  }

  function clear() {
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setPreviewUrl(null)
    onChange(null)
    setFileName(null)
    setError(null)
    if (inputRef.current) inputRef.current.value = ''
  }

  return (
    <div className="flex flex-col gap-1">
      {value ? (
        <>
          <div className="glass-input flex h-12 items-center justify-between gap-2 px-3">
            <span className="truncate text-sm text-[var(--medi-text-primary)]">
              ✓ {fileName ?? 'Certificado adjuntado'}
            </span>
            <button
              type="button"
              onClick={clear}
              className="shrink-0 text-sm font-medium text-[var(--medi-secondary)]"
            >
              Quitar
            </button>
          </div>
          {previewUrl && <CertificatePreview url={previewUrl} type={value.type} />}
        </>
      ) : (
        <input
          ref={inputRef}
          type="file"
          accept={CERTIFICATE_ACCEPT}
          onChange={(e) => handleFile(e.target.files?.[0])}
          className="glass-input h-12 w-full px-2 text-sm text-[var(--medi-text-secondary)]"
        />
      )}
      {error && <span className="text-sm text-red-600">{error}</span>}
      <span className="text-xs text-[var(--medi-text-secondary)]">
        PDF o imagen (JPG, PNG, WEBP). Máx. 5 MB. Acelera la verificación de tu
        perfil.
      </span>
    </div>
  )
}

// ponytail: live preview of the selected cert before submit. Images render
// natively via <img>; PDFs via <object> with an "Abrir" <a> fallback for
// browsers (esp. mobile) that can't embed PDF inline. Capped heights keep the
// form scrollable on small screens.
export function CertificatePreview({
  url,
  type,
}: {
  url: string
  type: string
}) {
  const isImage = type.startsWith('image/')
  if (isImage) {
    return (
      <div className="overflow-hidden rounded-[var(--glass-radius-sm)] border border-[var(--medi-border)] bg-white/50">
        <img
          src={url}
          alt="Vista previa del certificado"
          className="mx-auto max-h-64 w-auto object-contain"
        />
      </div>
    )
  }
  return (
    <div className="overflow-hidden rounded-[var(--glass-radius-sm)] border border-[var(--medi-border)] bg-white/50">
      <object
        data={url}
        type={type}
        className="h-64 w-full"
        aria-label="Vista previa del documento"
      >
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="block p-4 text-center text-sm font-semibold text-[var(--medi-secondary)] hover:underline"
        >
          Abrir documento
        </a>
      </object>
    </div>
  )
}

// ── Additional support documents (repeatable) ───────────────────────────────
// ponytail: mirrors CertificateInput but manages an array. Same PDF/image mimes
// + 5MB cap (duplicated locally — CertificateInput does the same; the server
// re-validates). name is the original File.name so the panel/admin list shows a
// readable label. value is the transport shape; the object URLs are a view-only
// side-state kept in a parallel array (indices align because these forms only
// mutate the array through this component).
export const SUPPORT_DOC_MAX = 6

export type SupportDocValue = CertificateValue & { name: string }

export function SupportDocsInput({
  value,
  onChange,
}: {
  value: SupportDocValue[]
  onChange: (v: SupportDocValue[]) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [previews, setPreviews] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)

  // ponytail: revoke every object URL on unmount to avoid leaks.
  useEffect(() => {
    return () => {
      for (const p of previews) URL.revokeObjectURL(p)
    }
    // ponytail: deps intentionally empty — revoke only on real unmount.
  }, [])

  async function handleFile(file: File | undefined) {
    if (!file) return
    if (!CERT_ALLOWED.has(file.type)) {
      setError('Solo PDF, JPG, PNG o WEBP.')
      return
    }
    if (file.size > CERTIFICATE_MAX_BYTES) {
      setError('El archivo supera los 5 MB.')
      return
    }
    if (value.length >= SUPPORT_DOC_MAX) {
      setError(`Máximo ${SUPPORT_DOC_MAX} documentos.`)
      return
    }
    try {
      const cert = await readFileAsCertificate(file)
      const nextUrl = URL.createObjectURL(file)
      onChange([...value, { ...cert, name: file.name }])
      setPreviews((p) => [...p, nextUrl])
      setError(null)
      if (inputRef.current) inputRef.current.value = ''
    } catch {
      setError('No se pudo leer el archivo.')
    }
  }

  function removeAt(i: number) {
    const next = value.filter((_, idx) => idx !== i)
    setPreviews((prev) => {
      const url = prev[i]
      if (url) URL.revokeObjectURL(url)
      return prev.filter((_, idx) => idx !== i)
    })
    onChange(next)
  }

  return (
    <div className="flex flex-col gap-2">
      {value.length > 0 && (
        <ul className="flex flex-col gap-3">
          {value.map((doc, i) => {
            const url = previews[i]
            return (
              <li key={`${doc.name}-${i}`} className="flex flex-col gap-1">
                <div className="glass-input flex h-12 items-center justify-between gap-2 px-3">
                  <span className="truncate text-sm text-[var(--medi-text-primary)]">
                    ✓ {doc.name}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeAt(i)}
                    className="shrink-0 text-sm font-medium text-[var(--medi-secondary)]"
                  >
                    Quitar
                  </button>
                </div>
                {url && <CertificatePreview url={url} type={doc.type} />}
              </li>
            )
          })}
        </ul>
      )}

      {value.length < SUPPORT_DOC_MAX && (
        <input
          ref={inputRef}
          type="file"
          accept={CERTIFICATE_ACCEPT}
          onChange={(e) => handleFile(e.target.files?.[0])}
          className="glass-input h-12 w-full px-2 text-sm text-[var(--medi-text-secondary)]"
        />
      )}

      {error && <span className="text-sm text-red-600">{error}</span>}
      <span className="text-xs text-[var(--medi-text-secondary)]">
        Documentos adicionales (certificados, credenciales, especializaciones).
        PDF o imagen (JPG, PNG, WEBP). Máx. 5 MB cada uno, hasta{' '}
        {SUPPORT_DOC_MAX} archivos. Acelera la verificación de tu perfil.
      </span>
    </div>
  )
}
