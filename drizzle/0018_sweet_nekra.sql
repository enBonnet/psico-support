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