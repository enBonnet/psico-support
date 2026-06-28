-- Collapse credential capture: drop cédula/rif/fpv_number/colegio_regional/
-- credential_file_r2_key (image) in favor of a single country-agnostic
-- certification number + optional certifying school name. Also add
-- `population` (JSON array of target demographics) for future filtering.
-- ponytail: SQLite can't drop many columns cleanly in place, so rebuild the
-- table (same pattern as 0002). The credential image / R2 upload is gone —
-- admins validate via the board's public registry using the number.
CREATE TABLE `professionals_new` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`certification_number` text NOT NULL,
	`certifying_school` text,
	`population` text NOT NULL,
	`modality` text NOT NULL,
	`country` text NOT NULL,
	`estado` text,
	`ciudad` text,
	`whatsapp` text NOT NULL,
	`verified_status` text DEFAULT 'pending' NOT NULL,
	`available` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (unixepoch()),
	`credential_country` text,
	`whatsapp_country` text,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
INSERT INTO `professionals_new` (
	`id`, `user_id`, `name`, `certification_number`, `certifying_school`, `population`,
	`modality`, `country`, `estado`, `ciudad`, `whatsapp`, `verified_status`, `available`,
	`created_at`, `credential_country`, `whatsapp_country`
)
SELECT
	`id`, `user_id`, `name`,
	COALESCE(NULLIF(`fpv_number`, ''), NULLIF(`cedula`, ''), '') AS `certification_number`,
	NULLIF(`colegio_regional`, '') AS `certifying_school`,
	'[]' AS `population`,
	`modality`, `country`, `estado`, `ciudad`, `whatsapp`, `verified_status`, `available`,
	`created_at`, `credential_country`, `whatsapp_country`
FROM `professionals`;
DROP TABLE `professionals`;
ALTER TABLE `professionals_new` RENAME TO `professionals`;
