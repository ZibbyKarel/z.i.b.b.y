# Phase 85 — Drawer tab: Roster (owned pipelines/chains, reused graph editor)

> Design doc: "The subsystem detail's Roster tab is not a new editor: it's the existing
> pipeline/chain node-graph editor, filtered to pipelines/chains tagged with that subsystem as
> owner." RECON CORRECTION: only pipelines have the node-graph editor
> (`features/pipelines/components/PipelineDialog/` — `PipelineCanvas`, `AgentNode`,
> `pipeline-graph.ts`); chains have no graph editor. Roster v1: graph for pipelines, plain
> cards for chains.

## 1 — Data

- `usePipelinesQuery` / `useChainsQuery` already exist — filter client-side by
  `ownerSubsystem === subsystem.id` (the lists are small; no new endpoint. If the existing
  queries don't expose the field, that's a phase-81 regression — fix there, not here).

## 2 — Roster tab body

`apps/web/features/subsystems/components/SubsystemDrawer/RosterTab.tsx` (+ test):

- **Owned pipelines**: for each, render the existing graph canvas READ-ONLY (reuse
  `PipelineCanvas` + `pipeline-graph.ts` exactly as `/pipelines` does — if the canvas is
  currently welded into `PipelineDialog`, extract the presentational part so both call sites
  share it; do NOT fork the component). Clicking a phase/agent node opens the EXISTING config
  surface for that pipeline (today's `PipelineDialog` for that id) — same data, drawer is just
  another entry point (design doc explicitly wants the existing config surface, not a new one).
- **Owned chains**: simple card list (name, phase count) linking to `/chains/[id]` detail.
- **Empty state**: "Zatím žádná pipeline" + a create affordance opening the existing pipeline
  creation dialog **pre-filled with `ownerSubsystem`** — the design's "no pipeline yet, create
  one" affordance. The pre-fill means the create dialog gains an optional `defaultOwnerSubsystem`
  prop (and the create payload carries it through — phase 81 made the field valid).

## 3 — Ownership visibility on `/pipelines` (small, keeps stores honest)

The standalone `/pipelines` index stays (transition policy per design doc). Show a small owner
chip (subsystem name+color) on tagged pipeline cards so ownership is visible from both lenses.
No editing UI there beyond what the existing dialog now carries.

## Tests

- Filtering: fixture with owned + unowned pipelines/chains renders only owned.
- Read-only canvas: rendered for each owned pipeline; node click callback opens config surface
  (assert handler/dialog invocation, not deep canvas internals).
- Empty state + create pre-fill: dialog receives `defaultOwnerSubsystem`.
- Owner chip on `/pipelines` card for a tagged fixture.

## Verification (paste real output)

- `npx tsc -p` web — clean; `npx eslint <touched>` — clean.
- `npx vitest run apps/web/features/subsystems apps/web/features/pipelines` — green.
- Visual: screenshot Roster tab for Loom (code-audit graph visible) and for an empty subsystem
  (e.g. Sentinel).

## Constraints

- ZERO new graph code: extraction/refactor of the existing canvas is allowed, forking is not.
- Respect the phase-74 agent-avatar rendering inside the canvas (don't lose avatars in the
  extraction).
- i18n cs + en.
