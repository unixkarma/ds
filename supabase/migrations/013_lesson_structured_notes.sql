-- ============================================================
-- HelixDriving - Migration 013: Structured Lesson Notes
-- Replaces single `notes` with three 150-char fields.
-- Run this in: Supabase Dashboard -> SQL Editor
-- ============================================================

ALTER TABLE lessons
  ADD COLUMN IF NOT EXISTS notes_covered TEXT NOT NULL DEFAULT ''
    CHECK (char_length(notes_covered) <= 150),
  ADD COLUMN IF NOT EXISTS notes_practice TEXT NOT NULL DEFAULT ''
    CHECK (char_length(notes_practice) <= 150),
  ADD COLUMN IF NOT EXISTS notes_additional TEXT NOT NULL DEFAULT ''
    CHECK (char_length(notes_additional) <= 150);

-- Migrate legacy `notes` column into `notes_additional`, only if it still exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'lessons'
      AND column_name = 'notes'
  ) THEN
    UPDATE lessons
      SET notes_additional = LEFT(COALESCE(notes, ''), 150)
      WHERE notes IS NOT NULL AND notes != '';

    ALTER TABLE lessons DROP COLUMN notes;
  END IF;
END$$;
