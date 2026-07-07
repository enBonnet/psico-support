// =============================================================================
// src/server/analytics-queries.ts — Analytics Engine SQL catalog + runner
// =============================================================================
// Worker-safe (no Node-only imports). Shared by:
//   - scripts/analytics.ts (CLI) — via scripts/analytics-lib.ts
//   - scripts/analytics-dashboard.ts (local standalone dashboard)
//   - src/server/analytics-read.ts (admin-gated in-app read path)
//
// Analytics Engine is WRITE-ONLY from the Worker (`writeDataPoint`); reads go
// through the SQL REST API with an account-level token. Column contract is
// documented in src/server/analytics.ts and AGENTS.md gotcha #10:
//
//   index1  = actorId    (anonId | userId | proId)
//   blob1   = event
//   blob2   = category   (public | auth | pro | admin)
//   blob3   = route
//   blob4   = param1     (meaning depends on event — see TRACKED_EVENTS)
//   blob5   = param2
//   blob6   = param3
//   double1 = count      (always 1 — used by SUM aggregations)
//   double2 = value      (duration | resultCount | pageNumber | band...)
//
// Every aggregation uses SUM(_sample_interval * double1) to undo sampling at
// >1M writes/min. Retention is 90 days, so days ∈ [1,90] is the only sane
// window. SQL is rendered as a template string; parameters that come from the
// client are whitelisted/sanitized via the `event` enum and the days clamp —
// NEVER interpolate arbitrary user SQL here.
// =============================================================================

export const DATASET = 'psico_events'

/**
 * Credentials for the SQL REST API. Resolved differently on Node (dotenv) vs
 * Worker (env vars / wrangler secrets). Both callers build this object and
 * hand it to runSql.
 */
export type AnalyticsReadEnv = {
  accountId: string
  token: string
}

export type QueryContext = {
  /** Window in days. Caller is responsible for clamping to [1, 90]. */
  days: number
  /**
   * Optional event name for single-event queries (trends, hourly). Callers
   * that accept client input MUST validate against TRACKED_EVENTS before
   * interpolating — this module trusts the caller.
   */
  event?: string
  /**
   * Optional secondary event for multi-series overlays. Same sanitization
   * contract as `event`.
   */
  eventB?: string
}

export type QueryDef = {
  id: string
  title: string
  description: string
  /** Rendered SQL. Interpolation MUST come from a whitelisted source. */
  sql: (ctx: QueryContext) => string
  columns: string[]
  /**
   * 'table' | 'bars' | 'line' | 'funnel' | 'donut' — a hint the UI uses to
   * pick a renderer. Optional; defaults to 'table'.
   */
  render?: 'table' | 'bars' | 'line' | 'funnel' | 'donut'
  /**
   * Category grouping for the in-app dashboard's left nav. Cosmetic.
   */
  group?: 'Adquisición' | 'Engagement' | 'Retención' | 'Operacional'
}

/**
 * Escape a single-quoted SQL string literal. Analytics Engine SQL is
 * PostgreSQL-ish; the canonical way to defeat injection inside a string
 * literal is doubling the single quotes. We also reject the obvious "go away"
 * shape (length 0 or contains a NUL byte) up front — callers should still
 * whitelist event names against TRACKED_EVENTS for defense in depth.
 */
export function sqlLiteral(s: string): string {
  if (!s || s.includes('\0')) return "''"
  return `'${s.replace(/'/g, "''")}'`
}

// -----------------------------------------------------------------------------
// Pre-built query catalog
// -----------------------------------------------------------------------------

