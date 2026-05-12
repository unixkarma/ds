-- ============================================================
-- HelixDriving - Migration 032: Age group + Program type
-- Adds:
--   - students.age_group   ('teen' | 'adult', default 'adult')
--   - packages.program_type ('teen' | 'adult' | 'both', default 'both')
--
-- Defaults keep the existing flow working (everyone shown to everyone).
-- The student portal will filter packages by the student's age_group:
--   teen  → teen + both
--   adult → adult + both
-- Admin (e.g. RecordPaymentDialog) sees all packages but the UI warns
-- when there is a mismatch.
-- Run this in: Supabase Dashboard -> SQL Editor
-- ============================================================

-- ── students.age_group ────────────────────────────────────────
ALTER TABLE students
  ADD COLUMN IF NOT EXISTS age_group TEXT NOT NULL DEFAULT 'adult';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'students_age_group_check'
  ) THEN
    ALTER TABLE students
      ADD CONSTRAINT students_age_group_check
      CHECK (age_group IN ('teen', 'adult'));
  END IF;
END $$;

-- ── packages.program_type ─────────────────────────────────────
ALTER TABLE packages
  ADD COLUMN IF NOT EXISTS program_type TEXT NOT NULL DEFAULT 'both';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'packages_program_type_check'
  ) THEN
    ALTER TABLE packages
      ADD CONSTRAINT packages_program_type_check
      CHECK (program_type IN ('teen', 'adult', 'both'));
  END IF;
END $$;
