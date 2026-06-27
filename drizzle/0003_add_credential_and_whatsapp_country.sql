-- Decouple credential country and whatsapp country from location country.
-- ponytail: both new columns are nullable, so SQLite supports ADD COLUMN
-- without a table rebuild. credential_country drives whether cedula/fpv/
-- colegio are required (Venezuela) — independent of where the professional
-- lives (country). whatsapp_country stores the dial-code country selected
-- for WhatsApp formatting.
ALTER TABLE `professionals` ADD COLUMN `credential_country` text;
ALTER TABLE `professionals` ADD COLUMN `whatsapp_country` text;