-- ============================================================
-- HelixDriving - Migration 017: Database Hardening
-- Critical + important constraints that the schema was missing:
--   * Close the public-schools RLS leak (Stripe keys)
--   * Payment idempotency at DB level
--   * No negative money, no out-of-range values
--   * No double-booking at DB level (exclusion constraint)
--   * UNIQUEs for emails, license numbers, license plates, availability
--   * Missing indexes for common query paths
--
-- Run this in: Supabase Dashboard -> SQL Editor
-- Fully idempotent (safe to re-run).
--
-- NOTE: Some constraints will FAIL if legacy data violates them.
--       If a statement errors, clean the offending rows and re-run.
--       Verification queries are at the bottom as a DO-NOT-RUN block.
-- ============================================================

-- ── 1. CLOSE STRIPE KEY LEAK ─────────────────────────────────
-- Migration 006 left a "Anyone can read school by registration_code"
-- policy with USING (true). Because RLS policies are OR-combined,
-- this bypassed migration 015's admin-only restriction and exposed
-- stripe_secret_key + stripe_webhook_secret to any user (incl. anon).
DROP POLICY IF EXISTS "Anyone can read school by registration_code" ON schools;

-- ── 2. UNIQUE CONSTRAINTS ────────────────────────────────────

-- Payments: prevent duplicate credit when Stripe re-delivers a webhook
CREATE UNIQUE INDEX IF NOT EXISTS payments_stripe_pi_unique
  ON payments (stripe_payment_intent_id)
  WHERE stripe_payment_intent_id <> '';

-- Users: no duplicate emails (partial — tolerates legacy empty strings)
CREATE UNIQUE INDEX IF NOT EXISTS users_email_unique
  ON users (lower(email))
  WHERE email <> '';

-- Instructor applications: only one PENDING per email per school
CREATE UNIQUE INDEX IF NOT EXISTS instructor_applications_pending_unique
  ON instructor_applications (school_id, lower(email))
  WHERE status = 'pending';

-- Availability: exact-duplicate rows shouldn't exist
CREATE UNIQUE INDEX IF NOT EXISTS availability_unique_block
  ON availability (instructor_id, day_of_week, start_time, end_time);

-- Instructors: license number unique per school (partial to tolerate empty)
CREATE UNIQUE INDEX IF NOT EXISTS instructors_license_unique
  ON instructors (school_id, license_number)
  WHERE license_number <> '';

-- Vehicles: plate unique per school
CREATE UNIQUE INDEX IF NOT EXISTS vehicles_plate_unique
  ON vehicles (school_id, license_plate)
  WHERE license_plate <> '';

-- ── 3. CHECK CONSTRAINTS ─────────────────────────────────────
-- Wrapped in DO blocks so re-running doesn't error on existing constraints.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'lessons_duration_range') THEN
    ALTER TABLE lessons ADD CONSTRAINT lessons_duration_range
      CHECK (duration_minutes BETWEEN 15 AND 240);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'lessons_price_nonneg') THEN
    ALTER TABLE lessons ADD CONSTRAINT lessons_price_nonneg
      CHECK (price_cents >= 0);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'lessons_earning_nonneg') THEN
    ALTER TABLE lessons ADD CONSTRAINT lessons_earning_nonneg
      CHECK (instructor_earning_cents >= 0);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'lessons_cancel_fee_nonneg') THEN
    ALTER TABLE lessons ADD CONSTRAINT lessons_cancel_fee_nonneg
      CHECK (cancellation_fee_cents >= 0);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payments_amount_nonneg') THEN
    ALTER TABLE payments ADD CONSTRAINT payments_amount_nonneg
      CHECK (amount_cents >= 0);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'students_remaining_nonneg') THEN
    ALTER TABLE students ADD CONSTRAINT students_remaining_nonneg
      CHECK (lessons_remaining >= 0);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'students_purchased_nonneg') THEN
    ALTER TABLE students ADD CONSTRAINT students_purchased_nonneg
      CHECK (total_lessons_purchased >= 0);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'students_completed_nonneg') THEN
    ALTER TABLE students ADD CONSTRAINT students_completed_nonneg
      CHECK (total_lessons_completed >= 0);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'instructors_commission_range') THEN
    ALTER TABLE instructors ADD CONSTRAINT instructors_commission_range
      CHECK (commission_rate >= 0 AND commission_rate <= 1);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'instructors_hourly_nonneg') THEN
    ALTER TABLE instructors ADD CONSTRAINT instructors_hourly_nonneg
      CHECK (hourly_rate_cents >= 0);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'instructors_vehicle_fee_nonneg') THEN
    ALTER TABLE instructors ADD CONSTRAINT instructors_vehicle_fee_nonneg
      CHECK (vehicle_monthly_fee_cents >= 0);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'schools_single_lesson_nonneg') THEN
    ALTER TABLE schools ADD CONSTRAINT schools_single_lesson_nonneg
      CHECK (single_lesson_price_cents >= 0);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'schools_student_fee_nonneg') THEN
    ALTER TABLE schools ADD CONSTRAINT schools_student_fee_nonneg
      CHECK (student_cancellation_fee_cents >= 0);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'schools_instructor_fee_nonneg') THEN
    ALTER TABLE schools ADD CONSTRAINT schools_instructor_fee_nonneg
      CHECK (instructor_cancellation_fee_cents >= 0);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'schools_booking_days_range') THEN
    ALTER TABLE schools ADD CONSTRAINT schools_booking_days_range
      CHECK (max_booking_days_ahead BETWEEN 1 AND 365);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'packages_lesson_count_pos') THEN
    ALTER TABLE packages ADD CONSTRAINT packages_lesson_count_pos
      CHECK (lesson_count > 0);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'packages_price_nonneg') THEN
    ALTER TABLE packages ADD CONSTRAINT packages_price_nonneg
      CHECK (price_cents >= 0);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'vehicles_year_range') THEN
    ALTER TABLE vehicles ADD CONSTRAINT vehicles_year_range
      CHECK (year BETWEEN 1950 AND 2100);
  END IF;
