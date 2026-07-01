-- ============================================================
-- HelixDriving - Migration 039: Atomic, idempotent credit RPCs
--
-- Fixes the two HIGH billing-integrity bugs found 2026-07-01:
--   1. The payment→purchase→ledger→lesson-credit sequence was a series of
--      separately-committed statements. A crash/timeout mid-sequence (very
--      real on serverless) left money captured but lessons never granted, and
--      the "duplicate" idempotency short-circuit blocked the Stripe retry from
--      ever completing the credit.
--   2. lessons_remaining was updated via read-modify-write in JS, losing
--      updates under concurrency (the atomic credit_student_lessons RPC from
--      migration 019 was dead code).
--
-- These functions run each flow inside a single transaction (implicit around a
-- plpgsql function body), so it's all-or-nothing. Idempotency: the payment row
-- is inserted inside the transaction; a Stripe retry hits the UNIQUE
-- stripe_payment_intent_id, raises unique_violation, the whole function rolls
-- back, and we report {duplicate:true} so the caller stops cleanly.
--
-- Concurrency: the balance flow locks the outstanding purchase rows with
-- FOR UPDATE, so two simultaneous balance payments can't double-apply.
--
-- SECURITY: service_role only (the webhook + admin routes use the service-role
-- client). SECURITY DEFINER + pinned search_path.
--
-- Run this in: Supabase Dashboard -> SQL Editor
-- ============================================================

-- Proportional activation, identical to lib/services/student-purchases.ts
-- computeActivated(): fractional lessons lost to floor on a partial payment are
-- always recovered when the purchase is fully paid (paid >= effective => total).
CREATE OR REPLACE FUNCTION _hd_compute_activated(
  p_paid bigint,
  p_effective_price bigint,
  p_total_lessons int
) RETURNS int
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN p_effective_price <= 0 THEN p_total_lessons
    WHEN p_paid <= 0 THEN 0
    WHEN p_paid >= p_effective_price THEN p_total_lessons
    ELSE floor((p_paid::numeric * p_total_lessons) / p_effective_price)::int
  END;
$$;

