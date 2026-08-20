-- FPV verification audit tables (fpv_search_requests + fpv_raw_results).
-- Originally generated as 0018_sweet_nekra; renumbered to 0023 because
-- 0018_verified_provides_service_idx.sql already existed (the journal was
-- stale through 0016 — see the note in 0019_appointments.sql). The journal's
-- last entry is now idx 23 with the full-schema snapshot at
-- meta/0023_snapshot.json, so the next `db:generate` emits 0024_* and can
-- no longer collide with the hand-written 0017–0022 files. Never applied to
-- any D1 (local or remote) under its old name — safe to have renamed.
CREATE TABLE `fpv_search_requests` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`search_type` text NOT NULL,
	`search_value` text NOT NULL,
	`normalized_value` text NOT NULL,
	`normalized_key` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`professional_id` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`executed_at` integer,
	`error_message` text,
	FOREIGN KEY (`professional_id`) REFERENCES `professionals`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `fpv_search_requests_status_idx` ON `fpv_search_requests` (`status`);--> statement-breakpoint
CREATE INDEX `fpv_search_requests_professionalId_idx` ON `fpv_search_requests` (`professional_id`);--> statement-breakpoint
CREATE TABLE `fpv_raw_results` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`request_id` integer NOT NULL,
	`source_url` text NOT NULL,
	`raw_json` text,
	`item_count` integer DEFAULT 0 NOT NULL,
	`fetched_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`request_id`) REFERENCES `fpv_search_requests`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `fpv_raw_results_requestId_idx` ON `fpv_raw_results` (`request_id`);