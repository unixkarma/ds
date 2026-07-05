-- ============================================================
-- HelixDriving - Migration 042: Make permit photos private (SECURITY)
--
-- Fixes HIGH A3 (storage side). Migration 010 created the "permit-photos"
-- bucket as PUBLIC, with a storage path {user_id}/permit.{ext} and a
-- getPublicUrl() link stored on students.permit_photo_url. That means every
-- learner's-permit image (a government ID document) is world-readable by anyone
-- who knows or guesses the URL, and any authenticated user could read any other
-- student's permit via the broad SELECT policy.
--
-- After this migration the bucket is private and images are served only through
-- short-lived signed URLs minted server-side with the service-role key
-- (see lib/storage/permit-photo.ts). The app now stores the bare storage path
-- on students.permit_photo_url, so we backfill existing rows that still hold a
-- full public URL.
--
-- Deploy the matching code in the SAME release: the app must already sign URLs,
-- otherwise the <img> links break once the bucket goes private.
--
-- Run this in: Supabase Dashboard -> SQL Editor
-- ============================================================

-- 1) Bucket goes private.
UPDATE storage.buckets SET public = false WHERE id = 'permit-photos';

-- 2) Drop the broad "any authenticated user can view" read policy. Direct reads
--    are no longer used by the app; signed URLs are minted with the service-role
--    client, which bypasses storage RLS.
DROP POLICY IF EXISTS "Anyone can view permit photos" ON storage.objects;

-- 3) Backfill: convert any stored full public URL to its bare storage path
--    ({user_id}/permit.{ext}) so the signing helper receives a clean path.
UPDATE students
SET permit_photo_url = regexp_replace(permit_photo_url, '^.*/permit-photos/', '')
WHERE permit_photo_url LIKE '%/permit-photos/%';
