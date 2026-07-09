-- ============================================================
-- HelixDriving - Migration 044: State compliance reporting (IL SOS / RMV)
-- Adds:
--   1. state_report_submissions — audit log of every generated compliance export
--
-- Design notes:
--   - The roster data itself lives on existing tables (students/users:
--     permit_number, date_of_birth, road_test_date, total_lessons_completed,
--     classroom_sessions_attended, observation_minutes_completed). No new
--     student columns — this migration only adds the audit trail the
--     MIGRATION_PLAN record-retention obligations require.
--   - csv_url is nullable: exports stream directly to the admin; we only store
--     a URL if the file is also archived to storage.
--
-- Run this in: Supabase Dashboard -> SQL Editor
-- ============================================================

CREATE TABLE IF NOT EXISTS state_report_submissions (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id      UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  report_type    TEXT NOT NULL DEFAULT 'il_sos_roster',
  period_start   DATE,
  period_end     DATE,
  student_count  INT NOT NULL DEFAULT 0 CHECK (student_count >= 0),
  csv_url        TEXT,
  generated_by   UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'state_report_submissions_type_check'
  ) THEN
    ALTER TABLE state_report_submissions
      ADD CONSTRAINT state_report_submissions_type_check
      CHECK (report_type IN ('il_sos_roster', 'attendance_sheet', 'staff_time_off'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_state_report_submissions_school_time
  ON state_report_submissions (school_id, created_at DESC);


-- ── RLS: admin only ────────────────────────────────────────────
ALTER TABLE state_report_submissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS state_report_submissions_select ON state_report_submissions;
CREATE POLICY state_report_submissions_select ON state_report_submissions
  FOR SELECT TO authenticated
  USING (
    school_id = (SELECT school_id FROM users WHERE id = auth.uid())
    AND (SELECT role FROM users WHERE id = auth.uid()) = 'admin'
  );

DROP POLICY IF EXISTS state_report_submissions_insert ON state_report_submissions;
CREATE POLICY state_report_submissions_insert ON state_report_submissions
  FOR INSERT TO authenticated
  WITH CHECK (
    school_id = (SELECT school_id FROM users WHERE id = auth.uid())
    AND (SELECT role FROM users WHERE id = auth.uid()) = 'admin'
  );
