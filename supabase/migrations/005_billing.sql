ALTER TABLE schools
  ADD COLUMN IF NOT EXISTS stripe_publishable_key TEXT,
  ADD COLUMN IF NOT EXISTS stripe_secret_key TEXT,
  ADD COLUMN IF NOT EXISTS stripe_webhook_secret TEXT,
  ADD COLUMN IF NOT EXISTS single_lesson_price_cents INTEGER NOT NULL DEFAULT 0;

ALTER TABLE students
  ADD COLUMN IF NOT EXISTS lessons_remaining INTEGER NOT NULL DEFAULT 0;
