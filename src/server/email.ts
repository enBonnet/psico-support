import { createEvent as buildIcs } from 'ics'

import { getCloudflareEnv } from '#/db'
import type { CloudflareEnv } from '#/db'
import { SITE_NAME } from '#/lib/seo'
// ponytail: resolveSiteUrl (server-only) so email action links + logo match
// the host the triggering request landed on (psicoayudaven.com OR
// psicoayudas.com). Cookie/session scope is per-domain, so a cancel/reset
// link must NOT cross domains or the user lands logged-out. The SENDER
// address (FROM_ADDRESS below) intentionally stays on psicoayudaven.com —
// only that domain is onboarded as a verified Mailgun sender.
import { resolveSiteUrl } from '#/lib/seo-server'

// ponytail: transactional mail goes through Mailgun's REST API (v3 messages
// endpoint) instead of a Cloudflare binding. Why: the old `send_email`
// binding with `remote: true` forced `wrangler dev` to open a remote proxy
// session, which required Cloudflare auth + a workers.dev subdomain — nobody
// could run the app locally without account access. Mailgun is a plain HTTPS
// API, so local dev works with zero Cloudflare dependency. Credentials come
// from env vars (MAILGUN_*), set in .env.local for dev and via
// `wrangler secret put` for prod.
// Ceiling: if volume grows, switch to Mailgun's batch API or a queue.
//
// ponytail: region selection — Mailgun runs US (api.mailgun.net) and EU
// (api.eu.mailgun.net) API bases. MAILGUN_REGION ('us' | 'eu', default 'us')
// picks the base; the endpoint is always /v3/{domain}/messages. The domain
// itself must live in the matching region (a US-domain on the EU base 404s).
const MAILGUN_API_BASE = 'https://api.mailgun.net/v3'
const MAILGUN_EU_API_BASE = 'https://api.eu.mailgun.net/v3'

// ponytail: from-address comes from MAILGUN_FROM_EMAIL (env) with a constant
// fallback — better-auth sendResetPassword and any future transactional mail
// all share it. The local part is arbitrary once the domain is verified
// (SPF/DKIM DNS records on mg.psicoayudaven.com). Kept on psicoayudaven.com
// even when the request came through psicoayudas.com: only psicoayudaven.com
// is verified as a Mailgun sender, so Mailgun would reject any other From.
const FROM_ADDRESS = 'noreply@mg.psicoayudaven.com'
const FROM_NAME = 'PsicoAyudas'

// ponytail: single source of truth for the sender address — sendEmail() uses
// it for the From field and buildIcsAttachment() for organizer.email, so a
// configured MAILGUN_FROM_EMAIL (or the fallback) is always consistent across
// the email and its calendar invite.
function resolveFromAddress(env: CloudflareEnv | null): string {
  return env?.MAILGUN_FROM_EMAIL ?? FROM_ADDRESS
}

// Mirrors Medicall tokens in src/styles.css — inline only (no CSS vars in mail).
// ponytail: logoUrl is intentionally NOT here — it's per-request (resolved in
// emailLayout from the inbound host) so the logo image URL matches the domain
// the email links back to.
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
} as const

type SendEmailInput = {
  to: string
  subject: string
  html: string
  text: string
  // ponytail: optional calendar/extra attachments. Mailgun accepts one
  // `attachment` form field per file (filename + content). Kept optional so
  // existing callers (password reset) are unchanged.
  attachments?: EmailAttachment[]
}

// ponytail: Mailgun attachment shape — filename + MIME type + content. The
// content is a string (the .ics builder produces one); Mailgun's multipart
// form-data accepts it directly. This replaced the Cloudflare-binding
// EmailAttachment type (which had disposition/contentId fields Mailgun
// doesn't use).
export type EmailAttachment = {
  filename: string
  type: string
  content: string
}

type EmailLayoutInput = {
  title: string
  /** HTML fragment — already trusted server copy, not user input. */
  body: string
}

