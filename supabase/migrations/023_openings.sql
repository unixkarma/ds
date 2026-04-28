-- ============================================================
-- HelixDriving - Migration 023: Openings & Templates (Step 13)
-- Adds:
--   1. opening_templates  — instructor "recipes" (Morning, Afternoon, Full day, custom)
--   2. openings           — concrete pre-bookable slots generated from templates
--   3. lessons.opening_id — FK so a booked lesson can release its opening on cancel
--   4. Default templates seeded at school level (instructor_id IS NULL)
--   5. RLS policies for all 3 audiences (admin/instructor/student)
-- Run this in: Supabase Dashboard -> SQL Editor
-- ============================================================

-- ── 1. opening_templates ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS opening_templates (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id     UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  instructor_id UUID REFERENCES instructors(id) ON DELETE CASCADE,
  -- NULL instructor_id => school-wide default available to any instructor in this school
  name          TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 60),
  slots         JSONB NOT NULL,
  -- slots format: [{"start": "09:00", "duration_min": 60}, ...]
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT slots_is_nonempty_array CHECK (
    jsonb_typeof(slots) = 'array' AND jsonb_array_length(slots) > 0
  )
);

-- One "Morning" per school at school level, one "Morning" per instructor at instructor level
CREATE UNIQUE INDEX IF NOT EXISTS uniq_school_template_name
  ON opening_templates (school_id, name) WHERE instructor_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uniq_instructor_template_name
  ON opening_templates (instructor_id, name) WHERE instructor_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_opening_templates_school     ON opening_templates (school_id);
CREATE INDEX IF NOT EXISTS idx_opening_templates_instructor ON opening_templates (instructor_id);


