# Phase 47 — DropDownButton has a clear disabled state (looks disabled, not just un-clickable)

> TODO (line 79): _"DropdownButton v CommandLine nemá asi správný disabled stav. stále
> vypadá že je aktivní jen na něj nejde kliknout."_

## Symptom & recon

In `CommandLine.tsx` the run control is `<DropDownButton disabled={!canRun || busy} .../>`
(≈ line 865). When disabled it still LOOKS active — only the click is blocked.

`libs/design-system/src/components/DropDownButton/DropDownButton.tsx` correctly forwards
`disabled` to both inner DS `Button`s (primary + chevron trigger, lines 166/184). The DS
`Button` applies `disabledClasses` from `libs/design-system/src/utils/focus.ts`:
```
export const disabledClasses = "disabled:cursor-not-allowed disabled:opacity-50";
```
So a disabled DropDownButton = the FILLED (accent/primary intent) button at 50% opacity. On a
saturated filled intent, opacity-50 still reads as "an active button, slightly dimmed" — not
clearly disabled. That's the bug: the disabled affordance is too weak for filled intents.

## Goal

A disabled `DropDownButton` (and disabled `Button` generally) must read UNAMBIGUOUSLY as
disabled — muted/neutral surface + muted text, not merely a faded accent. Keep it token-driven,
consistent across intents, and non-regressive for existing enabled states.

## Approach (diagnose first, then minimal fix)

1. Confirm the mechanism in the running/DS code: check DS `Button` intent styles
   (`libs/design-system/src/components/Button/Button.tsx`) — how filled/accent/danger/ghost
   backgrounds are applied and whether `disabledClasses` (opacity-only) is the sole disabled
   treatment. Verify the DropDownButton `Divider` between the two halves doesn't stay full-strength
   and read as "active".
2. Strengthen the shared disabled affordance so it's a real disabled look, not just opacity:
   - Prefer extending the DISABLED treatment at the DS `Button` level (so every consumer benefits
     and DropDownButton inherits it): when `disabled`, override the intent's fill/text with neutral
     muted tokens (e.g. a muted surface bg + muted/tertiary text + muted border) via
     `disabled:` Tailwind variants on the existing token classes — KEEP `cursor-not-allowed`, and
     keep/soften opacity. Use existing design tokens (surface/border/text-muted); no raw hex, no new
     token unless one is genuinely missing.
   - Ensure the effect is intent-agnostic (accent, primary, danger, ghost all land on the same clear
     disabled look) and that the DropDownButton's two halves + divider read as one disabled unit.
3. If a Button-wide change proves too broad/risky for some intents, scope the stronger disabled
   treatment so it at least covers the filled intents used by DropDownButton, but PREFER the
   consistent shared fix.

Keep focus-visible behavior intact for the ENABLED state (a disabled control isn't focusable/doesn't
need a ring). Don't change enabled visuals.

## Files
- `libs/design-system/src/utils/focus.ts` (if strengthening `disabledClasses`) and/or
  `libs/design-system/src/components/Button/Button.tsx` (disabled intent overrides).
- `libs/design-system/src/components/DropDownButton/DropDownButton.tsx` only if the divider/container
  needs a disabled treatment beyond what the inner Buttons inherit.
- Stories: add/extend a **disabled** state in `DropDownButton.stories.tsx` (and `Button.stories.tsx`
  if it lacks a disabled example) so the state is visible in Storybook.
- Tests: `DropDownButton.test.tsx` / `Button.test.tsx` — assert the disabled control carries the
  disabled affordance (e.g. `toBeDisabled()` + the disabled class/`aria-disabled` as the codebase
  asserts). A testid-first assertion per DS conventions; roles/attributes as assertions only.

## Verification
- `npx tsc -p tsconfig.base.json --noEmit` OR the DS project's typecheck (the base config;
  DS is covered) — clean.
- Scoped lint: `npx eslint libs/design-system/src/components/Button libs/design-system/src/components/DropDownButton libs/design-system/src/utils` (NEVER bare `pnpm lint`).
- `rtk proxy npx vitest run libs/design-system/src/components/Button libs/design-system/src/components/DropDownButton` green.
- Storybook: the disabled DropDownButton/Button visibly reads disabled (muted, not a faded-accent).
- Regression check: enabled Button/DropDownButton across intents is unchanged; run the DS test
  project once (`rtk proxy npx vitest run libs/design-system`) to confirm no other component's
  Button-based snapshot/assertion broke.

## Constraints
- No forwardRef, no `any`, sealed sizing (no raw px), token-driven only. Don't touch operator WIP
  (SummaryWidget, `apps/api/src/machine/*`, `libs/contracts/src/machine/*`, `design/*`,
  `apps/web/features/chat/**`). This is a DS-primitive change — keep the diff tight and the enabled
  path byte-for-byte unchanged.