// Thin wrapper over the Mailgun REST API. Both html + text are required: some
// clients render text only and it improves spam scoring. Always awaited inline
// (better-auth has no backgroundTasks.handler configured, so its
// runInBackgroundOrAwait falls back to `await`), which keeps sends reliable at
// the cost of a little request latency — acceptable for low-volume
// transactional mail. No retry/backoff here; Mailgun queues on its side.
// Ceiling: if volume grows or latency matters, configure
// `advanced.backgroundTasks.handler` (ctx.waitUntil) in auth.ts.
export async function sendEmail({
  to,
  subject,
  html,
  text,
  attachments,
}: SendEmailInput) {
  const env = getCloudflareEnv()
  const apiKey = env?.MAILGUN_SENDING_KEY ?? env?.MAILGUN_API_KEY
  const domain = env?.MAILGUN_DOMAIN
  if (!apiKey || !domain) {
    throw new Error(
      'Mailgun credentials (MAILGUN_SENDING_KEY/MAILGUN_API_KEY + MAILGUN_DOMAIN) not available. Set them in .env.local for dev or as wrangler secrets for prod.',
    )
  }
  const fromAddress = resolveFromAddress(env)
  const apiBase =
    env.MAILGUN_REGION === 'eu' ? MAILGUN_EU_API_BASE : MAILGUN_API_BASE

  const form = new FormData()
  form.set('from', `${FROM_NAME} <${fromAddress}>`)
  form.set('to', to)
  form.set('subject', subject)
  form.set('html', html)
  form.set('text', text)
  for (const attachment of attachments ?? []) {
    form.append(
      'attachment',
      new File([attachment.content], attachment.filename, {
        type: attachment.type,
      }),
    )
  }

  const response = await fetch(`${apiBase}/${domain}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${btoa(`api:${apiKey}`)}`,
    },
    body: form,
  })
  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new Error(
      `Mailgun send failed (${response.status}): ${body.slice(0, 500)}`,
    )
  }
  // ponytail: settle the success body before returning. Workers won't reuse
  // the outbound connection while a response body is left unread, which
  // stalls subsequent sends; the payload is tiny, so just read it. Fire-and-
  // forget callers never see this — sendEmail keeps its await/throw shape.
  await response.text().catch(() => '')
}

function escapeAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

