import { relations, sql } from 'drizzle-orm'
import { sqliteTable, text, integer, index, uniqueIndex } from 'drizzle-orm/sqlite-core'

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
    // ponytail: JSON array of sensitive specialized-area tags (e.g.
    // '["Suicidio","Duelo"]'). Orthogonal to the general axes — these are
    // areas where the help-seeker's need is delicate enough that we don't
    // surface every pro who holds them in the default directory browse.
    // See `specializationMode` for the visibility control.
    specializedAreas: text('specialized_areas').notNull().default('[]'),
    // ponytail: 'inclusive' = appear in the general directory browse AND when
    // a specialized-area filter is applied (default — preserves current
    // visibility for migrated pros). 'exclusive' = hidden from default browse
    // and from the "Necesito ayuda ahora" random pick; surfaces ONLY when a
    // help-seeker filters by one of this pro's specialized areas (the
    // /ayuda/especifica triage path). Plain TEXT enum (no CHECK; Zod validates).
    specializationMode: text('specialization_mode')
      .notNull()
      .default('inclusive'),
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
    // ponytail: denormalized contact counter for weighted-random pick. Bumped
    // from pickRandomProfessional after a successful pick (server-controlled
    // proId — NOT bumped from the auth-free track() server fn, which would let
    // any client poison any pro's count; see Copilot PR #29). Counts
    // SYSTEM-mediated picks only (random button, landing help-now CTA, /ahora
    // share-link) — NOT direct WhatsApp clicks from directory/profile cards,
    // because those reflect user preference, not load the system imposed, and
    // so shouldn't depress that pro's chance of being picked randomly.
    // Best-effort: a missed bump only slightly skews weights (gotcha #10).
    // Ceiling note: never reset, so a long-tenured pro with no recent contacts
    // slowly drifts back toward equal weight with new pros (weight =
    // 1/(count+1); if that becomes unfair in practice, switch to a recency
    // window).
    contactCount: integer('contact_count', { mode: 'number' })
      .notNull()
      .default(0),
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
    // ponytail: JSON array of offered appointment durations in minutes
    // (e.g. '[15,45]'). Default '[45]' (not '[]') so existing pros and new
    // signups offer 45-min sessions out of the box — no backfill, no migration
    // data step. Only meaningful when availabilityMode='scheduled'; the pro
    // picks the set in /profesional/disponibilidad. Allowed values are
    // constrained to {15,30,45,60} via Zod on write (APPOINTMENT_DURATION_OPTIONS
    // in src/server/professionals.ts) — no CHECK constraint, matching every
    // other JSON-array/status column in this schema. parseAppointmentDurations
    // drops invalid values and defaults to [45] on empty/garbage.
    appointmentDurations: text('appointment_durations').notNull().default('[45]'),
    createdAt: integer('created_at', { mode: 'timestamp' }).default(
      sql`(unixepoch())`,
    ),
  },
  (table) => [
    // ponytail: every directory query filters on verifiedStatus + modality;
    // estado/country carry the location filters; available is the ORDER BY
    // tiebreak. Cover the hot paths without over-indexing a small table.
    index('professionals_verifiedStatus_idx').on(table.verifiedStatus),
    // Composite covering the directory's most common predicate
    // (verifiedStatus='verified' AND provides_service=1) — listProfessionals,
    // countVerifiedProfessionals, getVerifiedProfessionalIds all hit this.
    // The single-column verifiedStatus index above covers SSR profile lookup
    // and other reads that don't constrain providesService. Added after WEB-H:
    // the count query was triggering D1 backend timeouts under load without it.
    index('professionals_verifiedStatus_providesService_idx').on(
      table.verifiedStatus,
      table.providesService,
    ),
    index('professionals_estado_idx').on(table.estado),
    index('professionals_country_idx').on(table.country),
    index('professionals_available_idx').on(table.available),
  ],
)

