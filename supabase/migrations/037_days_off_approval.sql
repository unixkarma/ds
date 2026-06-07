-- ============================================================
-- HelixDriving - Migration 037: Days-off approval workflow
--
-- Adds an approval status to instructor_days_off so a day off requested by
-- an instructor must be APPROVED by an admin before it blocks the schedule.
--   - instructor requests  → status = 'pending'  (does NOT remove openings yet)
--   - admin approves       → status = 'approved' (openings on that date removed)
--   - admin rejects        → status = 'rejected' (openings stay/come back)
--   - admin marks directly → status = 'approved'
--
-- Existing rows were already in effect, so we keep them 'approved'.
--
-- Run this in: Supabase Dashboard -> SQL Editor
-- ============================================================

-- ── 1. Columns ─────────────────────────────────────────────────
-- New column defaults to 'approved' so the rows that already exist (added by
-- this ALTER) stay in effect. We then flip the default to 'pending' so all
-- FUTURE inserts require approval unless the API sets 'approved' explicitly.
ALTER TABLE instructor_days_off
  ADD COLUMN IF NOT EXISTS status      TEXT NOT NULL DEFAULT 'approved',
  ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;

ALTER TABLE instructor_days_off ALTER COLUMN status SET DEFAULT 'pending';

ALTER TABLE instructor_days_off
  DROP CONSTRAINT IF EXISTS instructor_days_off_status_check;
ALTER TABLE instructor_days_off
  ADD CONSTRAINT instructor_days_off_status_check
  CHECK (status IN ('pending', 'approved', 'rejected'));

CREATE INDEX IF NOT EXISTS idx_instructor_days_off_school_status
  ON instructor_days_off (school_id, status);

-- ============================================================
-- After running, verify with:
--   SELECT date, status FROM instructor_days_off ORDER BY date;
--   -- pre-existing rows should be 'approved'.
-- ============================================================
