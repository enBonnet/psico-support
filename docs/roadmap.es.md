# PsicoAyudaVen — Hoja de ruta a 12 meses

**Estado:** documento de planificación activo (v1, julio 2026)
**Horizonte:** julio 2026 → julio 2027
**Responsables:** lídertechnical + asesor clínico

Esta hoja de ruta consolida el plan estratégico para los próximos 12 meses.
Se construye sobre el estado actual en producción (v1.23.0) y refleja las
decisiones tomadas en producto, arquitectura, equipo y financiamiento. Es el
artefacto para compartir con financiadores, aliados y nuevos miembros del
equipo.

Para las advertencias de implementación, ver [`AGENTS.md`](../AGENTS.md). Para
el historial de versiones publicadas, ver [`CHANGELOG.md`](../CHANGELOG.md).

---

## 1. Resumen ejecutivo

PsicoAyudaVen es una plataforma de apoyo psicológico para respuesta a desastres
que conecta a personas en Venezuela con psicólogos verificados, en evolución
hacia un modelo de *acompañamiento* voluntario (transfronterizo, no terapéutico).
En los próximos 12 meses crece desde una PWA liderada por un ingeniero de
software y guiada clínicamente hacia una operación con equipo pequeño que
entregue **apps nativas iOS + Android con sesiones de video integradas**, un
**copiloto de IA para profesionales** y **agendamiento para relaciones
terapéuticas continuas** — manteniendo el camino de triaje de crisis instantáneo,
que es la razón de ser de la plataforma.

**Envelope del año 1:** ~$220.000–400.000 (equipo + plataforma), gestionado vía
colectivos de financiamiento. Hoy la plataforma es sostenida por un único
desarrollador; el código es abierto (MIT) en GitHub.

---

## 2. Dónde estamos (julio 2026)

| Dimensión | Estado actual |
|-----------|---------------|
| Equipo | 1 ingeniero de software (único sostén — financia, construye y opera la plataforma); las guías clínicas las define un grupo asesor de profesionales de la salud mental |
| Costo de plataforma | ~$0–30 / mes (tiers gratuitos de Cloudflare + Sentry pequeño) |
| Superficie | Solo PWA — instala en Android, sin presencia en App Store / Play Store |
| Tiempo real | Ninguno — el contacto es WhatsApp saliente + audios pregrabados |
| Código base | Una app TanStack Start (React 19 + Cloudflare Workers + D1 + R2 + Analytics Engine) |
| Código | **Código abierto** (licencia MIT), público en GitHub (`github.com/enBonnet/psico-support`) |
| Modelo | Directorio de profesionales verificados operativo (v1.0, 2026-06-28); modelo de *acompañamiento* voluntario redactado (`/voluntariado`, `/privacidad`) pero **no validado legalmente**, sin flujo de registro de voluntarios |
| Cadencia de releases | ~25 releases en ~25 días (v1.0 → v1.23.0) |

**Gobernanza hoy:** la plataforma es sostenida únicamente por su ingeniero de
software líder, quien la financia, construye y opera. Un grupo asesor de
profesionales de la salud mental define las guías clínicas, los protocolos y los
estándares profesionales que terapeutas y voluntarios en la plataforma deben
seguir — el ingeniero ejecuta la entrega; el grupo clínico fija el estándar de
cuidado. Esta separación ya existe y es la base sobre la que se construye la
expansión del equipo del año 1 — el rol de asesor clínico en §12 lo formaliza y
extiende, no lo crea. El código es abierto bajo licencia MIT, nacido en el
hackathon abierto Build4Venezuela (un evento comunitario gratuito y sin
premios — **no** es fundador, financiador ni una relación institucional continua).

**Costo anual hoy:** ~$200–400 (dominio + servicios mínimos).

**Métricas desde el lanzamiento (2026-06-28), consultadas el 2026-08-03:**

| Métrica | Valor | Fuente |
|---------|-------|--------|
| Visitantes únicos | 4.140 (al 2026-07-14) | Cloudflare Web Analytics |
| Visitantes únicos/día (actual) | ~300 (al 2026-07-14) | Cloudflare Web Analytics |
| Actores con interacción (≥1 evento tracked) | 839 (~20% de los visitantes) | Analytics Engine |
| Eventos tracked totales | 3.448 | Analytics Engine |
| Contactos por WhatsApp (todos los CTAs) | 131 — help-now 85, tarjeta del directorio 28, `/ahora` 10, al azar 8 | Analytics Engine |
| Instalaciones PWA | 13 | Analytics Engine |

