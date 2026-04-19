-- ============================================================
-- HelixDriving - Migration 019: Atomic Lesson Credit RPC
--
-- The Stripe webhook previously did a read-modify-write to credit
-- `lessons_remaining` after a successful checkout:
--
--   SELECT lessons_remaining FROM students WHERE id = ?;
--   UPDATE students SET lessons_remaining = <value> + N WHERE id = ?;
--
-- That's not atomic — two concurrent webhooks (e.g. a Stripe retry
-- landing alongside the original) could both read the same balance,
-- both write back, and lose one increment.
--
-- This migration adds an atomic SQL function the webhook calls via
-- `supabase.rpc('credit_student_lessons', {...})`. Combined with the
-- payments_stripe_pi_unique index from migration 017, the webhook is
-- now fully idempotent and race-safe.
--
-- Run this in: Supabase Dashboard -> SQL Editor
-- Idempotent: CREATE OR REPLACE.
-- ============================================================

CREATE OR REPLACE FUNCTION credit_student_lessons(
  p_student_id uuid,
  p_lesson_count int
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE students
  SET lessons_remaining = lessons_remaining + p_lesson_count,
      total_lessons_purchased = total_lessons_purchased + p_lesson_count
  WHERE id = p_student_id;
$$;

-- Only the service-role (admin client) should be able to call this.
-- Revoke from PUBLIC/anon/authenticated so students can't grant
-- themselves free lessons by calling the RPC directly.
REVOKE ALL ON FUNCTION credit_student_lessons(uuid, int) FROM PUBLIC;
REVOKE ALL ON FUNCTION credit_student_lessons(uuid, int) FROM anon;
REVOKE ALL ON FUNCTION credit_student_lessons(uuid, int) FROM authenticated;
GRANT EXECUTE ON FUNCTION credit_student_lessons(uuid, int) TO service_role;
