-- ============================================================
-- HelixDriving - Migration 045: Lesson type (Regular vs Road Test)
--
-- Feedback: no way to book a Road Test — every lesson looked the same as
-- a regular BTW lesson. Adds lesson_type so the Book a Lesson dialog can
-- distinguish them, and lesson lists/reports can show which is which.
-- Run this in: Supabase Dashboard -> SQL Editor
-- ============================================================

ALTER TABLE lessons
  ADD COLUMN IF NOT EXISTS lesson_type TEXT NOT NULL DEFAULT 'regular'
    CHECK (lesson_type IN ('regular', 'road_test'));
