-- Scheduled video-call appointments table (1.25.0).
-- A row exists only once a help-seeker books a slot derived from a pro's weekly
-- availabilitySchedule (slots are computed at query time in
-- src/server/appointments.ts generateSlots; there is no separate slots table).
-- The meeting is a public meet.jit.si room with an opaque unguessable name
-- (meeting_room) — no JWT, no SDK. status: 'booked' → 'cancelled' (either party)
-- or 'completed' (set lazily on read once past endAt; no cron). Double-booking
-- is guarded by an interval-overlap SELECT in createAppointment (the cross-
-- duration real guard) PLUS the partial UNIQUE INDEX at the bottom of this
-- migration (same-interval belt-and-suspenders for the exact-duplicate race
-- the SELECT can lose under concurrency).
--
-- Note: drizzle-kit's journal was stale at this point (it only knew about
-- migrations through 0016; 0017_specialized_areas.sql and
-- 0018_verified_provides_service_idx.sql were hand-authored and not in the
-- journal). Running `db:generate` therefore re-emitted the specialized_areas /
-- specialization_mode columns and the verifiedStatus_providesService index
-- alongside this table. Those duplicates are stripped here — this migration
-- contains ONLY the appointments table + its two indexes. The journal/snapshot
-- drift is a known pre-existing condition (ponytail); do not "fix" it by
-- regenerating without first reconciling against the applied migrations list.
CREATE TABLE `appointments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`professional_id` integer NOT NULL,
	`client_user_id` text NOT NULL,
	`start_at` integer NOT NULL,
	`end_at` integer NOT NULL,
	`duration_min` integer DEFAULT 45 NOT NULL,
	`meeting_url` text NOT NULL,
	`meeting_room` text NOT NULL,
	`status` text DEFAULT 'booked' NOT NULL,
	`client_tz` text NOT NULL,
	`cancel_reason` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`professional_id`) REFERENCES `professionals`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`client_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `appointments_pro_start_idx` ON `appointments` (`professional_id`,`start_at`);--> statement-breakpoint
CREATE INDEX `appointments_client_start_idx` ON `appointments` (`client_user_id`,`start_at`);--> statement-breakpoint
-- ponytail: PARTIAL UNIQUE INDEX — same-interval guard against the exact-
-- duplicate race (two concurrent inserts with identical pro+start+end). Does
-- NOT cover cross-duration overlap (different end_at) — that is caught by the
-- interval-overlap SELECT in createAppointment. Filtered to status='booked'
-- so cancelled/completed rows don't collide; a cancelled slot at the same
-- (pro, start, end) MUST be re-bookable. SQLite supports partial unique
-- indexes natively (the WHERE
-- clause). Drizzle's uniqueIndex().where() emits this DDL.
CREATE UNIQUE INDEX `appointments_active_slot_uniq` ON `appointments` (`professional_id`,`start_at`,`end_at`) WHERE `status` = 'booked';
