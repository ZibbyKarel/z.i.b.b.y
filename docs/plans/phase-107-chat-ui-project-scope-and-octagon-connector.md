# Phase 107 — Chat UI: per-task project scope + subsystem-octagon connectors

> Two operator-reported Chat-UI fixes from `TODO.md`. Both are **web-only**
> (`apps/web`), no contract or API change. Files are the source of truth; the UI
> is a view — neither item touches persisted data, only how the composer scopes a
> single dispatch and how the WebGL net is drawn.

---

## Item 1 — CommandLine project selector must not mutate the global project scope

### The problem
`CommandLine` (`apps/web/features/tasks/components/CommandLine/CommandLine.tsx`)
reads `const { activeProjectId, setActiveProject } = useActiveProject()` and wires
the inline `ProjectSelect` (Phase 102) straight to `setActiveProject`. So changing
the project **for one task** silently re-scopes the WHOLE dashboard (the global
`activeProject` cookie in `ProjectProvider`).

The operator wants the opposite: **globally always see all projects' info**
(running tasks etc.); the CommandLine selector is a *per-task* scope — it picks
the project for the task being launched **only**, and never rewrites the global
selection.

### Current mechanics (verified)
- The selected project reaches the dispatched task through `paths`: `selectedProject?.path`
  is prepended to the detected paths in the `paths` memo, then passed to
  `useTaskSubmit` → `createTask({ body: { …, paths } })`. There is **no** `projectId`
  field on the create-task body — the project path in `paths` is the entire
  mechanism. So preserving that path-prepend is all that's needed to keep
  per-task scoping working.
- `useActiveProject` is used in `CommandLine` in exactly two spots: the
  `selectedProject`/`paths` memo, and the `ProjectSelect` props. Nothing else in
  the component depends on it.

### The change
Give `CommandLine` its **own local** per-task project state; stop calling
`setActiveProject`.

1. Add local state: `const [taskProjectId, setTaskProjectId] = useState<string | null>(() => activeProjectId)`.
   - Seed it once from the global `activeProjectId` (read via `useActiveProject`)
     as a convenience default so an operator who already had a project selected
     keeps launching into it — but this is a one-shot seed, **never** written
     back.
2. Point the `selectedProject`/`paths` memo at `taskProjectId` instead of
   `activeProjectId`.
3. Wire `ProjectSelect`:
   - `activeProjectId={taskProjectId}`
   - `onChange={setTaskProjectId}` (drop `setActiveProject` entirely; remove it
     from the `useActiveProject()` destructure — keep only `activeProjectId` for
     the seed).
4. Add a new optional prop so a host can override the seed and observe changes,
   keeping the component honest and testable (mirrors the other `on…Change`
   mirror props already on `CommandLine`):
   - `initialProjectId?: string | null` — overrides the global seed when provided.
   - `onProjectChange?: (id: string | null) => void` — fired whenever the
     per-task project changes.
   These are **optional**; existing hosts (overview command bar, chat composer,
   `NewTaskDialog`) need no change to keep working.

### Tests
- `CommandLine.test.tsx`: the existing block (lines ~384–422) asserts that picking
  a project calls the global `setActiveProject`. Rewrite those assertions to:
  - picking a project does **NOT** call `setActiveProject` (assert `setActiveProject`
    from the mocked `useActiveProject` is never called);
  - the per-task selection updates the trigger label AND (stronger, honest
    assertion) is carried into the dispatched task — assert the `createTask` mock
    body's `paths` includes the picked project's `path`. Reuse the existing
    project mocks (`alpha` etc.) and the create-task mock already in the file.
  - keep the "lists 'Bez projektu' + every project" coverage.
- `NewTaskDialog.test.tsx`: line 177 mocks `useActiveProject` with a `vi.fn()`
  `setActiveProject`; confirm nothing there asserts it is called (it doesn't —
  only the seed is read). Adjust only if a test breaks.

### Out of scope (note, don't do)
Whether the *rest* of the dashboard should drop the single global `activeProject`
scope in favour of an always-"all projects" view is a **separate, larger** change
(it touches `ChatScreen`, `ChatTasksPanel`, `memory/Screen`, every screen that
filters by `activeProject`, and the `ProjectProvider` contract). This phase does
exactly what the TODO item names — the CommandLine selector stops mutating the
global scope — and leaves the global-view question for a follow-up.

---

## Item 2 — Subsystem octagons cross the central octagon at one corner; need a connector

### The problem
In the WebGL net (`apps/web/features/chat/scene/sceneController.ts`, the block at
`// --- WebGL net`, ~L321–356) each subsystem mini-orb gets its own small octagon
(`octagonSlotsAround(node, NODE_OCTAGON_RADIUS)`, Phase 101), plus a short "link"
from the hub octagon vertex to the node octagon (`pointToward(node, hub, NODE_OCTAGON_RADIUS)`).

The geometry currently **overlaps**:
- `HUB_RADIUS = 0.7` (hub octagon vertices, ring the central orb)
- `NODE_RING_RADIUS = 0.85` (mini-orb centres)
- `NODE_OCTAGON_RADIUS = MINI_ORB_WORLD_RADIUS × 1.35 = 0.16 × 1.35 = 0.216`

Along a spoke, the node octagon's near point sits at `0.85 − 0.216 = 0.634`, which
is **inside** the hub vertex at `0.7`. So the node octagon pokes through the hub
octagon — "the octagons cross at one corner" — and the "link" `hub(0.7) →
nodeNear(0.634)` is a reversed, ~0.066-long inward stub, not a visible connector.

