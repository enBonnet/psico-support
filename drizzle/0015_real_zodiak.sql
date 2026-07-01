CREATE TABLE `professional_documents` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`professional_id` integer NOT NULL,
	`doc_key` text NOT NULL,
	`mime` text NOT NULL,
	`name` text,
	`created_at` integer DEFAULT (unixepoch()),
	FOREIGN KEY (`professional_id`) REFERENCES `professionals`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `professional_documents_pro_idx` ON `professional_documents` (`professional_id`);