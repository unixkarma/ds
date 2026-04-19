-- ============================================================
-- HelixDriving
-- Migration 015: Restrict schools SELECT to admins + public view
--
-- Before: any user in the school could SELECT every column of
-- `schools`, including stripe_secret_key and stripe_webhook_secret.
-- After:  only admins can read the full `schools` row.
-- Non-admins read safe columns via the `schools_public` view,
-- which is automatically scoped to the caller's school.
-- ============================================================

-- ── 1. Replace schools_select policy with admin-only ────────
DROP POLICY IF EXISTS "schools_select" ON schools;
DROP POLICY IF EXISTS "schools_select_admin" ON schools;

CREATE POLICY "schools_select_admin" ON schools
  FOR SELECT
  USING (id = get_my_school_id() AND is_admin());

-- ── 2. Public view with safe columns ────────────────────────
-- Runs as security definer (postgres) so it bypasses RLS on
-- `schools`. Access is controlled by:
--   • GRANT SELECT to authenticated (logged-in only)
--   • WHERE clause scopes rows to the caller's school
DROP VIEW IF EXISTS schools_public;

CREATE VIEW schools_public
WITH (security_invoker = false) AS
SELECT
  id,
  name,
  email,
  phone,
  address,
  registration_code,
  single_lesson_price_cents,
  student_cancellation_fee_cents,
  instructor_cancellation_fee_cents,
  max_booking_days_ahead,
  created_at
FROM schools
WHERE id = get_my_school_id();

REVOKE ALL ON schools_public FROM PUBLIC, anon;
GRANT  SELECT ON schools_public TO authenticated;
