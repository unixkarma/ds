-- ============================================================
-- HelixDriving - Migration 040: Lock down credit RPC execute grants
--
-- SECURITY HOTFIX for migration 039. 039 relied on `REVOKE ... FROM PUBLIC`,
-- but Supabase's default privileges grant EXECUTE on new public-schema
-- functions DIRECTLY to `anon` and `authenticated`. A revoke from PUBLIC does
-- not remove those direct grants, so the SECURITY DEFINER credit RPCs remained
-- callable by anon (unauthenticated) + authenticated (any logged-in student)
-- via PostgREST /rest/v1/rpc/... with the public anon key — a billing-forgery
-- hole (e.g. a student calling record_custom_payment to credit themselves
-- lessons for $0).
--
-- This revokes EXECUTE from PUBLIC + anon + authenticated explicitly and
-- (re)grants only service_role. Idempotent; safe to re-run.
--
-- Verify afterwards:
--   SELECT p.proname,
--     has_function_privilege('service_role', p.oid, 'EXECUTE') AS service_role_ok,
--     has_function_privilege('anon',          p.oid, 'EXECUTE') AS anon_can_exec,
--     has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authed_can_exec
--   FROM pg_proc p
--   WHERE p.proname IN ('record_package_purchase','record_balance_payment','record_custom_payment');
--   -- expect: service_role_ok=true, anon_can_exec=false, authed_can_exec=false
--
-- Run this in: Supabase Dashboard -> SQL Editor
-- ============================================================

REVOKE EXECUTE ON FUNCTION record_package_purchase(uuid,uuid,uuid,text,int,bigint,bigint,bigint,bigint,int,text,text,text,text,text,text,text,text,uuid,uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION record_balance_payment(uuid,uuid,bigint,bigint,text,text,text,text,text,text,text,text,uuid,uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION record_custom_payment(uuid,uuid,int,bigint,text,text,text,uuid,uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION _hd_compute_activated(bigint,bigint,int) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION record_package_purchase(uuid,uuid,uuid,text,int,bigint,bigint,bigint,bigint,int,text,text,text,text,text,text,text,text,uuid,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION record_balance_payment(uuid,uuid,bigint,bigint,text,text,text,text,text,text,text,text,uuid,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION record_custom_payment(uuid,uuid,int,bigint,text,text,text,uuid,uuid) TO service_role;
