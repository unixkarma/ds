---
name: ui-design
description: Front-end design system for HelixDriving — the "Soft Pastel" theme (warm off-white base, dusty-blue primary, sage/blush/lavender accents) plus a UI-quality playbook. Use when improving the look & feel of any screen, building or restyling a component, choosing colors/spacing/typography, adding a new page, or when the user asks to make the UI "prettier", "pastel", "cleaner", or "more polished". Stack is Next.js 16 App Router + Tailwind CSS v4 + shadcn/ui. Invoke as `/ui-design [screen or component]`.
---

# ui-design — HelixDriving "Soft Pastel" design system

You are polishing the UI of **HelixDriving**, a driving-school SaaS (Next.js 16 App Router, Tailwind CSS v4, shadcn/ui, `oklch`/hex tokens in `app/globals.css`). The look is **elegant, calm, boutique** — soft pastel surfaces, generous whitespace, crisp legible text. Not a toy: it holds forms, tables, money, and minors' records, so **beauty never costs legibility.**

## The prime directive
Ship screens that are **pretty AND accessible AND consistent**. If a pastel choice drops text below WCAG AA (4.5:1 normal / 3:1 large & UI), the accessible version wins — every time. A pastel you can't read is not "genial".

## How to work a request
1. **Read the tokens first.** `app/globals.css` `:root` (light) + `.dark` are the single source of truth. Never hardcode a hex in a component — use the semantic Tailwind classes that map to tokens (`bg-card`, `text-muted-foreground`, `border-border`, `bg-primary text-primary-foreground`, `bg-accent`, `bg-secondary`, `ring-ring`). Adding a hex like `bg-[#7fa6c9]` in a component is a bug — extend the token instead.
2. **Match the neighbors.** Open 1–2 existing screens in the same area and mirror their spacing scale, card usage, heading sizes, and empty/loading states. Consistency reads as quality more than any single flourish.
3. **Change tokens for global shifts, classes for local ones.** Recoloring the whole app = edit `globals.css`. Restyling one card = Tailwind classes on that card.
4. **Verify.** After edits run `npx tsc --noEmit` and a build/dev check. For a visual change, drive the actual screen (the `/run` or `verify` skill) — don't trust the diff.

## The palette (already in `app/globals.css`)

Semantic tokens — **always reference these, never raw hex:**

| Token | Light | Dark | Use for |
|---|---|---|---|
| `background` | `#faf9f7` warm off-white | `#17161a` warm near-black | page canvas |
| `foreground` | `#2b2a31` | `#eceaf0` | body text |
| `card` / `popover` | `#ffffff` | `#201f25` | raised surfaces |
| `primary` | `#6e9cc6` dusty blue | `#9dbedc` | primary CTA, active state |
| `primary-foreground` | `#17222b` dark navy | `#12202b` | text on primary |
| `secondary` | `#eef3ea` soft sage | `#2a2a31` | secondary buttons, chips |
| `muted` / `muted-foreground` | `#f1efec` / `#63616b` | `#2a2a31` / `#a6a2b0` | subtle fills, helper text |
| `accent` | `#f3eaf3` lavender | `#2e2a33` | hover/selected surfaces |
| `destructive` | `#bb5049` brick-rose | `#d98a82` | delete/danger |
| `border` / `input` | `#e7e3de` | white/10–15% | hairlines, field borders |
| `sidebar*` | sage-tinted rail | warm dark rail | the nav rail |
| `chart-1..5` | **validated CVD-safe brand set — UNCHANGED** | same | data viz only |

### Load-bearing decisions (do not "fix" these without cause)
- **`primary-foreground` is dark, not white.** Dusty-blue pastel is too light for white text to reach AA (~2.8:1). Dark navy on pastel blue (~5.3:1) is the *intended* aesthetic — clean and boutique. If you ever deepen `--primary`, re-check both foregrounds.
- **Charts stay on the deep validated palette.** Low-chroma pastels are indistinguishable in dense series and fail CVD checks. Pastel-ify surfaces, never `chart-*`. For any new data viz, read the global `dataviz` skill and pull colors from `chart-1..5`.
- **Destructive is muted brick-rose, not pastel.** Danger must feel like danger; white text on it passes AA. Don't soften it into pink.
- **Sage-tinted sidebar** is the signature. Keep the nav rail on `--sidebar` (not `--background`) so it reads as its own plane.

