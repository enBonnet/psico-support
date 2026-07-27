-- Audio categories: admin-managed lookup table for "Voces que acompañan", plus
-- a nullable FK on audio_stories. This lifts the earlier per-pro audio cap
-- (≤2) entirely; admin review stays the only gate. category_id is nullable so
-- legacy rows keep working — new uploads always pick an active category, and
-- uncategorized clips fall into an "Otros audios" bucket on the public tray.
-- ON DELETE SET NULL means deleting a category never strands or deletes clips.
--
-- Hand-authored (NOT via drizzle-kit generate) because drizzle/meta/_journal.json
-- is already stale for migrations 0018-0020 (see the inline warning there) —
-- regenerating would mis-number against the applied-remote state. Matches the
-- convention used by 0018/0019/0020.
CREATE TABLE `audio_categories` (
  `id` integer PRIMARY KEY AUTOINCREMENT,
  `slug` text NOT NULL,
  `title` text NOT NULL,
  `description` text NOT NULL,
  `sort_order` integer NOT NULL DEFAULT 1000,
  `active` integer NOT NULL DEFAULT 1,
  `created_at` integer DEFAULT (unixepoch())
);
CREATE UNIQUE INDEX `audio_categories_slug_idx` ON `audio_categories`(`slug`);
CREATE INDEX `audio_categories_active_sort_idx` ON `audio_categories`(`active`, `sort_order`);
ALTER TABLE `audio_stories` ADD `category_id` integer REFERENCES `audio_categories`(`id`) ON DELETE SET NULL;
CREATE INDEX `audio_stories_category_idx` ON `audio_stories`(`category_id`);

-- Seed the curated default category set. This is the first INSERT-seed
-- migration in the repo; it's intentional here because these are reference
-- (lookup) rows the app reads at runtime — a code const would defeat the
-- "admins edit live" goal of moving categories into the DB. sort_order keeps
-- the intended public-page order (children + tales lead, since they're the
-- broadest appeal). Add/reorder from the admin UI after this lands.
INSERT INTO `audio_categories` (`slug`, `title`, `description`, `sort_order`) VALUES
  ('para-ninos',  'Para niños',              'Cuentos y palabras suaves para acompañar a los más pequeños.',          10),
  ('cuentos',     'Cuentos',                 'Relatos breves para desconectar y descansar la mente.',                20),
  ('respiracion', 'Respira conmigo',         'Ejercicios de respiración para calmarte cuando la ansiedad sube.',     30),
  ('dormir',      'Para dormir mejor',       'Voces suaves para soltar el día y descansar.',                         40),
  ('animo',       'Un poquito de ánimo',     'Palabras para los días bajos; un pequeño empujón.',                    50),
  ('crisis',      'Estoy en crisis ahora',   'Acompañamiento breve para momentos de mucha intensidad.',              60),
  ('soledad',     'Cuando la soledad pesa',  'Recordatorios de que alguien está ahí contigo.',                       70);
