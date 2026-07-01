import { getEmailBinding } from '#/db'

// ponytail: from-address is a constant — better-auth sendResetPassword and any
// future transactional mail all share it. The local part is arbitrary once the
// domain is onboarded (see wrangler.jsonc send_email ponytail for the one-time
// `wrangler email sending enable` step + DNS records). Swap for env only if a
// staging domain needs a different sender.
const FROM_ADDRESS = 'noreply@psicoayudaven.com'
const FROM_NAME = 'PsicoAyudaVen'

type SendEmailInput = {
  to: string
  subject: string
  html: string
  text: string
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

// Minimal inline HTML for the password-reset email. Plain, dark-on-white,
// no external assets (email clients block remote images/CSS anyway). The link
// is the full `${baseURL}/reset-password/:token?callbackURL=...` from
// better-auth — clicking it hits the GET endpoint that 302s to /recuperar with
// ?token=. Keep both the button and the fallback raw link: some clients strip
// <a> styling or block button-shaped links.
export function resetPasswordHtml(url: string): string {
  const escaped = url.replace(/&/g, '&amp;').replace(/</g, '&lt;')
  return `<!doctype html>
<html lang="es"><body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#18181b">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:24px 0">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:12px;padding:32px 24px">
        <tr><td>
          <h1 style="margin:0 0 8px;font-size:20px;font-weight:700;color:#18181b">Restablece tu contraseña</h1>
          <p style="margin:0 0 16px;font-size:15px;line-height:1.5;color:#52525b">
            Recibimos una solicitud para cambiar la contraseña de tu cuenta en PsicoAyudaVen.
            El enlace es válido por 30 minutos.
          </p>
          <p style="margin:24px 0;text-align:center">
            <a href="${escaped}" style="display:inline-block;background:#0f172a;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 24px;border-radius:8px">Restablecer contraseña</a>
          </p>
          <p style="margin:16px 0 0;font-size:13px;line-height:1.5;color:#71717a;word-break:break-all">
            Si el botón no funciona, abre este enlace:<br>
            <a href="${escaped}" style="color:#0f172a">${escaped}</a>
          </p>
          <p style="margin:24px 0 0;font-size:13px;line-height:1.5;color:#71717a">
            Si no pediste este cambio, puedes ignorar este correo: tu contraseña no cambiará.
          </p>
        </td></tr>
      </table>
      <p style="margin:16px 0 0;font-size:12px;color:#a1a1aa">PsicoAyudaVen · psicoayudaven.com</p>
    </td></tr>
  </table>
</body></html>`
}