// ponytail: "Voces que acompañan" — short supportive audio clips recorded by
// verified professionals, played back as an IG-stories-style tray grouped by
// category. No expiry (option B): clips live until the pro removes/replaces
// them. There is no per-pro cap (the earlier ≤2 limit was lifted when
// categories landed); admin review is the only gate. The status enum mirrors
// professionals.verifiedStatus so the same review pattern applies. 'rejected'
// rows are kept for audit (pro can delete them). categoryId points at
// audio_categories (nullable so the column could be added without backfilling
// legacy rows; new uploads pick an active category, and legacy/uncategorized
// clips fall into an "Otros audios" bucket on the tray). ON DELETE SET NULL
// means retiring+deleting a category never strands or deletes clips.
// Key prefix support-audio/ is stripped when building the public
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
    // ponytail: optional per-clip description shown under the title in the
    // /apoyo viewer (a short note about what the audio is for). Nullable so the
    // migration could add it without backfilling; legacy rows stay valid.
    description: text('description'),
    status: text('status', {
      enum: ['pending', 'approved', 'rejected'],
    })
      .notNull()
      .default('pending'),
    // ponytail: nullable FK → audio_categories. Nullable so legacy rows (added
    // before categories) keep working; new uploads always pick an active one.
    // ON DELETE SET NULL so deleting a category never strands/deletes clips.
    categoryId: integer('category_id').references(() => audioCategories.id, {
      onDelete: 'set null',
    }),
    createdAt: integer('created_at', { mode: 'timestamp' }).default(
      sql`(unixepoch())`,
    ),
  },
  (table) => [
    // ponytail: tray query filters status='approved'; the admin queue filters
    // status='pending'; the per-pro self-list filters by professionalId. One
    // composite (leading column professionalId) covers the per-pro fetches;
    // status as second column lets SQLite range-scan approved/pending subsets.
    index('audio_stories_pro_status_idx').on(
      table.professionalId,
      table.status,
    ),
    // ponytail: public tray groups clips by category; this index serves the
    // "all approved clips in category X" range scan + the delete-guard count.
    index('audio_stories_category_idx').on(table.categoryId),
  ],
)