The operator wants: the subsystem octagons and the central octagon **separated**
(not touching), with a real **connector line** bridging the gap between them.

### The change (all in `sceneController.ts` + `clusterGeometry.test.ts`)
Create a clean radial separation so each node octagon sits entirely outside the
hub octagon, with a visible connector across the gap:

1. **Push the node ring out** so the node octagon's near point clears the hub
   octagon vertex plus a deliberate gap. Introduce a named gap constant and
   derive/retune the ring:
   - `NODE_LINK_GAP = 0.12` (world units — the visible connector length; tune
     during the screenshot pass).
   - Set `NODE_RING_RADIUS` so `NODE_RING_RADIUS − NODE_OCTAGON_RADIUS ≥ HUB_RADIUS + NODE_LINK_GAP`
     → `0.7 + 0.12 + 0.216 = 1.036`. Start at **`NODE_RING_RADIUS = 1.05`** and
     verify visually.
   - Keep `HUB_RADIUS = 0.7` (it must still clear the central orb's glow, 0.625).
2. **Draw the connector as a real outward segment**: the link becomes
   `hubOuter (HUB_RADIUS vertex) → nodeNear (node − NODE_OCTAGON_RADIUS along the
   spoke)`, which is now a positive-length segment pointing outward across
   `NODE_LINK_GAP`. The existing `pointToward(node, hub, NODE_OCTAGON_RADIUS)`
   already yields the correct `nodeNear`; with the larger ring it is now beyond
   the hub vertex, so the same two push-lines produce a proper connector — the fix
   is the radius, not the link code. Add a short comment documenting the invariant
   `NODE_RING_RADIUS − NODE_OCTAGON_RADIUS > HUB_RADIUS` (no overlap by
   construction).
3. **Camera/composition check**: pushing mini-orbs out to 1.05 may bring them
   nearer the viewport edges (Phase 94/98 tuned the "top-third" framing). During
   the screenshot pass, if any mini-orb / its octagon / its label clips, reduce
   `NODE_RING_RADIUS` toward 1.04 and/or `NODE_OCTAGON_RADIUS` slightly (it must
   stay `> MINI_ORB_WORLD_RADIUS` so it still clears the mini-orb), keeping the
   no-overlap invariant. Do **not** shrink `HUB_RADIUS` into the orb glow.

### Optional refinement (only if the connector reads as attaching mid-edge)
`octagonSlotsAround` uses a fixed orientation (index 0 at bottom) for every node
octagon, so the connector meets the node octagon at a point on its bounding
circle, not necessarily a vertex. If the screenshot shows the connector clearly
landing mid-edge and it looks wrong, snap the connector's node end to the node
octagon's **nearest vertex to the hub** instead of `pointToward`. Treat this as a
polish step, gated on the screenshot — the primary requirement (no overlap +
visible connector) is met by steps 1–2 alone.

### Tests
- `clusterGeometry.test.ts`: pure-geometry unit tests exist for `octagonSlots`,
  `octagonSlotsAround`, `pointToward`, `hubSlots`. Add an assertion of the new
  no-overlap invariant: for the tuned constants, `NODE_RING_RADIUS −
  NODE_OCTAGON_RADIUS > HUB_RADIUS` and the connector (`hub` → `pointToward(node,
  hub, NODE_OCTAGON_RADIUS)`) has positive length pointing outward (node-near
  radius > hub radius). If those constants live only in `sceneController.ts`,
  either export them or replicate the arithmetic in the test with a comment tying
  it back to the controller — prefer exporting a small `NET_GEOMETRY` constant
  object from `sceneController.ts` (or a shared module) so the test asserts the
  real values, not copies.
- `sceneController` has no direct render test (WebGL is skipped in jsdom via
  `canMountWebGL`); rely on the geometry unit test + the manual screenshot.

### Visual verification (required for item 2)
Run the web app and screenshot the chat scene, because this is a subjective visual
tune:
```
pnpm web:dev     # http://localhost:3000  (chat/overview scene)
```
Use Playwright MCP to navigate to the chat scene, wait for the mitosis entry
animation to settle, and screenshot. Confirm: (a) no node octagon overlaps the
central octagon, (b) a clean connector line bridges each node octagon to the hub
octagon, (c) nothing clips at the viewport edges. Iterate on `NODE_RING_RADIUS` /
`NODE_LINK_GAP` until it reads right.

---

## Sequencing & commits
Two independent items → two commits (plus the plan commit), all on
`feat/todo-chat-ui-fixes`, one PR at the end.

1. `docs(plans): phase 107 — chat-ui project scope + octagon connector` (this file).
2. `fix(chat): per-task project scope in CommandLine (no global mutation)` — item 1
   + tests.
3. `fix(chat): separate subsystem octagons from hub octagon with a connector` —
   item 2 + geometry test + screenshot-verified tuning.

Tick both `TODO.md` items as each lands.

## Definition of done
- `TODO.md` both items checked.
- `pnpm check:lint && pnpm check:types && pnpm test` all green (per project
  convention, run in order after each code change).
- Item 2 visually verified via screenshot (no overlap, visible connector, no
  clipping).
- `graphify update .` run so the graph reflects the new code.
- One PR opened from `feat/todo-chat-ui-fixes` → `main`.
