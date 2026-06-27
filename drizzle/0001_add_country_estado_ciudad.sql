-- Add country/estado/ciudad to professionals.
-- ponytail: SQLite can't DROP COLUMN portably; we keep the old `region`
-- column (now unused) and add the new ones. estado/ciudad are nullable
-- because psychologists outside Venezuela don't have them.
ALTER TABLE `professionals` ADD COLUMN `country` text NOT NULL DEFAULT 'Venezuela';
ALTER TABLE `professionals` ADD COLUMN `estado` text;
ALTER TABLE `professionals` ADD COLUMN `ciudad` text;
-- Backfill estado from the old region for existing rows.
UPDATE `professionals` SET `estado` = `region` WHERE `region` IS NOT NULL;