-- ============================================================
-- HelixDriving - Migration 039: Block self privilege escalation (SECURITY)
--
-- Fixes CRITICAL C1: the "users_update_own" RLS policy (migration 002)
-- allows a user to UPDATE their own row with no column restriction, so any
-- student/instructor could run, via the PostgREST API with only the anon key:
--     UPDATE users SET role = 'admin' WHERE id = auth.uid();
-- or reassign their own school_id to jump into another tenant. Every access
-- check in the app trusts users.role / users.school_id, so this breaks the
-- entire authorization model.
--
-- A column-restricted WITH CHECK can't compare against the OLD row, so we use
-- a BEFORE UPDATE trigger, which sees both OLD and NEW. It only blocks the
-- self-service path (auth.uid() = the row being changed). Admin API routes use
-- the service-role key, where auth.uid() is NULL, so they are unaffected and
-- can still change roles / move users legitimately.
--
-- Run this in: Supabase Dashboard -> SQL Editor
-- ============================================================

CREATE OR REPLACE FUNCTION prevent_self_privilege_escalation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only guard the case where the acting user is editing their OWN row.
  -- Service-role calls (admin API) have auth.uid() = NULL and are allowed.
  IF auth.uid() IS NOT NULL AND auth.uid() = NEW.id THEN
    IF NEW.role IS DISTINCT FROM OLD.role THEN
      RAISE EXCEPTION 'Not allowed to change your own role';
    END IF;
    IF NEW.school_id IS DISTINCT FROM OLD.school_id THEN
      RAISE EXCEPTION 'Not allowed to change your own school';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_self_privilege_escalation ON users;
CREATE TRIGGER trg_prevent_self_privilege_escalation
  BEFORE UPDATE ON users
  FOR EACH ROW
  EXECUTE FUNCTION prevent_self_privilege_escalation();
