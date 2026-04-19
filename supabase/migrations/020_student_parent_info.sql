-- ============================================================
-- HelixDriving - Migration 020: Parent/Guardian Contact Info
--
-- Adds parent/guardian contact fields to the students table.
-- Driving schools typically require at least one parent/guardian
-- phone number to be reachable during lessons.
--
-- The CHECK constraint is added with NOT VALID so pre-existing
-- student rows (which default to empty) are grandfathered — only
-- new inserts and updates are enforced. The form and API validate
-- at the app layer as well for UX (proper error messages).
--
-- Run this in: Supabase Dashboard -> SQL Editor
-- Idempotent: safe to re-run.
-- ============================================================

ALTER TABLE students
  ADD COLUMN IF NOT EXISTS parent1_name  TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS parent1_phone TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS parent1_email TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS parent2_name  TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS parent2_phone TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS parent2_email TEXT NOT NULL DEFAULT '';

-- At least one parent phone required (new rows only).
-- NOT VALID grandfathers pre-existing rows.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'students_parent_phone_required'
  ) THEN
    ALTER TABLE students
      ADD CONSTRAINT students_parent_phone_required
      CHECK (parent1_phone <> '' OR parent2_phone <> '')
      NOT VALID;
  END IF;
END$$;