// ponytail: "Voces que acompañan" categories — admin-managed lookup table that
// groups audio clips on the public tray (each clip belongs to exactly one
// category via audio_stories.category_id). slug is the stable URL/analytics id
// (never reused); title + description are user-facing Spanish copy shown as the
// section header + subtitle on /apoyo. active=false retires a category: it
// stops being offered on new uploads and the public tray hides its section,
// but existing clips keep their FK (the public tray still joins by id, so a
// retired-but-not-deleted category's clips stay grouped under their title).
// sortOrder sets the public-page section order (smaller = higher up; seeded
// categories get explicit order, admin-added ones default to 1000 → bottom).
// Kept as a table (not a code const) so admins can edit copy + add categories
// live without a deploy. Seed rows are inserted by 0021_audio_categories.sql.
export const audioCategories = sqliteTable(
  'audio_categories',
  {
    id: integer('id', { mode: 'number' }).primaryKey({ autoIncrement: true }),
    // ponytail: stable id used in analytics params; lowercase, kebab-case,
    // derived from title on create if not supplied. Unique so two categories
    // can't share a slug.
    slug: text('slug').notNull(),
    title: text('title').notNull(),
    description: text('description').notNull(),
    sortOrder: integer('sort_order').notNull().default(1000),
    active: integer('active', { mode: 'boolean' }).notNull().default(true),
    createdAt: integer('created_at', { mode: 'timestamp' }).default(
      sql`(unixepoch())`,
    ),
  },
  (table) => [
    uniqueIndex('audio_categories_slug_idx').on(table.slug),
    // ponytail: public list reads WHERE active=1 ORDER BY sort_order; this
    // index serves both the filter and the sort in one range scan.
    index('audio_categories_active_sort_idx').on(
      table.active,
      table.sortOrder,
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

// ponytail: scheduled video-call appointments between a logged-in help-seeker
// (clientUserId → user.id) and a professional (professionalId → professionals.id).
// Derived from the pro's weekly availabilitySchedule (see src/server/appointments.ts
// generateSlots); there is no separate "slots" table — slots are computed at query
// time and this row only exists once a slot is booked. The meeting is a public
// meet.jit.si room with an opaque unguessable name (meetingRoom); no JWT, no SDK.
// status: 'booked' = upcoming/active; 'cancelled' = either party cancelled (slot
// becomes re-bookable); 'completed' = past its endAt (set lazily on read, no cron).
// ON DELETE CASCADE on both FKs — if a user or pro row is hard-deleted, their
// appointments go too (soft-delete of a pro leaves the row intact). Double-booking
// is guarded by an interval-overlap SELECT in createAppointment (the cross-
// duration real guard) PLUS a partial UNIQUE INDEX on exact (pro, start, end)
// for the rare exact-duplicate race the SELECT can lose under concurrency.
// Plain-TEXT enums (no CHECK; Zod
// validates on write), matching every other status column in this schema.
export const appointments = sqliteTable(
  'appointments',
  {
    id: integer('id', { mode: 'number' }).primaryKey({ autoIncrement: true }),
    professionalId: integer('professional_id')
      .notNull()
      .references(() => professionals.id, { onDelete: 'cascade' }),
    // ponytail: the booking client (a standard user account, NOT a professional).
    // Required — anonymous visitors use the instant WhatsApp path; scheduled
    // video calls need an attributable account so we can email both parties and
    // give the client a self-service "Mis sesiones" list.
    clientUserId: text('client_user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    // ponytail: UTC ms (timestamp_ms) — matches user/session/follow_ups convention.
    // Stored in UTC; rendered in each participant's tz via Intl.DateTimeFormat.
    startAt: integer('start_at', { mode: 'timestamp_ms' }).notNull(),
    endAt: integer('end_at', { mode: 'timestamp_ms' }).notNull(),
    // ponytail: denormalized meeting length in minutes (default 45). Redundant
    // with endAt-startAt but convenient for display + analytics. Ceiling: if
    // per-pro configurable duration is added, this becomes the source of truth.
    durationMin: integer('duration_min').notNull().default(45),
    meetingUrl: text('meeting_url').notNull(),
    // ponytail: the bare room name (e.g. 'psico-<uuid>'), kept separately from
    // meetingUrl for reference/auditing. The full URL is reconstructed if needed.
    meetingRoom: text('meeting_room').notNull(),
    status: text('status', {
      enum: ['booked', 'cancelled', 'completed'],
    })
      .notNull()
      .default('booked'),
    // ponytail: IANA tz of the CLIENT at booking time, so the client's "Mis
    // sesiones" list renders in their tz even if the pro is in another country.
    // The pro's tz comes from professionals.timezone.
    clientTz: text('client_tz').notNull(),
    cancelReason: text('cancel_reason'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    // ponytail: covers the pro's upcoming list, the double-book pre-check
    // (WHERE professional_id=? AND status='booked' AND start_at < ? AND end_at > ?),
    // and the per-pro "Mis sesiones" query — all leading on professional_id with
    // a start_at range/predicate.
    index('appointments_pro_start_idx').on(table.professionalId, table.startAt),
    // ponytail: the client's "Mis sesiones" list (WHERE client_user_id=? ORDER BY
    // start_at). Separate from the pro index because the leading column differs.
    index('appointments_client_start_idx').on(
      table.clientUserId,
      table.startAt,
    ),
    // ponytail: PARTIAL UNIQUE INDEX — a SAME-INTERVAL guard against the exact-
    // duplicate race (two concurrent inserts with identical pro+start+end). It
    // does NOT cover cross-duration overlap (a 15-min and a 45-min slot
    // starting at 9:00 have different end_at, so both pass this index) — that
    // is caught by the interval-overlap SELECT in createAppointment. Think of
    // this index as belt-and-suspenders for the rare exact-dup case the SELECT
    // can lose under concurrency. Filtered to status='booked' so cancelled/
    // completed rows don't collide — a cancelled slot at the same (pro, start,
    // end) MUST be re-bookable. SQLite supports partial unique indexes natively.
    uniqueIndex('appointments_active_slot_uniq')
      .on(table.professionalId, table.startAt, table.endAt)
      .where(sql`status = 'booked'`),
  ],
)

// ponytail: FPV verification audit trail. Every search the scraping script
// runs against the FPV public API is logged here, regardless of outcome.
// This gives us full traceability: what was searched, when, with what criteria,
// and what the API returned. The script reads professionals with
// verifiedStatus='pending' and creates a row here before hitting the API.
export const fpvSearchRequests = sqliteTable(
  'fpv_search_requests',
  {
    id: integer('id', { mode: 'number' }).primaryKey({ autoIncrement: true }),
    // 'name' or 'fpv' — matches the normalizer output type
    searchType: text('search_type', { enum: ['name', 'fpv'] }).notNull(),
    // The raw input from the user/registration (e.g. "FPV-5338" or "díaz rivera")
    searchValue: text('search_value').notNull(),
    // The normalized input (e.g. "5338" or "Díaz Rivera | Jusagnny América")
    normalizedValue: text('normalized_value').notNull(),
    // The comparison key (no accents, lowercase) for deduplication
    normalizedKey: text('normalized_key').notNull(),
    // 'pending' = created but not executed; 'success' = exact match found;
    // 'ambiguous' = multiple matches (homónimos); 'empty' = no match;
    // 'error' = API or network failure
    status: text('status', {
      enum: ['pending', 'success', 'ambiguous', 'empty', 'error'],
    })
      .notNull()
      .default('pending'),
    // If status='success', link to the verified professional
    professionalId: integer('professional_id').references(() => professionals.id, {
      onDelete: 'set null',
    }),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .default(sql`(unixepoch())`)
      .notNull(),
    executedAt: integer('executed_at', { mode: 'timestamp' }),
    errorMessage: text('error_message'),
  },
  (table) => [
    index('fpv_search_requests_status_idx').on(table.status),
    index('fpv_search_requests_professionalId_idx').on(table.professionalId),
  ],
)

// ponytail: Raw API response storage. Stores the redacted JSON returned by
// the FPV API for each search request. Cédula/tipoDocumento/id are already
// null-ed out by the client (redactSensitive) BEFORE reaching this table, so
// no sensitive data is ever persisted. Kept as text (JSON string) because
// SQLite has no native JSON type and we only need it for audit/debugging.
export const fpvRawResults = sqliteTable(
  'fpv_raw_results',
  {
    id: integer('id', { mode: 'number' }).primaryKey({ autoIncrement: true }),
    requestId: integer('request_id')
      .notNull()
      .references(() => fpvSearchRequests.id, { onDelete: 'cascade' }),
    sourceUrl: text('source_url').notNull(),
    // The redacted JSON response, stringified
    rawJson: text('raw_json'),
    itemCount: integer('item_count').notNull().default(0),
    fetchedAt: integer('fetched_at', { mode: 'timestamp' })
      .default(sql`(unixepoch())`)
      .notNull(),
  },
  (table) => [index('fpv_raw_results_requestId_idx').on(table.requestId)],
)

export const userRelations = relations(user, ({ many }) => ({
  sessions: many(session),
  accounts: many(account),
  // ponytail: a user may be the client side of many appointments. (There is still
  // NO user→professionals relation — that link is one-way via professionals.userId
  // and resolved manually in server fns; adding it here would not change that.)
  appointmentsAsClient: many(appointments),
}))

export const sessionRelations = relations(session, ({ one }) => ({
  user: one(user, { fields: [session.userId], references: [user.id] }),
}))

export const accountRelations = relations(account, ({ one }) => ({
  user: one(user, { fields: [account.userId], references: [user.id] }),
}))

export const professionalsRelations = relations(professionals, ({ many }) => ({
  // ponytail: back-relations for the pro side of appointments and the existing
  // media/follow-up tables (declared here for the first time — they were omitted
  // originally because relational queries weren't used for those tables).
  appointments: many(appointments),
  audioStories: many(audioStories),
  professionalDocuments: many(professionalDocuments),
  followUps: many(followUps),
}))

export const appointmentsRelations = relations(appointments, ({ one }) => ({
  professional: one(professionals, {
    fields: [appointments.professionalId],
    references: [professionals.id],
  }),
  client: one(user, {
    fields: [appointments.clientUserId],
    references: [user.id],
  }),
}))

export const fpvSearchRequestsRelations = relations(
  fpvSearchRequests,
  ({ one, many }) => ({
    professional: one(professionals, {
      fields: [fpvSearchRequests.professionalId],
      references: [professionals.id],
    }),
    rawResults: many(fpvRawResults),
  }),
)

export const fpvRawResultsRelations = relations(fpvRawResults, ({ one }) => ({
  request: one(fpvSearchRequests, {
    fields: [fpvRawResults.requestId],
    references: [fpvSearchRequests.id],
  }),
}))

