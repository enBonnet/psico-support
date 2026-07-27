-- Add an optional per-clip description to audio_stories. Shown under the title
-- in the /apoyo viewer as a short note about what the audio is for. Nullable so
-- legacy rows stay valid; new uploads may leave it blank (the field is optional
-- in the recorder UI).
--
-- Hand-authored (NOT via drizzle-kit generate) — the journal is stale for
-- 0017-0021 (see the inline warning in drizzle/meta/_journal.json and the
-- 0021 migration comment). Matches the convention used by 0018-0021.
ALTER TABLE `audio_stories` ADD `description` text;
