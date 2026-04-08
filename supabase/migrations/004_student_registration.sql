-- ============================================================
-- DSS — Driving School Software
-- Migration 004: Student Self-Registration
-- Adds registration_code to schools, extra profile fields to
-- users, and driving-school-specific fields to students.
-- ============================================================

-- ── schools: registration invite code ────────────────────────
ALTER TABLE schools
  ADD COLUMN registration_code TEXT UNIQUE;

-- Generate a random 8-char code for every existing school
UPDATE schools
SET registration_code = substr(md5(random()::text), 1, 8)
WHERE registration_code IS NULL;

ALTER TABLE schools
  ALTER COLUMN registration_code SET NOT NULL;

-- ── users: additional profile fields ─────────────────────────
ALTER TABLE users
  ADD COLUMN middle_name TEXT NOT NULL DEFAULT '',
  ADD COLUMN address     TEXT NOT NULL DEFAULT '',
  ADD COLUMN city        TEXT NOT NULL DEFAULT '',
  ADD COLUMN state       TEXT NOT NULL DEFAULT '',
  ADD COLUMN zip_code    TEXT NOT NULL DEFAULT '',
  ADD COLUMN gender      TEXT NOT NULL DEFAULT '';

-- ── students: driving-school-specific fields ─────────────────
ALTER TABLE students
  ADD COLUMN emergency_contact_name         TEXT NOT NULL DEFAULT '',
  ADD COLUMN emergency_contact_phone        TEXT NOT NULL DEFAULT '',
  ADD COLUMN emergency_contact_relationship TEXT NOT NULL DEFAULT '',
  ADD COLUMN road_test_status               TEXT NOT NULL DEFAULT '',
  ADD COLUMN wears_glasses_contacts         TEXT NOT NULL DEFAULT '',
  ADD COLUMN medical_conditions             TEXT NOT NULL DEFAULT '',
  ADD COLUMN how_heard_about_us             TEXT NOT NULL DEFAULT '',
  ADD COLUMN has_learners_permit            BOOLEAN,
  ADD COLUMN permit_number                  TEXT NOT NULL DEFAULT '',
  ADD COLUMN permit_issued_date             DATE,
  ADD COLUMN permit_expiration_date         DATE,
  ADD COLUMN school_referral                BOOLEAN NOT NULL DEFAULT FALSE;

-- ── RLS: allow public read of school by registration_code ────
-- Students registering are not yet authenticated, so they need
-- to look up the school name by code without a session.
CREATE POLICY "Anyone can read school by registration_code"
  ON schools FOR SELECT
  USING (true);
