-- ============================================================
-- HelixDriving - Migration 021: Payment Method Details
-- Adds payment method type + card brand/last4 to payments so the
-- revenue report can show how each sale was paid and let admins
-- cross-reference card payments against the Stripe dashboard.
-- Run this in: Supabase Dashboard -> SQL Editor
-- ============================================================

ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS payment_method TEXT,
  ADD COLUMN IF NOT EXISTS card_brand     TEXT,
  ADD COLUMN IF NOT EXISTS card_last4     TEXT
    CHECK (card_last4 IS NULL OR card_last4 ~ '^[0-9]{4}$');
