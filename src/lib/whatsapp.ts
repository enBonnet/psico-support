// ponytail: single source of truth for the WhatsApp deep-link the platform
// uses to connect help-seekers with professionals. Both the message copy AND
// the URL shape (wa.me/<digits>?text=<encoded>) live here so the four contact
// entry points — landing CTA, directory "Contactar al azar", directory card,
// and the per-pro profile — can never drift apart.
//
// Ceiling: this is a string template, not i18n. The app is Spanish-only by
// design (see AGENTS.md); if a second language is added, lift the copy into a
// message catalog and parameterize here.

/**
 * Build the pre-filled WhatsApp message for a help-seeker's first contact.
 *
 * Tone: cordial but urgent. The user reached this point from a distress entry
 * ("Necesito ayuda ahora"), so the message signals real urgency ("necesito
 * hablar con alguien ahora mismo") without being dramatic, names the source so
 * the professional trusts the lead, addresses them by name (warmth + cuts the
 * cold-outreach feel), and closes with a concrete low-friction yes/no so the
 * reply is one tap.
 *
 * The name is used verbatim — the directory stores the professional's full
 * display name, and over-claiming a title (Lic./Dra.) that isn't stored would
 * be worse than none.
 */
export function whatsappMessage(proName: string): string {
  return `Hola ${proName}, te escribo desde PsicoAyudas. Necesito hablar con alguien ahora mismo. ¿Tienes un momento para conversar?`
}

/**
 * Build a `https://wa.me/...` deep-link with the pre-filled message.
 *
 * `whatsapp` is the stored column value (e.g. "+58 412 1234567"); wa.me wants
 * digits only (no +, no spaces), so non-digits are stripped. Empty/invalid
 * input returns `null` so callers can choose to hide the link rather than emit
 * a broken `wa.me/` href.
 */
export function whatsappHref(whatsapp: string, proName: string): string | null {
  const digits = whatsapp.replace(/\D/g, '')
  if (!digits) return null
  return `https://wa.me/${digits}?text=${encodeURIComponent(whatsappMessage(proName))}`
}
