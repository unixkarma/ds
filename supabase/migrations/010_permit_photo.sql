-- ============================================================
-- HelixDriving - Migration 010: Permit Photo
-- Adds permit photo URL to students and creates storage bucket.
-- Run this in: Supabase Dashboard -> SQL Editor
-- ============================================================

ALTER TABLE students
  ADD COLUMN IF NOT EXISTS permit_photo_url TEXT NOT NULL DEFAULT '';

-- Create the storage bucket for permit photos
INSERT INTO storage.buckets (id, name, public)
VALUES ('permit-photos', 'permit-photos', true)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload to their own folder
DROP POLICY IF EXISTS "Users can upload their own permit photo" ON storage.objects;
CREATE POLICY "Users can upload their own permit photo"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'permit-photos'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Allow authenticated users to update/overwrite their own files
DROP POLICY IF EXISTS "Users can update their own permit photo" ON storage.objects;
CREATE POLICY "Users can update their own permit photo"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'permit-photos'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Public read access (admins and instructors need to view)
DROP POLICY IF EXISTS "Anyone can view permit photos" ON storage.objects;
CREATE POLICY "Anyone can view permit photos"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'permit-photos');
