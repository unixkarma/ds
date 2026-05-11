-- ============================================================
-- HelixDriving - Migration 030: Student Purchases
-- Per-purchase tracking so we can activate lessons proportionally
-- to the amount actually paid:
--   amount_paid_cents = 50% of price_cents
--     => lessons_activated = floor(0.5 * total_lessons)
-- When the remaining balance gets paid, lessons_activated grows
-- and student.lessons_remaining is bumped by the delta.
--
-- - Used by all flows that involve a package (Stripe checkout,
--   manual paid_full / partial / unpaid). NOT used by custom
--   payments (no proportional logic — always paid in full).
-- - Manual ledger adjustments (charges/credits) do NOT affect
--   purchases. They only move the money balance.
-- - No backfill: existing students keep their current
--   lessons_remaining; only new sales create purchase rows.
-- Run this in: Supabase Dashboard -> SQL Editor
-- ============================================================

CREATE TABLE IF NOT EXISTS student_purchases (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id          UUID NOT NULL REFERENCES schools(id)  ON DELETE CASCADE,
  student_id         UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  package_id         UUID REFERENCES packages(id) ON DELETE SET NULL,
  package_name       TEXT   NOT NULL,           -- snapshot in case the package row is later edited/deleted
  total_lessons      INT    NOT NULL CHECK (total_lessons >= 0),
  lessons_activated  INT    NOT NULL DEFAULT 0  CHECK (lessons_activated >= 0),
  price_cents        BIGINT NOT NULL CHECK (price_cents >= 0),
  amount_paid_cents  BIGINT NOT NULL DEFAULT 0  CHECK (amount_paid_cents >= 0),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT student_purchases_lessons_activated_le_total
    CHECK (lessons_activated <= total_lessons),
  CONSTRAINT student_purchases_paid_le_price
    CHECK (amount_paid_cents <= price_cents)
);

CREATE INDEX IF NOT EXISTS student_purchases_student_idx
  ON student_purchases (student_id, created_at);

CREATE INDEX IF NOT EXISTS student_purchases_school_idx
  ON student_purchases (school_id, created_at DESC);

-- Partial index to find the oldest unpaid purchase quickly
CREATE INDEX IF NOT EXISTS student_purchases_unpaid_idx
  ON student_purchases (student_id, created_at)
  WHERE amount_paid_cents < price_cents;

-- RLS ------------------------------------------------------------
ALTER TABLE student_purchases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS student_purchases_admin_all ON student_purchases;
CREATE POLICY student_purchases_admin_all ON student_purchases
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
        AND users.role = 'admin'
        AND users.school_id = student_purchases.school_id
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
        AND users.role = 'admin'
        AND users.school_id = student_purchases.school_id
    )
  );

DROP POLICY IF EXISTS student_purchases_student_select ON student_purchases;
CREATE POLICY student_purchases_student_select ON student_purchases
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM students
      WHERE students.id = student_purchases.student_id
        AND students.user_id = auth.uid()
    )
  );
