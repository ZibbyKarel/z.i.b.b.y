# Phase 74 — Show agent avatars in the pipeline flow preview (Orchestrace)

> Completes TODO item 2: _"stránka Orchestrace — v náhledu flow pipeliny nejsou vidět
> avataři agentů."_

## Problem

On the Orchestrace (pipelines) page, the pipeline **flow canvas** renders each phase as an
`AgentNode` (`apps/web/features/pipelines/components/PipelineDialog/AgentNode.tsx`). The node
shows only the agent's **glyph** icon:

```tsx
const glyphOf = (node, agents): IconName =>
  node.type === "verify" ? "shield" : (agents.find(a => a.id === node.agent)?.glyph ?? "bot");
...
<IconTile glyph={glyphOf(node, agents)} size="sm" />
```

Even when the agent has an uploaded/bundled `avatar`, the flow node never displays it — you
just see a generic glyph. `IconTile` already supports a custom image via its `src` prop (it
falls back to `glyph`/`children` automatically when the image is absent or fails to load —
see `IconTileProps.src`, used by `AgentCard` (`logoSrc`→`src`) and `PipelineCard`
(`src={pipeline.avatar}`)).

## Fix

In `AgentNode.tsx`, resolve the phase agent's avatar and pass it to the tile so the flow node
shows the same avatar the agent card does, with the glyph as the automatic fallback:

- Add a helper `avatarOf(node, agents): string | undefined` → for an `agent` node,
  `agents.find(a => a.id === node.agent)?.avatar`; for a `verify` node, `undefined` (keep the
  `shield` glyph). Mirror `glyphOf`.
- Change the tile render to:
  `<IconTile alt={node.type === "verify" ? undefined : node.agent} glyph={glyphOf(node, agents)} size="sm" src={avatarOf(node, agents)} />`
  (`alt` = the agent id for a meaningful accessible name; the glyph stays as the fallback).

That's the whole behavioural change — a data-carry, no new component. Verify the readonly
canvas (`PipelineCanvas.tsx` / `PipelineCanvas.readonly.test.tsx`) passes the same `agents`
array through so the avatar resolves in the detail/preview view too (it already passes
`agents` to `AgentNode`; no change needed, just confirm).

## Also apply the same carry to the two other flow surfaces (small, consistent)

For a coherent "flow shows avatars" story, extend the same avatar-with-glyph-fallback to the
inline flow chips where an `IconTile`/avatar fits without layout churn:

1. **`PipelineStageTimeline.tsx`** (`apps/web/features/runs/components/`) — the run-detail
   stage flow. Grep how it renders each stage's icon; if it uses `IconTile` (or can), pass the
   stage agent's `avatar` as `src` with the phase glyph as fallback. If it uses a bare `Icon`
   (which has no image support), leave it — do NOT introduce a raw `<img>`; only wire `src`
   where an `IconTile` is already (or trivially) in use. Note the decision in your report.
2. **`PipelineCard.tsx`** phase chips use a bare `<Icon name={glyphForPhase(ph, agents)}>` —
   these are 16px inline chips; leave them as glyphs (out of scope; changing them to image
   tiles would blow up the chip row). The card's header tile already shows `pipeline.avatar`.

Keep the primary change (AgentNode) mandatory; treat surface (1) as a nice-to-have applied
only if it's a clean `src` wire.

## Files

- `apps/web/features/pipelines/components/PipelineDialog/AgentNode.tsx` (primary)
- Possibly `apps/web/features/runs/components/PipelineStageTimeline.tsx` (only if clean)
- Update/extend the relevant tests (`PipelineCanvas.readonly.test.tsx`, an AgentNode-focused
  assertion, or the timeline test) to assert the avatar `src` is wired: an agent with
  `avatar` set renders an `IconTile` whose image src equals that avatar (select via the
  IconTile testid — `IconTileTestId.Image` — per the DS testid convention).

## Verification (run, paste real output)

- `rtk proxy npx tsc -p apps/web/tsconfig.json --noEmit` — clean (or only pre-existing).
- `rtk lint` on touched files — clean.
- `rtk proxy npx vitest run apps/web/features/pipelines apps/web/features/runs` — green modulo
  documented pre-existing reds (PipelineCard last-run; TaskCard ×2; RunDetail cost-cell). Any
  NEW red is yours.

## Constraints

- DS-composed only (`IconTile`, no raw `<img>`/inline style in `apps/web`). React 19 (no
  forwardRef). No `any`. Keep the glyph fallback intact for agents without an avatar and for
  verify nodes.
