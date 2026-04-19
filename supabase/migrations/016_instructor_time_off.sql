-- ============================================================
-- HelixDriving - Migration 016: Instructor Time Off
-- One-time absences for instructors (vacation, sick days, holidays).
-- Complements the weekly `availability` table for recurring hours.
-- Run this in: Supabase Dashboard -> SQL Editor
-- Idempotent: safe to run even if the table was already created manually.
-- ============================================================

-- ── Table ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS instructor_time_off (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  instructor_id UUID NOT NULL REFERENCES instructors(id) ON DELETE CASCADE,
  school_id     UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  starts_at     TIMESTAMPTZ NOT NULL,
  ends_at       TIMESTAMPTZ NOT NULL,
  reason        TEXT DEFAULT '',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Range check — ends must be after starts
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'instructor_time_off_valid_range'
      AND conrelid = 'instructor_time_off'::regclass
  ) THEN
    ALTER TABLE instructor_time_off
      ADD CONSTRAINT instructor_time_off_valid_range
      CHECK (ends_at > starts_at);
  END IF;
END$$;

-- ── Indexes ──────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_time_off_instructor
  ON instructor_time_off(instructor_id);
CREATE INDEX IF NOT EXISTS idx_time_off_school
  ON instructor_time_off(school_id);
CREATE INDEX IF NOT EXISTS idx_time_off_range
  ON instructor_time_off(instructor_id, starts_at, ends_at);

-- ── RLS ──────────────────────────────────────────────────────
ALTER TABLE instructor_time_off ENABLE ROW LEVEL SECURITY;

-- All school members can see an instructor's time off (needed for booking UX)
DROP POLICY IF EXISTS "time_off_select" ON instructor_time_off;
CREATE POLICY "time_off_select" ON instructor_time_off
  FOR SELECT
  USING (school_id = get_my_school_id());

-- Admins can manage any instructor's time off
DROP POLICY IF EXISTS "time_off_insert_admin" ON instructor_time_off;
CREATE POLICY "time_off_insert_admin" ON instructor_time_off
  FOR INSERT
  WITH CHECK (school_id = get_my_school_id() AND is_admin());

DROP POLICY IF EXISTS "time_off_update_admin" ON instructor_time_off;
CREATE POLICY "time_off_update_admin" ON instructor_time_off
  FOR UPDATE
  USING (school_id = get_my_school_id() AND is_admin());

DROP POLICY IF EXISTS "time_off_delete_admin" ON instructor_time_off;
CREATE POLICY "time_off_delete_admin" ON instructor_time_off
  FOR DELETE
  USING (school_id = get_my_school_id() AND is_admin());

-- Instructors can manage their own time off
DROP POLICY IF EXISTS "time_off_insert_self" ON instructor_time_off;
CREATE POLICY "time_off_insert_self" ON instructor_time_off
  FOR INSERT
  WITH CHECK (
    instructor_id IN (SELECT id FROM instructors WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "time_off_update_self" ON instructor_time_off;
CREATE POLICY "time_off_update_self" ON instructor_time_off
  FOR UPDATE
  USING (
    instructor_id IN (SELECT id FROM instructors WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "time_off_delete_self" ON instructor_time_off;
CREATE POLICY "time_off_delete_self" ON instructor_time_off
  FOR DELETE
  USING (
    instructor_id IN (SELECT id FROM instructors WHERE user_id = auth.uid())
  );
