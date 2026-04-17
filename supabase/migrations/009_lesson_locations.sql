-- ============================================================
-- HelixDriving - Migration 009: Lesson Locations
-- Adds pickup and dropoff locations to lessons.
-- Run this in: Supabase Dashboard -> SQL Editor
-- ============================================================
ALTER TABLE lessons
  ADD COLUMN IF NOT EXISTS pickup_location  TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS dropoff_location TEXT NOT NULL DEFAULT '';
