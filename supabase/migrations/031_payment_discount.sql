-- ============================================================
-- HelixDriving - Migration 031: Payment Discount
-- Adds discount_cents to both `payments` and `student_purchases`.
--
-- Semantics (package mode only — custom + balance always have
-- discount_cents = 0):
--   effective_price = price_cents - discount_cents
--   activation:      lessons_activated = floor(amount_paid * total / effective_price)
--   owed/balance:    effective_price - amount_paid_cents
--
-- On `student_purchases`, the OLD constraint
--   amount_paid_cents <= price_cents
-- is replaced with the tighter
--   amount_paid_cents <= price_cents - discount_cents
-- which subsumes the original.
-- Run this in: Supabase Dashboard -> SQL Editor
-- ============================================================

-- ── payments ──────────────────────────────────────────────────
ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS discount_cents BIGINT NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'payments_discount_nonneg'
  ) THEN
    ALTER TABLE payments
      ADD CONSTRAINT payments_discount_nonneg CHECK (discount_cents >= 0);
  END IF;
END $$;

-- ── student_purchases ─────────────────────────────────────────
ALTER TABLE student_purchases
  ADD COLUMN IF NOT EXISTS discount_cents BIGINT NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'student_purchases_discount_nonneg'
  ) THEN
    ALTER TABLE student_purchases
      ADD CONSTRAINT student_purchases_discount_nonneg CHECK (discount_cents >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'student_purchases_discount_le_price'
  ) THEN
    ALTER TABLE student_purchases
      ADD CONSTRAINT student_purchases_discount_le_price
      CHECK (discount_cents <= price_cents);
  END IF;
END $$;

-- Replace the old paid<=price constraint with the tighter paid<=price-discount.
ALTER TABLE student_purchases
  DROP CONSTRAINT IF EXISTS student_purchases_paid_le_price;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'student_purchases_paid_le_effective'
  ) THEN
    ALTER TABLE student_purchases
      ADD CONSTRAINT student_purchases_paid_le_effective
      CHECK (amount_paid_cents <= price_cents - discount_cents);
  END IF;
END $$;

-- Update the unpaid partial index to reflect the effective price.
DROP INDEX IF EXISTS student_purchases_unpaid_idx;
CREATE INDEX IF NOT EXISTS student_purchases_unpaid_idx
  ON student_purchases (student_id, created_at)
  WHERE amount_paid_cents < price_cents - discount_cents;
