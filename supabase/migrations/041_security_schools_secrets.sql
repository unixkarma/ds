-- ============================================================
-- HelixDriving - Migration 041: Lock down schools secrets & tenant leak (SECURITY)
--
-- Fixes CRITICAL C2/C3 and MEDIUM M6.
--
-- Problem 1 (anon cross-tenant dump): migration 006 added a permissive policy
--   "Anyone can read school by registration_code" ON schools USING (true).
--   RLS policies are OR'd, so this let ANY caller with the anon key run
--   `GET /rest/v1/schools?select=stripe_secret_key` and dump every school's
--   Stripe secret + contact info. The app never relies on it: the public
--   register/apply routes read schools via the service-role key.
--
-- Problem 2 (own-school secret read): even with the above dropped, the
--   schools_select policy returns the whole row to any authenticated member of
--   the school, so a student/instructor could read their school's
--   stripe_secret_key. Postgres column privileges fix this, but a column-level
--   REVOKE is ignored while a table-level SELECT grant exists (Supabase grants
--   that by default), so we REVOKE the table grant and re-GRANT only the
--   non-secret columns.
--
-- Problem 3 (registration_code enumeration): the schools_public view (024) is
--   granted to anon with no WHERE filter, exposing every school's
--   registration_code. The view is dead code (nothing in the app reads it), so
--   we drop it.
--
-- Service-role (createAdminClient) bypasses RLS and grants, so checkout,
-- payment-link, webhook and settings-save keep working unchanged.
--
-- Run this in: Supabase Dashboard -> SQL Editor
-- ============================================================

-- Problem 1: remove the blanket-read policy.
DROP POLICY IF EXISTS "Anyone can read school by registration_code" ON schools;

-- Problem 3: drop the unused, over-exposed public view.
DROP VIEW IF EXISTS schools_public;

-- Problem 2: restrict column-level SELECT so anon/authenticated can never read
-- the Stripe secrets. anon reads schools only through the service-role in the
-- app, so it gets no grant at all; authenticated gets every column EXCEPT the
-- two secrets. Row visibility is still governed by the schools_select RLS
-- policy (own school only).
REVOKE SELECT ON schools FROM anon;
REVOKE SELECT ON schools FROM authenticated;

GRANT SELECT (
  id,
  name,
  email,
  phone,
  address,
  created_at,
  registration_code,
  timezone,
  stripe_publishable_key,             -- publishable keys are public by design
  single_lesson_price_cents,
  student_cancellation_fee_cents,
  instructor_cancellation_fee_cents,
  student_no_show_fee_cents,
  max_booking_days_ahead
) ON schools TO authenticated;