**Alcance vs compromiso:** ~4.140 visitantes llegaron al sitio (última
consulta 2026-07-14 — Web Analytics no es consultable vía la API de eventos),
mientras que 839 (~20%) dispararon una acción tracked y 131 (~3,2%) abrieron
una conversación de WhatsApp. Los actores con interacción picaron en 212 el
día del lanzamiento (2 jul) y se han asentado en ~10–20/día hacia finales de
julio frente a ~300 visitantes únicos/día en bruto. El CTA "necesito ayuda
ahora" (help-now) es el mayor conversor individual (85 de 131 contactos, arriba
de 64 hace tres semanas). Esta brecha es el caso cuantitativo para el trabajo
de reconstrucción del embudo en Q4 — la plataforma tiene alcance; convertir ese
alcance en contactos de quienes buscan ayuda es el problema abierto de
producto.

---

## 3. Dónde queremos estar (julio 2027)

| Dimensión | Estado objetivo |
|-----------|-----------------|
| Equipo | 4–6 personas (3 ingenieros tiempo completo + asesor clínico + diseño + comunidad) |
| Superficie | Web (PWA, alcance público) + **apps nativas iOS + Android** en las tiendas |
| Tiempo real | **Sesiones de video integradas** (LiveKit) — el canal profesional principal |
| Chat | Chat de primeros auxilios in-app (Cloudflare Durable Objects) + WhatsApp (relegado a primeros auxilios) |
| IA | **Copiloto para profesionales** (asistencia en seguimientos, recomendaciones, patrones de riesgo). La persona que busca ayuda nunca interactúa con la IA. |
| Agendamiento | Reserva de sesiones de video con calendarios, casos, seguimiento longitudinal de terapia |
| Modelo | Modelo de voluntarios validado legalmente y operativo junto al directorio de profesionales verificados |
| Financiamiento | Fuente sostenible identificada y comprometida |
| Medición | Métricas de impacto (no solo el embudo) |

---

## 4. La plataforma contiene dos productos coexistentes

Esta separación es estructural y no debe difuminarse en la interfaz.

| Producto | Meta | Sesión | Fricción | Compromiso | Identidad | Canal |
|----------|------|--------|----------|------------|-----------|-------|
| **Triaje de crisis** (existente) | **Restablecer estabilidad** — PFA, no terapia | ~15 min, bajo demanda | Cero — sin cuenta, sin reserva | Contacto único | Anónimo válido | Chat / WhatsApp / video bajo demanda |
| **Terapia continua** (nuevo) | Trabajo terapéutico en el tiempo | Programada, más larga | Reserva, cuenta, consentimiento | Relación multi-sesión | Identificada | Sesiones de video programadas |

**Regla:** una persona en crisis nunca debe chocar con una pared de "crea una
cuenta para hablar ahora". El camino de crisis se mantiene sin fricción; el
camino de terapia es una relación comprometida e identificada.

**Frontera clínica (estructural):** el camino de crisis entrega **primeros
auxilios psicológicos (PFA) — estabilización, no terapia.** Su única meta es
restablecer la estabilidad de la persona en el momento (una sesión de apoyo de
~15 minutos) y derivar si hace falta. **No** es psicoterapia y **no** es ejercicio
profesional regulado, lo cual es precisamente por qué voluntarios entrenados
pueden brindarlo (el modelo de *acompañamiento* voluntario sirve a este camino).
El camino de terapia es trabajo terapéutico real y queda como dominio exclusivo
de profesionales licenciados. Estas metas no deben difuminarse: una sesión de
crisis nunca se convierte en terapia improvisada, y un proceso terapéutico nunca
se reduce a un parche de 15 minutos.

---

## 5. Jerarquía de canales

```
Llega quien busca ayuda (web o app nativa)
  │
  ├─ CAMINO DE CRISIS (~15 min de estabilización — PFA, no terapia)
  │    ├─ Chat de primeros auxilios in-app (Durable Objects)
  │    ├─ WhatsApp (ws) — solo primeros auxilios
  │    └─ Video bajo demanda (~15 min — restablecer estabilidad, derivar)
  │
  └─ CAMINO DE TERAPIA (trabajo terapéutico programado — solo profesionales licenciados)
       └─ Sesión de video programada (LiveKit)

Lado profesional (todas las sesiones, ambos caminos)
  ├─ Gestión de casos (casos + sesiones + seguimientos)
  ├─ Copiloto de IA (para profesionales, revisado, nunca visible para el usuario)
  └─ Agendamiento (solo sesiones de video del camino de terapia)
```

**El video sirve a ambos caminos con metas distintas:** camino de crisis =
estabilización bajo demanda de ~15 minutos (PFA); camino de terapia = sesiones
terapéuticas programadas. El chat y WhatsApp nunca se programan — se mantienen
como primeros auxilios instantáneos. Esto confina la complejidad de agendamiento
a la superficie de video del camino de terapia.

