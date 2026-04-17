-- ============================================================
-- HelixDriving - Migration 006: Student Self-Registration
-- Adds registration_code to schools, profile fields to users,
-- and driving-school-specific fields to students.
-- Run this in: Supabase Dashboard -> SQL Editor
-- ============================================================

-- schools.registration_code
ALTER TABLE schools ADD COLUMN IF NOT EXISTS registration_code TEXT;

UPDATE schools
SET registration_code = substr(md5(random()::text), 1, 8)
WHERE registration_code IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'schools_registration_code_key'
      AND conrelid = 'schools'::regclass
  ) THEN
    ALTER TABLE schools ADD CONSTRAINT schools_registration_code_key UNIQUE (registration_code);
  END IF;
END$$;

ALTER TABLE schools ALTER COLUMN registration_code SET NOT NULL;

-- users: profile fields
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS middle_name TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS address     TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS city        TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS state       TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS zip_code    TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS gender      TEXT NOT NULL DEFAULT '';

-- students: driving-school fields
ALTER TABLE students
  ADD COLUMN IF NOT EXISTS emergency_contact_name         TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS emergency_contact_phone        TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS emergency_contact_relationship TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS road_test_status               TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS wears_glasses_contacts         TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS medical_conditions             TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS how_heard_about_us             TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS has_learners_permit            BOOLEAN,
  ADD COLUMN IF NOT EXISTS permit_number                  TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS permit_issued_date             DATE,
  ADD COLUMN IF NOT EXISTS permit_expiration_date         DATE,
  ADD COLUMN IF NOT EXISTS school_referral                BOOLEAN NOT NULL DEFAULT FALSE;

-- RLS policy: public read of schools by registration_code
DROP POLICY IF EXISTS "Anyone can read school by registration_code" ON schools;
CREATE POLICY "Anyone can read school by registration_code"
  ON schools FOR SELECT
  USING (true);
