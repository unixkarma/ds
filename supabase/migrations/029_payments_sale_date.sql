-- ============================================================
-- HelixDriving - Migration 029: Sale vs Payment date split
-- Adds payments.sale_date — the date the package/lessons were
-- added to the student's account (the "sale"). Existing
-- payments.created_at is renamed conceptually to "paid_at"
-- (when the money actually arrived).
--
-- For simultaneous sale + payment (Stripe checkout, manual
-- paid_full / partial / custom): sale_date == created_at.
-- For balance payments of a previously-unpaid sale:
--   sale_date = the original ledger charge's created_at.
--
-- Backfill: existing rows get sale_date = created_at.
-- Run this in: Supabase Dashboard -> SQL Editor
-- ============================================================

ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS sale_date TIMESTAMPTZ;

UPDATE payments
SET sale_date = created_at
WHERE sale_date IS NULL;

ALTER TABLE payments
  ALTER COLUMN sale_date SET DEFAULT now();

ALTER TABLE payments
  ALTER COLUMN sale_date SET NOT NULL;
