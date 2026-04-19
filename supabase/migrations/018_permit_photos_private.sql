-- ============================================================
-- HelixDriving - Migration 018: Privatize permit-photos bucket
--
-- Migration 010 created `permit-photos` as a PUBLIC bucket and the
-- SELECT policy "Anyone can view permit photos" allowed any
-- authenticated user to list/read any permit image. That means a
-- student at School A could fetch a student's permit photo from
-- School B just by guessing the path (user_id is a UUID, but URLs
-- leaked via server logs / referrers are enough).
--
-- This migration:
--   1. Flips the bucket to PRIVATE.
--   2. Converts any pre-existing public URLs in `students.permit_photo_url`
--      into plain storage paths ({user_id}/permit.{ext}). The app now
--      generates short-lived signed URLs on read via
--      `lib/services/permit-photo.ts`.
--   3. Replaces the blanket SELECT policy with an own-folder-only one,
--      so a user-scoped Supabase client can only read their own photo.
--      Admin + instructor views generate signed URLs server-side using
--      the service-role client (bypasses RLS), so they don't need a
--      storage policy.
--
-- REQUIRES: code change in
--   - lib/services/permit-photo.ts (new helper)
--   - app/api/students/[id]/permit-photo/route.ts (stores path, returns signed URL)
--   - app/(student)/student/page.tsx              (resolves signed URL server-side)
--   - app/(dashboard)/dashboard/students/[id]/page.tsx (same)
-- All applied before running this migration.
--
-- Run this in: Supabase Dashboard -> SQL Editor
-- Idempotent: safe to re-run.
-- ============================================================

-- ── 1. Flip bucket to PRIVATE ────────────────────────────────
UPDATE storage.buckets
SET public = false
WHERE id = 'permit-photos';

-- ── 2. Convert existing public URLs to storage paths ─────────
-- Matches: https://<project>.supabase.co/storage/v1/object/public/permit-photos/{user_id}/permit.jpg
-- Result: {user_id}/permit.jpg
UPDATE students
SET permit_photo_url = regexp_replace(permit_photo_url, '^.*?/permit-photos/', '')
WHERE permit_photo_url LIKE '%/permit-photos/%';

-- ── 3. Replace SELECT policy ─────────────────────────────────
-- Drop the blanket "any authenticated user can view" policy.
DROP POLICY IF EXISTS "Anyone can view permit photos" ON storage.objects;

-- New SELECT policy: user-scoped client can only read their own photo.
-- Admin/instructor access goes through the service-role client, which
-- bypasses RLS — no storage policy needed for them.
DROP POLICY IF EXISTS "Users can view their own permit photo" ON storage.objects;
CREATE POLICY "Users can view their own permit photo"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'permit-photos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- ── Verification (DO NOT RUN — reference only) ───────────────
/*
-- Bucket should be private
SELECT id, public FROM storage.buckets WHERE id = 'permit-photos';

-- All permit_photo_url values should be plain paths (no http://)
SELECT id, permit_photo_url FROM students
WHERE permit_photo_url <> '' AND permit_photo_url LIKE 'http%';

-- Storage policies on permit-photos
SELECT policyname, cmd FROM pg_policies
WHERE schemaname = 'storage' AND tablename = 'objects'
  AND policyname LIKE '%permit%';
*/
