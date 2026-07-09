# Phase 101 — Each subsystem orb wrapped in its own octagon, joined to the hub by a short link

> TODO ("Další nalezené věci"):
> _"Chat UI - orby subsystémů by měly být obalené vlastním oktagonem, který bude spojený s
> oktagonem okolo hlavního Orbu krátkou čarou místo toho aby vedla čára od centrálního oktagonu
> do středu orbu sub systému."_

## Recon (verified)

WebGL scene: `apps/web/features/chat/scene/`. Geometry math is pure in `clusterGeometry.ts`
(`octagonSlots(radius,count)`, `hubSlots(radius)`, `orbFlightSlots(radius)`; unit-tested in
`clusterGeometry.test.ts`). The net is built once in `sceneController.ts` (l.311–346):

```
MINI_ORB_WORLD_RADIUS = 0.16   // a mini-orb radius
NODE_RING_RADIUS      = 0.85   // octagon the 8 mini-orbs sit on
HUB_RADIUS            = 0.7    // inner octagon ringing the central orb
```
The single `THREE.LineSegments` net contains, per i in 0..7:
- inner octagon edge `hub[i] → hub[i+1]` (radius HUB_RADIUS), and
- a **spoke `hub[i] → node[i].center`** where `node[i]` is the mini-orb CENTER (radius
  NODE_RING_RADIUS) — this is exactly the reported "line into the middle of the subsystem orb".

Mini-orbs are separate `OrbLayer` meshes at `nodeSlots[i]`; nothing draws an octagon around them.
Entry animation (`applyEntryAt`/`finishEntry`/`collapseForEntry`, l.388–434) scales/fades the
single `net` object and the mini-orb groups — geometry baked into that same `net` buffer inherits
the fade for free.

## Goal

Each mini-orb is ringed by its **own small octagon**, and the connector from the central octagon
ends at that small octagon's near edge as a **short link** — not a spoke piercing the orb centre.

## Approach

1. **Geometry helper (`clusterGeometry.ts`).** Add a pure helper to produce a small octagon's 8
   vertices centred on an arbitrary point, e.g. `octagonSlotsAround(center, radius, count=8)` that
   returns `octagonSlots(radius,count)` offset by `+center.x/+center.y` (reuse the existing
   angle math; keep index-0 orientation consistent with `octagonSlots`). Add a tiny helper to get
   the point on a segment shortened toward the hub by `radius` (or compute the near-vertex of the
   node octagon facing the hub). Keep everything pure and add cases to `clusterGeometry.test.ts`
   (centre offset correct; 8 verts; radius honoured).
2. **Per-node octagon in the net (`sceneController.ts`).** Choose a node-octagon radius a touch
   larger than the mini-orb so it visibly wraps it (e.g. `NODE_OCTAGON_RADIUS = MINI_ORB_WORLD_RADIUS * 1.35`).
   In the net-build loop, for each `node[i]` push the 8 edges of `octagonSlotsAround(node[i],
   NODE_OCTAGON_RADIUS)` into the same `netPositions` buffer (so it inherits entry fade/scale).
3. **Shorten the spoke to a short link.** Replace `hub[i] → node[i].center` with
   `hub[i]OuterEdge → node[i]NearEdge`: start the connector at the hub octagon's vertex/edge
   pointing at the node, end it at the node octagon's near vertex/edge facing the hub. The result
   is a short segment bridging the two octagons, not a line into the orb centre. Compute both
   endpoints from the geometry helpers (unit-direction hub→node, offset each end inward by the
   respective octagon radius).
4. Keep it one `LineSegments`/one material (`netMaterial`, additive, `NET_OPACITY`) so nothing
   else in the entry animation needs to change. If a separate object is unavoidable, replicate the
   `applyEntryAt`/`finishEntry`/`collapseForEntry` opacity+scale treatment for it — but prefer the
   single-buffer route.
5. Note (do not fix here unless trivial): the mini-orbs travel during mitosis entry while the net
   buffer is static; the current spoke already uses the static rest slot, so baking the node
   octagon at the rest slot is consistent with today's behaviour. Leave dynamic-tracking as a
   possible later polish.

## Files

- `apps/web/features/chat/scene/clusterGeometry.ts` (+ `clusterGeometry.test.ts`)
- `apps/web/features/chat/scene/sceneController.ts` (net-build loop l.~316–346; add
  `NODE_OCTAGON_RADIUS` const; node octagons + shortened links)

## Verification

- `pnpm check:types` clean; scoped lint.
- `pnpm exec vitest run apps/web/features/chat/scene` green (geometry helper cases).
- Visual: run the chat scene (or a Storybook scene story if present, `phase-37-chat-scene-storybook`)
  and screenshot — each of the 8 mini-orbs sits inside its own octagon, joined to the central
  octagon by a short link; no line runs to an orb centre. Include the screenshot in the PR.

## Constraints

- Keep the change inside the scene layer; no contract/API change. Reuse the pure geometry module
  and keep it testable. No `any`. Don't disturb the phase-97 particle flight slots or the ring
  layer. Keep the visual language coherent with phases 93–97 (octagon motif, additive glow).
