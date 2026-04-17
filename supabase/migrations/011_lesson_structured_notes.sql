-- ============================================================
-- HelixDriving — Migration 011: Structured Lesson Notes
-- Replaces single `notes` with three 150-char fields.
-- Run this in: Supabase Dashboard → SQL Editor
-- ============================================================

-- Add new structured note columns
ALTER TABLE lessons
  ADD COLUMN IF NOT EXISTS notes_covered TEXT NOT NULL DEFAULT ''
    CHECK (char_length(notes_covered) <= 150),
  ADD COLUMN IF NOT EXISTS notes_practice TEXT NOT NULL DEFAULT ''
    CHECK (char_length(notes_practice) <= 150),
  ADD COLUMN IF NOT EXISTS notes_additional TEXT NOT NULL DEFAULT ''
    CHECK (char_length(notes_additional) <= 150);

-- Migrate existing notes data to notes_additional (truncate if over 150)
UPDATE lessons
  SET notes_additional = LEFT(COALESCE(notes, ''), 150)
  WHERE notes IS NOT NULL AND notes != '';

-- Drop the old notes column
ALTER TABLE lessons DROP COLUMN IF EXISTS notes;
