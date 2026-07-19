# F5 — Orchestration: pipelines, chains

Part of the HUD → Chat UI migration.

**The recipe lives in `docs/plans/hud2chat-F3-catalogs-a.md` — read its 9 numbered steps and
follow them.** Read also `docs/hud2chat/DECISIONS.md` (D5, D7, D10, D12, **D13**) and the
reference migrations `features/settings/Screen.tsx` (`d7d2b106`),
`features/skills/` (`f01c2395`), `features/agents/` (`c4fe68cb`).

**This is the first of the two hard phases.** `pipelines/Screen.tsx` is 431 LOC with a node
graph canvas. Slow down here.

## Scope

| Route | File | LOC |
| --- | --- | --- |
| `/pipelines` and `/pipelines/[id]` | `features/pipelines/Screen.tsx` | 431 |
| `/chains` and `/chains/[id]` | `features/chains/Screen.tsx` | 331 |

## What is structurally different — read before starting

1. **One Screen serves both list and detail.** Unlike every section migrated so far, both
   `pipelines` and `chains` render list *and* detail from a single `Screen.tsx`, switching on
   a `selectedId` prop passed by the route. So there is one `ImmersivePage` per section whose
   **title, subtitle and actions must change depending on whether an item is selected**, and
   whose **`backHref` must be `/pipelines` (or `/chains`) when an item is selected and `/chat`
   when it is not**. Get this right — it is the single most likely defect in this phase.
2. **`pipelines/Screen.tsx` renders `EntityHero`** — same duplication as F4. Per **D13**, do
   **not** patch it here. Note it in your report and move on.
3. **`PipelineCanvas` is a transform-based node graph.** It computes a fit-to-view CSS
   transform from measured container dimensions. The shell changes its available height
   (the old `MainLayout` had a top bar and page padding; the immersive body does not), so
   **the canvas may fit differently or clip**. This is the one thing in this phase that jsdom
   cannot tell you about: verify the canvas renders and fits in a real browser at 1680px, and
   say what you saw. The same canvas is reused read-only in the subsystem drawer's Roster tab
   — check that surface still looks right too.
4. **Early-return shape.** Expect the pending/error/success early-return pattern F4 hit in
   `automations/Screen.tsx`; consolidate into one `ImmersivePage` with the state as a `body`
   variable rather than three wrappers.
5. **`/pipelines` is missing from Chat entirely** per the audit — there is no dock icon and no
   "browse all" surface, only owned pipelines inside the subsystem drawer's Roster tab.
   `pipelines` is already in `NAV_ITEMS` (`flow` glyph); add it to `ChatToolDock`'s
   `DOCK_IDS`. Same for `chains` (`link` glyph) — the audit notes its list is unreachable
   from Chat while its detail is not.

## Cross-surface regression risks specific to this phase
- The subsystem drawer's Roster tab links to `/chains/[id]` and opens `PipelineDialog`.
- `AktivitaTab` links to `/runs?run=…` (untouched — `/runs` dies in F8, not here).
- `NewPipelineDialog` is opened both from `/pipelines` and from the Roster tab's empty state.

Verify each still works after the route becomes fullscreen.

## Out of scope
Restructuring the canvas or the graph model. Changing `EntityHero` (D13). Deleting `/runs`.
**Do not commit.**

## Verification
- `pnpm exec prettier --write` + `eslint --fix` on touched files; `pnpm check:lint`.
- `npx tsc -p apps/web --noEmit` and `npx tsc -p libs/design-system --noEmit` — tsc DIRECTLY.
  Both are known-clean on this branch; any error is yours.
- Scoped vitest (`web-components`, `@zibby/design-system`).
- **Live browser verification is mandatory in this phase**, not optional: `/pipelines`,
  `/pipelines/<id>`, `/chains`, `/chains/<id>`, and the subsystem drawer's Roster tab.
  Report what you actually saw, with the selected/unselected header and back target for each.
