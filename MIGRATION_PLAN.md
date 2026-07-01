# DSS → HelixDriving — Production Migration Plan

Migration of live data (students, instructors, payments/ledger, schedule) from
the legacy **drivingschoolsoftware.com** system into this platform.

> **Golden rule:** money and lesson counts must reconcile to the cent and to the
> unit, before AND after cutover. If reconciliation fails, you do not cut over.

---

## 0. Go / No-Go gates (must ALL be green before touching production data)

| Gate | Owner | Status |
|------|-------|--------|
| Security blockers closed (headers, error sanitization, rate limiting live) | eng | ✅ code done — Upstash env must be set in prod |
| **Billing atomicity fixed** (atomic credit RPCs; see §6) | eng | 🟡 code done (migration 039) — MUST apply migration to prod before deploy |
| Stripe secrets encrypted at rest (AES-256-GCM, lib/crypto.ts) | eng | 🟡 code done — set STRIPE_KEY_ENCRYPTION_KEY in prod + run scripts/encrypt-stripe-keys.ts |
| Supabase **PITR** (point-in-time recovery) enabled on prod plan | ops | ⛔ verify |
| Privacy Policy + Terms of Service published | legal | ⛔ OPEN |
| DPAs signed with Supabase, Stripe, Resend, Vercel | legal | ⛔ verify |
| Staging dry-run reconciles 100% | eng | ⛔ pending |
| Rollback tested | eng | ⛔ pending |

---

## 1. Prerequisites

1. **Obtain the DSS data export.** Confirm format (CSV/SQL/API) and completeness:
   students, instructors, packages, payments, lesson history, balances/credits,
   documents. Get a *frozen* snapshot + the exact timestamp it was taken.
2. **Field mapping doc.** Map every DSS field → this schema. Flag fields with no
   home (don't silently drop — driving schools have **state record-retention
   obligations**; confirm with the client what Illinois requires them to keep).
3. **Staging environment.** A separate Supabase project + Vercel preview with an
   *anonymized* copy of prod schema. Never dry-run against prod.
4. **Freeze window agreed** with the client (no bookings/payments in DSS during
   cutover).

---

## 2. Data mapping — high-risk areas

- **Money is in cents (BIGINT).** DSS likely stores dollars/decimals. Convert with
  explicit rounding rules; never use floats. Verify no value loses precision.
- **Balances / credits.** This system splits *hour balance* (`lessons_remaining`)
  from *money balance* (`student_ledger`). Map DSS balances into the correct one.
  Every migrated student needs a ledger opening entry if they carry a balance.
- **Purchases.** `student_purchases` drives proportional lesson activation. Decide:
  do you backfill historical purchases, or open each student with a single
  "opening balance" purchase reflecting their current paid/owed state? (Recommend
  the latter — simpler, avoids re-deriving historical activation math.)
- **Age group / program type** (teen vs adult) must be set — defaults to `adult`.
  Teens with no parent phone will violate the DB CHECK; clean before import.
- **Uniqueness:** emails, license/permit numbers, plates have UNIQUE constraints.
  De-dupe in the export first or the import will partially fail.
- **Timezone:** all timestamps land in `America/Chicago` semantics. Confirm DSS
  export timezone and convert consistently.

---

## 3. Import procedure (staging first, then prod)

1. Import via the **service-role client / SQL**, RLS bypassed, inside a single
   transaction per table where possible. Order respects FKs:
   `schools → users → students/instructors → packages → student_purchases →
   payments → student_ledger → lessons → classroom_*`.
2. **Do NOT** send invite/confirmation emails during import (set `email_confirm`
   true, suppress Resend). Communicate the new-login process out of band.
3. Generate temporary passwords or a forced-reset flow for migrated users.
4. Re-attach documents (permit photos, instructor docs) to the private buckets.

---

## 4. Financial reconciliation (the critical step)

Run these BEFORE and AFTER import and diff them. Any nonzero delta blocks cutover.

- **Per student:** `SUM(payments) − SUM(charges)` in new system == DSS balance.
- **Ledger identity:** `student.balance == SUM(student_ledger.amount_cents)`.
- **Lesson identity:** `lessons_remaining == SUM(purchases.lessons_activated) −
  lessons_consumed` (per your activation model).
- **Grand totals:** total money owed, total lessons outstanding, student count,
  instructor count — DSS vs new, exact match.
- Export both sides to CSV, diff programmatically, keep the report as an audit
  artifact.

---

## 5. Cutover & rollback

**Cutover**
1. Enter DSS freeze (read-only). Take final DSS export.
2. Snapshot new prod DB (label it `pre-migration`), confirm PITR timestamp.
3. Run import against prod. Run §4 reconciliation. **Stop if any delta.**
4. Smoke test: admin login, student login, book a lesson, record a payment,
   Stripe test checkout, `/api/health` green.
5. Flip DNS / announce. Monitor errors closely for 48h.

**Rollback**
- Trigger: reconciliation delta discovered post-import, or critical breakage.
- Action: PITR-restore prod to the `pre-migration` snapshot, re-open DSS from the
  frozen read-only copy. Because DSS stays frozen (not deleted) until you've run
  ≥1 week clean, rollback is always available.
- **Do not decommission DSS** until: 1 week stable + reconciliation re-verified +
  client sign-off.

---

## 6. Billing bugs to fix BEFORE migration (from audit 2026-07-01)

These corrupt money/lesson data under real concurrency + Stripe retries. Details
in the audit; summary:

1. **HIGH — non-atomic payment sequence + idempotency short-circuit.** Payment row
   commits, then a crash before purchase/ledger/lesson credit leaves money
   captured but lessons never granted; the "duplicate" guard blocks the retry from
   ever completing the credit. *(webhook + manual payment routes)*
2. **HIGH — read-modify-write on `lessons_remaining` bypasses the atomic
   `credit_student_lessons` RPC** (migration 019), which is currently **dead
   code**. Concurrent credits lose updates. This is exactly what the RPC was built
   to prevent.
3. MEDIUM — `applyPaymentToPurchases` non-atomic; concurrent balance payments can
   double-apply or lose a payment's purchase credit.
4. MEDIUM — no `payment_status` check and no refund/chargeback (`charge.refunded`,
   `charge.dispute`) handling; refunds never claw back lessons.

**Recommendation:** move the credit sequence into a single atomic Postgres RPC
(wrap purchase update + ledger insert + lesson bump + payment insert in one
transaction, keyed idempotently on the payment intent) before migrating real
volume. Card-only launch lowers #4's urgency but it should be tracked.

---

## 7. Post-cutover monitoring

- Error tracking (Sentry) live — also your breach-detection per IL PIPA.
- Uptime monitor hitting `/api/health`.
- Watch Stripe webhook delivery/retry dashboard for the first week.
- Daily reconciliation job for the first week (re-run §4, alert on drift).
