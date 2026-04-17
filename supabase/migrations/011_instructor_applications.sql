-- ============================================================
-- HelixDriving - Migration 011: Instructor Applications
-- Public-facing instructor application with document uploads.
-- Run this in: Supabase Dashboard -> SQL Editor
-- Manual step after running: create a PRIVATE Storage bucket
-- named "instructor-documents" via Dashboard -> Storage.
-- ============================================================

-- Instructor applications table
CREATE TABLE IF NOT EXISTS instructor_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,

  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT NOT NULL DEFAULT '',

  workers_comp_doc_url TEXT,
  car_insurance_doc_url TEXT,

  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected')),
  admin_notes TEXT,
  reviewed_by UUID REFERENCES users(id),
  reviewed_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_instructor_applications_school
  ON instructor_applications(school_id);
CREATE INDEX IF NOT EXISTS idx_instructor_applications_status
  ON instructor_applications(status);
CREATE INDEX IF NOT EXISTS idx_instructor_applications_email
  ON instructor_applications(email);

ALTER TABLE instructor_applications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view school applications" ON instructor_applications;
CREATE POLICY "Admins can view school applications"
  ON instructor_applications FOR SELECT
  USING (
    school_id IN (
      SELECT school_id FROM users WHERE id = auth.uid() AND role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Admins can update school applications" ON instructor_applications;
CREATE POLICY "Admins can update school applications"
  ON instructor_applications FOR UPDATE
  USING (
    school_id IN (
      SELECT school_id FROM users WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Public insert goes through admin client (no RLS policy needed).
