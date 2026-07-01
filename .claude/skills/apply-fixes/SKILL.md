---
name: apply-fixes
description: Implements the fixes from a prior `/audit` run. Reads the ranked findings in .claude/audits/findings.md, applies each correction safely to the working tree, and verifies with tsc + eslint. Use when the user asks to fix the audited bugs, apply the audit findings, or implement the proposed corrections/improvements. Invoke as `/apply-fixes` (optionally with finding IDs like `F1 F3` or a severity like `critical`).
---

# apply-fixes — implement HelixDriving audit findings

You apply the corrections that the `audit` skill diagnosed. Diagnosis already happened; your job is safe, verified implementation.

## Preconditions

1. Read `.claude/audits/findings.md`. If it's missing or empty, tell the user to run `/audit <domain>` first and stop.
2. Parse the findings (`F1, F2, …`) with their severity, file, proposed fix, and confidence.
3. **Selection:** if the user passed IDs (`F1 F3`) or a severity (`critical`, `high`), act on only those. Otherwise default to **`confirmed` findings, critical+high first**, and ask before touching `plausible`/`low` ones or anything that changes a public contract (API shape, DB migration, money math).

## How to apply each fix

Work one finding at a time, most-severe first:

1. **Re-read the actual code** at the cited `file:line` before editing — the audit may be stale or slightly off. If the code no longer matches the finding, mark it `no_change_needed` and move on.
2. **Confirm the fix is still correct** in context. Don't blindly transcribe the proposed fix — verify it addresses the failure scenario without breaking the billing/RLS/scheduling invariants documented in `MEMORY.md` and the `audit` skill. If a finding touches a **DB migration**, do NOT invent SQL silently: draft the migration following the MEMORY numbering convention (running total, not `ls`), and surface it for the user to review/apply — migrations are applied manually via Supabase.
3. **Make the smallest correct edit.** Match surrounding code style, comment density, and the project's established patterns (e.g. `z.string()` form schemas, `users!user_id` joins, `createAdminClient` only in routes, atomic RPC for `lessons_remaining`). Don't refactor beyond the fix.
4. Keep edits for one finding cohesive; don't entangle unrelated findings in one change.

## Verify before declaring done

After applying the batch (or each fix for risky ones):

- Run `npx tsc --noEmit` — must be clean.
- Run `npx eslint <changed files>` — must be clean.
- If either fails, fix the regression you introduced before moving on; never leave the tree broken.
- For logic-heavy money/scheduling fixes, trace the corrected path by hand against the failure scenario from the finding and confirm it now produces the right result. If the project has tests covering the area, run them.

## Report back

Give a concise per-finding outcome list:

```
F1 (critical) — fixed:      <one-line what changed> — file.ts:LINE
F2 (high)     — skipped:    <why — needs user decision / migration / out of scope>
F3 (medium)   — no_change_needed: code already correct / already fixed
```

Then state the verification result (`tsc` clean, `eslint` clean, tests if run). Do **not** commit or push unless the user asks. If any finding requires a DB migration or a product decision, surface it explicitly rather than guessing. Leave `.claude/audits/findings.md` in place so the user can re-run or review.
