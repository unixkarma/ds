-- ============================================================
-- HelixDriving - Migration 045: Quiz / knowledge-test tracking
-- Adds:
--   1. quizzes        — a school's catalog of knowledge tests
--   2. quiz_attempts  — per-student attempt with score + pass/fail
--   3. RLS (admin/instructor manage; student reads own attempts)
--
-- Design notes:
--   - This tracks RESULTS of tests, not question banks. The reference system's
--     Quiz/Tests tab is a per-student progress/score view; that's what this
--     models. Question authoring is out of scope.
--   - passed is stored (not derived) so historical rows survive passing_score
--     changes on the quiz.
--
-- Run this in: Supabase Dashboard -> SQL Editor
-- ============================================================

-- ── 1. quizzes ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS quizzes (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id      UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  title          TEXT NOT NULL DEFAULT '',
  topic          TEXT NOT NULL DEFAULT '',
  passing_score  INT NOT NULL DEFAULT 80 CHECK (passing_score BETWEEN 0 AND 100),
  active         BOOLEAN NOT NULL DEFAULT TRUE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_quizzes_school ON quizzes (school_id);


-- ── 2. quiz_attempts ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS quiz_attempts (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id    UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  quiz_id      UUID NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
  student_id   UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  score        INT NOT NULL DEFAULT 0 CHECK (score BETWEEN 0 AND 100),
  passed       BOOLEAN NOT NULL DEFAULT FALSE,
  taken_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  recorded_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_quiz_attempts_student ON quiz_attempts (student_id, quiz_id);
CREATE INDEX IF NOT EXISTS idx_quiz_attempts_quiz ON quiz_attempts (quiz_id);


-- ── 3. RLS ─────────────────────────────────────────────────────
ALTER TABLE quizzes       ENABLE ROW LEVEL SECURITY;
ALTER TABLE quiz_attempts ENABLE ROW LEVEL SECURITY;

-- ── quizzes: admin/instructor read; admin writes ──
DROP POLICY IF EXISTS quizzes_select ON quizzes;
CREATE POLICY quizzes_select ON quizzes
  FOR SELECT TO authenticated
  USING (
    school_id = (SELECT school_id FROM users WHERE id = auth.uid())
    AND (SELECT role FROM users WHERE id = auth.uid()) IN ('admin', 'instructor')
  );

DROP POLICY IF EXISTS quizzes_insert ON quizzes;
CREATE POLICY quizzes_insert ON quizzes
  FOR INSERT TO authenticated
  WITH CHECK (
    school_id = (SELECT school_id FROM users WHERE id = auth.uid())
    AND (SELECT role FROM users WHERE id = auth.uid()) = 'admin'
  );

DROP POLICY IF EXISTS quizzes_update ON quizzes;
CREATE POLICY quizzes_update ON quizzes
  FOR UPDATE TO authenticated
  USING (
    school_id = (SELECT school_id FROM users WHERE id = auth.uid())
    AND (SELECT role FROM users WHERE id = auth.uid()) = 'admin'
  );

DROP POLICY IF EXISTS quizzes_delete ON quizzes;
CREATE POLICY quizzes_delete ON quizzes
  FOR DELETE TO authenticated
  USING (
    school_id = (SELECT school_id FROM users WHERE id = auth.uid())
    AND (SELECT role FROM users WHERE id = auth.uid()) = 'admin'
  );

-- ── quiz_attempts: admin/instructor manage; student reads own ──
DROP POLICY IF EXISTS quiz_attempts_select ON quiz_attempts;
CREATE POLICY quiz_attempts_select ON quiz_attempts
  FOR SELECT TO authenticated
  USING (
    school_id = (SELECT school_id FROM users WHERE id = auth.uid())
    AND (
      (SELECT role FROM users WHERE id = auth.uid()) IN ('admin', 'instructor')
      OR student_id IN (SELECT id FROM students WHERE user_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS quiz_attempts_insert ON quiz_attempts;
CREATE POLICY quiz_attempts_insert ON quiz_attempts
  FOR INSERT TO authenticated
  WITH CHECK (
    school_id = (SELECT school_id FROM users WHERE id = auth.uid())
    AND (SELECT role FROM users WHERE id = auth.uid()) IN ('admin', 'instructor')
  );

DROP POLICY IF EXISTS quiz_attempts_update ON quiz_attempts;
CREATE POLICY quiz_attempts_update ON quiz_attempts
  FOR UPDATE TO authenticated
  USING (
    school_id = (SELECT school_id FROM users WHERE id = auth.uid())
    AND (SELECT role FROM users WHERE id = auth.uid()) IN ('admin', 'instructor')
  );

DROP POLICY IF EXISTS quiz_attempts_delete ON quiz_attempts;
CREATE POLICY quiz_attempts_delete ON quiz_attempts
  FOR DELETE TO authenticated
  USING (
    school_id = (SELECT school_id FROM users WHERE id = auth.uid())
    AND (SELECT role FROM users WHERE id = auth.uid()) = 'admin'
  );
