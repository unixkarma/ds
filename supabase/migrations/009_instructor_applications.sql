-- ============================================================
-- HelixDriving — Migration 009: Instructor Applications
-- Public-facing instructor application with document uploads.
-- Run this in: Supabase Dashboard → SQL Editor
-- ============================================================

-- ── Instructor applications table ───────────────────────────
CREATE TABLE IF NOT EXISTS instructor_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,

  -- Applicant info
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT NOT NULL DEFAULT '',

  -- Document URLs (stored in Supabase Storage, private bucket)
  workers_comp_doc_url TEXT,
  car_insurance_doc_url TEXT,

  -- Review workflow
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected')),
  admin_notes TEXT,
  reviewed_by UUID REFERENCES users(id),
  reviewed_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Indexes ─────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_instructor_applications_school
  ON instructor_applications(school_id);
CREATE INDEX IF NOT EXISTS idx_instructor_applications_status
  ON instructor_applications(status);
CREATE INDEX IF NOT EXISTS idx_instructor_applications_email
  ON instructor_applications(email);

-- ── RLS ─────────────────────────────────────────────────────
ALTER TABLE instructor_applications ENABLE ROW LEVEL SECURITY;

-- Admins can view applications for their school
CREATE POLICY "Admins can view school applications"
  ON instructor_applications FOR SELECT
  USING (
    school_id IN (
      SELECT school_id FROM users WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Admins can update applications for their school
CREATE POLICY "Admins can update school applications"
  ON instructor_applications FOR UPDATE
  USING (
    school_id IN (
      SELECT school_id FROM users WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Public insert (no auth required — handled via API with service role)
-- We do NOT add an INSERT policy because inserts go through the admin client.

-- ── Storage bucket for instructor documents ─────────────────
-- NOTE: Create the bucket "instructor-documents" in Supabase Dashboard → Storage
-- Set it as PRIVATE (not public). Access will be via signed URLs.
