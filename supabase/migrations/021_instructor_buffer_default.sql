-- ============================================================
-- HelixDriving - Migration 021: Instructor Buffer Default = 15 min
--
-- Raises the default `buffer_minutes` on new instructors from 0 to 15.
-- Also backfills any existing instructor currently at 0 to 15 — these
-- rows inherited the old default rather than being an explicit choice.
--
-- Rationale: 15 min covers trivial transitions (parking, bathroom,
-- fuel, same-neighborhood drive). Longer trips will be caught by the
-- Google Maps Distance Matrix check (pending 2026-04-21).
--
-- Run this in: Supabase Dashboard -> SQL Editor
-- Idempotent: safe to re-run.
-- ============================================================

ALTER TABLE instructors
  ALTER COLUMN buffer_minutes SET DEFAULT 15;

UPDATE instructors SET buffer_minutes = 15 WHERE buffer_minutes = 0;
