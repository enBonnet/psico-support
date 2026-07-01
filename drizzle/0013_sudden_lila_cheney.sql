CREATE TABLE `follow_ups` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`professional_id` integer NOT NULL,
	`phone` text NOT NULL,
	`phone_country` text,
	`name` text,
	`reason` text,
	`risk_level` text DEFAULT 'none' NOT NULL,
	`action_taken` text,
	`status` text DEFAULT 'open' NOT NULL,
	`notes` text,
	`next_contact_at` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`professional_id`) REFERENCES `professionals`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `follow_ups_pro_created_idx` ON `follow_ups` (`professional_id`,`created_at`);