## UI-quality playbook — how to make it "genial"

**Whitespace & rhythm.** Pastel design lives or dies on breathing room. Prefer `space-y-6` between sections, `p-6` inside cards, `gap-4` in grids. Crowded pastel looks cheap; airy pastel looks expensive. Use a consistent scale (multiples of 4) — no random `mt-[13px]`.

**Depth, softly.** Favor a hairline `border border-border` + a whisper shadow (`shadow-sm`) over heavy `shadow-lg`. Pastel + heavy drop-shadow looks muddy. Elevation comes from the white card sitting on the off-white base, not from big shadows. `rounded-lg`/`rounded-xl` (radius is 0.75rem) — soft, not pill-round for containers.

**Typography.** One family (Geist sans, already wired). Hierarchy by weight+size, not color: `text-xl font-semibold` page titles, `text-sm font-medium` labels, `text-sm text-muted-foreground` help text. Body stays `foreground`. Never use a pastel accent as body-text color (fails contrast).

**Color discipline — the 60/30/10 rule.** ~60% neutral (background/card), ~30% secondary sage/muted surfaces, ~10% primary/accent pops. Color should guide the eye to *one* action per view. If everything is colored, nothing stands out. Reserve `primary` for the single main CTA; secondary actions use `variant="secondary"` or `variant="outline"`.

**States are not optional.** Every list/table needs: loading (use `Skeleton`), empty (a calm centered message + the primary action, not a blank box), and error. Every interactive element needs a visible hover (`hover:bg-accent`) and focus ring (`focus-visible:ring-ring` — already in shadcn variants; don't strip it).

**Status colors — tint, don't shout.** For badges/status, use soft tinted backgrounds with a readable foreground rather than saturated fills: e.g. success `bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300`, warning amber, info sky, danger rose. Keep the same recipe everywhere so a "paid/partial/unpaid" badge looks the same on every screen. Match the pastel family (muted, not neon).

**Motion, restrained.** `transition-colors`/`transition-all` on interactive elements (150–200ms). No bouncy or long animations in an admin tool — it slows people down.

**Accessibility checklist (run mentally on every change):**
- Text ≥ 4.5:1 on its surface (large ≥ 3:1). When unsure, use `foreground`/`muted-foreground` — they're pre-validated.
- Never encode meaning in color alone — pair status color with a label/icon.
- Focus states visible; don't remove outlines. Tap targets ≥ 24px (ideally 40px).
- Test both light and dark — this app ships both. A token that looks great in light can vanish in dark.

## Component conventions (shadcn — already installed)
Components live in `components/ui/`. Reuse them; don't hand-roll buttons/inputs/dialogs. Available: button, card, dialog, alert-dialog, sheet, popover, dropdown-menu, select, input, textarea, label, form, table, tabs, badge, alert, avatar, calendar, command, separator, skeleton, switch, sonner (toasts). Compose these before adding new primitives. If you need a new shadcn component, add it via the CLI (`vercel:shadcn` skill) so it inherits the tokens.

Card is the workhorse: `Card > CardHeader (CardTitle + CardDescription) > CardContent > CardFooter`. Keep page structure `space-y-6` with a title block (`h1 text-xl font-semibold` + muted subtitle) then content — mirror `app/(dashboard)/dashboard/reports/page.tsx`.

## Guardrails
- Don't touch `chart-*` tokens, the `@theme inline` mapping, or `--radius` scale math without a stated reason.
- Don't introduce a second UI kit or CSS-in-JS — Tailwind + shadcn only.
- Don't add raw hex/`bg-[...]` in components; extend a token.
- Keep changes reversible and scoped; run `tsc` + a visual check before declaring done.
- When the user wants a *different* palette direction later, edit only `:root`/`.dark` in `globals.css` and re-validate contrast — the whole app follows automatically.
