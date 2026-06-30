CREATE TABLE `audio_stories` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`professional_id` integer NOT NULL,
	`audio_key` text NOT NULL,
	`mime` text NOT NULL,
	`duration_sec` integer NOT NULL,
	`title` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_at` integer DEFAULT (unixepoch()),
	FOREIGN KEY (`professional_id`) REFERENCES `professionals`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `audio_stories_pro_status_idx` ON `audio_stories` (`professional_id`,`status`);