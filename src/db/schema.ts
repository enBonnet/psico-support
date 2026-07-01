import { relations, sql } from 'drizzle-orm'
import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core'

export const user = sqliteTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: integer('email_verified', { mode: 'boolean' })
    .default(false)
    .notNull(),
  image: text('image'),
  // ponytail: single role column on user. 'admin' gates the /admin panel
  // and professional-review actions; everyone else is 'user'. Replaces the
  // old ADMIN_EMAILS env list (which needed a redeploy to change).
  role: text('role', { enum: ['user', 'admin'] }).notNull().default('user'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' })
    .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
    .notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
    .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
    .$onUpdate(() => new Date())
    .notNull(),
})

export const session = sqliteTable(
  'session',
  {
    id: text('id').primaryKey(),
    expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
    token: text('token').notNull().unique(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
      .$onUpdate(() => new Date())
      .notNull(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
  },
  (table) => [index('session_userId_idx').on(table.userId)],
)

export const account = sqliteTable(
  'account',
  {
    id: text('id').primaryKey(),
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: integer('access_token_expires_at', {
      mode: 'timestamp_ms',
    }),
    refreshTokenExpiresAt: integer('refresh_token_expires_at', {
      mode: 'timestamp_ms',
    }),
    scope: text('scope'),
    password: text('password'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index('account_userId_idx').on(table.userId)],
)

export const verification = sqliteTable(
  'verification',
  {
    id: text('id').primaryKey(),
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index('verification_identifier_idx').on(table.identifier)],
)

export const professionals = sqliteTable(
  'professionals',
  {
    id: integer('id', { mode: 'number' }).primaryKey({ autoIncrement: true }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    // ponytail: credential capture collapsed from cédula/FPV/colegio/photo into
    // a single country-agnostic registration number at the certifying psychology
    // board, plus the board name (free text — boards vary per country). The
    // certifying country lives in credentialCountry (decoupled from residence:
    // a pro may live in Chile but hold a Venezuelan board registration).
    certificationNumber: text('certification_number').notNull(),
    certifyingSchool: text('certifying_school'),
    // ponytail: JSON array of population tags (e.g. '["Niños","Adultos"]').
    // Stored as text; filter via LIKE on the serialized string (no index —
    // LIKE-leading-wildcard can't use one anyway).
    population: text('population').notNull(),
    // ponytail: JSON array of specialized-population tags (e.g. '["Oncológica"]').
    // Orthogonal to population (age) — a pro may serve "Adultos" AND "Oncológica".
    focusGroups: text('focus_groups').notNull(),
    // ponytail: JSON array of intervention-area tags (e.g. '["Duelo","Adicciones"]').
    // Also orthogonal to population/focusGroups.
    practiceAreas: text('practice_areas').notNull(),
    modality: text('modality', {
      enum: ['in_person', 'remote', 'both'],
    }).notNull(),
    country: text('country').notNull(),
    estado: text('estado'),
    ciudad: text('ciudad'),
    credentialCountry: text('credential_country'),
    whatsappCountry: text('whatsapp_country'),
    whatsapp: text('whatsapp').notNull(),
    // ponytail: optional R2 object key for the pro's título/certificado de
    // egreso upload. Null when none attached. The object lives in the MEDIA
    // bucket under certificates/{userId}/{uuid}.{ext}.
    certificateKey: text('certificate_key'),
    // ponytail: optional R2 object key for the pro's avatar. Null when none
    // uploaded (fallback to initials on the UI). The object lives in the MEDIA
    // bucket under avatars/{professionalId}/{uuid}.{ext}. Uploaded post-signup
    // from the panel (never in registration, to keep signup frictionless).
    avatarKey: text('avatar_key'),
    // ponytail: optional social handles, entered post-signup from the panel
    // (never in registration) and shown only on the public profile. Stored as
    // bare handles (no @, no URL); the profile builds x.com/<h>,
    // instagram.com/<h>, tiktok.com/@<h>. Nullable = not provided.
    socialX: text('social_x'),
    socialInstagram: text('social_instagram'),
    socialTikTok: text('social_tiktok'),
    // ponytail: 'deleted' is the soft-delete tombstone; 'disabled' is a
    // temporary admin suspension (credential doubts — the pro was verified but
    // is paused from providing service). No migration needed for either: the
    // column is plain TEXT with no CHECK, and every public query filters
    // verifiedStatus = 'verified', so a deleted OR disabled pro auto-vanishes
    // from the directory, random pick, audio tray, and verified count. The auth
    // user row is left intact in both cases (deleted can re-register via
    // /profesional/completar, which resurrects the tombstoned row; disabled
    // keeps their row and can be reactivated by an admin).
    verifiedStatus: text('verified_status', {
      enum: ['pending', 'verified', 'rejected', 'disabled', 'deleted'],
    })
      .notNull()
      .default('pending'),
    available: integer('available', { mode: 'boolean' })
      .notNull()
      .default(false),
    // ponytail: "content creator only" flag. When false, the pro is verified
    // (so their audios appear in Voces que acompañan, which filters on
    // verifiedStatus) but is EXCLUDED from the service directory + random pick
    // + verified count + public profile — they don't take patient contacts.
    // Orthogonal to `available` (real-time on/off) and to verifiedStatus (trust):
    // a content-only pro is trusted + always "off duty" for direct service.
    // Admin-set only (no signup self-select) per product decision.
    providesService: integer('provides_service', { mode: 'boolean' })
      .notNull()
      .default(true),
    // ponytail: three-state availability (F1). 'always' = Siempre disponible
    // (always on); 'scheduled' = available during availability_schedule blocks
    // (live-derived via isActiveNow in the pro's timezone); 'inactive' = No
    // conectado (opted out). Default 'always' so the migration backfills every
    // existing pro to Siempre disponible (no one disappears at cutover) AND new
    // signups appear online once verified — both via the column DEFAULT in one
    // ALTER. The legacy `available` boolean is now dormant for display but kept
    // roughly consistent on write for safety.
    availabilityMode: text('availability_mode', {
      enum: ['always', 'scheduled', 'inactive'],
    })
      .notNull()
      .default('always'),
    // ponytail: JSON Schedule (array of {d,s,e}) — only meaningful when
    // availabilityMode='scheduled'. Null otherwise. Plain text like population.
    availabilitySchedule: text('availability_schedule'),
    // ponytail: IANA tz (e.g. 'America/Caracas') interpreting the schedule.
    // Defaulted from country on first schedule save.
    timezone: text('timezone'),
    createdAt: integer('created_at', { mode: 'timestamp' }).default(
      sql`(unixepoch())`,
    ),
  },
  (table) => [
    // ponytail: every directory query filters on verifiedStatus + modality;
    // estado/country carry the location filters; available is the ORDER BY
    // tiebreak. Cover the hot paths without over-indexing a small table.
    index('professionals_verifiedStatus_idx').on(table.verifiedStatus),
    index('professionals_estado_idx').on(table.estado),
    index('professionals_country_idx').on(table.country),
    index('professionals_available_idx').on(table.available),
  ],
)

// ponytail: "Voces que acompañan" — short supportive audio clips recorded by
// verified professionals, played back as an IG-stories-style tray. No expiry
// (option B): clips live until the pro removes/replaces them. The cap is
// enforced in app code (≤2 rows per pro where status IN pending,approved), not
// by a CHECK — SQLite CHECK can't express "count per group". The status enum
// mirrors professionals.verifiedStatus so the same review pattern applies.
// 'rejected' rows are kept for audit (don't count toward the cap; pro can
// delete them). Key prefix support-audio/ is stripped when building the public
// /media/audio/... URL (see src/server/audio-stories.ts publicAudioUrl).
export const audioStories = sqliteTable(
  'audio_stories',
  {
    id: integer('id', { mode: 'number' }).primaryKey({ autoIncrement: true }),
    professionalId: integer('professional_id')
      .notNull()
      .references(() => professionals.id, { onDelete: 'cascade' }),
    audioKey: text('audio_key').notNull(),
    // ponytail: stored for client <source> hints; the /media/audio/$ route
    // also reads contentType from R2 httpMetadata (set at upload) so playback
    // never needs a DB hit.
    mime: text('mime').notNull(),
    durationSec: integer('duration_sec').notNull(),
    title: text('title'),
    status: text('status', {
      enum: ['pending', 'approved', 'rejected'],
    })
      .notNull()
      .default('pending'),
    createdAt: integer('created_at', { mode: 'timestamp' }).default(
      sql`(unixepoch())`,
    ),
  },
  (table) => [
    // ponytail: tray query filters status='approved'; the cap-count query
    // filters by professionalId + status IN (pending, approved); the admin
    // queue filters status='pending'. One composite covers all three hot paths
    // (leading column professionalId serves the cap-count + per-pro tray
    // fetches; status as second column still lets SQLite range-scan the
    // approved/pending subsets efficiently for the admin + count queries).
    index('audio_stories_pro_status_idx').on(
      table.professionalId,
      table.status,
    ),
  ],
)

// ponytail: optional additional support documents a pro attaches alongside
// the main título/certificado de egreso (certificateKey) — extra certificates,
// board credentials, specializations, anything that speeds verification. N per
// pro (capped in app code, like audio_stories). Key prefix support-docs/ is
// stripped when building the /media/document/... URL. Viewable by the owning
// pro + admins (NOT public — personal credential docs, same trust as the main
// certificate). ON DELETE CASCADE cleans up if a pro row is hard-deleted.
export const professionalDocuments = sqliteTable(
  'professional_documents',
  {
    id: integer('id', { mode: 'number' }).primaryKey({ autoIncrement: true }),
    professionalId: integer('professional_id')
      .notNull()
      .references(() => professionals.id, { onDelete: 'cascade' }),
    // ponytail: R2 object key: support-docs/{professionalId}/{uuid}.{ext}.
    docKey: text('doc_key').notNull(),
    // ponytail: stored for client <object>/<img> hints; the /media/document/$
    // route also reads contentType from R2 httpMetadata (set at upload).
    mime: text('mime').notNull(),
    // ponytail: original filename, shown in the panel/admin list. Nullable
    // because older rows / programmatic uploads may omit it.
    name: text('name'),
    createdAt: integer('created_at', { mode: 'timestamp' }).default(
      sql`(unixepoch())`,
    ),
  },
  (table) => [
    // ponytail: the panel list + admin per-pro fetch both filter by
    // professional_id; one index covers them.
    index('professional_documents_pro_idx').on(table.professionalId),
  ],
)

// ponytail: clinical follow-up (seguimiento) entries written by a professional
// about a person who asked for support. PRIVATE to the owning pro: every query
// scopes WHERE professional_id = <my pro id> derived from the session — there is
// NO public route and NO admin route to these rows (per product decision; the
// deployer can still read D1 directly, so this is app-level privacy, not crypto).
// ON DELETE CASCADE never fires on soft-delete (verifiedStatus='deleted' keeps
// the row) but is correct if a pro row is ever hard-deleted. risk_level is a
// 3-level clinical triage (simplified Columbia/C-SSRS, none/watch/urgent);
// action_taken is a JSON array of PFA-derived tags. status/risk_level follow the
// codebase's plain-TEXT-enum pattern (no CHECK; Zod validates on write).
export const followUps = sqliteTable(
  'follow_ups',
  {
    id: integer('id', { mode: 'number' }).primaryKey({ autoIncrement: true }),
    professionalId: integer('professional_id')
      .notNull()
      .references(() => professionals.id, { onDelete: 'cascade' }),
    phone: text('phone').notNull(),
    phoneCountry: text('phone_country'),
    name: text('name'),
    reason: text('reason'),
    // ponytail: 'none' | 'watch' | 'urgent'. 'urgent' surfaces an escalation
    // reminder in the UI. Simplified triage, not the full C-SSRS — field-worker
    // scale; add structured items only if a concrete clinical need appears.
    riskLevel: text('risk_level', {
      enum: ['none', 'watch', 'urgent'],
    })
      .notNull()
      .default('none'),
    // ponytail: JSON array of PFA tags ('["Escucha activa","Derivación"]').
    // Stored as text; same pattern as professionals.population. Null = none.
    actionTaken: text('action_taken'),
    status: text('status', {
      enum: ['open', 'contacted', 'closed'],
    })
      .notNull()
      .default('open'),
    notes: text('notes'),
    // ponytail: date the pro picks to re-contact. Stored as a timestamp (ms)
    // at start-of-day; mode: 'timestamp' would lose sub-second; ms matches the
    // user/session tables. Nullable = no planned follow-up.
    nextContactAt: integer('next_contact_at', { mode: 'timestamp_ms' }),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    // ponytail: the list query is always "this pro's entries, newest first";
    // one composite on (professional_id, created_at) covers it.
    index('follow_ups_pro_created_idx').on(
      table.professionalId,
      table.createdAt,
    ),
  ],
)

export const userRelations = relations(user, ({ many }) => ({
  sessions: many(session),
  accounts: many(account),
}))

export const sessionRelations = relations(session, ({ one }) => ({
  user: one(user, { fields: [session.userId], references: [user.id] }),
}))

export const accountRelations = relations(account, ({ one }) => ({
  user: one(user, { fields: [account.userId], references: [user.id] }),
}))