---

## 6. Arquitectura — el backend es dueño de la lógica

El principio arquitectónico más importante para un equipo pequeño:

> **Toda la lógica de negocio vive en el backend (Cloudflare Workers). Las tres
> capas de presentación (web, iOS, Android) son renderizadores delgados que
> llaman a la misma API. No se duplica lógica entre plataformas.**

```
┌─────────────────────────────────────────────────────────────┐
│                     PRESENTACIÓN (delgada)                   │
│   Web PWA (TanStack Start)   │   Apps nativas (React Native) │
│   - alcance público + SEO    │   - iOS + Android, un código  │
│   - directorio, /recursos,   │     RN                        │
│     /apoyo, páginas legales  │   - el producto principal:    │
│   - respaldo para dispositivos│     auth, panel, casos,       │
│     de bajos recursos        │     video, chat, agendamiento │
└──────────────┬───────────────┴───────────────┬───────────────┘
               │                               │
               └───────────────┬───────────────┘
                               │  contrato de API compartido
                               │  (esquemas Zod, server fns tipadas)
                               ▼
┌──────────────────────────────────────────────────────────────┐
│                  BACKEND (toda la lógica vive aquí)           │
│                  Cloudflare Workers                            │
│   ├─ D1 (SQLite) — directorio, usuarios, casos, sesiones, slots│
│   ├─ R2 — avatares, certificados, audios                      │
│   ├─ Durable Objects — chat de primeros auxilios en tiempo real│
│   ├─ Analytics Engine — telemetría de producto (solo escritura)│
│   ├─ Email Service — transaccional + recordatorios de sesión  │
│   ├─ LiveKit (externo) — sesiones de video (creación de salas,│
│   │                       tokens, webhooks)                   │
│   └─ Proveedores de IA — Workers AI (en región) + LLM API     │
│                      (con DPA) para el copiloto de profesionales│
└──────────────────────────────────────────────────────────────┘
```

**Implicaciones:**
- Validación, reglas de agendamiento, verificación de conflictos, escalada de
  riesgo, orquestación de IA, emisión de tokens de video — **todo server-side.**
- Los clientes solo renderizan estado y llaman mutaciones. Nada más inteligente.
- La capa compartida de esquemas/tipos (Zod) es el contrato. Un cambio en un
  esquema es la fuente de verdad única para los tres clientes.
- **Un ingeniero mobile puede entregar tanto iOS como Android** porque la app
  RN es un renderizador delgado. Esta es la palanca de "hacer más con menos".

---

## 7. Estrategia de IA — solo copiloto para profesionales

**Principio:** la persona que busca ayuda nunca interactúa con la IA. La
promesa del landing "personas reales, no bots ni inteligencia artificial"
(v1.13.1) se mantiene sin reescribirse. La IA es una herramienta que el
profesional usa en el backend; todo lo que produce es revisado por un humano
antes de llegar a cualquier registro o persona.

### Funciones del copiloto

| Función | Qué hace | Fase |
|---------|----------|------|
| Asistencia en notas de seguimiento | Sugiere estructura, marca elementos faltantes, completa plantillas desde las notas del profesional | Q1 2027 |
| Recomendaciones de recursos | Sugiere `/recursos`, derivaciones, hojas de trabajo según etiquetas de la sesión | Q1 2027 |
| Detección de patrones de riesgo en la carga de casos | Marca riesgo ascendente / sesiones perdidas entre los casos abiertos del profesional | Q2 2027 |
| Resumen de transferencia de sesión | Resume el chat de primeros auxilios previo para el profesional que entra | Q1 2027 |
| Borrador de plan de tratamiento | Sugiere metas/hitos desde el contexto del caso (el profesional revisa) | Q2 2027 |
| Señales de evolución en el tiempo | Detecta señales de progreso entre sesiones | Q2 2027 |

### Estrategia de proveedor (dos niveles, manejo de datos atado a la revisión legal)

- **Cloudflare Workers AI** (en región) para llamadas baratas/rápidas:
  etiquetado, clasificación, banderas de enrutamiento. Los datos se quedan en
  Cloudflare — no se necesita DPA.
- **LLM API** (Anthropic/OpenAI) para generación de calidad clínica (borradores,
  resúmenes). Requiere un **acuerdo de procesamiento de datos (DPA) +
  consentimiento explícito**. Decisión diferida a la revisión legal del Q3.

**Fuera de la mesa (no negociable):**
- Chatbot de IA *como terapeuta*.
- Diagnóstico por IA.
- IA sin una ruta de escalada humana.
- Cualquier IA con la que la persona que busca ayuda interactúe directamente.

---

## 8. Datos y retención

