-- ============================================================
-- HelixDriving - Migration 022: School Timezone
-- Adds an IANA timezone column to schools so all date/time math
-- (booking, calendar, reports) can be anchored to the school's
-- local time instead of the server's. Default 'America/Chicago'
-- since the first client is in Chicago.
-- Run this in: Supabase Dashboard -> SQL Editor
-- ============================================================

ALTER TABLE schools
  ADD COLUMN IF NOT EXISTS timezone TEXT NOT NULL DEFAULT 'America/Chicago';

-- Restrict to a known list of IANA US timezones for the MVP.
-- Drop + recreate so the migration is idempotent.
ALTER TABLE schools
  DROP CONSTRAINT IF EXISTS schools_timezone_check;

ALTER TABLE schools
  ADD CONSTRAINT schools_timezone_check
  CHECK (timezone IN (
    'America/New_York',     -- Eastern
    'America/Chicago',      -- Central
    'America/Denver',       -- Mountain
    'America/Los_Angeles',  -- Pacific
    'America/Anchorage',    -- Alaska
    'America/Phoenix',      -- Arizona (no DST)
    'Pacific/Honolulu'      -- Hawaii
  ));

-- NOTE: if you want non-admin code (student/instructor portals) to read
-- the timezone via the schools_public view from migration 015, you must
-- also recreate that view to include the new `timezone` column. Skipped
-- here to avoid clobbering whatever shape the view currently has.