END$$;

-- ── 4. EXCLUSION CONSTRAINT: no double-booking ───────────────
-- Requires btree_gist extension for UUID equality + range overlap.
-- NOTE: `timestamptz + interval` is marked STABLE in Postgres (the
--       result can depend on session TimeZone for month/year intervals).
--       Index expressions must be IMMUTABLE, so we wrap the range
--       computation in a SQL function marked IMMUTABLE. This is safe
--       because we only add minute-level intervals — the result is
--       truly deterministic regardless of timezone.
CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE OR REPLACE FUNCTION lesson_range(ts timestamptz, mins int)
RETURNS tstzrange
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
STRICT
AS $$
  SELECT tstzrange(ts, ts + (mins * interval '1 minute'))
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'lessons_no_instructor_overlap'
  ) THEN
    ALTER TABLE lessons ADD CONSTRAINT lessons_no_instructor_overlap
      EXCLUDE USING gist (
        instructor_id WITH =,
        lesson_range(scheduled_at, duration_minutes) WITH &&
      ) WHERE (status = 'scheduled');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'lessons_no_student_overlap'
  ) THEN
    ALTER TABLE lessons ADD CONSTRAINT lessons_no_student_overlap
      EXCLUDE USING gist (
        student_id WITH =,
        lesson_range(scheduled_at, duration_minutes) WITH &&
      ) WHERE (status = 'scheduled');
  END IF;
END$$;

-- ── 5. MISSING INDEXES ───────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_lessons_instructor_scheduled
  ON lessons (instructor_id, scheduled_at, status);

CREATE INDEX IF NOT EXISTS idx_lessons_student_scheduled
  ON lessons (student_id, scheduled_at);

CREATE INDEX IF NOT EXISTS idx_lessons_status
  ON lessons (status);

CREATE INDEX IF NOT EXISTS idx_payments_created_at
  ON payments (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_payments_package_id
  ON payments (package_id);

-- ── Verification (DO NOT RUN — reference only) ───────────────
/*
-- Emails duplicados (debería devolver 0 filas)
SELECT lower(email), count(*) FROM users WHERE email <> ''
GROUP BY lower(email) HAVING count(*) > 1;

-- Stripe intents duplicados
SELECT stripe_payment_intent_id, count(*) FROM payments
WHERE stripe_payment_intent_id <> ''
GROUP BY stripe_payment_intent_id HAVING count(*) > 1;

-- Overlaps existentes
SELECT a.id, b.id FROM lessons a JOIN lessons b ON
  a.instructor_id = b.instructor_id AND a.id < b.id
  AND a.status = 'scheduled' AND b.status = 'scheduled'
  AND tstzrange(a.scheduled_at, a.scheduled_at + make_interval(mins => a.duration_minutes))
      && tstzrange(b.scheduled_at, b.scheduled_at + make_interval(mins => b.duration_minutes));

-- Availability duplicada
SELECT instructor_id, day_of_week, start_time, end_time, count(*)
FROM availability GROUP BY 1,2,3,4 HAVING count(*) > 1;
*/
