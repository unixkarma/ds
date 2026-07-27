-- ============================================================
-- HelixDriving - Migration 044: 'card' as a manual payment method
--
-- The Record Payment dialog now offers "Card (in person)" as a manual
-- payment method — for schools that swipe a card on a separate terminal
-- (Square, Clover, etc.) and just want it logged, not a real Stripe
-- charge. Adds 'card' to the ledger's allowed payment_method values
-- (payments.payment_method is free TEXT already and needs no change).
-- Run this in: Supabase Dashboard -> SQL Editor
-- ============================================================

ALTER TABLE student_ledger
  DROP CONSTRAINT IF EXISTS student_ledger_payment_method_check;

ALTER TABLE student_ledger
  ADD CONSTRAINT student_ledger_payment_method_check
    CHECK (payment_method IS NULL OR payment_method IN ('cash', 'check', 'card', 'other', 'stripe'));