-- ── record_package_purchase ──────────────────────────────────
-- Webhook package mode + manual package mode (paid_full/partial/unpaid).
-- Caller computes the paid portion from paymentStatus and passes it in.
--   p_purchase_paid_cents  -> student_purchases.amount_paid_cents (drives activation)
--   p_payment_amount_cents -> payments.amount_cents (GROSS incl. surcharge for card)
-- A payment row is created only when p_payment_amount_cents > 0.
CREATE OR REPLACE FUNCTION record_package_purchase(
  p_school_id uuid,
  p_student_id uuid,
  p_package_id uuid,
  p_package_name text,
  p_total_lessons int,
  p_price_cents bigint,
  p_discount_cents bigint,
  p_purchase_paid_cents bigint,
  p_payment_amount_cents bigint,
  p_classroom_required int,
  p_requirements text,
  p_payment_method text,
  p_card_brand text,
  p_card_last4 text,
  p_stripe_payment_intent_id text,
  p_receipt_url text,
  p_description text,
  p_sold_by text,
  p_recorded_by uuid,
  p_sold_by_instructor_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_effective_price bigint;
  v_activated int;
  v_owed bigint;
  v_payment_id uuid;
  v_purchase_id uuid;
BEGIN
  v_effective_price := p_price_cents - COALESCE(p_discount_cents, 0);
  v_activated := _hd_compute_activated(p_purchase_paid_cents, v_effective_price, p_total_lessons);
  v_owed := v_effective_price - p_purchase_paid_cents;

  -- 1. Payment row FIRST — this is the idempotency guard.
  IF p_payment_amount_cents > 0 THEN
    INSERT INTO payments (
      school_id, student_id, package_id, stripe_payment_intent_id,
      amount_cents, discount_cents, status, payment_method,
      card_brand, card_last4, receipt_url, description,
      sold_by, recorded_by, sold_by_instructor_id
    ) VALUES (
      p_school_id, p_student_id, p_package_id, p_stripe_payment_intent_id,
      p_payment_amount_cents, COALESCE(p_discount_cents, 0), 'completed', p_payment_method,
      p_card_brand, p_card_last4, p_receipt_url, p_description,
      p_sold_by, p_recorded_by, p_sold_by_instructor_id
    )
    RETURNING id INTO v_payment_id;
  END IF;

  -- 2. Purchase row.
  INSERT INTO student_purchases (
    school_id, student_id, package_id, package_name,
    total_lessons, lessons_activated, price_cents, discount_cents,
    amount_paid_cents, classroom_required, requirements,
    sold_by, recorded_by, sold_by_instructor_id
  ) VALUES (
    p_school_id, p_student_id, p_package_id, p_package_name,
    p_total_lessons, v_activated, p_price_cents, COALESCE(p_discount_cents, 0),
    p_purchase_paid_cents, COALESCE(p_classroom_required, 0), p_requirements,
    p_sold_by, p_recorded_by, p_sold_by_instructor_id
  )
  RETURNING id INTO v_purchase_id;

  -- 3. Bump student counters (single atomic UPDATE — no lost updates).
  IF v_activated > 0 THEN
    UPDATE students
      SET lessons_remaining = COALESCE(lessons_remaining, 0) + v_activated,
          total_lessons_purchased = COALESCE(total_lessons_purchased, 0) + v_activated
      WHERE id = p_student_id;
  END IF;

  -- 4. Ledger charge for the unpaid portion.
  IF v_owed > 0 THEN
    INSERT INTO student_ledger (
      school_id, student_id, amount_cents, entry_type, description,
      package_id, created_by
    ) VALUES (
      p_school_id, p_student_id, v_owed, 'charge',
      COALESCE(NULLIF(btrim(p_description), ''), 'Pending balance — ' || p_package_name),
      p_package_id, p_recorded_by
    );
  END IF;

  RETURN jsonb_build_object(
    'duplicate', false,
    'purchase_id', v_purchase_id,
    'payment_id', v_payment_id,
    'lessons_activated', v_activated,
    'owed', v_owed
  );
EXCEPTION
  WHEN unique_violation THEN
    -- Only the Stripe payment_intent is unique here. For a card retry, report
    -- duplicate so the caller stops. For a manual sale (null intent) a
    -- unique_violation means something genuinely wrong — re-raise it.
    IF p_stripe_payment_intent_id IS NOT NULL THEN
      RETURN jsonb_build_object('duplicate', true);
    END IF;
    RAISE;
END;
$$;

-- ── record_balance_payment ───────────────────────────────────
-- Webhook balance mode + manual balance mode. Applies the payment to
-- outstanding purchases oldest-first (locked FOR UPDATE), unlocking lessons
-- proportionally, and records payment + negative ledger entry.
--   p_amount_cents         -> applied to purchases + recorded on the ledger
--   p_payment_amount_cents -> payments.amount_cents (GROSS for card)
--   p_payment_method       -> payments.payment_method  (e.g. 'card', 'cash')
--   p_ledger_payment_method-> student_ledger.payment_method (e.g. 'stripe', 'cash')
CREATE OR REPLACE FUNCTION record_balance_payment(
  p_school_id uuid,
  p_student_id uuid,
  p_amount_cents bigint,
  p_payment_amount_cents bigint,
  p_payment_method text,
  p_ledger_payment_method text,
  p_card_brand text,
  p_card_last4 text,
  p_stripe_payment_intent_id text,
  p_receipt_url text,
  p_description text,
  p_sold_by text,
  p_recorded_by uuid,
  p_sold_by_instructor_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_payment_id uuid;
  v_remaining bigint := p_amount_cents;
  v_unlocked int := 0;
  v_applied bigint := 0;
  v_oldest timestamptz := NULL;
  v_eff bigint;
  v_owed bigint;
  v_applied_row bigint;
  v_new_paid bigint;
  v_new_activated int;
  r record;
BEGIN
  -- 1. Payment row FIRST — idempotency guard.
  INSERT INTO payments (
    school_id, student_id, package_id, stripe_payment_intent_id,
    amount_cents, status, payment_method, card_brand, card_last4,
    receipt_url, description, sold_by, recorded_by, sold_by_instructor_id
  ) VALUES (
    p_school_id, p_student_id, NULL, p_stripe_payment_intent_id,
    p_payment_amount_cents, 'completed', p_payment_method, p_card_brand, p_card_last4,
    p_receipt_url, p_description, p_sold_by, p_recorded_by, p_sold_by_instructor_id
  )
  RETURNING id INTO v_payment_id;

  -- 2. Apply to outstanding purchases oldest-first, locking each row so two
  --    concurrent balance payments can't both read the same amount_paid_cents.
  FOR r IN
    SELECT * FROM student_purchases
    WHERE student_id = p_student_id
      AND amount_paid_cents < (price_cents - COALESCE(discount_cents, 0))
    ORDER BY created_at ASC
    FOR UPDATE
  LOOP
    EXIT WHEN v_remaining <= 0;
    v_eff := r.price_cents - COALESCE(r.discount_cents, 0);
    v_owed := v_eff - r.amount_paid_cents;
    IF v_owed <= 0 THEN CONTINUE; END IF;

    v_applied_row := LEAST(v_remaining, v_owed);
    v_new_paid := r.amount_paid_cents + v_applied_row;
    v_new_activated := _hd_compute_activated(v_new_paid, v_eff, r.total_lessons);

    UPDATE student_purchases
      SET amount_paid_cents = v_new_paid,
          lessons_activated = v_new_activated
      WHERE id = r.id;

    IF v_oldest IS NULL THEN v_oldest := r.created_at; END IF;
    v_unlocked := v_unlocked + (v_new_activated - r.lessons_activated);
    v_remaining := v_remaining - v_applied_row;
    v_applied := v_applied + v_applied_row;
  END LOOP;

  -- 3. Backfill sale_date to the oldest touched purchase.
  IF v_oldest IS NOT NULL THEN
    UPDATE payments SET sale_date = v_oldest WHERE id = v_payment_id;
  END IF;

  -- 4. Ledger payment entry (negative = reduces what the student owes).
  INSERT INTO student_ledger (
    school_id, student_id, amount_cents, entry_type, description,
    payment_method, payment_id, created_by
  ) VALUES (
    p_school_id, p_student_id, -p_amount_cents, 'payment',
    COALESCE(NULLIF(btrim(p_description), ''), 'Balance payment'),
    p_ledger_payment_method, v_payment_id, p_recorded_by
  );

  -- 5. Bump lessons by the unlocked delta.
  IF v_unlocked > 0 THEN
    UPDATE students
      SET lessons_remaining = COALESCE(lessons_remaining, 0) + v_unlocked,
          total_lessons_purchased = COALESCE(total_lessons_purchased, 0) + v_unlocked
      WHERE id = p_student_id;
  END IF;

  RETURN jsonb_build_object(
    'duplicate', false,
    'payment_id', v_payment_id,
    'lessons_unlocked', v_unlocked,
    'applied_cents', v_applied
  );
EXCEPTION
  WHEN unique_violation THEN
    IF p_stripe_payment_intent_id IS NOT NULL THEN
      RETURN jsonb_build_object('duplicate', true);
    END IF;
    RAISE;
END;
$$;

-- ── record_custom_payment ────────────────────────────────────
-- Manual custom mode: credit N lessons for an arbitrary amount (paid in full).
-- No purchase row, no ledger entry, no discount. No Stripe intent => no
-- idempotency key (admin action, not auto-retried), but still atomic.
CREATE OR REPLACE FUNCTION record_custom_payment(
  p_school_id uuid,
  p_student_id uuid,
  p_lesson_count int,
  p_amount_cents bigint,
  p_payment_method text,
  p_description text,
  p_sold_by text,
  p_recorded_by uuid,
  p_sold_by_instructor_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_payment_id uuid;
BEGIN
  INSERT INTO payments (
    school_id, student_id, package_id, stripe_payment_intent_id,
    amount_cents, status, payment_method, description,
    sold_by, recorded_by, sold_by_instructor_id
  ) VALUES (
    p_school_id, p_student_id, NULL, NULL,
    p_amount_cents, 'completed', p_payment_method, p_description,
    p_sold_by, p_recorded_by, p_sold_by_instructor_id
  )
  RETURNING id INTO v_payment_id;

  UPDATE students
    SET lessons_remaining = COALESCE(lessons_remaining, 0) + p_lesson_count,
        total_lessons_purchased = COALESCE(total_lessons_purchased, 0) + p_lesson_count
    WHERE id = p_student_id;

  RETURN jsonb_build_object('payment_id', v_payment_id);
END;
$$;

-- ── Permissions: service_role only ───────────────────────────
-- Revoke from anon + authenticated explicitly, not just PUBLIC: Supabase's
-- default privileges grant EXECUTE on new public functions directly to those
-- roles, and a revoke from PUBLIC does not remove a direct grant. Without this
-- any anon/authenticated caller could invoke these SECURITY DEFINER RPCs via
-- PostgREST and forge billing. (See migration 040 — same fix, applied to prod.)
REVOKE ALL ON FUNCTION record_package_purchase(uuid,uuid,uuid,text,int,bigint,bigint,bigint,bigint,int,text,text,text,text,text,text,text,text,uuid,uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION record_balance_payment(uuid,uuid,bigint,bigint,text,text,text,text,text,text,text,text,uuid,uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION record_custom_payment(uuid,uuid,int,bigint,text,text,text,uuid,uuid) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION record_package_purchase(uuid,uuid,uuid,text,int,bigint,bigint,bigint,bigint,int,text,text,text,text,text,text,text,text,uuid,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION record_balance_payment(uuid,uuid,bigint,bigint,text,text,text,text,text,text,text,text,uuid,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION record_custom_payment(uuid,uuid,int,bigint,text,text,text,uuid,uuid) TO service_role;
