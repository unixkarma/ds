-- ============================================================
-- HelixDriving - Migration 043: Platform billing (schools pay the platform)
--
-- New layer, distinct from the per-school Stripe integration (which is how each
-- school charges ITS students). This table tracks the SaaS subscription each
-- school pays to the platform owner, billed through Lemon Squeezy (Merchant of
-- Record). Rows are written only by the Lemon Squeezy webhook (service-role);
-- admins can read their own school's row.
--
-- Run this in: Supabase Dashboard -> SQL Editor
-- ============================================================

CREATE TABLE IF NOT EXISTS school_subscriptions (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id              UUID NOT NULL UNIQUE REFERENCES schools(id) ON DELETE CASCADE,
  provider               TEXT NOT NULL DEFAULT 'lemonsqueezy',
  -- Mirrors Lemon Squeezy subscription status:
  -- none | on_trial | active | paused | past_due | unpaid | cancelled | expired
  status                 TEXT NOT NULL DEFAULT 'none',
  ls_subscription_id     TEXT,
  ls_customer_id         TEXT,
  ls_variant_id          TEXT,
  ls_customer_portal_url TEXT,
  -- End of the current paid period (Lemon Squeezy `renews_at` / `ends_at`).
  -- Used to keep access during a cancelled-but-not-yet-expired period.
  current_period_end     TIMESTAMPTZ,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_school_subscriptions_ls_sub
  ON school_subscriptions (ls_subscription_id);

ALTER TABLE school_subscriptions ENABLE ROW LEVEL SECURITY;

-- Admins may read their own school's subscription. There are deliberately no
-- INSERT/UPDATE/DELETE policies: only the service-role webhook writes here.
DROP POLICY IF EXISTS school_subscriptions_select ON school_subscriptions;
CREATE POLICY school_subscriptions_select ON school_subscriptions
  FOR SELECT
  USING (school_id = get_my_school_id() AND is_admin());
