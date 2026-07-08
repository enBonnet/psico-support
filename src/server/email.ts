import { getEmailBinding } from '#/db'
import { SITE_NAME, SITE_URL } from '#/lib/seo'

// ponytail: from-address is a constant — better-auth sendResetPassword and any
// future transactional mail all share it. The local part is arbitrary once the
// domain is onboarded (see wrangler.jsonc send_email ponytail for the one-time
// `wrangler email sending enable` step + DNS records). Swap for env only if a
// staging domain needs a different sender.
const FROM_ADDRESS = 'noreply@psicoayudaven.com'
const FROM_NAME = 'PsicoAyudaVen'

// Mirrors Medicall tokens in src/styles.css — inline only (no CSS vars in mail).
const EMAIL = {
  primary: '#112a8d',
  secondary: '#199bee',
  bg: '#eff7fe',
  text: '#252525',
  textMuted: '#606060',
  line: '#ececec',
  white: '#ffffff',
  cardSoft: '#f7fbff',
  font:
    "'Open Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
  logoUrl: `${SITE_URL}/logo512.png`,
} as const

type SendEmailInput = {
  to: string
  subject: string
  html: string
  text: string
}

type EmailLayoutInput = {
  title: string
  /** HTML fragment — already trusted server copy, not user input. */
  body: string
}

// Thin wrapper over the Cloudflare Email Service binding. Both html + text are
// required: some clients render text only and it improves spam scoring. Always
// awaited inline (better-auth has no backgroundTasks.handler configured, so its
// runInBackgroundOrAwait falls back to `await`), which keeps sends reliable at
// the cost of a little request latency — acceptable for low-volume
// transactional mail. No retry/backoff here; the binding queues on its side.
// Ceiling: if volume grows or latency matters, configure
// `advanced.backgroundTasks.handler` (ctx.waitUntil) in auth.ts.
export async function sendEmail({ to, subject, html, text }: SendEmailInput) {
  const email = getEmailBinding()
  await email.send({
    from: { email: FROM_ADDRESS, name: FROM_NAME },
    to,
    subject,
    html,
    text,
  })
}

function escapeAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
}

// Shared Medicall-branded shell: soft blue page bg, logo header, glass-like
// white card, gradient section underline. Remote logo is intentional — emails
// always target real users on the prod domain; SITE_URL matches seo.ts / OG.
function emailLayout({ title, body }: EmailLayoutInput): string {
  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
  <link href="https://fonts.googleapis.com/css2?family=Open+Sans:wght@400;600;700&display=swap" rel="stylesheet">
  <title>${escapeAttr(title)}</title>
</head>
<body style="margin:0;padding:0;background:${EMAIL.bg};font-family:${EMAIL.font};color:${EMAIL.text};-webkit-text-size-adjust:100%;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${EMAIL.bg};padding:32px 16px">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px">
          <tr>
            <td align="center" style="padding:0 0 20px">
              <img src="${EMAIL.logoUrl}" width="72" height="72" alt="${escapeAttr(SITE_NAME)}" style="display:block;width:72px;height:72px;border:0;border-radius:16px">
            </td>
          </tr>
          <tr>
            <td style="background:${EMAIL.white};border:1px solid rgba(17,42,141,0.12);border-radius:16px;padding:32px 28px;box-shadow:0 12px 32px rgba(17,42,141,0.12)">
              <p style="margin:0 0 8px;font-size:13px;font-weight:700;color:${EMAIL.primary};letter-spacing:0.01em">${escapeAttr(SITE_NAME)}</p>
              <h1 style="margin:0 0 12px;font-size:22px;line-height:1.35;font-weight:700;color:${EMAIL.primary}">${escapeAttr(title)}</h1>
              <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 24px">
                <tr>
                  <td style="height:6px;width:100px;border-radius:999px;background:linear-gradient(90deg,${EMAIL.secondary} 0%,#349bef 27%,#76b9f0 55%,#8fc5f1 80%,#b0d6f5 100%)">&nbsp;</td>
                </tr>
              </table>
              ${body}
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:20px 8px 0;font-size:13px;line-height:1.5;color:${EMAIL.textMuted}">
              ${escapeAttr(SITE_NAME)} · <a href="${SITE_URL}" style="color:${EMAIL.secondary};text-decoration:none">psicoayudaven.com</a>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

function emailPrimaryButton(href: string, label: string): string {
  const safeHref = escapeAttr(href)
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:28px auto">
    <tr>
      <td align="center" style="border-radius:12px;background:linear-gradient(180deg,#1a3088 0%,${EMAIL.primary} 100%);border:1px solid rgba(17,42,141,0.35)">
        <a href="${safeHref}" style="display:inline-block;padding:14px 28px;font-size:16px;font-weight:600;line-height:1.2;color:${EMAIL.white};text-decoration:none;border-radius:12px">${escapeAttr(label)}</a>
      </td>
    </tr>
  </table>`
}

function emailSoftNote(html: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0 0">
    <tr>
      <td style="background:${EMAIL.cardSoft};border:1px solid rgba(17,42,141,0.12);border-radius:12px;padding:14px 16px;font-size:14px;line-height:1.55;color:${EMAIL.textMuted}">
        ${html}
      </td>
    </tr>
  </table>`
}

// Password-reset email. The link is the full
// `${baseURL}/reset-password/:token?callbackURL=...` from better-auth — clicking
// it hits the GET endpoint that 302s to /recuperar with ?token=. Keep both the
// button and the fallback raw link: some clients strip <a> styling or block
// button-shaped links.
export function resetPasswordHtml(url: string): string {
  const safeUrl = escapeAttr(url)
  const body = `
    <p style="margin:0;font-size:15px;line-height:1.6;color:${EMAIL.textMuted}">
      Recibimos una solicitud para cambiar la contraseña de tu cuenta.
      El enlace es válido por <strong style="color:${EMAIL.text}">30 minutos</strong>.
    </p>
    ${emailPrimaryButton(url, 'Restablecer contraseña')}
    <p style="margin:0;font-size:13px;line-height:1.55;color:${EMAIL.textMuted};word-break:break-all">
      Si el botón no funciona, copia y abre este enlace:<br>
      <a href="${safeUrl}" style="color:${EMAIL.secondary};text-decoration:underline">${safeUrl}</a>
    </p>
    ${emailSoftNote('Si no pediste este cambio, puedes ignorar este correo: tu contraseña no cambiará.')}`

  return emailLayout({ title: 'Restablece tu contraseña', body })
}
