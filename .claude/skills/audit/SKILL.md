---
name: audit
description: Read-only audit of the HelixDriving driving-school SaaS. Scans a chosen domain (billing, security, scheduling, data, or all) for real bugs and logic flaws, adversarially verifies each finding, and writes a ranked findings report to .claude/audits/findings.md for the apply-fixes skill to consume. Use when the user asks to audit the system, look for bugs, review billing/ledger integrity, check RLS/multi-tenant security, review scheduling/booking logic, or check data-integrity. Invoke as `/audit [billing|security|scheduling|data|all]`.
---

# audit — HelixDriving system auditor (read-only)

You are auditing **HelixDriving**, a multi-tenant driving-school SaaS (Next.js 16 App Router, TypeScript strict, Supabase Postgres + RLS, Stripe per-school keys). This skill is **diagnosis only — never edit code here.** The `apply-fixes` skill acts on what you produce.

## Scope argument

The argument selects the domain: `billing` | `security` | `scheduling` | `data` | `all` (default `all` if none given). Map fuzzy input (e.g. "money", "rls", "booking", "migrations") to the closest domain. If `all`, run every domain.

## How to run the audit

1. **Read the ground truth first.** Skim `MEMORY.md` (and any `project_*` files it points to) and `CLAUDE.md` for the current architecture, invariants, and migration state. The invariants below are a starting checklist, not the whole truth — the codebase is authoritative.

2. **Fan out with subagents.** For each in-scope domain, launch an `Explore` (or `general-purpose`) subagent to map the relevant files and pull concrete code excerpts (`file:line`). Run independent domain scouts in parallel. Keep the conclusions, not the file dumps.

3. **Reason about logic flaws, not style.** You are hunting for behavior that is *wrong* — money that doesn't reconcile, data that leaks across tenants, races, off-by-one activation, missing ledger writes, constraints the code can violate. Ignore formatting/naming nits.

4. **Adversarially verify every candidate before reporting it.** For each suspected bug, spawn a skeptic subagent (or reason in a separate pass) whose job is to *refute* it: find the guard, constraint, or code path that already prevents the failure. **Only keep a finding if you can state a concrete failure scenario (inputs → wrong outcome) that survives refutation.** Default to dropping uncertain findings. A short list of real bugs beats a long list of maybes.

5. **Rank** surviving findings by severity: `critical` (money loss / cross-tenant leak / data corruption) > `high` (wrong balances/counters, auth gap) > `medium` (logic flaw with limited blast radius) > `low` (defensive gap / latent risk).

6. **Write the report** to `.claude/audits/findings.md` using the exact format below (overwrite any previous run). Then give the user a short spoken summary (counts by severity + the headline findings). Do **not** print the whole report inline — point them to the file and offer `/apply-fixes`.

## Domain checklists (HelixDriving-specific invariants)

These encode how the system is *supposed* to behave. A violation is a finding.

### billing — ledger / purchases / payments / lessons
- **Balance = `SUM(student_ledger.amount_cents)`** is the single source of truth for money owed (positive = owes, negative = credit). Every balance-affecting operation MUST write a ledger entry. Look for mutations that change what a student owes without a corresponding ledger row.
- **Three manual modes** in `POST /api/payments/manual`: `package` (charge ledger entry for the *unpaid* portion only; payment row for paid portion), `balance` (payment row + negative `payment` ledger entry; `applyPaymentToPurchases` unlocks lessons oldest-first), `custom` (payment row only, no ledger, no purchase). Verify each mode's ledger/payment/purchase writes still match this contract.
- **Proportional activation:** `lessons_activated = floor(amount_paid_cents * total_lessons / effective_price)`, `effective_price = price_cents - discount_cents`. Check `student-purchases.ts` (computeActivated, createPurchase, applyPaymentToPurchases) and `payments.ts` for divergence, integer-division truncation bugs, or division by zero when `effective_price === 0`.
- **Discounts only in package mode** — custom/balance must enforce `discount = 0` (schema + service). CHECK: `paid <= price - discount`, `discount <= price`.
- **Stripe webhook idempotency** (`app/api/stripe/webhook/route.ts`): insert payment FIRST; on Postgres `23505` (unique `stripe_payment_intent_id`) skip crediting; credit via the atomic `credit_student_lessons` RPC — never read-modify-write `lessons_remaining`. Flag any read-modify-write on `lessons_remaining` anywhere (race → double credit).
- **Counters** `students.lessons_remaining` / `total_lessons_purchased` are bumped by the *activated* portion at sale, then by the *delta* as balance payments arrive. Look for double-bumps or missing delta updates.
- **Dates:** `payments.created_at` = money arrival; `payments.sale_date` = when the package was added; `student_purchases.created_at` = sale date. Reports must not conflate them. Known limitation: payments link to purchases only by `student_id + package_id` (no `purchase_id`) — repeat purchases of the same package share a payment date.
- **Reports:** revenue outstanding-balance and the transactions view must read the **ledger**, not just `student_purchases` (purchases miss manual adjustments).

