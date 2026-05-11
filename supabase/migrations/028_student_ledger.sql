-- ============================================================
-- HelixDriving - Migration 028: Student Ledger + Payment Concept
-- Adds:
--   1. payments.description     — free-text concept for manual/custom payments
--      (e.g. "Pago parcial paquete 10h", "Saldo pendiente")
--   2. student_ledger table     — append-only journal of charges,
--      payments and adjustments. Student balance = SUM(amount_cents):
--          positive = student owes the school
--          negative = school owes the student (credit)
--      Entries are created when:
--        - Admin assigns a package marked as not-paid / partially-paid
--        - A payment is recorded (Stripe webhook or manual) — mirrored
--          as a negative entry that offsets the charge
--        - Admin manually adjusts balance (discount, extra fee, etc.)
-- Run this in: Supabase Dashboard -> SQL Editor
-- ============================================================

-- 1. Payment description ------------------------------------------------------
ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS description TEXT;

-- 2. Ledger table -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS student_ledger (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id       UUID NOT NULL REFERENCES schools(id)  ON DELETE CASCADE,
  student_id      UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  amount_cents    BIGINT NOT NULL,
  entry_type      TEXT   NOT NULL CHECK (entry_type IN ('charge', 'payment', 'adjustment')),
  description     TEXT   NOT NULL DEFAULT '',
  payment_method  TEXT   CHECK (payment_method IS NULL OR payment_method IN ('cash', 'check', 'other', 'stripe')),
  payment_id      UUID   REFERENCES payments(id) ON DELETE SET NULL,
  package_id      UUID   REFERENCES packages(id) ON DELETE SET NULL,
  created_by      UUID   REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS student_ledger_student_idx
  ON student_ledger (student_id, created_at DESC);

CREATE INDEX IF NOT EXISTS student_ledger_school_idx
  ON student_ledger (school_id, created_at DESC);

-- 3. RLS ----------------------------------------------------------------------
ALTER TABLE student_ledger ENABLE ROW LEVEL SECURITY;

-- Admins: full access on their own school
DROP POLICY IF EXISTS student_ledger_admin_all ON student_ledger;
CREATE POLICY student_ledger_admin_all ON student_ledger
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
        AND users.role = 'admin'
        AND users.school_id = student_ledger.school_id
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
        AND users.role = 'admin'
        AND users.school_id = student_ledger.school_id
    )
  );

-- Students: SELECT only their own ledger entries
DROP POLICY IF EXISTS student_ledger_student_select ON student_ledger;
CREATE POLICY student_ledger_student_select ON student_ledger
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM students
      WHERE students.id = student_ledger.student_id
        AND students.user_id = auth.uid()
    )
  );
