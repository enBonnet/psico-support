ALTER TABLE `professionals` ADD `availability_mode` text DEFAULT 'always' NOT NULL;--> statement-breakpoint
ALTER TABLE `professionals` ADD `availability_schedule` text;--> statement-breakpoint
ALTER TABLE `professionals` ADD `timezone` text;