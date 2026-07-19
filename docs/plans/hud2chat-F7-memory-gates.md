# F7 — Memory + gates

Part of the HUD → Chat UI migration. **The recipe lives in
`docs/plans/hud2chat-F3-catalogs-a.md` — read its 9 numbered steps and follow them.** Read also
`docs/hud2chat/DECISIONS.md` (D5, D7, D10, D12) and the reference migrations
`features/settings/` (`d7d2b106`) and `features/skills/` (`f01c2395`).

This is the last mechanical conversion phase. Only two routes, but one of them carries a seam
that has been deliberately left alone since F1.

## Scope

| Route     | File                             | Notes                                            |
| --------- | -------------------------------- | ------------------------------------------------ |
| `/memory` | `features/memory/Screen.tsx`     | ~237 LOC; graph view + `filterGraph.ts`          |
| `/gates`  | `features/gates/Screen.tsx`      | thin — it mostly renders `GateRulesSection`      |

## The `GateRulesSection` seam — the real work of this phase

`GateRulesSection` (`features/gates/components/GateRulesSection.tsx`) has **three** consumers:

1. `features/settings/Screen.tsx` — migrated in F1, already on the immersive shell.
2. `features/gates/Screen.tsx` — migrated by you, now.
3. `features/subsystems/components/SubsystemDrawer/GatesTab.tsx` — **inside the Chat UI
   drawer**, on a completely different surface, and NOT part of this migration.

Every previous phase was told "do not touch `GateRulesSection`" precisely so this decision
would be made once, here, with all three consumers visible. Look at what it actually renders
(`HudPanel`? bare `Card`? its own frame?) and decide:

- If it renders its own panel chrome, the right shape is almost certainly the **same additive
  prop pattern D7 established for `HudPanel`** — a `surface` prop threaded through, defaulting
  to the current appearance so the drawer consumer is untouched, with the two immersive pages
  opting in. Do not fork the component, and do not restyle it globally.
- If it renders no chrome of its own and simply inherits from its host, there may be nothing
  to do beyond the host swap. That is a fine outcome — **say so explicitly** rather than
  inventing a change to justify the phase.

Whatever you choose, `GatesTab` in the drawer must look exactly as it does today. Verify that
in the browser, not by reasoning.

## `/memory` specifics

- It renders a graph/canvas-ish view. Same class of risk as F5's `PipelineCanvas`: the
  immersive body has different available height than `MainLayout`'s `<main>` did. **Verify in
  a real browser** that the graph renders and is navigable. F5's finding is worth knowing:
  what looked like clipping there was a deliberately pannable `overflow-x: auto` container, so
  **measure (`clientWidth` vs `scrollWidth`) before calling anything a defect.**
- `filterGraph.ts` is pure logic with its own test — do not touch it.
- Memory has dialogs (note create/edit). Same focus-trap check F4 did: `Dialog` is
  `position: fixed` with no ancestor containing block, so `ImmersiveShell`'s `overflow: hidden`
  root does not clip it — confirm, don't assume.

## Chat reachability

`memory` is already in `ChatToolDock`'s `DOCK_IDS`. **`gates` is not** — check `NAV_ITEMS` for
its glyph and add it, the same one-line change `hooks` (F3), `automations` (F4) and
`pipelines`/`chains` (F5) each got. If there is a reason `/gates` should NOT be in the dock
(e.g. it is a locked policy-floor view reached from elsewhere), say so instead of adding it.

## Out of scope
Restructuring the memory graph or the gate rules model. `EntityHero` (handled in parallel by
F6b — do not touch it or `features/agents/DetailScreen.tsx` or `features/pipelines/Screen.tsx`).
Deleting `MainLayout`, `/runs` or `/overview`. **Do not commit.**

## Verification
- `pnpm exec prettier --write` + `eslint --fix` on touched files; `pnpm check:lint`.
- `npx tsc -p apps/web --noEmit` and `npx tsc -p libs/design-system --noEmit` — tsc DIRECTLY,
  not through `rtk pnpm typecheck`, which lies. Both are known-clean; any error is yours.
- Scoped vitest (`web-components`, `@zibby/design-system`).
- **Live browser at 1680px, three surfaces:** `/memory` (graph renders, dialog opens and traps
  focus), `/gates`, and the subsystem drawer's Gates tab inside `/chat` (must be visually
  unchanged — this is the regression risk of the whole phase). Report what you actually saw.
  Note: the shell body is the scroll container, so Playwright `fullPage: true` captures only
  the viewport; scroll the inner container instead.