// Shared Medicall-branded shell: soft blue page bg, logo header, glass-like
// white card, gradient section underline. Logo + footer link resolve to the
// inbound request's host (psicoayudaven.com / psicoayudas.com) via
// resolveSiteUrl, so an email triggered from psicoayudas.com links back to
// psicoayudas.com — keeping the user within their session-cookie domain.
// Exported so the meeting-confirmation/cancellation emails (and any future
// transactional mail) compose the same branded shell.
export function emailLayout({ title, body }: EmailLayoutInput): string {
  const origin = resolveSiteUrl()
  const logoUrl = `${origin}/logo512.png`
  // ponytail: footer link text shows the host (without scheme) so the visible
  // label matches where the link goes — never "psicoayudaven.com" pointing at
  // psicoayudas.com or vice versa.
  const footerHost = origin.replace(/^https?:\/\//, '')
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
              <img src="${logoUrl}" width="72" height="72" alt="${escapeAttr(SITE_NAME)}" style="display:block;width:72px;height:72px;border:0;border-radius:16px">
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
              ${escapeAttr(SITE_NAME)} · <a href="${origin}" style="color:${EMAIL.secondary};text-decoration:none">${escapeAttr(footerHost)}</a>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

export function emailPrimaryButton(href: string, label: string): string {
  const safeHref = escapeAttr(href)
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:28px auto">
    <tr>
      <td align="center" style="border-radius:12px;background:linear-gradient(180deg,#1a3088 0%,${EMAIL.primary} 100%);border:1px solid rgba(17,42,141,0.35)">
        <a href="${safeHref}" style="display:inline-block;padding:14px 28px;font-size:16px;font-weight:600;line-height:1.2;color:${EMAIL.white};text-decoration:none;border-radius:12px">${escapeAttr(label)}</a>
      </td>
    </tr>
  </table>`
}

export function emailSoftNote(html: string): string {
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

// ── Scheduled video-call appointment emails (1.25.0) ─────────────────────────
// ponytail: shared shape for the confirmation + cancellation emails. `whoFor`
// is the recipient's perspective ('client' | 'professional') so the copy can
// address them correctly while naming the other party. Times are pre-formatted
// strings in the recipient's tz (the caller computes them via Intl.DateTimeFormat)
// so the email body itself stays tz-agnostic.

export type MeetingEmailInput = {
  whoFor: 'client' | 'professional'
  // The other party's display name (escaped before interpolation).
  counterpartName: string
  // Pre-formatted date+time in the recipient's tz, e.g. "lunes 28 de julio, 3:00 PM".
  whenLabel: string
  // Recipient's IANA tz label for display, e.g. "Hora de Caracas".
  tzLabel: string
  meetingUrl: string
  cancelUrl: string
}

function meetingDetailsList(input: MeetingEmailInput): string {
  const who = input.whoFor === 'client' ? 'Profesional' : 'Persona que te contacta'
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 8px;font-size:15px;line-height:1.7;color:${EMAIL.text}">
      <tr><td style="color:${EMAIL.textMuted};width:140px;vertical-align:top">${who}:</td><td>${escapeHtml(input.counterpartName)}</td></tr>
      <tr><td style="color:${EMAIL.textMuted};vertical-align:top">Fecha y hora:</td><td><strong style="color:${EMAIL.text}">${escapeHtml(input.whenLabel)}</strong><br><span style="font-size:13px;color:${EMAIL.textMuted}">${escapeHtml(input.tzLabel)}</span></td></tr>
    </table>`
}

export function meetingConfirmationHtml(input: MeetingEmailInput): string {
  const intro =
    input.whoFor === 'client'
      ? 'Tu videollamada de apoyo psicológico está agendada. Te esperamos en el enlace a la hora acordada.'
      : 'Tienes una nueva videollamada agendada en PsicoAyudas. Revisa los datos abajo.'
  const body = `
    <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:${EMAIL.textMuted}">${intro}</p>
    ${meetingDetailsList(input)}
    ${emailPrimaryButton(input.meetingUrl, 'Unirse a la videollamada')}
    <p style="margin:0;font-size:13px;line-height:1.55;color:${EMAIL.textMuted};word-break:break-all">
      Si el botón no funciona, copia y abre este enlace:<br>
      <a href="${escapeAttr(input.meetingUrl)}" style="color:${EMAIL.secondary};text-decoration:underline">${escapeAttr(input.meetingUrl)}</a>
    </p>
    ${emailSoftNote(
      'Adjuntamos un archivo de calendario (<strong>.ics</strong>) para que agregues la cita a tu calendario con un clic. ' +
        'Si necesitas cancelar, puedes hacerlo desde la app o con este enlace: ' +
        `<a href="${escapeAttr(input.cancelUrl)}" style="color:${EMAIL.secondary};text-decoration:underline">cancelar cita</a>.`,
    )}`

  return emailLayout({ title: 'Videollamada agendada', body })
}

export function meetingCancellationHtml(input: {
  whoFor: 'client' | 'professional'
  counterpartName: string
  whenLabel: string
  tzLabel: string
  reason?: string | null
  bookAgainUrl?: string
}): string {
  const intro =
    input.whoFor === 'client'
      ? `La videollamada con ${input.counterpartName} fue cancelada.`
      : `Una videollamada agendada contigo fue cancelada por la persona que la solicitó.`
  const reasonBlock = input.reason?.trim()
    ? `<p style="margin:12px 0 0;font-size:14px;line-height:1.55;color:${EMAIL.textMuted}"><strong style="color:${EMAIL.text}">Motivo:</strong> ${escapeHtml(input.reason.trim())}</p>`
    : ''
  const againBlock = input.bookAgainUrl
    ? `<p style="margin:16px 0 0;font-size:14px;line-height:1.55;color:${EMAIL.textMuted}">¿Quieres reagendar? <a href="${escapeAttr(input.bookAgainUrl)}" style="color:${EMAIL.secondary};text-decoration:underline">Agendar otra hora</a>.</p>`
    : ''
  const body = `
    <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:${EMAIL.textMuted}">${escapeHtml(intro)}</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 8px;font-size:15px;line-height:1.7;color:${EMAIL.text}">
      <tr><td style="color:${EMAIL.textMuted};width:140px;vertical-align:top">Fecha y hora:</td><td>${escapeHtml(input.whenLabel)}<br><span style="font-size:13px;color:${EMAIL.textMuted}">${escapeHtml(input.tzLabel)}</span></td></tr>
    </table>
    ${reasonBlock}
    ${againBlock}
    ${emailSoftNote('No es necesario que hagas nada más. La cita ya no está activa.')}`

  return emailLayout({ title: 'Videollamada cancelada', body })
}

// ponytail: builds an RFC-5545 .ics attachment for the confirmation email using
// the `ics` npm package. UID is stable per appointment id so re-importing
// updates the same calendar entry instead of duplicating. The METHOD:REQUEST +
// STATUS:CONFIRMED pair is what makes most clients (Google/Apple/Outlook) treat
// it as an invite. Returns the Mailgun attachment shape, OR null if
// serialization fails — callers should send the email WITHOUT the attachment
// in that case (the email itself must never fail just because the calendar
// blob couldn't be built).
export type IcsInput = {
  appointmentId: number | string
  title: string
  description: string
  startAt: Date
  endAt: Date
  meetingUrl: string
  // organizerName + attendeeName + attendeeEmail make the invite carry both
  // parties so calendar apps show "with Dr. X" context.
  organizerName: string
  attendeeName: string
  attendeeEmail: string
}

export function buildIcsAttachment(input: IcsInput): EmailAttachment | null {
  // ponytail: `ics` expects DateArray tuples (not number[]); build them as
  // const tuples so the type checks. CalType values are string-literal unions.
  const start: [
    number, number, number, number, number,
  ] = [
    input.startAt.getUTCFullYear(),
    input.startAt.getUTCMonth() + 1,
    input.startAt.getUTCDate(),
    input.startAt.getUTCHours(),
    input.startAt.getUTCMinutes(),
  ]
  const end: [
    number, number, number, number, number,
  ] = [
    input.endAt.getUTCFullYear(),
    input.endAt.getUTCMonth() + 1,
    input.endAt.getUTCDate(),
    input.endAt.getUTCHours(),
    input.endAt.getUTCMinutes(),
  ]
  const result = buildIcs({
    title: input.title,
    description: input.description,
    location: input.meetingUrl,
    url: input.meetingUrl,
    start,
    startInputType: 'utc',
    end,
    endInputType: 'utc',
    uid: `appointment-${input.appointmentId}@psicoayudaven.com`,
    method: 'REQUEST',
    status: 'CONFIRMED',
    organizer: {
      name: input.organizerName,
      email: resolveFromAddress(getCloudflareEnv()),
    },
    attendees: [
      {
        name: input.attendeeName,
        email: input.attendeeEmail,
        rsvp: true,
        partstat: 'NEEDS-ACTION',
        role: 'REQ-PARTICIPANT',
      },
    ],
  })
  if (result.error || !result.value) {
    // ponytail: defensive — return null instead of throwing so a caller that
    // builds the attachment inside its sendEmail try block still sends the
    // email (without the .ics) rather than suppressing it entirely. Logged
    // upstream via the caller's Sentry capture.
    return null
  }
  // ponytail: the `ics` lib returns a string; wrap as a Mailgun attachment
  // (the API accepts raw string content in multipart form-data).
  return {
    filename: 'cita-psicoayudaven.ics',
    type: 'text/calendar; charset=utf-8; method=REQUEST',
    content: result.value,
  }
}
