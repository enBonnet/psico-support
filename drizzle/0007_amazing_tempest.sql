-- ponytail: DEFAULT '[]' backfills existing rows. SQLite rejects ADD COLUMN
-- ... NOT NULL with no default on a non-empty table, so the default is
-- load-bearing (mirrors how 0005 seeded population as '[]'). Editing the .sql
-- here (not the schema) is safe: drizzle compares schema↔meta snapshot, not .sql.
ALTER TABLE `professionals` ADD `focus_groups` text NOT NULL DEFAULT '[]';--> statement-breakpoint
ALTER TABLE `professionals` ADD `practice_areas` text NOT NULL DEFAULT '[]';