export const QUERIES: QueryDef[] = [
  // ── Acquisition: help-seeker funnel ──────────────────────────────────────
  {
    id: 'funnel',
    title: 'Embudo help-seeker',
    description: 'Landing → directorio → perfil → contacto (categoría public)',
    columns: ['event', 'category', 'total'],
    render: 'table',
    group: 'Adquisición',
    sql: ({ days }) => `
      SELECT
        blob1 AS event,
        blob2 AS category,
        SUM(_sample_interval * double1) AS total
      FROM ${DATASET}
      WHERE blob2 = 'public'
        AND timestamp > NOW() - INTERVAL '${days}' DAY
      GROUP BY event, category
      ORDER BY total DESC
    `,
  },
  {
    id: 'funnel-steps',
    title: 'Conversión del embudo',
    description:
      'Conversión paso-a-paso: landing → CTA → directorio → perfil → contacto (con %)',
    columns: ['step', 'event', 'total', 'pct_of_prev', 'pct_of_first'],
    render: 'funnel',
    group: 'Adquisición',
    sql: ({ days }) => `
      WITH ev AS (
        SELECT blob1 AS event,
               SUM(_sample_interval * double1) AS total
        FROM ${DATASET}
        WHERE timestamp > NOW() - INTERVAL '${days}' DAY
        GROUP BY blob1
      ),
      ordered AS (
        SELECT '1. Landing'        AS step, 'landing_view'    AS event FROM (SELECT 1)
        UNION ALL SELECT '2. CTA',              'cta_click'
        UNION ALL SELECT '3. Directorio',       'directory_view'
        UNION ALL SELECT '4. Filtro/búsqueda',  'directory_filter'
        UNION ALL SELECT '5. Perfil',           'profile_view'
        UNION ALL SELECT '6. Contacto WhatsApp','pro_contact'
      )
      SELECT
        o.step,
        o.event,
        COALESCE(ev.total, 0) AS total,
        CASE
          WHEN LAG(COALESCE(ev.total, 0)) OVER (ORDER BY o.step) = 0 THEN NULL
          ELSE ROUND(
            COALESCE(ev.total, 0) * 100.0 /
            NULLIF(LAG(COALESCE(ev.total, 0)) OVER (ORDER BY o.step), 0),
          1)
        END AS pct_of_prev,
        CASE
          WHEN FIRST_VALUE(COALESCE(ev.total, 0)) OVER (ORDER BY o.step) = 0 THEN NULL
          ELSE ROUND(
            COALESCE(ev.total, 0) * 100.0 /
            NULLIF(FIRST_VALUE(COALESCE(ev.total, 0)) OVER (ORDER BY o.step), 0),
          1)
        END AS pct_of_first
      FROM ordered o
      LEFT JOIN ev ON ev.event = o.event
      ORDER BY o.step
    `,
  },
  {
    id: 'whatsapp-entries',
    title: 'Contactos por punto de entrada',
    description:
      'Los 4 puntos de WhatsApp: directorio, al-azar, ayuda-ahora (landing), /ahora',
    columns: ['event', 'total'],
    render: 'bars',
    group: 'Adquisición',
    sql: ({ days }) => `
      SELECT
        blob1 AS event,
        SUM(_sample_interval * double1) AS total
      FROM ${DATASET}
      WHERE blob1 IN (
        'pro_contact', 'pro_contact_random',
        'pro_contact_help_now', 'pro_contact_ahora'
      )
        AND timestamp > NOW() - INTERVAL '${days}' DAY
      GROUP BY event
      ORDER BY total DESC
    `,
  },
  {
    id: 'help-now-funnel',
    title: 'Funnel "Necesito ayuda ahora"',
    description:
      'Landing → cta_click(help_now) → pro_contact_help_now (éxito) | help_now_fallback (sin disponibles)',
    columns: ['step', 'event', 'total'],
    render: 'funnel',
    group: 'Adquisición',
    sql: ({ days }) => `
      SELECT
        CASE
          WHEN blob1 = 'cta_click' AND blob4 = 'help_now'          THEN '1. CTA ayuda ahora'
          WHEN blob1 = 'cta_click' AND blob4 = 'help_now_fallback' THEN '2. Sin disponibles'
          WHEN blob1 = 'pro_contact_help_now'                      THEN '3. WhatsApp abierto'
        END AS step,
        blob1 AS event,
        SUM(_sample_interval * double1) AS total
      FROM ${DATASET}
      WHERE blob1 = 'cta_click' AND blob4 IN ('help_now', 'help_now_fallback')
        OR blob1 = 'pro_contact_help_now'
      AND timestamp > NOW() - INTERVAL '${days}' DAY
      GROUP BY step, event
      HAVING step IS NOT NULL
      ORDER BY step
    `,
  },
  {
    id: 'ahora-funnel',
    title: 'Funnel /ahora',
    description:
      '/ahora view → pro_contact_ahora (éxito). Drop-off = view − contact',
    columns: ['step', 'event', 'total'],
    render: 'funnel',
    group: 'Adquisición',
    sql: ({ days }) => `
      SELECT
        CASE blob1
          WHEN 'ahora_view'         THEN '1. /ahora cargó'
          WHEN 'pro_contact_ahora'  THEN '2. WhatsApp abierto'
        END AS step,
        blob1 AS event,
        SUM(_sample_interval * double1) AS total
      FROM ${DATASET}
      WHERE blob1 IN ('ahora_view', 'pro_contact_ahora')
        AND timestamp > NOW() - INTERVAL '${days}' DAY
      GROUP BY step, event
      ORDER BY step
    `,
  },

  // ── Acquisition: professionals ───────────────────────────────────────────
  {
    id: 'pro-signup-funnel',
    title: 'Embudo de registro profesional',
    description: 'Vista registro → acepta términos → submit → signup',
    columns: ['step', 'event', 'total'],
    render: 'funnel',
    group: 'Adquisición',
    sql: ({ days }) => `
      WITH ev AS (
        SELECT blob1 AS event,
               SUM(_sample_interval * double1) AS total
        FROM ${DATASET}
        WHERE blob1 IN (
          'pro_registro_view', 'pro_registro_step_continue',
          'pro_terms_accept', 'pro_register_submit', 'auth_signup'
        )
          AND timestamp > NOW() - INTERVAL '${days}' DAY
        GROUP BY blob1
      ),
      ordered AS (
        SELECT '1. Vista registro'   AS step, 'pro_registro_view'      AS event FROM (SELECT 1)
        UNION ALL SELECT '2. Continúa paso', 'pro_registro_step_continue'
        UNION ALL SELECT '3. Acepta términos','pro_terms_accept'
        UNION ALL SELECT '4. Submit',         'pro_register_submit'
        UNION ALL SELECT '5. Cuenta creada',  'auth_signup'
      )
      SELECT o.step, o.event, COALESCE(ev.total, 0) AS total
      FROM ordered o LEFT JOIN ev ON ev.event = o.event
      ORDER BY o.step
    `,
  },

  // ── Engagement ───────────────────────────────────────────────────────────
  {
    id: 'whatsapp',
    title: 'Clicks WhatsApp (totales)',
    description: 'pro_contact + pro_contact_random',
    columns: ['event', 'total'],
    render: 'bars',
    group: 'Engagement',
    sql: ({ days }) => `
      SELECT
        blob1 AS event,
        SUM(_sample_interval * double1) AS total
      FROM ${DATASET}
      WHERE blob1 IN ('pro_contact', 'pro_contact_random')
        AND timestamp > NOW() - INTERVAL '${days}' DAY
      GROUP BY event
      ORDER BY total DESC
    `,
  },
  {
    id: 'whatsapp-by-pro',
    title: 'WhatsApp por profesional',
    description: 'Top profesionales por clicks (param1=proId, param3=userId)',
    columns: ['pro_id', 'user_id', 'source', 'clicks'],
    render: 'table',
    group: 'Engagement',
    sql: ({ days }) => `
      SELECT
        blob4 AS pro_id,
        blob6 AS user_id,
        blob5 AS source,
        SUM(_sample_interval * double1) AS clicks
      FROM ${DATASET}
      WHERE blob1 = 'pro_contact'
        AND timestamp > NOW() - INTERVAL '${days}' DAY
      GROUP BY pro_id, user_id, source
      ORDER BY clicks DESC
      LIMIT 20
    `,
  },
  {
    id: 'profile-views-by-pro',
    title: 'Vistas de perfil por profesional',
    description: 'Top profesionales por vistas de perfil (param1=proId)',
    columns: ['pro_id', 'views'],
    render: 'bars',
    group: 'Engagement',
    sql: ({ days }) => `
      SELECT
        blob4 AS pro_id,
        SUM(_sample_interval * double1) AS views
      FROM ${DATASET}
      WHERE blob1 = 'profile_view'
        AND blob4 != ''
        AND timestamp > NOW() - INTERVAL '${days}' DAY
      GROUP BY pro_id
      ORDER BY views DESC
      LIMIT 15
    `,
  },
  {
    id: 'sources',
    title: 'Origen del contacto',
    description: 'WhatsApp: ¿desde directorio o desde perfil?',
    columns: ['source', 'clicks'],
    render: 'donut',
    group: 'Engagement',
    sql: ({ days }) => `
      SELECT
        blob5 AS source,
        SUM(_sample_interval * double1) AS clicks
      FROM ${DATASET}
      WHERE blob1 = 'pro_contact'
        AND timestamp > NOW() - INTERVAL '${days}' DAY
      GROUP BY source
      ORDER BY clicks DESC
    `,
  },
  {
    id: 'audio-engagement',
    title: 'Engagement de audios',
    description: 'Vistas de la bandeja, reproducciones, atribución y cierre (Voces que acompañan)',
    columns: ['event', 'total'],
    render: 'bars',
    group: 'Engagement',
    sql: ({ days }) => `
      SELECT
        blob1 AS event,
        SUM(_sample_interval * double1) AS total
      FROM ${DATASET}
      WHERE blob1 IN (
        'apoyo_view',
        'audio_play_all', 'audio_play_pro',
        'audio_attribution_click', 'audio_close'
      )
        AND timestamp > NOW() - INTERVAL '${days}' DAY
      GROUP BY event
      ORDER BY total DESC
    `,
  },
  {
    id: 'selfcare-engagement',
    title: 'Uso de autocuidado',
    description: 'Inicio y finalización de herramientas (respirar, enraizamiento, autochequeo)',
    columns: ['event', 'total'],
    render: 'bars',
    group: 'Engagement',
    sql: ({ days }) => `
      SELECT
        blob1 AS event,
        SUM(_sample_interval * double1) AS total
      FROM ${DATASET}
      WHERE blob1 IN (
        'respirar_start', 'enraizamiento_step',
        'autochequeo_start', 'autochequeo_complete',
        'autochequeo_gate_response', 'recursos_tool_view',
        'crisis_cta_click'
      )
        AND timestamp > NOW() - INTERVAL '${days}' DAY
      GROUP BY event
      ORDER BY total DESC
    `,
  },
  {
    id: 'pwa-funnel',
    title: 'Funnel PWA / instalación',
    description: 'install_prompt_trigger → dismiss | app_installed',
    columns: ['event', 'total'],
    render: 'funnel',
    group: 'Engagement',
    sql: ({ days }) => `
      SELECT
        blob1 AS event,
        SUM(_sample_interval * double1) AS total
      FROM ${DATASET}
      WHERE blob1 IN (
        'install_prompt_trigger', 'install_prompt_dismiss', 'app_installed'
      )
        AND timestamp > NOW() - INTERVAL '${days}' DAY
      GROUP BY event
      ORDER BY total DESC
    `,
  },

  // ── Retention: unique actors ─────────────────────────────────────────────
  {
    id: 'unique-actors',
    title: 'Usuarios únicos (DAU/WAU/MAU)',
    description: 'Conteo DISTINCT de actorId en ventanas de 1/7/30 días',
    columns: ['window', 'unique_actors'],
    render: 'table',
    group: 'Retención',
    sql: ({ days: _days }) => `
      SELECT window, COUNT(DISTINCT index1) AS unique_actors FROM (
        SELECT index1, '1d' AS window FROM ${DATASET}
          WHERE timestamp > NOW() - INTERVAL '1' DAY
          AND index1 != '' AND index1 != 'anonymous'
        UNION ALL
        SELECT index1, '7d' FROM ${DATASET}
          WHERE timestamp > NOW() - INTERVAL '7' DAY
          AND index1 != '' AND index1 != 'anonymous'
        UNION ALL
        SELECT index1, '30d' FROM ${DATASET}
          WHERE timestamp > NOW() - INTERVAL '30' DAY
          AND index1 != '' AND index1 != 'anonymous'
      ) GROUP BY window ORDER BY window
    `,
  },

  // ── Trends ───────────────────────────────────────────────────────────────
  {
    id: 'trends',
    title: 'Tendencia diaria (un evento)',
    description: 'Clicks por día para un evento (pro_contact por defecto)',
    columns: ['day', 'count'],
    render: 'line',
    group: 'Engagement',
    sql: ({ days, event }) => `
      SELECT
        DATE(timestamp) AS day,
        SUM(_sample_interval * double1) AS count
      FROM ${DATASET}
      WHERE blob1 = ${sqlLiteral(event ?? 'pro_contact')}
        AND timestamp > NOW() - INTERVAL '${days}' DAY
      GROUP BY day
      ORDER BY day ASC
    `,
  },
  {
    id: 'trends-overlay',
    title: 'Tendencia diaria (2 eventos)',
    description: 'Comparación día a día de dos eventos sobre el mismo eje',
    columns: ['day', 'a_count', 'b_count'],
    render: 'line',
    group: 'Engagement',
    sql: ({ days, event, eventB }) => `
      SELECT
        DATE(timestamp) AS day,
        SUM(CASE WHEN blob1 = ${sqlLiteral(event ?? 'pro_contact')}
                 THEN _sample_interval * double1 ELSE 0 END) AS a_count,
        SUM(CASE WHEN blob1 = ${sqlLiteral(eventB ?? 'profile_view')}
                 THEN _sample_interval * double1 ELSE 0 END) AS b_count
      FROM ${DATASET}
      WHERE blob1 IN (${sqlLiteral(event ?? 'pro_contact')}, ${sqlLiteral(eventB ?? 'profile_view')})
        AND timestamp > NOW() - INTERVAL '${days}' DAY
      GROUP BY day
      ORDER BY day ASC
    `,
  },
  {
    id: 'hourly-heatmap',
    title: 'Mapa de calor por hora',
    description: 'Distribución horaria de un evento (UTC) — cuándo hay demanda',
    columns: ['hour', 'count'],
    render: 'bars',
    group: 'Engagement',
    sql: ({ days, event }) => `
      SELECT
        HOUR(timestamp) AS hour,
        SUM(_sample_interval * double1) AS count
      FROM ${DATASET}
      WHERE blob1 = ${sqlLiteral(event ?? 'pro_contact')}
        AND timestamp > NOW() - INTERVAL '${days}' DAY
      GROUP BY hour
      ORDER BY hour ASC
    `,
  },

  // ── Panel engagement (pro) ───────────────────────────────────────────────
  {
    id: 'panel-engagement',
    title: 'Engagement del panel profesional',
    description: 'Cómo interactúan los profesionales con su panel (perfil, disponibilidad, audios, baja)',
    columns: ['event', 'total'],
    render: 'bars',
    group: 'Engagement',
    sql: ({ days }) => `
      SELECT
        blob1 AS event,
        SUM(_sample_interval * double1) AS total
      FROM ${DATASET}
      WHERE blob1 IN (
        'panel_view',
        'availability_mode_change', 'availability_save',
        'pro_profile_save',
        'pro_avatar_upload', 'pro_avatar_remove',
        'pro_supportdoc_add', 'pro_supportdoc_remove',
        'pro_socials_save',
        'pro_audio_submit', 'pro_audio_delete',
        'panel_delete_account'
      )
        AND timestamp > NOW() - INTERVAL '${days}' DAY
      GROUP BY event
      ORDER BY total DESC
    `,
  },

  // ── Directory behavior (public) ──────────────────────────────────────────
  {
    id: 'directory-behavior',
    title: 'Comportamiento en el directorio',
    description: 'Selección de modalidad, búsquedas, filtros limpiados, paginación, vanities',
    columns: ['event', 'total'],
    render: 'bars',
    group: 'Engagement',
    sql: ({ days }) => `
      SELECT
        blob1 AS event,
        SUM(_sample_interval * double1) AS total
      FROM ${DATASET}
      WHERE blob1 IN (
        'modality_select',
        'directory_search', 'directory_clear', 'directory_page',
        'vanity_redirect'
      )
        AND timestamp > NOW() - INTERVAL '${days}' DAY
      GROUP BY event
      ORDER BY total DESC
    `,
  },

  // ── Profile engagement (public) ──────────────────────────────────────────
  {
    id: 'profile-engagement',
    title: 'Engagement con perfiles',
    description: 'Shares, clicks en redes sociales del pro, CTA profesional',
    columns: ['event', 'total'],
    render: 'bars',
    group: 'Engagement',
    sql: ({ days }) => `
      SELECT
        blob1 AS event,
        SUM(_sample_interval * double1) AS total
      FROM ${DATASET}
      WHERE blob1 IN (
        'profile_share', 'profile_social_click', 'pro_cta_click'
      )
        AND timestamp > NOW() - INTERVAL '${days}' DAY
      GROUP BY event
      ORDER BY total DESC
    `,
  },

  // ── Auth events (auth) ───────────────────────────────────────────────────
  {
    id: 'auth-events',
    title: 'Eventos de autenticación',
    description: 'Sign-in, sign-out y resets de contraseña (la cuenta se crea en el funnel de registro)',
    columns: ['event', 'total'],
    render: 'bars',
    group: 'Adquisición',
    sql: ({ days }) => `
      SELECT
        blob1 AS event,
        SUM(_sample_interval * double1) AS total
      FROM ${DATASET}
      WHERE blob1 IN (
        'auth_signin', 'auth_signout',
        'password_reset_request', 'password_reset_submit'
      )
        AND timestamp > NOW() - INTERVAL '${days}' DAY
      GROUP BY event
      ORDER BY total DESC
    `,
  },

  // ── Admin activity (admin) ───────────────────────────────────────────────
  {
    id: 'admin-activity',
    title: 'Actividad de administración',
    description: 'Acciones admin: revisión de pros, toggle servicio, revisión de audios, promociones',
    columns: ['event', 'total'],
    render: 'bars',
    group: 'Operacional',
    sql: ({ days }) => `
      SELECT
        blob1 AS event,
        SUM(_sample_interval * double1) AS total
      FROM ${DATASET}
      WHERE blob1 IN (
        'admin_pro_review', 'admin_pro_toggle_service',
        'admin_audio_review', 'admin_user_promote'
      )
        AND timestamp > NOW() - INTERVAL '${days}' DAY
      GROUP BY event
      ORDER BY total DESC
    `,
  },

  // ── Catalog overview ─────────────────────────────────────────────────────
  {
    id: 'top-events',
    title: 'Top eventos',
    description: 'Todos los eventos por número total',
    columns: ['event', 'category', 'total'],
    render: 'table',
    group: 'Operacional',
    sql: ({ days }) => `
      SELECT
        blob1 AS event,
        blob2 AS category,
        SUM(_sample_interval * double1) AS total
      FROM ${DATASET}
      WHERE timestamp > NOW() - INTERVAL '${days}' DAY
      GROUP BY event, category
      ORDER BY total DESC
    `,
  },  {
    id: 'routes',
    title: 'Top rutas',
    description: 'Dónde ocurren los eventos (top 15 rutas)',
    columns: ['route', 'events'],
    render: 'bars',
    group: 'Operacional',
    sql: ({ days }) => `
      SELECT
        blob3 AS route,
        SUM(_sample_interval * double1) AS events
      FROM ${DATASET}
      WHERE blob3 != ''
        AND timestamp > NOW() - INTERVAL '${days}' DAY
      GROUP BY route
      ORDER BY events DESC
      LIMIT 15
    `,
  },
]

