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
