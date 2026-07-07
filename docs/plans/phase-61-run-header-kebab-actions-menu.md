# Phase 61 — Run-detail header: collapse the actions behind a three-dot (kebab) menu

> TODO (line 9): _"Stránka Běhy a aktivita - Detail běhu - header - v hlavičce je spoustu akcí.
> Musíme je schovat za »tří tečkové menu«. V pravo nahoře headeru bude IconButton tři tečky
> který po rozkliknutí zobrazí plachtu s možnostmi, které jsou momentálně přímo viditelné
> v headeru (smazat, resume, zastavit běh, přiřadit do projektu, …)."_

## Goal

The run-detail header top-right currently shows a row of buttons (Stop, Resume, Delete/Cancel). Replace
that cluster with a single **three-dot (kebab) IconButton** at the top-right that, when clicked, opens a
**menu (plachta)** listing those same actions. Fewer buttons in the header; the actions live one click away.

## Two parts

### Part A — new DS primitive `MenuButton` (icon-only trigger → menu of actions)

The DS has `DropDownButton` (a SPLIT button: mandatory primary segment + chevron menu) and `Dropdown`
(a value/onChange SELECT) — neither is a pure kebab. Add a small, reusable
`libs/design-system/src/components/MenuButton/` that is an **icon-only trigger** opening a
`MenuSurface` of action rows. Reuse `DropDownButton`'s proven mechanics verbatim where possible
(fixed-position portal, `updateRect` on scroll/resize, ArrowUp/Down + Enter/Escape/Tab keyboard nav via
`aria-activedescendant`, the `<div className="fixed inset-0 z-40">` click-catcher, the menu-row markup
with `focusRingInset`). Difference: no primary segment — the trigger is just a `Button icon="dots"`
(there IS a `dots` icon in `libs/design-system/src/assets/icons`), `intent`/`size` configurable, with an
accessible `aria-label` (default e.g. "Actions"), `aria-haspopup="menu"`, `aria-expanded`.

- Reuse the existing `DropDownButtonItem` shape (`{ id, label, icon?, disabled?, onSelect }`) — import and
  re-export it, OR define an equivalent `MenuButtonItem`; prefer reusing to avoid divergence. Each item
  supports an optional `tone`/danger styling is a nice-to-have (Delete/Stop read as danger) — if easy, add
  an optional `danger?: boolean` on the item that paints the row/icon with the `bad` token; otherwise skip
  and keep rows uniform.
- `MenuButtonTestId` enum: `Root`, `Trigger`, `Menu`, `Item` (mirror DropDownButton's testids). Wire
  `data-testid` on each part; item testids as `${Item}-${id}`.
- Export from `libs/design-system/src/index.ts`. Add `MenuButton.stories.tsx` (a story with a few action
  items incl. a disabled + a danger one) and `MenuButton.test.tsx` (opens on click, renders items, item
  `onSelect` fires + menu closes, keyboard nav, Escape closes — assert via testids, keep role/aria as
  assertions: trigger `aria-haspopup="menu"`/`aria-expanded`, menu `role="menu"`, items `role="menuitem"`).
- React 19 (NO forwardRef). Class-based Tailwind in DS is fine. Follow the design-system SKILL conventions
  (testid enum, tests via `getByTestId`, story, a11y).

### Part B — use it in `RunDetail.tsx`

Replace the non-approval action-button cluster (`apps/web/features/runs/components/RunDetail.tsx`
lines ~493–531 — the `<Stack>` holding Stop / Resume / Delete) with a `MenuButton` whose items are:
- **Stop** (`icon="stop"`, danger) — `onSelect: () => setConfirmKind("stop")` — only when `isStoppableRun(run)`.
- **Resume** (`icon="run"`) — `onSelect: onResume` — only when `onResume && isResumableRun(run)`; label is
  the same honest `run.sessionId ? t("resumeContinue") : t("resumeFresh")`.
- **Delete / Cancel** (`icon="x"`, danger) — `onSelect: () => setConfirmKind("delete")` — label
  `run.status === "scheduled" ? t("cancelTask") : t("delete")`.

Build the `menuItems` array conditionally (push only the applicable ones), same guards as today. The
confirm dialogs (`confirmKind` stop/delete) and `onResume`/disabled (`stopping`/`resuming`/`deleting`)
behavior stay exactly as-is — only the trigger surface changes from inline buttons to menu rows. Use each
button's disabled state as the item's `disabled`.

- Keep the **approval branch** (SeverityMeter + RiskBadge) UNCHANGED — those are status indicators, not
  actions; the kebab is the `else` (non-approval) branch's replacement.
- Leave **AssignProjectControl** where it is (in the meta row, shown only when the run has no project) —
  it's a `SelectField`, not a simple action, so it doesn't belong as a menu row. (The operator's "…" makes
  it an example, not a hard requirement; note this decision in the commit.)
- The kebab sits top-right of the header (where the button cluster was), over the EntityHero scrim — keep
  it legible.

## Tests
- `RunDetail.test.tsx`: the header no longer shows the inline Stop/Resume/Delete buttons directly; instead
  a kebab `MenuButton` trigger is present, and opening it reveals the applicable action rows; activating
  the Delete row opens the delete confirm (same assertion the current test makes, just reached through the
  menu); Stop/Resume gated by run state as before. Migrate SELECTORS to the menu, keep the assertion set
  (confirm dialog appears, onResume called, etc.). Existing `resume-run` testid: either keep it on the
  menu item or update the test to the new item testid — keep the behavior assertion.
- New `MenuButton.test.tsx` + `MenuButton.stories.tsx` as above.

## Verification (run, paste real output — no success claim without it)
- `npx tsc -p apps/web/tsconfig.json --noEmit` clean.
- `npx eslint libs/design-system/src/components/MenuButton apps/web/features/runs` clean.
- `rtk proxy npx vitest run libs/design-system/src/components/MenuButton` green.
- `rtk proxy npx vitest run apps/web/features/runs` green modulo the KNOWN pre-existing reds (RunDetail
  cost-cell cs-locale; TaskCard x2) — confirm via `git stash`, don't chase.

## Constraints
- React 19 (NO forwardRef), no `any`, no raw inline DOM `style` in apps/web.
- Do NOT touch operator WIP: `PipelineStageTimeline.tsx`, `.zibby/data/**`, `RunLogStream.tsx`,
  `machine.*`, `design/*`, chat internals, and the CommandLine/EntityHero files owned by phases 59/60.
- Only add `libs/design-system/src/components/MenuButton/*` (+ index export) and edit
  `RunDetail.tsx` (+ its test). Do NOT change the meta strip (that's phase 62).
