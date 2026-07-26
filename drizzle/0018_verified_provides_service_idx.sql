-- Composite index for the directory's hottest predicate
-- (verified_status = 'verified' AND provides_service = 1). listProfessionals,
-- countVerifiedProfessionals, and getVerifiedProfessionalIds all hit this
-- exact pair on the public read paths. WEB-H traced to D1 backend "internal
-- error; reference = ..." on this count; covering the predicate lets SQLite
-- avoid the full scan that was making it collide with concurrent directory
-- reads under load. The existing single-column verifiedStatus index stays —
-- it still covers the SSR profile lookup and other reads that don't constrain
-- providesService. Safe to add concurrently (CREATE INDEX IF NOT EXISTS).
CREATE INDEX IF NOT EXISTS `professionals_verifiedStatus_providesService_idx`
  ON `professionals` (`verified_status`, `provides_service`);
