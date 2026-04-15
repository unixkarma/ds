-- 007: Add pickup and dropoff locations to lessons
ALTER TABLE lessons
  ADD COLUMN pickup_location  TEXT NOT NULL DEFAULT '',
  ADD COLUMN dropoff_location TEXT NOT NULL DEFAULT '';
