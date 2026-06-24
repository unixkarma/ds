-- ============================================================
-- DSS — Migration 038: Payroll extras
-- 1) Status timestamps on lessons (completed/cancelled/no_show)
-- 2) instructor_assignments  — paid activities (hourly)
-- 3) instructor_deductions   — insurance / company expenses
-- 4) instructor_reimbursements — expense reimbursements w/ evidence
-- 5) Private storage bucket "reimbursement-evidence"
-- Run this in: Supabase Dashboard -> SQL Editor
-- ============================================================

-- ── 1) Lesson status timestamps ──────────────────────────────
ALTER TABLE lessons
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS no_show_at   TIMESTAMPTZ;

-- Backfill historical rows. We never tracked the real transition time,
-- so approximate with scheduled_at (the lesson's own day/time).
UPDATE lessons SET completed_at = scheduled_at WHERE status = 'completed' AND completed_at IS NULL;
UPDATE lessons SET cancelled_at = scheduled_at WHERE status = 'cancelled' AND cancelled_at IS NULL;
UPDATE lessons SET no_show_at   = scheduled_at WHERE status = 'no_show'   AND no_show_at   IS NULL;

-- ── 2) Instructor assignments ────────────────────────────────
CREATE TABLE IF NOT EXISTS instructor_assignments (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id        UUID NOT NULL REFERENCES schools(id)     ON DELETE CASCADE,
  instructor_id    UUID NOT NULL REFERENCES instructors(id) ON DELETE CASCADE,
  scheduled_at     TIMESTAMPTZ NOT NULL,            -- date + time of the activity
  duration_minutes INT  NOT NULL CHECK (duration_minutes > 0),
  detail           TEXT NOT NULL DEFAULT '',
  status           TEXT NOT NULL DEFAULT 'scheduled'
    CHECK (status IN ('scheduled', 'completed', 'cancelled')),
  earning_cents    INT  NOT NULL DEFAULT 0 CHECK (earning_cents >= 0),
  created_by       UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS instructor_assignments_instructor_idx
  ON instructor_assignments (instructor_id, scheduled_at);
CREATE INDEX IF NOT EXISTS instructor_assignments_school_idx
  ON instructor_assignments (school_id, scheduled_at);

ALTER TABLE instructor_assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS instructor_assignments_admin_all ON instructor_assignments;
CREATE POLICY instructor_assignments_admin_all ON instructor_assignments
  FOR ALL
  USING (school_id = get_my_school_id() AND is_admin())
  WITH CHECK (school_id = get_my_school_id() AND is_admin());

DROP POLICY IF EXISTS instructor_assignments_instructor_select ON instructor_assignments;
CREATE POLICY instructor_assignments_instructor_select ON instructor_assignments
  FOR SELECT
  USING (
    instructor_id IN (SELECT id FROM instructors WHERE user_id = auth.uid())
  );

-- ── 3) Instructor deductions ─────────────────────────────────
CREATE TABLE IF NOT EXISTS instructor_deductions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id     UUID NOT NULL REFERENCES schools(id)     ON DELETE CASCADE,
  instructor_id UUID NOT NULL REFERENCES instructors(id) ON DELETE CASCADE,
  date          DATE NOT NULL,
  type          TEXT NOT NULL DEFAULT 'other'
    CHECK (type IN ('car_insurance', 'personal_insurance', 'other')),
  amount_cents  INT  NOT NULL CHECK (amount_cents >= 0),
  detail        TEXT NOT NULL DEFAULT '',
  created_by    UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS instructor_deductions_instructor_idx
  ON instructor_deductions (instructor_id, date);
CREATE INDEX IF NOT EXISTS instructor_deductions_school_idx
  ON instructor_deductions (school_id, date);

ALTER TABLE instructor_deductions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS instructor_deductions_admin_all ON instructor_deductions;
CREATE POLICY instructor_deductions_admin_all ON instructor_deductions
  FOR ALL
  USING (school_id = get_my_school_id() AND is_admin())
  WITH CHECK (school_id = get_my_school_id() AND is_admin());

DROP POLICY IF EXISTS instructor_deductions_instructor_select ON instructor_deductions;
CREATE POLICY instructor_deductions_instructor_select ON instructor_deductions
  FOR SELECT
  USING (
    instructor_id IN (SELECT id FROM instructors WHERE user_id = auth.uid())
  );

-- ── 4) Instructor reimbursements ─────────────────────────────
CREATE TABLE IF NOT EXISTS instructor_reimbursements (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id      UUID NOT NULL REFERENCES schools(id)     ON DELETE CASCADE,
  instructor_id  UUID NOT NULL REFERENCES instructors(id) ON DELETE CASCADE,
  date           DATE NOT NULL,
  amount_cents   INT  NOT NULL CHECK (amount_cents >= 0),
  detail         TEXT NOT NULL DEFAULT '',
  evidence_path  TEXT,                              -- storage path in reimbursement-evidence bucket
  status         TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'paid')),
  reviewed_by    UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at    TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS instructor_reimbursements_instructor_idx
  ON instructor_reimbursements (instructor_id, date);
CREATE INDEX IF NOT EXISTS instructor_reimbursements_school_idx
  ON instructor_reimbursements (school_id, date);

ALTER TABLE instructor_reimbursements ENABLE ROW LEVEL SECURITY;

-- Admins manage everything in their school.
DROP POLICY IF EXISTS instructor_reimbursements_admin_all ON instructor_reimbursements;
CREATE POLICY instructor_reimbursements_admin_all ON instructor_reimbursements
  FOR ALL
  USING (school_id = get_my_school_id() AND is_admin())
  WITH CHECK (school_id = get_my_school_id() AND is_admin());

-- Instructors can read their own reimbursements.
DROP POLICY IF EXISTS instructor_reimbursements_instructor_select ON instructor_reimbursements;
CREATE POLICY instructor_reimbursements_instructor_select ON instructor_reimbursements
  FOR SELECT
  USING (
    instructor_id IN (SELECT id FROM instructors WHERE user_id = auth.uid())
  );

-- Instructors can submit reimbursements for themselves.
DROP POLICY IF EXISTS instructor_reimbursements_instructor_insert ON instructor_reimbursements;
CREATE POLICY instructor_reimbursements_instructor_insert ON instructor_reimbursements
  FOR INSERT
  WITH CHECK (
    instructor_id IN (SELECT id FROM instructors WHERE user_id = auth.uid())
  );

-- ── 5) Reimbursement evidence bucket (PRIVATE) ───────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('reimbursement-evidence', 'reimbursement-evidence', false)
ON CONFLICT (id) DO NOTHING;

-- Instructors upload to their own {user_id}/... folder.
DROP POLICY IF EXISTS "Instructors upload own reimbursement evidence" ON storage.objects;
CREATE POLICY "Instructors upload own reimbursement evidence"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'reimbursement-evidence'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Instructors can read their own evidence.
DROP POLICY IF EXISTS "Instructors read own reimbursement evidence" ON storage.objects;
CREATE POLICY "Instructors read own reimbursement evidence"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'reimbursement-evidence'
  AND (storage.foldername(name))[1] = auth.uid()::text
);
-- Admin reads happen through the service-role client (signed URLs), which
-- bypasses RLS — no extra storage policy required.
