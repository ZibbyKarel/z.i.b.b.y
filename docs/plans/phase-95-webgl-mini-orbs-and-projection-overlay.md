# Phase 95 — WebGL mini-orbs + projection-driven interactive overlay

> Operator brief (CS): _"Každý subsystém bude momentálně reprezentován podobným orbem jako je
> centrální. Bude menší a barevně unikátní."_ Plus the two AskUserQuestion decisions for this
> arc: **WebGL mini-orbs in the same three.js scene + a DOM overlay for hit-targets/labels/
> badges** (chosen over SVG orb-styling), and **an inner octagon-hub net that rings the orb
> without touching it** (chosen over a bare rim).
>
> Third phase of the redesign arc (93–97) and the structural heart of it. Phase 94 delivered the
> octagon composition in interim SVG; this phase REPLACES the SVG `SubsystemWeb` nodes+net with
> real WebGL orbs (reusing the central orb's shader, tinted per subsystem) and a projection-
> driven DOM overlay that carries all interaction/keyboard/aria/testids/labels/badges. Because
> everything now lives in ONE coordinate space (three.js world), the net can finally HUG the orb
> by construction — no SVG↔WebGL calibration.
>
> RECON (already done — do NOT re-derive):
> - `orbLayer.ts` — `createOrbLayer()` (no params): wireframe icosahedron (`RADIUS=1`, `DETAIL=4`)
>   + fresnel shell (alpha floor 0.6 after phase 93) + additive glow shell (`RADIUS*1.25`). Seed
>   colour = accent. `update(dt, target, reducedMotion, flash)` eases everything; exposes
>   `currentColor`. This is the shader the mini-orbs must reuse.
> - `sceneController.ts` — orb+rings live in a half-scale `core` group whose `position.y =
>   CLUSTER_Y` (phase 94, top third). Camera `(0,0,6)` looks at origin (small drift re-`lookAt`).
>   Single RAF `frame()`. `setInputs({mode,dock,reducedMotion})`, `pushActivity`, `flashComplete`,
>   `pause/resume/dispose`. Background glow center fed via `backgroundLayer.setGlowCenter`.
> - `CosmicScene.tsx` — thin React shell: creates the controller once (dynamic import, WebGL-only),
>   pushes `setInputs` on prop change, `pushActivity`/`flashComplete`. Props today:
>   `mode/dock/streamChars/completedTick`. Renders one `div` (the scene container).
> - `ChatScreen.tsx` — renders `<CosmicScene …/>` then, separately, the SVG `<SubsystemWeb …/>`
>   overlay (top-third wrapper) with `subsystems/selectedId/onSelect/pipelines/runs`. Owns
>   `selectedSubsystemId` + the `SubsystemDrawer`.
> - `SubsystemWeb.tsx` + `subsystem-web-geometry.ts` (+ their tests + `SubsystemWeb.particles.
>   test.tsx`) — the SVG overlay being retired. `particle-mapping.ts` (pure `flightForEvent`/
>   `resolveEventOwner`/`appendParticle`/`particleDuration`) is REUSED (kept). Registry order &
>   colours: forge #f97316, puls #14b8a6, sentinel #ef4444, maestro #8b5cf6, beacon #f59e0b,
>   scout #22c55e, herald #3b82f6, loom #6366f1. States: `klid/bezi/hlaseni/ceka`.

## End-state architecture

- The scene controller owns a **cluster group** at `CLUSTER_Y` (world), scale 1, containing:
  (a) the existing half-scale central orb `core` (orb+rings), (b) **8 mini-orbs** at the octagon
  vertices, (c) the **WebGL net** (inner octagon snug around the central orb + spokes hub→mini-orb).
  Octagon geometry is in cluster-local world units — Forge at the BOTTOM (world −Y), clockwise.
- Mini-orbs reuse the orb shader via a generalized factory, tinted to each subsystem's registry
  colour, smaller and lower-detail. Their per-state look mirrors the SVG semantics (klid dim,
  bezi/ceka pulse, ceka louder) — via colour/brightness/pulse, never a flat opacity fade.
- The controller projects the central orb + each mini-orb (world→container px, plus an on-screen
  radius) every frame and pushes them to a subscriber.
- A React overlay **`SubsystemOrbsOverlay`** (rendered inside `CosmicScene`) owns interaction &
  a11y: 8 absolutely-positioned nodes, each = an invisible circular hit-target (`role="button"`,
  `tabIndex`, `aria-label`, `aria-pressed`) sized to the mini-orb + a name label + optional badge
  + selection ring. It renders from the `subsystems` prop (so jsdom tests work with NO WebGL) and
  positions each node imperatively (`el.style.transform`) from the controller's projections (a
  no-op in jsdom). Click/Enter/Space → `onSelect`.