export function findQuery(id: string): QueryDef | undefined {
  return QUERIES.find((q) => q.id === id)
}

/**
 * Whitelist of valid query ids — used by the worker read path to refuse
 * arbitrary SQL from the client.
 */
export const QUERY_IDS: readonly string[] = QUERIES.map((q) => q.id)

export type SqlResult = {
  data?: Array<Record<string, string | number | boolean | null>>
  errors?: { message: string }[]
  meta?: { name: string }[]
  success?: boolean
  messages?: { message: string }[]
}

/**
 * Run a SQL query against the Analytics Engine SQL REST API. Worker- and
 * Node-safe (uses global fetch). Throws on non-2xx; returns the parsed JSON
 * envelope otherwise (which can still contain `errors`).
 */
export async function runSql(
  env: AnalyticsReadEnv,
  sql: string,
): Promise<SqlResult> {
  // Cloudflare's Analytics Engine SQL API takes the raw SQL text as the body
  // (NOT a JSON {"sql":"..."} object — that yields HTTP 422 "Expected an SQL
  // statement, found: {"). See the cURL example in the SQL API docs which uses
  // `--data "SELECT ..."`.
  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${env.accountId}/analytics_engine/sql`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.token}`,
        'content-type': 'text/plain',
      },
      body: sql,
    },
  )

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`HTTP ${res.status}: ${text}`)
  }

  return (await res.json())
}

/**
 * Clamp a user-supplied days window to the valid range. Returns 7 for anything
 * non-finite / non-positive.
 */
export function clampDays(n: unknown): number {
  const v = Number(n)
  if (!Number.isFinite(v) || v <= 0) return 7
  return Math.min(Math.max(Math.floor(v), 1), 90)
}