### security — RLS / multi-tenancy / secrets
- **Client choice:** `createClient` (server, user-scoped, RLS applies) in Server Components + API routes; `createClient` (browser) in Client Components; `createAdminClient` (service role, **bypasses RLS**) only inside API routes for privileged ops. Flag any admin client reachable from a client component or used without a manual `school_id` ownership check.
- **Every mutating API route** must: `auth.getUser()` → load role/school_id → authorize (role + ownership) BEFORE acting. On `/[id]` routes, verify the target row belongs to the caller's `school_id` (admin client bypasses RLS, so the check must be explicit). Hunt for routes that trust a body-supplied `studentId`/`schoolId` without ownership validation.
- **Stripe secrets** (`stripe_secret_key`, `stripe_webhook_secret`) live in `schools` and must never be SELECT-able by non-admins — non-admin paths use the `schools_public` view / the 015 RLS subset. Flag any non-admin query pulling secret columns from `schools`.
- **FK ambiguity:** joins through `students` to `users` must use `users!user_id` (not `users`) because `students` has both `user_id` and `parent_user_id`. A bare join can return the wrong person.
- Look for cross-school leakage: list queries missing a `school_id` filter where RLS isn't the only guard, and admin-client reads that forget to scope.

### scheduling — booking / conflicts / earnings
- **Three conflict layers:** DB exclusion constraints (`lessons_no_instructor_overlap`, `lessons_no_student_overlap`, strict overlap, can't be bypassed); app-level strict overlap in `POST /api/lessons`; travel-time + `buffer_minutes` floor in `POST /api/lessons` and `PATCH /api/lessons/[id]` (when `scheduled_at` changes). Verify PATCH re-checks conflicts and travel-time; flag reschedule paths that skip the check.
- **Travel-time** (`lib/travel-time.ts`): ZIP-prefix heuristic; `null` when ZIP missing → falls back to `buffer_minutes`. Check the null/fallback handling.
- **Earnings & counters** only on `completed`: school mode = `hourly_rate × hours`; independent = `price - commission`. `cancelled` records `cancelled_by` + fee. Flag earnings/counter changes on non-completed transitions or status flows that can double-count.
- **Booking window:** max N days ahead (configurable). Timezone shortcut: `TZ=America/Chicago` process-wide — flag naive `new Date()` math that assumes server-local time incorrectly.

### data — constraints / migrations / counters
- **Migration ↔ code coherence:** numbering follows the MEMORY running total (033 applied as of 2026-05-13), not `ls supabase/migrations`. Flag code referencing columns/tables/RPCs that don't exist in the applied schema, or migrations whose CHECK/UNIQUE/NOT NULL the code can violate.
- **No-drift counters:** `classroom_sessions_attended`, `total_lessons_completed`, etc. are incremented by deltas — verify no path sets them by read-modify-write under concurrency or recounts incorrectly.
- **Auth trigger** `handle_new_user_registration` writes profile fields from `raw_user_meta_data` only when expected metadata is present (admin signup vs invited users). Flag flows that assume a `users` row exists when the trigger wouldn't have fired.
- **At-least-one-phone**, money/range CHECKs, UNIQUE on emails/plates/license numbers — flag code that can attempt to violate them without handling the error.

## Output format — write this to `.claude/audits/findings.md`

```
# HelixDriving audit — <domain(s)> — <YYYY-MM-DD HH:MM>

Summary: <N> findings — <c> critical, <h> high, <m> medium, <l> low.

## F1 · <severity> · <domain> · <one-line title>
- **File:** path/to/file.ts:LINE
- **What's wrong:** <one or two sentences>
- **Failure scenario:** <concrete inputs/state → wrong output/crash/leak>
- **Proposed fix:** <specific change; name the function/route and the edit>
- **Confidence:** <confirmed | plausible>  (only `confirmed` survived adversarial refutation)

## F2 · ...
```

Number findings `F1, F2, …` (stable IDs the fixer references). Most-severe first. If nothing real survives verification, write a report that says so explicitly — do not pad with style nits.
