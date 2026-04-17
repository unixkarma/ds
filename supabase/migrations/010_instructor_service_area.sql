-- ============================================================
-- HelixDriving — Migration 010: Instructor Service Area
-- Adds service_area to instructors and instructor_applications.
-- Run this in: Supabase Dashboard → SQL Editor
-- ============================================================

ALTER TABLE instructors
  ADD COLUMN IF NOT EXISTS service_area TEXT NOT NULL DEFAULT '';

ALTER TABLE instructor_applications
  ADD COLUMN IF NOT EXISTS service_area TEXT NOT NULL DEFAULT '';
