-- ============================================================
-- HelixDriving - Migration 040: Stop instructor self-approval / forgery (SECURITY)
--
-- Fixes HIGH A4 and A5. Both tables are written by the app exclusively through
-- the service-role key (createAdminClient), which sets status/reviewer fields
-- server-side. The instructor-facing RLS write policies are therefore NOT used
-- by the app for normal operation -- they only widen the attack surface: an
-- instructor with the authenticated anon key can hit PostgREST directly and:
--   A4) INSERT an instructor_reimbursements row with status='paid', an arbitrary
--       amount_cents, and forged reviewed_by/reviewed_at.
--   A5) INSERT / UPDATE an instructor_days_off row with status='approved',
--       self-approving a day off (bypassing the admin approval workflow) and
--       forging reviewed_by/reviewed_at.
--
-- We keep the instructor's ability to *request* (insert pending) and to edit
-- their own pending rows, but pin the trust-bearing columns to safe values.
-- Admin branches are unchanged. Service-role calls bypass RLS entirely.
--
-- Run this in: Supabase Dashboard -> SQL Editor
-- ============================================================

-- ── A4: instructor_reimbursements ────────────────────────────
-- Instructors may only submit pending, un-reviewed reimbursements for
-- themselves, within their own school.
DROP POLICY IF EXISTS instructor_reimbursements_instructor_insert ON instructor_reimbursements;
CREATE POLICY instructor_reimbursements_instructor_insert ON instructor_reimbursements
  FOR INSERT
  WITH CHECK (
    school_id = get_my_school_id()
    AND instructor_id IN (SELECT id FROM instructors WHERE user_id = auth.uid())
    AND status = 'pending'
    AND reviewed_by IS NULL
    AND reviewed_at IS NULL
  );

-- ── A5: instructor_days_off (INSERT) ─────────────────────────
-- Admin may insert anything; an instructor may only request their own day off
-- in 'pending' state with no forged reviewer fields.
DROP POLICY IF EXISTS days_off_insert ON instructor_days_off;
CREATE POLICY days_off_insert ON instructor_days_off
  FOR INSERT TO authenticated
  WITH CHECK (
    school_id = (SELECT school_id FROM users WHERE id = auth.uid())
    AND (
      (SELECT role FROM users WHERE id = auth.uid()) = 'admin'
      OR (
        instructor_id = (SELECT id FROM instructors WHERE user_id = auth.uid())
        AND status = 'pending'
        AND reviewed_by IS NULL
        AND reviewed_at IS NULL
      )
    )
  );

-- ── A5: instructor_days_off (UPDATE) ─────────────────────────
-- Same USING as before (which rows are targetable), but add a WITH CHECK so an
-- instructor cannot flip their own request to 'approved' or forge reviewer
-- fields. Admin keeps full control.
DROP POLICY IF EXISTS days_off_update ON instructor_days_off;
CREATE POLICY days_off_update ON instructor_days_off
  FOR UPDATE TO authenticated
  USING (
    school_id = (SELECT school_id FROM users WHERE id = auth.uid())
    AND (
      (SELECT role FROM users WHERE id = auth.uid()) = 'admin'
      OR
      instructor_id = (SELECT id FROM instructors WHERE user_id = auth.uid())
    )
  )
  WITH CHECK (
    school_id = (SELECT school_id FROM users WHERE id = auth.uid())
    AND (
      (SELECT role FROM users WHERE id = auth.uid()) = 'admin'
      OR (
        instructor_id = (SELECT id FROM instructors WHERE user_id = auth.uid())
        AND status = 'pending'
        AND reviewed_by IS NULL
        AND reviewed_at IS NULL
      )
    )
  );