| Clase de dato | Retención |
|---------------|-----------|
| Contactos anónimos de triaje de crisis (sin cuenta) | 12 meses tras el último contacto (borrador actual) |
| Casos de terapia continua | **Se conservan mientras el caso esté activo.** La ventana de 12 meses empieza cuando el caso concluye (`status → concluded` o `referred_out`). |
| Documentos de verificación profesional | Se conservan mientras el profesional esté verificado; se eliminan a pedido / al retirarlo |
| Video de sesiones | **Nunca se graba.** Las sesiones de LiveKit son solo en vivo. |
| Analítica | Solo agregada, contrato de columnas inmutable (gotcha #10) |

**Regla de privacidad:** los datos longitudinales de un caso son mucho más
sensibles que los contactos de crisis únicos. El uso de LLM externo sobre notas
de sesiones requiere un DPA fuerte + consentimiento explícito — por defecto se
usa Workers AI (en región) hasta que lo legal habilite proveedores externos.

---

## 9. Apps nativas — producto completo, React Native, delgadas

- **Un solo código base React Native** → iOS + Android.
- Paridad completa de funciones con el producto web (la app *es* el producto).
- Renderizador delgado — toda la lógica vía la API compartida (ver §6).
- **La web (PWA) se queda** como capa de alcance público: landing, directorio
  público, perfiles de profesionales (SSR para OG/JSON-LD según gotcha #6),
  `/recursos`, `/apoyo`, páginas legales, y respaldo para dispositivos de bajos
  recursos.
- Las funciones interactivas nuevas (video, chat, agendamiento, copiloto de IA)
  apuntan primero a nativo; la web sigue o se queda solo en lo público.

**Estrategia de ingeniería mobile:** empezar con **un ingeniero mobile senior**,
sumar un mid/contratista en Q1 2027 si el alcance lo demanda. Como la app es
delgada, un ingeniero puede sostener ambas plataformas.

---

## 10. Agendamiento, casos, terapia de largo plazo

### Qué existe
- `availability_mode` (always/scheduled/inactive) + bloques semanales recurrentes
  + zona horaria IANA, disponibilidad derivada al momento de renderizar
  (v1.13.0, migración 0014).
- Tabla `follow_ups` — plana, un registro por contacto, con alcance al dueño
  (v1.13.0, migración 0013).

### Qué se agrega (migraciones aditivas, no rompen nada)

```
cases (NUEVA)
  id, professional_id, help_seeker_user_id (nullable),
  status (active|paused|concluded|referred_out),
  treatment_goals (JSON text), started_at, concluded_at

sessions (NUEVA)
  id, case_id (nullable — los contactos de crisis se quedan sin caso),
  professional_id, scheduled_at, duration_min,
  status (scheduled|completed|cancelled|no_show),
  video_room_id, risk_level, action_taken, notes

slots (NUEVA)
  id, professional_id, start_at, end_at,
  status (open|booked|blocked), booked_by_user_id, case_id

follow_ups (EXISTENTE — se conserva, se extiende)
  + case_id opcional (nullable, backfill a null)
```

### Construir vs comprar (agendamiento)
- **v1: construir lo mínimo en D1** (slots + reservas + verificación de
  conflictos). El `availability_schedule` existente ya modela bloques
  recurrentes — se extiende para materializar slots reservables.
- **v2 (Q2 2027, solo si los profesionales lo piden):** sincronización con
  Google Calendar API (gratis).
- Calendly (costo por puesto) y Cal.com autohospedado (carga operativa, Node no
  nativo de Workers) **no** se adoptan.

### Disciplina de alcance — esto NO es una HCET (historia clínica)
Construir el mínimo que soporte la continuidad del *acompañamiento*. Evitar:
campos estructurados de diagnóstico, seguro/facturación, seguimiento de
recetas, logging de auditoría de grado médico. Eso es otra empresa regulada.

---

## 11. Más allá del año 1 — suscripciones y compensación a especialistas (Preply para terapia)

**Esta es la meta DESPUÉS de la hoja de ruta a 12 meses, no un entregable del
año 1.** Nada de esta sección se construye durante el año 1; es el destino final
para el que el trabajo del año 1 (equipo, agendamiento, casos, video, apps
nativas, pool de especialistas verificados) es la *base*. El año 1 se mantiene
íntegramente financiado por donaciones/colectivos (ver §15); las suscripciones
empiezan a aportar en el año 2.

La plataforma operará un **modelo de servicio de dos niveles**, y solo un nivel
es de pago:

| Nivel | Camino | Costo | Meta |
|-------|--------|-------|------|
| **Gratis** | Triaje de crisis (estabilización PFA de ~15 min) | $0 — la misión | Restablecer estabilidad, derivar |
| **Suscripción** | Terapia continua (sesiones de video programadas) | Tarifa mensual → cuota de sesiones | Trabajo terapéutico con especialistas licenciados |

### Cómo funciona la suscripción (marketplace tipo Preply)

- Un usuario se **suscribe mensualmente** y recibe una **cuota de sesiones de
  terapia** para ese mes (p. ej. un nivel podría incluir 4 sesiones programadas/mes).
- El usuario se empareja con especialistas licenciados del directorio verificado.
- **Cada sesión entregada le paga al especialista.** La plataforma cobra la
  suscripción, dispersa el pago por sesión al especialista y retiene una comisión.
- **La comisión financia tres cosas:** (1) el pago al especialista, (2) las
  tarifas de procesamiento de pagos y (3) el mantenimiento de la plataforma +
  el **camino de crisis gratis**. El nivel pago subsidia al cruz la misión
  gratuita — este es el motor de sostenibilidad de la plataforma y la respuesta
  a "quién paga por la ayuda de crisis gratuita".

### Compensación al especialista (decisión del año 2)

| Modelo | Descripción |
|--------|-------------|
| **Tarifa estándar de plataforma** (v1, recomendada) | A cada especialista verificado se le paga el mismo monto fijo por sesión entregada. Simple, equitativo, fácil de razonar. |
| Tarifa fijada por el especialista (tipo Preply) (v2) | Cada especialista fija su propio precio por sesión; los usuarios eligen por precio/ajuste. Dinámica de marketplace. Solo reditúa con volumen. |

La tarifa estándar v1 es la opción "ponytail": un número, una regla de pago,
sin arbitraje de marketplace que construir. Las tarifas fijadas por el
especialista añaden una capa de marketplace (niveles, ranking, pricing dinámico)
que solo reditúa con volumen.

### Procesamiento de pagos — la complicación Venezuela (hay que marcarla)

El sistema financiero de Venezuela hace que las suscripciones y los pagos a
especialistas no sean triviales:

- **Stripe no opera en Venezuela.** La facturación por suscripción probablemente
  requiera una entidad EE. UU./internacional (Stripe Atlas, o equivalente) o un
  procesador amigo de LATAM (dLocal, Ebanx, MercadoPago).
- **Pagar a especialistas venezolanos** es el problema más difícil. Rieles
  realistas en la región: Payoneer, Wise, Binance Pay (USDT), Zelle o cripto
  (USDT/TRC20). Cada uno tiene trade-offs de cumplimiento, comisiones y UX.
- Esto es un **workstream del año 2** para lo legal/operaciones, no una tarea
  del año 1. Los rieles elegidos afectan el modelo financiero, la exposición de
  protección al consumidor y la reportación de impuestos tanto en Venezuela
  como en la jurisdicción del procesador.

### Confianza y transparencia

Introducir dinero cambia el modelo de confianza. Reglas:

- **El camino de crisis es y se mantiene visiblemente gratis.** Sin paywall, sin
  upsell, sin "mejora para hablar ahora". Una persona en crisis nunca ve un precio.
- La terapia de pago es un nivel claramente separado y opcional — nunca se
  inserta en el flujo de crisis.
- Los precios, las cuotas de sesiones y el reparto de la comisión son
  transparentes para usuarios y especialistas. Sin tarifas ocultas.
- La promesa del landing de "personas reales" se mantiene — el pago dirige a los
  usuarios hacia humanos licenciados reales, no hacia IA.

### Esquema indicativo (alcance del año 2, no se construye en el año 1)

```
subscription_plans (NUEVA)
  id, name, monthly_price_usd, sessions_per_month,
  status (active|retired), created_at

user_subscriptions (NUEVA)
  id, user_id, plan_id, status (active|cancelled|past_due),
  current_period_start, current_period_end,
  sessions_remaining, payment_processor, processor_customer_id

session_payouts (NUEVA)
  id, session_id, specialist_id, amount_usd,
  status (pending|paid|failed), processor_payout_id, paid_at
```

Se bosqueja aquí para que las decisiones de esquema del año 1 (§10) no las
impidan — las tablas de casos y sesiones están diseñadas para adjuntar pagos
después sin reestructurar.

### Qué hace el año 1 para habilitar esto

Los entregables del año 1 son los *prerrequisitos*, no la monetización en sí:

- **Pool de especialistas verificados + agendamiento + casos** (§10) → el lado
  de la oferta.
- **Apps nativas + sesiones de video** (§9, §5) → la superficie de entrega.
- **Gobernanza clínica + revisión legal** (Q3) → la base de confianza +
  cumplimiento que los pagos requieren.

### Impacto en el presupuesto del año 1

**Ninguno.** Las suscripciones no se lanzan ni generan ingresos durante el año 1.
El presupuesto de equipo/plataforma en §13–§14 es íntegramente financiado por
donaciones/colectivos. Las tarifas de procesamiento de pagos y los pagos a
especialistas son líneas del año 2, que se dimensionan cuando el modelo se lance.

---

## 12. Equipo (el costo dominante)

Tarifas LATAM (USD/mes). Equipo pequeño pero real. Crece condicional al
financiamiento.

| Rol | Dedicación | Mensual | Anual | Por qué |
|-----|-----------|---------|-------|---------|
| Tech lead / full-stack (dev actual) | TC | $4.000–6.000 | $48–72k | Posee la plataforma + el stack, hace mentoría |
| Ingeniero mobile (React Native) | TC | $3.500–5.000 | $42–60k | Posee iOS + Android (apps delgadas, un código base) |
| Ingeniero backend / plataforma | TC (o 0,8) | $3.000–4.500 | $36–54k | Posee integración de video, chat (DO), confiabilidad, datos |
| Asesor clínico (psicólogo licenciado) | 0,2–0,3 | $800–1.500 | $10–18k | Salvaguarda, protocolo, relaciones con profesionales/voluntarios |
| Diseñador producto / UX | 0,5–1,0 | $1.500–3.000 | $18–36k | UX para contexto de crisis (la baja fricción es clínica) |
| Líder de comunidad / soporte | 0,5 | $800–1.500 | $10–18k | Onboarding de profesionales + voluntarios (extiende `docs/professional-communications.md`) |
| Asesor legal (abogado venezolano, LOPDP) | retainer | $300–800 | $4–10k | Carta del voluntariado, protección de datos, decisión institucional |
| QA / pruebas | 0,5–1,0 | $1.200–2.500 | $14–30k | Hoy no hay pruebas; se vuelve estructural con nativo + video |
| Redactor de donaciones / líder de financiamiento | contrato (Q3–Q4) | $1.000–3.000 | $6–18k | Posee el pipeline de financiadores |

**Total equipo: ~$170.000–280.000 / año.**

---

## 13. Presupuesto de plataforma y servicios

| Servicio | Costo / mes | Notas |
|---------|-------------|-------|
| Cloudflare (Workers pagado, D1 pagado, R2, Analytics Engine, Email) | $5–25 | Tiers pagados generosos; R2 crece con almacenamiento de audio/video |
| Sentry (Team) | $26–80 | Escala con reporte de errores nativos |
| Apple App Store | ~$8 (amortizado $99/año) | Tarifa anual |
| Google Play | ~$2 (pago único $25) | Despreciable |
| **Proveedor de video (LiveKit)** | **$300–1.500** | Por uso — el verdadero costo variable; opción de autohospedar en Q2 2027 |
| Durable Objects (chat) | $50–300 | Chat de primeros auxilios en tiempo real |
| Proveedores de IA (Workers AI + LLM API) | $30–200 | Para profesionales, bajo volumen (mucho más barato que un triaje orientado al usuario) |
| Email (transaccional) | $0–20 | Cloudflare Email Service, actualmente gratis |
| Dominio + DNS | ~$1 | psicoayudaven.com |
| Observabilidad / APM (más allá de Sentry) | $0–200 | Opcional |

**Total plataforma: ~$400–2.500 / mes → ~$5.000–30.000 / año.**

### Gastos únicos / capex (año 1)

| Ítem | Costo | Cuándo |
|------|-------|--------|
| Revisión legal de la carta del voluntariado + privacidad (proyecto) | $2.000–6.000 | Q3 |
| Assets de listado en App Store / Play Store, capturas | $500–1.500 | Q4 |
| Herramientas/consultoría de pruebas de carga (preparación para picos de desastre) | $1.000–3.000 | Q4 |
| Spike de integración de video (POC de LiveKit) | interno | Q4 |

---

## 14. Presupuesto anual total

| Rubro | Bajo | Alto |
|-------|------|------|
| Equipo (salarios) | $170.000 | $280.000 |
| Plataforma y servicios | $5.000 | $30.000 |
| Gastos únicos / capex | $4.000 | $11.000 |
| Colchón (10%) | $18.000 | $32.000 |
| **TOTAL año 1** | **~$197.000** | **~$353.000** |

**Mayor palanca de costo:** la adopción de video. Si las sesiones despegan, la
línea de $300–1.500/mes puede multiplicarse 3–5× para fin de año. Autohospedar
LiveKit (Q2 2027 si el volumen lo justifica) aplana esto.

---

## 15. Estrategia de financiamiento

El financiamiento es un workstream nombrado del Q3, no una tarea secundaria.
Colectivos objetivo (ordenados por ajuste):

| Colectivo | Ajuste | Por qué |
|-----------|--------|---------|
| **Mozilla MVP** (Mozillas.org) | Máximo | Código abierto MIT sirviendo a una población marginada — encaje de libro de texto |
| **IDB Lab / BID Lab** | Alto | Innovación social LATAM; salud mental + tech elegibles |
| **Grand Challenges Canada** | Alto | Financiamiento de salud mental global; financia intervenciones no canadienses |
| **Help.NGO** | Alto | Tecnología de respuesta a desastres — caso de uso exacto |
| **Direct Relief / Americares** | Medio | ONGs de emergencia sanitaria con programas en Venezuela |
| **Open Society Foundations** (LATAM) | Medio | Sociedad civil + derechos; ciclo más largo |

**Acción:** Q3 = preseleccionar 3–4, redactar solicitudes. Q4 = primeras
decisiones; el crecimiento del equipo acelera condicional a un compromiso.

**Fases condicionales al financiamiento:** el Q3 opera ajustado con los recursos
existentes (dev en solitario + retainer legal pequeño + redacción de donaciones).
El crecimiento del equipo en Q4 acelera solo si un colectivo se compromete. Si
no, el Q4 se mantiene ajustado y entregamos el flujo de voluntarios + la base
legal con los recursos actuales, posponiendo las apps nativas.

---

## 16. Fases trimestrales

### Q3 2026 — Fundación y desbloqueo legal (ajustado, pre-financiamiento)

**Camino ajustado (siempre):**
- Flujo de registro de voluntarios (paralelo al registro de profesionales,
  apuntando a `/voluntariado`; cédula opcional, carta de adhesión capturada
  como consentimiento). Resuelve la deuda explícita #1 del CHANGELOG 1.23.0.
- Inicio de la revisión legal formal (carta del voluntariado + privacidad +
  decisión sobre manejo de datos de IA). Resuelve la deuda #3.
- Decisión sobre registro institucional (registro formal venezolano vs.
  perfil bajo). Resuelve la deuda #4.
- Dar seguimiento al grupo de apoyo por desastres naturales prometido a los
  profesionales el 2026-07-03 (ver `docs/professional-communications.md`).
- **Búsqueda de financiamiento:** preseleccionar colectivos, redactar solicitudes.
- Diseñar el modelo de datos caso/sesión con el asesor clínico.
- Revisión de retención/privacidad para datos de casos de largo plazo.

**Camino financiado:** — (ninguno; condicional a que llegue financiamiento en Q3/Q4)

**Métrica de éxito:** el registro de voluntarios se entrega; la revisión legal
inicia; el grupo de apoyo tiene fecha de lanzamiento; 3+ solicitudes de
financiamiento enviadas.

### Q4 2026 — Modelo de voluntarios en vivo + andamio nativo + POC de video

**Camino ajustado:**
- Superficie de emparejamiento de voluntarios (cómo llega quien busca ayuda a un
  voluntario vs. un profesional verificado).
- Reescritura del copy del landing + `/ayuda` (ambos modelos operativos).
- Protocolo de salvaguarda/escalada (qué hace un voluntario ante riesgo agudo).
- Prueba de carga para picos de desastre.

**Camino financiado (si un colectivo se compromete):**
- Contratar: ingeniero mobile + diseñador + asesor clínico.
- Andamio React Native (auth + panel + lectura de directorio).
- POC de integración de video con LiveKit.
- MVP de chat de primeros auxilios con Durable Objects.
- **Agendamiento v1** — reserva de slots en D1, consciente de zona horaria,
  confirmación por reserva (email hasta que existan push). Migraciones: `cases`
  + `sessions` + `slots`.

**Métrica de éxito:** primera cohorte de voluntarios incorporada; andamio de
app nativa en construcción; POC de LiveKit funcionando extremo a extremo;
agendamiento v1 entregado.

### Q1 2027 — Apps en tiendas + video en vivo + copiloto de IA v1

- Envíos a las tiendas de iOS + Android.
- Sesiones de video en producción (programadas).
- Notificaciones push (recordatorios de sesión).
- Chat de primeros auxilios en producción.
- **Copiloto de IA v1:** asistencia en seguimientos + recomendaciones + resumen
  de transferencia.
- **Gestión de casos v1** en la app nativa: lista de casos, registro de
  sesiones, metas de tratamiento.
- Métricas de impacto v1 (opt-in, solo agregadas, post-contacto).
- Infraestructura de pruebas (arreglar el gap de arranque vitest/plugin de
  Cloudflare; pruebas para los guardias de auth, el peso de
  `pickRandomProfessional`, `isActiveNow`, el aislamiento por petición).
- Extraer `getHeaders()` a `lib/auth.ts` (el techo del `ponytail:`, si aparece
  un 4.º módulo de server-fn).

**Métrica de éxito:** apps en vivo en ambas tiendas; primera sesión de video
completada; copiloto de IA usado por ≥1 profesional; métrica de impacto
recogiendo datos.

### Q2 2027 — Escala, sostenibilidad, madurez anual

- Reducción del factor bus: runbooks (deploy, migración, incidente), un segundo
  que sepa hacer deploy, doc de onboarding.
- Decisión de gobernanza (guía de contribución al código abierto, quién tiene
  las llaves de deploy, patrocinador fiscal vs. independiente).
- Auditoría clínica de calidad / sesgo de IA (umbrales de triaje, tasa de
  falsos negativos).
- Revisión de datos de impacto + primer **informe anual de impacto** (público,
  en español; retroalimenta `/acerca-de`).
- Revisión de paridad de funciones vs. pares internacionales (Crisis Text Line,
  7 Cups).
- Sincronización opcional con Google Calendar si los profesionales lo piden.
- Retrospectiva anual + replanificación.

**Métrica de éxito:** una segunda persona puede hacer deploy; existe un informe
de impacto; los próximos 12 meses planificados con datos.

---

## 17. Lo que este plan deliberadamente NO construye

- **Sin chat de texto en tiempo real in-app como canal de terapia.** El chat es
  solo primeros auxilios; el video es el medio de la sesión.
- **Sin chatbot de IA como terapeuta / diagnóstico por IA / IA orientada al
  usuario.** Rompe la promesa central de confianza; la IA es solo para
  profesionales.
- **Sin monetización construida en el año 1.** Las suscripciones/pagos a
  especialistas son la meta post-año-1 (ver §11), no un entregable del año 1. El
  año 1 se mantiene financiado por donaciones/colectivos; introducir dinero
  antes cambiaría el modelo de confianza antes de que el modelo de voluntarios y
  el pool de especialistas estén probados.
- **Sin expansión a múltiples países.** Voluntarios transfronterizos ≠ área de
  servicio transfronteriza. Quedarse en Venezuela.
- **Sin backend de video propio.** Solo proveedor externo (LiveKit).
- **Sin HCET (historia clínica).** Agendamiento + casos + registros de sesiones
  son el mínimo para continuidad, no un sistema de registro médico regulado.
- **Sin grabación de sesiones.** Video solo en vivo; la regla de retención se
  simplifica.
- **Sin Calendly / SaaS de agendamiento por puesto.** Los costos por puesto
  escalan mal y los datos salen del perímetro.

---

## 18. Riesgos

| Riesgo | Probabilidad | Impacto | Mitigación |
|--------|-------------|---------|------------|
| Exposición legal del modelo de voluntarios (marco sin validar + brecha de salvaguarda) | Alta | Existencial | Revisión legal en Q3 antes de escalar voluntarios |
| El financiamiento no llega en Q3/Q4 | Media | Alto (retrasa nativo + video) | Fases condicionales al financiamiento; Q3/Q4 ajustado sigue entregando |
| La adopción de video dispara el costo de plataforma 3–5× | Media | Medio | Autohospedar LiveKit en Q2 2027 si el volumen lo justifica |
| Límites de D1 / Cloudflare bajo un desastre real | Media | Alto | Prueba de carga en Q4; verificar comportamiento fail-soft (el patrón de esqueletos infinitos del v1.21.2) |
| Burnout del mantenedor (transición de solo → equipo pequeño) | Alta | Alto | Trabajo de factor bus en Q2; el financiamiento habilita delegar |
| Burnout de voluntarios / deriva de calidad a escala | Media | Alto | Onboarding + re-implicación periódica; el asesor clínico lo posee |
| El copiloto de IA produce una recomendación dañina que llega a quien busca ayuda | Baja | Alto | Regla de humano en el bucle; el profesional revisa todo; auditoría de sesgo en Q2 |

---

## 19. Temas abiertos (mínimos)

| Tema | Responsable | Resolución |
|------|-------------|------------|
| Manejo de datos de IA — en región (Workers AI) vs LLM externo con DPA | Revisión legal (Q3) | Atado a la pregunta de privacidad de datos longitudinales |
| Fuente(s) específica(s) de financiamiento | Líder de financiamiento | Solicitudes Q3 |
| Video bajo demanda (crisis) vs solo programado | Tech lead | Este plan asume solo programado; revisar si se pide video en el camino de crisis |

---

## Changelog

- **2026-07-14** — v1. Plan consolidado inicial. Captura decisiones en equipo,
  apps nativas (React Native, producto completo), video (LiveKit), chat
  (Durable Objects, primeros auxilios), IA (copiloto para profesionales),
  agendamiento + casos, retención (caso activo), financiamiento (colectivos) y
  la arquitectura de "el backend es dueño de la lógica".