- `CosmicScene` gains `subsystems/selectedId/onSelect` props; `ChatScreen` passes them and DROPS
  the separate SVG overlay div. Selection→`SubsystemDrawer` wiring unchanged.

## Implementation — do it in this internal order (one PR/diff, but staged so it stays coherent)

### 95.1 — Generalize the orb factory + world octagon geometry (pure, tested)
- Refactor `orbLayer.ts` so the orb is built by a factory taking options, e.g.
  `createOrbLayer(opts?: { seedColor?: THREE.ColorRepresentation; detail?: number; glowScale?:
  number; glowStrength?: number })`, defaulting to today's central-orb values (central orb call
  site unchanged in behaviour). Mini-orbs call it with the subsystem colour, `detail: 2`, a
  smaller `glowScale`. Keep `update`/`dispose`/`currentColor`. Do not regress phase 93.
- New pure module `scene/clusterGeometry.ts` (three-free math is fine, or return plain
  `{x,y}`/`{x,y,z}` — no DOM): `octagonSlots(count, radius)` → cluster-local positions with index
  0 at the BOTTOM (angle chosen so +index goes clockwise, matching phase 94's Forge-bottom), and
  `hubSlots(count, hubRadius)` at the same angles. Keyed by registry rank via a `slotForId`
  equivalent (reuse the registry order). Unit-test: Forge at bottom, regular octagon (equal
  radius, 45° apart), hub radius < node radius, hub angle == node angle per index.

### 95.2 — Mini-orbs + WebGL net in the controller
- Add a `cluster` group at `CLUSTER_Y` (move the existing `core` under it, keeping the net/orb in
  one transform). Add 8 mini-orbs (one per registry subsystem) at `octagonSlots`, each an orb-
  factory instance tinted to the subsystem colour. Choose sizes so the composition reads well —
  suggested starting points, TUNE VISUALLY: central orb prominent (keep `ORB_SCALE=0.5` or bump
  toward ~0.6 if it reads small), mini-orb world radius ~0.22, node ring radius ~2.2, hub radius
  ~0.85 (must clear the central orb's glow — its world radius ≈ `0.5×1.25 = 0.625` — with a
  visible gap). Long spokes hub→mini-orb; inner octagon snug on the orb.
- WebGL net: `THREE.LineSegments` (additive, faint, like `backgroundLayer`'s lines) for the inner
  octagon (hub[i]→hub[i+1]) + spokes (hub[i]→miniOrb[i]). Neutral faint colour (foreground-faint
  equivalent) or a low-alpha subsystem tint. NOTHING in the net overlaps the central orb.
- Controller gains `setSubsystems(list: {id, color, state, present}[])`: shows/hides each mini-orb
  and drives its per-state visual (klid → dimmer brightness/glow + static; bezi → full + gentle
  pulse; hlaseni → full + static; ceka → full + stronger/faster pulse). Ease toward targets
  (nothing snaps). The mini-orbs get a small ever-present idle breath so they read alive like the
  central orb. Reduced motion honored.
- Central orb behaviour unchanged (still driven by `mode`).

### 95.3 — Projection API + React overlay + retire SVG
- Controller: `subscribeProjections(cb: (p: { id: string; x: number; y: number; r: number }[])
  => void): () => void` — each frame, project each mini-orb's world centre to CONTAINER pixels
  (`project()` via camera + container rect) and an on-screen radius `r` (project a point offset by
  the mini-orb radius). Call `cb` with all 8 (+ optionally the centre). Keep it allocation-light.
- New `apps/web/features/chat/scene/SubsystemOrbsOverlay.tsx` (`"use client"`): props
  `{ subsystems, selectedId, onSelect, controllerRef | subscribe }`. Renders a
  `pointer-events-none` root; for each subsystem in registry order a node wrapper (absolute,
  positioned via ref+transform from projections) with:
  - an invisible hit-target circle (`pointer-events-auto`, `role="button"`, `tabIndex={0}`,
    `aria-label` = name+state (+badge count), `aria-pressed` = selected), Enter/Space + click →
    `onSelect(id)`;
  - a name label (i18n, below the orb);
  - a badge (top-right) when `hlaseni` tier2Count>0 (ok tone) or `ceka` tier3Count>0 (warn tone);
  - a selection ring when selected.
  It subscribes to projections in an effect and sets each node ref's `transform`/size imperatively
  (allowed: imperative `el.style.*`, NOT a JSX `style={{}}` prop — same as `dockLayer`). With no
  controller (jsdom) it still renders all nodes (offscreen/at 0), so component tests work.
  Testids: define `SubsystemOrbsOverlayTestId` (`Root`, `Node-<id>`, `Badge-<id>`, optionally
  `Label-<id>`). Reuse the i18n keys `SubsystemWeb` used (`subsystems.nodeAria/state.*/tier2Badge/
  tier3Badge/ariaLabel`).
- `CosmicScene.tsx`: accept `subsystems/selectedId/onSelect` props; render `SubsystemOrbsOverlay`
  inside its container, wired to the controller (expose the controller via a ref/callback so the
  overlay can `subscribeProjections`). Call `controller.setSubsystems(...)` when `subsystems`
  changes (like the other setInputs effects).
- `ChatScreen.tsx`: pass `subsystems/selectedId/onSelect` into `<CosmicScene/>`; DELETE the
  separate SVG `<SubsystemWeb/>` overlay wrapper. Keep the drawer + selection state.
- RETIRE the SVG overlay: delete `SubsystemWeb.tsx`, `SubsystemWeb.test.tsx`,
  `SubsystemWeb.particles.test.tsx`, `subsystem-web-geometry.ts`, `subsystem-web-geometry.test.ts`.
  KEEP `particle-mapping.ts` (pure, reused in phase 97). Remove now-dead imports/exports.

## Constraints

- **Net hugs the orb.** The inner octagon sits just outside the central orb's glow with a visible
  gap; spokes are long, radiating out to the mini-orbs; nothing crosses the orb. This is the
  headline fix over phase 94 — verify on screen.
- **Concentric & top third** preserved (cluster at `CLUSTER_Y`; overlay tracks projections so it
  can't desync).
- Reuse the orb shader — mini-orbs must look like smaller siblings of the central orb, not a
  different primitive. Colours only from the subsystem registry.
- State via colour/brightness/pulse, never a flat opacity fade (phase-93 principle).
- No `forwardRef`; no `any`; no JSX `style={{}}` on DOM in apps/web (imperative `el.style.*` via
  ref is fine). DS primitives / Tailwind for any static styling.
- Reduced motion honored across mini-orbs, net, and idle breath.
- **Handoff particles are OUT of scope this phase** — they are intentionally dropped when the SVG
  overlay is retired and RESTORED in WebGL in phase 97 (`particle-mapping.ts` is kept for that).
  Call this out in the hand-back; do not leave broken particle code behind.
- Perf: 8 mini-orbs at `detail: 2` (~320 tris each) + 8 glow shells; keep the background's
  low-power path intact.

## Tests

- `clusterGeometry.test.ts` — Forge at bottom; regular octagon; hub inside node ring, same angles.
- `SubsystemOrbsOverlay.test.tsx` — renders all 8 nodes (testids) from the `subsystems` prop;
  fewer/shuffled entries still render by registry mapping; a node is a focusable `role="button"`
  with an accessible name incl. state; click and Enter fire `onSelect(id)`; selection sets
  `aria-pressed`; badge hidden at 0, shown for hlaseni tier2 / ceka tier3. (Mirror the retired
  `SubsystemWeb.test.tsx` assertions — same behaviour, DOM instead of SVG, testid-first.)
- `CosmicScene` stays WebGL-free in jsdom (renders root + overlay nodes, `data-mode` intact).
- `ChatScreen.test.tsx` — update to the new overlay (no `SubsystemWeb`); keep green.
- Update `CosmicScene.stories.tsx` for the new props (a sample `subsystems` roster).

## Verification (paste real output in the hand-back)

- `npx tsc -p apps/web/tsconfig.json --noEmit` — clean (ignore the pre-existing unrelated
  `apps/api/machine.service.ts` error).
- `npx eslint <touched/new files>` — clean.
- `npx vitest run apps/web/features/chat apps/web/features/subsystems` — green (the only tolerated
  failure is the pre-existing `chat/Screen.test.tsx` "KNOWN GAP" test — confirm by stashing).
- Visual (REQUIRED): dev server at http://localhost:3000/chat. Screenshot showing (a) 8 color-
  unique mini-orbs ringing the central orb in a regular octagon, Forge at the bottom, top third;
  (b) the net = inner octagon HUGGING the orb + long spokes to the mini-orbs, never touching the
  orb; (c) a node hover/selected shows its ring; (d) chat room below intact. Also confirm clicking
  a mini-orb opens the `SubsystemDrawer` (selection wired). Save screenshots to the SESSION
  scratchpad (ask the orchestrator for the path), NOT the repo; never touch the tracked
  `.playwright-mcp/`.
- Do NOT run `graphify update .` (keeps the self-knowledge note stable for a clean commit — the
  orchestrator handles graphify + the note at commit time).

## Out of scope (later phases)

- Mitosis / fork-from-centre entry animation → Phase 96.
- Handoff particles restored in WebGL (phase-89 port) → Phase 97.
