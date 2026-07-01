-- ============================================================
-- HelixDriving - Migration 041: Student record retention
--
-- Illinois requires a driving school to keep each student's instruction record
-- for >= 3 years AFTER the road-test date (625 ILCS 5/6-408; 92 Ill. Adm. Code
-- Part 1060). The schema previously (a) had only `road_test_status` text and no
-- date to anchor that 3-year clock, and (b) used ON DELETE CASCADE throughout,
-- so deleting a student (or the auth user, which cascades) would silently
-- destroy their lessons / payments / attendance — a retention violation.
--
-- This migration:
--   1. Adds students.road_test_date (the retention-clock anchor).
--   2. Adds a BEFORE DELETE guard on students that BLOCKS deletion when the
--      student has any instruction or financial history. This is additive (no
--      FK surgery) and also fires during a cascade from auth.users, so an
--      accidental account deletion can't destroy legally-required records.
--      To remove a student, set students.status = 'inactive' instead.
--
-- Run this in: Supabase Dashboard -> SQL Editor
-- ============================================================

-- 1. Retention-clock anchor -------------------------------------------------
ALTER TABLE students ADD COLUMN IF NOT EXISTS road_test_date DATE;

COMMENT ON COLUMN students.road_test_date IS
  'Date the student completed the SOS road test. Anchors the 3-year instruction-record retention window (625 ILCS 5/6-408).';

-- 2. Guard against destroying instruction / financial records ---------------
-- SECURITY DEFINER so the check can read the history tables even when the
-- delete is initiated by a role (e.g. supabase_auth_admin cascading from
-- auth.users) that lacks direct SELECT on them.
CREATE OR REPLACE FUNCTION prevent_student_record_destruction()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM lessons              WHERE student_id = OLD.id)
     OR EXISTS (SELECT 1 FROM payments          WHERE student_id = OLD.id)
     OR EXISTS (SELECT 1 FROM classroom_attendance WHERE student_id = OLD.id)
     OR EXISTS (SELECT 1 FROM student_purchases WHERE student_id = OLD.id)
     OR EXISTS (SELECT 1 FROM student_ledger    WHERE student_id = OLD.id)
  THEN
    RAISE EXCEPTION
      'Cannot delete student % — instruction/financial records must be retained for 3 years after the road test (625 ILCS 5/6-408). Set status = ''inactive'' instead of deleting.',
      OLD.id
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_student_record_destruction ON students;
CREATE TRIGGER trg_prevent_student_record_destruction
  BEFORE DELETE ON students
  FOR EACH ROW
  EXECUTE FUNCTION prevent_student_record_destruction();
