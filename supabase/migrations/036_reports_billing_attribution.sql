-- ============================================================
-- DSS — Migration 036: Reports billing + sale attribution
--
-- 1. No-show fee: schools.student_no_show_fee_cents (default $60)
--    and lessons.no_show_fee_cents to record the charged amount.
-- 2. Sale attribution ("Sold by") on payments and student_purchases:
--    sold_by ('online' | 'operator' | 'instructor'), recorded_by
--    (the admin/operator user) and sold_by_instructor_id.
--
-- All additive / idempotent. Existing rows keep sold_by = NULL
-- (rendered as "—" in reports).
-- Run this in: Supabase Dashboard -> SQL Editor
-- ============================================================

-- ── No-show fee ─────────────────────────────────────────────
ALTER TABLE schools
  ADD COLUMN IF NOT EXISTS student_no_show_fee_cents INTEGER NOT NULL DEFAULT 6000;

ALTER TABLE lessons
  ADD COLUMN IF NOT EXISTS no_show_fee_cents INTEGER NOT NULL DEFAULT 0;

-- ── Sale attribution: payments ──────────────────────────────
ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS sold_by TEXT
    CHECK (sold_by IN ('online', 'operator', 'instructor')),
  ADD COLUMN IF NOT EXISTS recorded_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS sold_by_instructor_id UUID REFERENCES instructors(id) ON DELETE SET NULL;

-- ── Sale attribution: student_purchases ─────────────────────
ALTER TABLE student_purchases
  ADD COLUMN IF NOT EXISTS sold_by TEXT
    CHECK (sold_by IN ('online', 'operator', 'instructor')),
  ADD COLUMN IF NOT EXISTS recorded_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS sold_by_instructor_id UUID REFERENCES instructors(id) ON DELETE SET NULL;
