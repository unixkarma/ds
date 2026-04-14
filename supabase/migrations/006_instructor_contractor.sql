-- ============================================================
-- HelixDriving — Migration 006: Instructor Contractor Model
-- Adds modality, earnings, cancellation fees, and booking limits.
-- Run this in: Supabase Dashboard → SQL Editor
-- ============================================================

-- ── Instructor contractor fields ─────────────────────────────
ALTER TABLE instructors
  ADD COLUMN IF NOT EXISTS modality TEXT NOT NULL DEFAULT 'school'
    CHECK (modality IN ('school', 'independent')),
  ADD COLUMN IF NOT EXISTS commission_rate NUMERIC(5,4) NOT NULL DEFAULT 0.10,
  ADD COLUMN IF NOT EXISTS hourly_rate_cents INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS lesson_price_cents INTEGER,
  ADD COLUMN IF NOT EXISTS uses_school_vehicle BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS vehicle_monthly_fee_cents INTEGER NOT NULL DEFAULT 0;

-- ── Lesson pricing & sales tracking ──────────────────────────
ALTER TABLE lessons
  ADD COLUMN IF NOT EXISTS sold_by TEXT NOT NULL DEFAULT 'school'
    CHECK (sold_by IN ('school', 'instructor')),
  ADD COLUMN IF NOT EXISTS price_cents INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS instructor_earning_cents INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cancelled_by TEXT
    CHECK (cancelled_by IN ('student', 'instructor', 'admin')),
  ADD COLUMN IF NOT EXISTS cancellation_fee_cents INTEGER NOT NULL DEFAULT 0;

-- ── School-level fee & booking config ────────────────────────
ALTER TABLE schools
  ADD COLUMN IF NOT EXISTS student_cancellation_fee_cents INTEGER NOT NULL DEFAULT 6000,
  ADD COLUMN IF NOT EXISTS instructor_cancellation_fee_cents INTEGER NOT NULL DEFAULT 3000,
  ADD COLUMN IF NOT EXISTS max_booking_days_ahead INTEGER NOT NULL DEFAULT 30;

-- ── Indexes for earnings queries ─────────────────────────────
CREATE INDEX IF NOT EXISTS idx_lessons_sold_by ON lessons(sold_by);
CREATE INDEX IF NOT EXISTS idx_instructors_modality ON instructors(modality);
