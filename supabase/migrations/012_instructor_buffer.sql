-- ============================================================
-- HelixDriving — Migration 012: Instructor Buffer Between Lessons
-- Adds configurable travel/buffer time between consecutive lessons.
-- Run this in: Supabase Dashboard → SQL Editor
-- ============================================================

ALTER TABLE instructors
  ADD COLUMN IF NOT EXISTS buffer_minutes INTEGER NOT NULL DEFAULT 0
    CHECK (buffer_minutes >= 0 AND buffer_minutes <= 60);
