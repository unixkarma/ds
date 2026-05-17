-- ============================================================
-- HelixDriving — Migration 034: Package Requirements
-- Adds a `requirements` TEXT field to `packages` so admins can
-- attach important information (documents to bring, age limits,
-- medical clearances, etc.) to a package. The student sees this
-- in the portal before buying, and receives it in the purchase
-- confirmation email.
--
-- Snapshotted onto `student_purchases.requirements` at sale time
-- so historical purchases remember what was promised even if the
-- package is later edited.
--
-- Idempotent. Run in: Supabase Dashboard -> SQL Editor
-- ============================================================

-- ── packages ──────────────────────────────────────────────────
ALTER TABLE packages
  ADD COLUMN IF NOT EXISTS requirements TEXT;

-- ── student_purchases ─────────────────────────────────────────
ALTER TABLE student_purchases
  ADD COLUMN IF NOT EXISTS requirements TEXT;
