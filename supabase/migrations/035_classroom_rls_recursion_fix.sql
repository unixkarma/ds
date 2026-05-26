-- ============================================================
-- HelixDriving — Migration 035: Fix classroom RLS recursion
--
-- The policies introduced in migration 033 caused infinite
-- recursion: `classroom_sessions_select` queries `classroom_attendance`
-- to find sessions the student is enrolled in, while
-- `classroom_attendance_select` queries `classroom_sessions` to
-- find rosters for sessions the instructor teaches. When a query
-- joins both tables, Postgres recursively re-evaluates each policy
-- and errors with:
--
--   ERROR: infinite recursion detected in policy for relation
--          "classroom_attendance"
--
-- Fix: extract the cross-table lookups into SECURITY DEFINER
-- functions. Those run as the function owner and bypass RLS, so
-- the policy itself never re-triggers the other table's RLS.
--
-- Idempotent. Run in: Supabase Dashboard -> SQL Editor.
-- ============================================================

-- ── Helper: session ids the calling student is enrolled in ────
CREATE OR REPLACE FUNCTION student_classroom_session_ids()
RETURNS SETOF UUID
LANGUAGE SQL
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT ca.session_id
  FROM classroom_attendance ca
  JOIN students s ON s.id = ca.student_id
  WHERE s.user_id = auth.uid()
$$;

-- ── Helper: session ids the calling instructor teaches ────────
CREATE OR REPLACE FUNCTION instructor_classroom_session_ids()
RETURNS SETOF UUID
LANGUAGE SQL
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT cs.id
  FROM classroom_sessions cs
  JOIN instructors i ON i.id = cs.instructor_id
  WHERE i.user_id = auth.uid()
$$;

REVOKE ALL ON FUNCTION student_classroom_session_ids() FROM PUBLIC;
REVOKE ALL ON FUNCTION instructor_classroom_session_ids() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION student_classroom_session_ids() TO authenticated;
GRANT EXECUTE ON FUNCTION instructor_classroom_session_ids() TO authenticated;


-- ── Rebuild classroom_sessions_select without cross-table RLS recursion ──
DROP POLICY IF EXISTS classroom_sessions_select ON classroom_sessions;
CREATE POLICY classroom_sessions_select ON classroom_sessions
  FOR SELECT TO authenticated
  USING (
    school_id = (SELECT school_id FROM users WHERE id = auth.uid())
    AND (
      (SELECT role FROM users WHERE id = auth.uid()) = 'admin'
      OR
      instructor_id = (SELECT id FROM instructors WHERE user_id = auth.uid())
      OR
      id IN (SELECT student_classroom_session_ids())
    )
  );


-- ── Rebuild classroom_attendance_select without cross-table RLS recursion ──
DROP POLICY IF EXISTS classroom_attendance_select ON classroom_attendance;
CREATE POLICY classroom_attendance_select ON classroom_attendance
  FOR SELECT TO authenticated
  USING (
    school_id = (SELECT school_id FROM users WHERE id = auth.uid())
    AND (
      (SELECT role FROM users WHERE id = auth.uid()) = 'admin'
      OR
      session_id IN (SELECT instructor_classroom_session_ids())
      OR
      student_id IN (SELECT id FROM students WHERE user_id = auth.uid())
    )
  );


-- ── Rebuild classroom_attendance_update mirror (same recursion risk) ──
DROP POLICY IF EXISTS classroom_attendance_update ON classroom_attendance;
CREATE POLICY classroom_attendance_update ON classroom_attendance
  FOR UPDATE TO authenticated
  USING (
    school_id = (SELECT school_id FROM users WHERE id = auth.uid())
    AND (
      (SELECT role FROM users WHERE id = auth.uid()) = 'admin'
      OR
      session_id IN (SELECT instructor_classroom_session_ids())
    )
  );
