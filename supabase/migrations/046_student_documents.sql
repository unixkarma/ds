-- ============================================================
-- HelixDriving - Migration 046: Per-student document management
-- Adds:
--   1. student_documents  — many files per student (beyond the single permit photo)
--   2. private storage bucket 'student-documents'
--   3. RLS (admin/instructor manage; student reads own doc rows)
--
-- Design notes:
--   - Unlike permit-photos (public bucket), student documents are sensitive
--     (IDs, medical, parental) so the bucket is PRIVATE. Files are served via
--     short-lived signed URLs minted server-side with the service-role client.
--   - file_url stores the storage PATH (not a public URL); the service signs it
--     on read. Path convention: {student_id}/{uuid}.{ext}.
--
-- Run this in: Supabase Dashboard -> SQL Editor
-- ============================================================

CREATE TABLE IF NOT EXISTS student_documents (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id    UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  student_id   UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  doc_type     TEXT NOT NULL DEFAULT 'other',
  file_path    TEXT NOT NULL,
  file_name    TEXT NOT NULL DEFAULT '',
  uploaded_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'student_documents_type_check'
  ) THEN
    ALTER TABLE student_documents
      ADD CONSTRAINT student_documents_type_check
      CHECK (doc_type IN ('permit', 'id', 'medical', 'parental_consent', 'certificate', 'other'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_student_documents_student
  ON student_documents (student_id, created_at DESC);


-- ── Private storage bucket ─────────────────────────────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('student-documents', 'student-documents', false)
ON CONFLICT (id) DO NOTHING;

-- Read via signed URLs only (service role). This SELECT policy lets school staff
-- list objects if they ever query storage directly; uploads/deletes go through
-- the service-role client in the API and bypass RLS.
DROP POLICY IF EXISTS "Staff can view student documents" ON storage.objects;
CREATE POLICY "Staff can view student documents"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'student-documents'
  AND (SELECT role FROM users WHERE id = auth.uid()) IN ('admin', 'instructor')
);


-- ── RLS on the metadata table ──────────────────────────────────
ALTER TABLE student_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS student_documents_select ON student_documents;
CREATE POLICY student_documents_select ON student_documents
  FOR SELECT TO authenticated
  USING (
    school_id = (SELECT school_id FROM users WHERE id = auth.uid())
    AND (
      (SELECT role FROM users WHERE id = auth.uid()) IN ('admin', 'instructor')
      OR student_id IN (SELECT id FROM students WHERE user_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS student_documents_insert ON student_documents;
CREATE POLICY student_documents_insert ON student_documents
  FOR INSERT TO authenticated
  WITH CHECK (
    school_id = (SELECT school_id FROM users WHERE id = auth.uid())
    AND (SELECT role FROM users WHERE id = auth.uid()) IN ('admin', 'instructor')
  );

DROP POLICY IF EXISTS student_documents_delete ON student_documents;
CREATE POLICY student_documents_delete ON student_documents
  FOR DELETE TO authenticated
  USING (
    school_id = (SELECT school_id FROM users WHERE id = auth.uid())
    AND (SELECT role FROM users WHERE id = auth.uid()) = 'admin'
  );