-- ── 2. openings ────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE opening_status AS ENUM ('available', 'booked', 'blocked');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS openings (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id        UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  instructor_id    UUID NOT NULL REFERENCES instructors(id) ON DELETE CASCADE,
  template_id      UUID REFERENCES opening_templates(id) ON DELETE SET NULL,
  scheduled_at     TIMESTAMPTZ NOT NULL,
  duration_minutes INT NOT NULL CHECK (duration_minutes BETWEEN 15 AND 240),
  status           opening_status NOT NULL DEFAULT 'available',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_openings_instructor_time ON openings (instructor_id, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_openings_school_time     ON openings (school_id, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_openings_status_avail
  ON openings (school_id, instructor_id, scheduled_at) WHERE status = 'available';

-- No two openings can overlap for the same instructor (uses lesson_range helper from migration 017)
ALTER TABLE openings DROP CONSTRAINT IF EXISTS openings_no_overlap;
ALTER TABLE openings ADD CONSTRAINT openings_no_overlap
  EXCLUDE USING gist (
    instructor_id WITH =,
    lesson_range(scheduled_at, duration_minutes) WITH &&
  );


-- ── 3. lessons.opening_id ──────────────────────────────────────
ALTER TABLE lessons
  ADD COLUMN IF NOT EXISTS opening_id UUID REFERENCES openings(id) ON DELETE SET NULL;

-- One lesson per opening (a booked opening can't be re-booked)
CREATE UNIQUE INDEX IF NOT EXISTS idx_lessons_opening_id
  ON lessons (opening_id) WHERE opening_id IS NOT NULL;


-- ── 4. Seed default templates at school level ─────────────────
INSERT INTO opening_templates (school_id, instructor_id, name, slots)
SELECT s.id, NULL, t.name, t.slots
FROM schools s
CROSS JOIN (VALUES
  ('Morning'::text,
   '[{"start":"09:00","duration_min":60},{"start":"10:30","duration_min":60},{"start":"12:00","duration_min":60}]'::jsonb),
  ('Afternoon',
   '[{"start":"14:00","duration_min":60},{"start":"15:30","duration_min":60},{"start":"17:00","duration_min":60}]'::jsonb),
  ('Full day',
   '[{"start":"09:00","duration_min":60},{"start":"10:30","duration_min":60},{"start":"12:00","duration_min":60},{"start":"14:00","duration_min":60},{"start":"15:30","duration_min":60},{"start":"17:00","duration_min":60}]'::jsonb)
) AS t(name, slots)
ON CONFLICT (school_id, name) WHERE instructor_id IS NULL
DO NOTHING;


-- ── 5. RLS policies ────────────────────────────────────────────
ALTER TABLE opening_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE openings          ENABLE ROW LEVEL SECURITY;

-- ── opening_templates ──
DROP POLICY IF EXISTS opening_templates_select ON opening_templates;
CREATE POLICY opening_templates_select ON opening_templates
  FOR SELECT TO authenticated
  USING (
    -- Anyone in the same school can read templates (admin sees all, instructor sees school + own, student doesn't need)
    school_id = (SELECT school_id FROM users WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS opening_templates_insert ON opening_templates;
CREATE POLICY opening_templates_insert ON opening_templates
  FOR INSERT TO authenticated
  WITH CHECK (
    school_id = (SELECT school_id FROM users WHERE id = auth.uid())
    AND (
      -- admin can insert school-level (instructor_id NULL) or instructor-level (any instructor)
      (SELECT role FROM users WHERE id = auth.uid()) = 'admin'
      OR
      -- instructor can only insert their own templates
      (
        instructor_id IS NOT NULL
        AND instructor_id = (SELECT id FROM instructors WHERE user_id = auth.uid())
      )
    )
  );

DROP POLICY IF EXISTS opening_templates_update ON opening_templates;
CREATE POLICY opening_templates_update ON opening_templates
  FOR UPDATE TO authenticated
  USING (
    school_id = (SELECT school_id FROM users WHERE id = auth.uid())
    AND (
      (SELECT role FROM users WHERE id = auth.uid()) = 'admin'
      OR
      instructor_id = (SELECT id FROM instructors WHERE user_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS opening_templates_delete ON opening_templates;
CREATE POLICY opening_templates_delete ON opening_templates
  FOR DELETE TO authenticated
  USING (
    school_id = (SELECT school_id FROM users WHERE id = auth.uid())
    AND (
      (SELECT role FROM users WHERE id = auth.uid()) = 'admin'
      OR
      instructor_id = (SELECT id FROM instructors WHERE user_id = auth.uid())
    )
  );

-- ── openings ──
DROP POLICY IF EXISTS openings_select ON openings;
CREATE POLICY openings_select ON openings
  FOR SELECT TO authenticated
  USING (
    school_id = (SELECT school_id FROM users WHERE id = auth.uid())
    AND (
      -- admin sees all
      (SELECT role FROM users WHERE id = auth.uid()) = 'admin'
      OR
      -- instructor sees their own (any status)
      instructor_id = (SELECT id FROM instructors WHERE user_id = auth.uid())
      OR
      -- student sees only available openings (for booking)
      (
        (SELECT role FROM users WHERE id = auth.uid()) = 'student'
        AND status = 'available'
      )
    )
  );

DROP POLICY IF EXISTS openings_insert ON openings;
CREATE POLICY openings_insert ON openings
  FOR INSERT TO authenticated
  WITH CHECK (
    school_id = (SELECT school_id FROM users WHERE id = auth.uid())
    AND (
      (SELECT role FROM users WHERE id = auth.uid()) = 'admin'
      OR
      instructor_id = (SELECT id FROM instructors WHERE user_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS openings_update ON openings;
CREATE POLICY openings_update ON openings
  FOR UPDATE TO authenticated
  USING (
    school_id = (SELECT school_id FROM users WHERE id = auth.uid())
    AND (
      (SELECT role FROM users WHERE id = auth.uid()) = 'admin'
      OR
      instructor_id = (SELECT id FROM instructors WHERE user_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS openings_delete ON openings;
CREATE POLICY openings_delete ON openings
  FOR DELETE TO authenticated
  USING (
    school_id = (SELECT school_id FROM users WHERE id = auth.uid())
    AND status != 'booked'   -- never delete a booked opening directly; cancel the lesson instead
    AND (
      (SELECT role FROM users WHERE id = auth.uid()) = 'admin'
      OR
      instructor_id = (SELECT id FROM instructors WHERE user_id = auth.uid())
    )
  );
