# Professional communications log

Outbound messages sent to the verified psychologists on the platform
(intended for WhatsApp / broadcast). Keep one entry per send, newest first.

**Why this file exists:** the same professionals hear from us repeatedly
(release notes, support-group invites, incidents). Re-reading past messages
keeps tone consistent, avoids repeating the same framing word-for-word, and
gives the next agent (or human) the full history of what these people have
already been told — so we never re-announce a shipped feature as "new" or
contradict a commitment we already made (e.g. the support group).

**Tone:** warm, non-technical, Spanish, emoji-light. These are clinicians, not
engineers — lead with what changes for *them and their patients*, not the
stack. Always close with an invitation to reply with doubts/suggestions.

---

## 2026-07-03 — Release notes (landing CTA, directory ordering, support group)

**Channel:** WhatsApp broadcast to verified professionals.
**Context:** end of the Thu/Fri sprint — v1.17.0 + v1.19.0 shipped, plus the
Sentry/Analytics/per-request-isolation plumbing. 2,500 people reached
cumulatively; ~15 attended that same day.

**Message sent:**

> Hola, soy Ender de nuevo, el desarrollador de PsicoAyudaVen 💜 te quería contar lo que hemos hecho los últimos días.
>
> Primero, una linda noticia 🎉
> *PsicoAyudaVen ya llegó a 2.500 personas*, y solo hoy atendimos a unas *15 personas*. Detrás de cada número hay alguien a quien le extendiste la mano. Gracias 🙏
>
> Esto fue lo que mejoramos para que te encuentren más fácil:
>
> 📞 *Contacto más rápido por WhatsApp*
> Con un toque en "Necesito ayuda ahora", la persona se conecta directo con un profesional disponible en ese momento. Mucho menos pasos.
>
> 🔝 *Los disponibles aparecen primero*
> Si estás disponible, sales arriba en el directorio. Así quien busca ayuda ve primero a quien puede atenderlo ya.
>
> 💬 *El primer mensaje llega más humano*
> Ahora llega con tu nombre, así: *"Hola {tu nombre}, te escribo desde PsicoAyudaVen. ¿Tienes un momento para conversar?"*
>
> 🎲 *Botón "Contactar al azar" más grande en el celular*
> Más fácil de tocar con el pulgar, más oportunidades de que te escriban.
>
> 🌿 *Si nadie está disponible, igual cuidamos a la persona*
> Le ofrecemos ejercicios de respiración mientras puede hablar con alguien.
>
> 🔑 *¿Olvidaste tu contraseña?*
> Ya puedes recuperarla tú solo/a con el enlace que está en el ingreso.
>
> 📋 *Tu panel quedó más claro*
> Ahora es un menú de tarjetas (perfil, disponibilidad, audios…) más fácil de moverse desde el celular.
>
> 🤝 *Una novedad importante para ustedes también*
> En los próximos días vamos a abrir un *grupo de apoyo para los psicólogos* de PsicoAyudaVen, con expertos en este tipo de emergencias y desastres naturales. Sabemos que acompañar a quienes están pasando por situaciones tan difíciles también pesa, y queremos que ustedes tengan un espacio para cuidarse, descargar y aprender de quienes ya han trabajado esto. En cuanto lo tengamos listo te aviso por aquí.
>
> Un favor grande 🙏
> *Mantén tu disponibilidad actualizada*. Si cambias tu horario, si tendrás días libres, o si por un tiempo no podrás atender, actualízalo en tu panel. Así te mostramos a las personas solo cuando realmente puedes responder.
>
> ¿Dudas o sugerencias? Me dices por aquí 👇
>
> Gracias por estar al lado de quienes más lo necesitan 💜
>
> Ender

**Open commitments made in this message (must follow up):**
- **Support group for psychologists** with experts in natural-disaster
  response — announced as "in the próximos días." When it launches, send a
  follow-up to the same list with the invite/link. Do **not** re-announce it
  as a new idea; it was already promised here.

**Features announced (do not re-announce as "new"):**
- Landing "Necesito ayuda ahora" CTA → direct WhatsApp (v1.19.0)
- Custom WhatsApp message with the pro's name, centralized in
  `src/lib/whatsapp.ts` (v1.19.0)
- Directory ordered by live availability, refresh 20s (v1.17.0)
- Floating "Contactar al azar" button on mobile (v1.17.0)
- Self-care fallback to `/recursos` when no pro is available (v1.17.0)
- Password recovery at `/recuperar` (v1.15.2)
- Redesigned `/profesional/panel` card hub (v1.15.0)
