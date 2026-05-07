-- ============================================================
-- HelixDriving - Migration 027: Payment receipt URL
-- Stores the Stripe-hosted receipt URL captured at webhook time
-- so the student account page can link directly to it.
-- Also relax stripe_payment_intent_id to allow NULL for manual
-- (cash/check/other) payments recorded by admins.
-- Run this in: Supabase Dashboard -> SQL Editor
-- ============================================================

ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS receipt_url TEXT;

ALTER TABLE payments
  ALTER COLUMN stripe_payment_intent_id DROP NOT NULL;
