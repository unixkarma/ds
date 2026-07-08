-- ============================================================
-- HelixDriving — Migration 042: Observation lessons
-- Illinois teens need 6 hours of BEHIND-THE-WHEEL OBSERVATION in
-- addition to 6 hours of driving. Model: while student A drives,
-- student B rides along and observes (same instructor, same car,
-- same time slot). A "double block" books two chained segments
-- where the students swap roles.
--
-- Adds:
--   1. lessons.lesson_type        'drive' (default) | 'observation'
--   2. lessons.paired_lesson_id   observation → the drive lesson it
--                                 rides along with (SET NULL on delete)
--   3. students.observation_minutes_completed  running total, bumped
--                                 when an observation lesson completes
--   4. Recreates lessons_no_instructor_overlap to include lesson_type,
--      so ONE drive + ONE observation may share an instructor/slot,
--      but never two of the same type.
--
-- Observation lessons carry price_cents = 0, earn the instructor
-- nothing, consume no lesson credits, and charge no fees. All of
-- that is enforced in the API layer; this migration is schema only.
--
-- Idempotent. Run in: Supabase Dashboard -> SQL Editor
-- ============================================================

-- ── 1. lesson_type ────────────────────────────────────────────
ALTER TABLE lessons
  ADD COLUMN IF NOT EXISTS lesson_type TEXT NOT NULL DEFAULT 'drive';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'lessons_lesson_type_check' AND conrelid = 'lessons'::regclass
  ) THEN
    ALTER TABLE lessons
      ADD CONSTRAINT lessons_lesson_type_check
      CHECK (lesson_type IN ('drive', 'observation'));
  END IF;
END $$;

-- ── 2. paired_lesson_id ───────────────────────────────────────
-- Links an observation lesson to the drive lesson happening in the
-- same car. Nullable: legacy rows and free-standing bookings.
ALTER TABLE lessons
  ADD COLUMN IF NOT EXISTS paired_lesson_id UUID REFERENCES lessons(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_lessons_paired_lesson_id
  ON lessons(paired_lesson_id)
  WHERE paired_lesson_id IS NOT NULL;

-- ── 3. observation minutes counter ────────────────────────────
-- Minutes, not sessions — IL compliance is measured in clock hours
-- (6h = 360 min). Display as minutes/60.
ALTER TABLE students
  ADD COLUMN IF NOT EXISTS observation_minutes_completed INT NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'students_observation_minutes_check' AND conrelid = 'students'::regclass
  ) THEN
    ALTER TABLE students
      ADD CONSTRAINT students_observation_minutes_check
      CHECK (observation_minutes_completed >= 0);
  END IF;
END $$;

-- ── 4. Instructor overlap constraint, now type-aware ──────────
-- Original (migration 017): one lesson per instructor per time range.
-- New: one lesson per instructor per time range PER TYPE — allowing
-- exactly one drive + one observation to coexist (the ride-along),
-- while still blocking double-booked drives or double observers.
-- lessons_no_student_overlap is intentionally untouched: a student
-- can never be in two lessons at once, regardless of type.
ALTER TABLE lessons DROP CONSTRAINT IF EXISTS lessons_no_instructor_overlap;

ALTER TABLE lessons
  ADD CONSTRAINT lessons_no_instructor_overlap
  EXCLUDE USING gist (
    instructor_id WITH =,
    lesson_type WITH =,
    lesson_range(scheduled_at, duration_minutes) WITH &&
  )
  WHERE (status = 'scheduled');
