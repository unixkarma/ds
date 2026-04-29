-- ============================================================
-- HelixDriving - Migration 024: Recreate schools_public view with timezone
-- The schools_public view (originally created in migration 015) is the
-- safe projection of `schools` for non-admin code paths (student/instructor
-- portals, public registration/apply pages). It excludes Stripe secrets.
--
-- Migration 022 added a `timezone` column to `schools` but did not touch
-- the view, so non-admin code can't see it yet. This migration recreates
-- the view to expose `timezone` plus all previously safe columns.
--
-- Run this in: Supabase Dashboard -> SQL Editor
-- ============================================================

DROP VIEW IF EXISTS schools_public;

CREATE VIEW schools_public AS
SELECT
  id,
  name,
  email,
  phone,
  address,
  registration_code,
  timezone,
  stripe_publishable_key,                 -- safe: publishable keys are public by design
  single_lesson_price_cents,
  student_cancellation_fee_cents,
  instructor_cancellation_fee_cents,
  max_booking_days_ahead,
  created_at
FROM schools;

-- Allow authenticated clients (student/instructor portals + public pages with anon key)
-- to read the safe projection. Stripe secrets stay locked behind the table-level RLS
-- from migration 015 (admin-only).
GRANT SELECT ON schools_public TO authenticated, anon;
