-- Add the 4th specialization axis: sensitive "áreas específicas" (JSON array
-- of tags like '["Suicidio","Duelo"]') plus a per-pro participation mode.
-- Both columns have safe defaults so existing rows become inclusive with an
-- empty specialized set — no row disappears, no row leaks. The tag-overlap
-- backfill (Cuidadores/Neurodivergentes/Oncológica out of focus_groups, Duelo
-- out of practice_areas, into specialized_areas) is a separate one-off script
-- (scripts/migrate-specialized-areas.ts) run after this migration applies.
ALTER TABLE `professionals` ADD `specialized_areas` text DEFAULT '[]' NOT NULL;
ALTER TABLE `professionals` ADD `specialization_mode` text DEFAULT 'inclusive' NOT NULL;
