-- ============================================================
-- HelixDriving - Migration 025: Templates with day_of_week + Days Off
--
-- Reshapes Step 13 around a single concept: the instructor's "schedule" =
--   1. opening_templates (now carry which days of the week they apply to)
--   2. instructor_days_off (one-off exceptions)
--
-- The legacy `availability` table is left in place for now — code still
-- reads from it. Migration 026 will DROP it after the new UI/API ships.
--
-- Run this in: Supabase Dashboard -> SQL Editor
-- ============================================================

-- ── 1. opening_templates.day_of_week ───────────────────────────
-- Array of integers 0..6 (0=Sunday, 6=Saturday).
-- Default Mon–Fri so existing seeds (Morning/Afternoon/Full day) keep working.
ALTER TABLE opening_templates
  ADD COLUMN IF NOT EXISTS day_of_week INT[] NOT NULL DEFAULT ARRAY[1,2,3,4,5]::INT[];

-- Drop + recreate the CHECK so the migration is idempotent.
ALTER TABLE opening_templates
  DROP CONSTRAINT IF EXISTS opening_templates_day_of_week_check;

ALTER TABLE opening_templates
  ADD CONSTRAINT opening_templates_day_of_week_check
  CHECK (
    array_length(day_of_week, 1) BETWEEN 1 AND 7
    AND day_of_week <@ ARRAY[0,1,2,3,4,5,6]
  );

-- Refine the existing school-level defaults so they have sensible days.
UPDATE opening_templates
   SET day_of_week = ARRAY[1,2,3,4,5,6]::INT[]   -- Mon–Sat
 WHERE instructor_id IS NULL AND name = 'Full day';

-- (Morning + Afternoon stay on the Mon–Fri default we just set.)


-- ── 2. instructor_days_off table ───────────────────────────────
CREATE TABLE IF NOT EXISTS instructor_days_off (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id     UUID NOT NULL REFERENCES schools(id)     ON DELETE CASCADE,
  instructor_id UUID NOT NULL REFERENCES instructors(id) ON DELETE CASCADE,
  date          DATE NOT NULL,
  reason        TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (instructor_id, date)
);

CREATE INDEX IF NOT EXISTS idx_instructor_days_off_inst_date
  ON instructor_days_off (instructor_id, date);
CREATE INDEX IF NOT EXISTS idx_instructor_days_off_school_date
  ON instructor_days_off (school_id, date);


-- ── 3. RLS for instructor_days_off ─────────────────────────────
ALTER TABLE instructor_days_off ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS days_off_select ON instructor_days_off;
CREATE POLICY days_off_select ON instructor_days_off
  FOR SELECT TO authenticated
  USING (
    school_id = (SELECT school_id FROM users WHERE id = auth.uid())
    AND (
      -- admin sees all
      (SELECT role FROM users WHERE id = auth.uid()) = 'admin'
      OR
      -- instructor sees their own
      instructor_id = (SELECT id FROM instructors WHERE user_id = auth.uid())
      OR
      -- students see days off of any instructor in their school (so they don't try to book then)
      (SELECT role FROM users WHERE id = auth.uid()) = 'student'
    )
  );

DROP POLICY IF EXISTS days_off_insert ON instructor_days_off;
CREATE POLICY days_off_insert ON instructor_days_off
  FOR INSERT TO authenticated
  WITH CHECK (
    school_id = (SELECT school_id FROM users WHERE id = auth.uid())
    AND (
      (SELECT role FROM users WHERE id = auth.uid()) = 'admin'
      OR
      instructor_id = (SELECT id FROM instructors WHERE user_id = auth.uid())
    )
  );

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
  );

DROP POLICY IF EXISTS days_off_delete ON instructor_days_off;
CREATE POLICY days_off_delete ON instructor_days_off
  FOR DELETE TO authenticated
  USING (
    school_id = (SELECT school_id FROM users WHERE id = auth.uid())
    AND (
      (SELECT role FROM users WHERE id = auth.uid()) = 'admin'
      OR
      instructor_id = (SELECT id FROM instructors WHERE user_id = auth.uid())
    )
  );

-- ============================================================
-- After running, verify with:
--   SELECT name, day_of_week FROM opening_templates WHERE instructor_id IS NULL;
--   -- Morning/Afternoon → {1,2,3,4,5}; Full day → {1,2,3,4,5,6}
--   SELECT * FROM instructor_days_off LIMIT 1;
--   -- Should be empty (no rows yet) but the table must exist.
-- ============================================================
