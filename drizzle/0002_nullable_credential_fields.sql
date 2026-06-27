-- Make cedula/rif/fpv_number/colegio_regional nullable so foreign
-- psychologists (outside Venezuela) can register without them.
-- ponytail: SQLite can't ALTER COLUMN to drop NOT NULL, so we rebuild
-- the table. rif is kept (nullable) for possible future use but no
-- longer collected in the form.
CREATE TABLE `professionals_new` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`cedula` text,
	`rif` text,
	`fpv_number` text,
	`colegio_regional` text,
	`credential_file_r2_key` text NOT NULL,
	`modality` text NOT NULL,
	`country` text NOT NULL,
	`estado` text,
	`ciudad` text,
	`whatsapp` text NOT NULL,
	`verified_status` text DEFAULT 'pending' NOT NULL,
	`available` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (unixepoch()),
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
INSERT INTO `professionals_new` (`id`, `user_id`, `name`, `cedula`, `rif`, `fpv_number`, `colegio_regional`, `credential_file_r2_key`, `modality`, `country`, `estado`, `ciudad`, `whatsapp`, `verified_status`, `available`, `created_at`)
SELECT `id`, `user_id`, `name`, `cedula`, `rif`, `fpv_number`, `colegio_regional`, `credential_file_r2_key`, `modality`, `country`, `estado`, `ciudad`, `whatsapp`, `verified_status`, `available`, `created_at` FROM `professionals`;
DROP TABLE `professionals`;
ALTER TABLE `professionals_new` RENAME TO `professionals`;