-- ============================================================
-- HelixDriving - Migration 033: Classroom sessions + attendance
-- Adds:
--   1. classroom_sessions          — group lessons in a room (separate from BTW lessons)
--   2. classroom_attendance        — per-student enrollment + attendance status
--   3. packages.classroom_required — classroom hours bundled in a package (separate pool from lesson_count)
--   4. student_purchases.classroom_required — snapshot per purchase
--   5. students.classroom_sessions_attended — counter incremented on present/late
--   6. RLS policies for all 3 audiences (admin/instructor/student)
--
-- Design notes:
--   - Single-student BTW path (lessons + openings) is unchanged. Classroom is a
--     parallel hierarchy because group semantics (capacity, roster, no vehicle,
--     no pickup/dropoff) don't fit the 1:1 opening constraint.
--   - Pricing mirrors BTW (price_cents + instructor_earning_cents) so classroom
--     sessions flow into the existing payroll/reports surface.
--   - Counter on students is maintained by the markAttendance service using
--     no-drift deltas — same property as creditLessonsForPayment.
--
-- Run this in: Supabase Dashboard -> SQL Editor
-- ============================================================

-- ── 1. classroom_sessions ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS classroom_sessions (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id                 UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  instructor_id             UUID REFERENCES instructors(id) ON DELETE SET NULL,
  scheduled_at              TIMESTAMPTZ NOT NULL,
  duration_minutes          INT NOT NULL CHECK (duration_minutes BETWEEN 15 AND 480),
  capacity                  INT NOT NULL DEFAULT 20 CHECK (capacity > 0),
  topic                     TEXT NOT NULL DEFAULT '',
  location                  TEXT NOT NULL DEFAULT '',
  status                    TEXT NOT NULL DEFAULT 'scheduled',
  notes                     TEXT NOT NULL DEFAULT '',
  price_cents               INT NOT NULL DEFAULT 0 CHECK (price_cents >= 0),
  instructor_earning_cents  INT NOT NULL DEFAULT 0 CHECK (instructor_earning_cents >= 0),
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'classroom_sessions_status_check'
  ) THEN
    ALTER TABLE classroom_sessions
      ADD CONSTRAINT classroom_sessions_status_check
      CHECK (status IN ('scheduled', 'completed', 'cancelled'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_classroom_sessions_school_time
  ON classroom_sessions (school_id, scheduled_at DESC);
CREATE INDEX IF NOT EXISTS idx_classroom_sessions_instructor_time
  ON classroom_sessions (instructor_id, scheduled_at DESC);


-- ── 2. classroom_attendance ───────────────────────────────────
CREATE TABLE IF NOT EXISTS classroom_attendance (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id  UUID NOT NULL REFERENCES classroom_sessions(id) ON DELETE CASCADE,
  student_id  UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  school_id   UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  status      TEXT NOT NULL DEFAULT 'enrolled',
  marked_at   TIMESTAMPTZ,
  marked_by   UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (session_id, student_id)
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'classroom_attendance_status_check'
  ) THEN
    ALTER TABLE classroom_attendance
      ADD CONSTRAINT classroom_attendance_status_check
      CHECK (status IN ('enrolled', 'present', 'absent', 'late', 'excused'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_classroom_attendance_student ON classroom_attendance (student_id);
CREATE INDEX IF NOT EXISTS idx_classroom_attendance_session ON classroom_attendance (session_id);


-- ── 3. Package + tracking columns ─────────────────────────────
ALTER TABLE packages
  ADD COLUMN IF NOT EXISTS classroom_required INT NOT NULL DEFAULT 0;

ALTER TABLE student_purchases
  ADD COLUMN IF NOT EXISTS classroom_required INT NOT NULL DEFAULT 0;

ALTER TABLE students
  ADD COLUMN IF NOT EXISTS classroom_sessions_attended INT NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'packages_classroom_required_check'
  ) THEN
    ALTER TABLE packages
      ADD CONSTRAINT packages_classroom_required_check
      CHECK (classroom_required >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'student_purchases_classroom_required_check'
  ) THEN
    ALTER TABLE student_purchases
      ADD CONSTRAINT student_purchases_classroom_required_check
      CHECK (classroom_required >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'students_classroom_sessions_attended_check'
  ) THEN
    ALTER TABLE students
      ADD CONSTRAINT students_classroom_sessions_attended_check
      CHECK (classroom_sessions_attended >= 0);
  END IF;
END $$;


-- ── 4. RLS policies ───────────────────────────────────────────
ALTER TABLE classroom_sessions   ENABLE ROW LEVEL SECURITY;
ALTER TABLE classroom_attendance ENABLE ROW LEVEL SECURITY;

-- ── classroom_sessions ──
DROP POLICY IF EXISTS classroom_sessions_select ON classroom_sessions;
CREATE POLICY classroom_sessions_select ON classroom_sessions
  FOR SELECT TO authenticated
  USING (
    school_id = (SELECT school_id FROM users WHERE id = auth.uid())
    AND (
      -- admin sees all sessions in school
      (SELECT role FROM users WHERE id = auth.uid()) = 'admin'
      OR
      -- instructor sees their assigned sessions
      instructor_id = (SELECT id FROM instructors WHERE user_id = auth.uid())
      OR
      -- student sees sessions they're enrolled in
      EXISTS (
        SELECT 1 FROM classroom_attendance ca
        JOIN students s ON s.id = ca.student_id
        WHERE ca.session_id = classroom_sessions.id
          AND s.user_id = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS classroom_sessions_insert ON classroom_sessions;
CREATE POLICY classroom_sessions_insert ON classroom_sessions
  FOR INSERT TO authenticated
  WITH CHECK (
    school_id = (SELECT school_id FROM users WHERE id = auth.uid())
    AND (SELECT role FROM users WHERE id = auth.uid()) = 'admin'
  );

DROP POLICY IF EXISTS classroom_sessions_update ON classroom_sessions;
CREATE POLICY classroom_sessions_update ON classroom_sessions
  FOR UPDATE TO authenticated
  USING (
    school_id = (SELECT school_id FROM users WHERE id = auth.uid())
    AND (
      (SELECT role FROM users WHERE id = auth.uid()) = 'admin'
      OR
      instructor_id = (SELECT id FROM instructors WHERE user_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS classroom_sessions_delete ON classroom_sessions;
CREATE POLICY classroom_sessions_delete ON classroom_sessions
  FOR DELETE TO authenticated
  USING (
    school_id = (SELECT school_id FROM users WHERE id = auth.uid())
    AND (SELECT role FROM users WHERE id = auth.uid()) = 'admin'
  );

-- ── classroom_attendance ──
DROP POLICY IF EXISTS classroom_attendance_select ON classroom_attendance;
CREATE POLICY classroom_attendance_select ON classroom_attendance
  FOR SELECT TO authenticated
  USING (
    school_id = (SELECT school_id FROM users WHERE id = auth.uid())
    AND (
      (SELECT role FROM users WHERE id = auth.uid()) = 'admin'
      OR
      -- instructor sees rosters for sessions they teach
      EXISTS (
        SELECT 1 FROM classroom_sessions cs
        WHERE cs.id = classroom_attendance.session_id
          AND cs.instructor_id = (SELECT id FROM instructors WHERE user_id = auth.uid())
      )
      OR
      -- student sees their own attendance rows
      student_id IN (SELECT id FROM students WHERE user_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS classroom_attendance_insert ON classroom_attendance;
CREATE POLICY classroom_attendance_insert ON classroom_attendance
  FOR INSERT TO authenticated
  WITH CHECK (
    school_id = (SELECT school_id FROM users WHERE id = auth.uid())
    AND (SELECT role FROM users WHERE id = auth.uid()) = 'admin'
  );

DROP POLICY IF EXISTS classroom_attendance_update ON classroom_attendance;
CREATE POLICY classroom_attendance_update ON classroom_attendance
  FOR UPDATE TO authenticated
  USING (
    school_id = (SELECT school_id FROM users WHERE id = auth.uid())
    AND (
      (SELECT role FROM users WHERE id = auth.uid()) = 'admin'
      OR
      -- instructor can update attendance only for sessions they teach
      EXISTS (
        SELECT 1 FROM classroom_sessions cs
        WHERE cs.id = classroom_attendance.session_id
          AND cs.instructor_id = (SELECT id FROM instructors WHERE user_id = auth.uid())
      )
    )
  );

DROP POLICY IF EXISTS classroom_attendance_delete ON classroom_attendance;
CREATE POLICY classroom_attendance_delete ON classroom_attendance
  FOR DELETE TO authenticated
  USING (
    school_id = (SELECT school_id FROM users WHERE id = auth.uid())
    AND (SELECT role FROM users WHERE id = auth.uid()) = 'admin'
  );
