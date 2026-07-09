# Phase 97 — Restore handoff particles in WebGL

> Final phase of the redesign arc (93–97). Phase 95 retired the SVG `SubsystemWeb`, which had
> carried the Phase-89 handoff particles (dispatch/report flights) as SVG `animateMotion`. That
> rendering was intentionally dropped for the WebGL migration; the pure event→flight mapping
> (`particle-mapping.ts`) was KEPT for exactly this phase. Now restore the flights as real WebGL
> particles riding the octagon spokes.
>
> WHAT THE FEATURE IS (Phase-89, unchanged semantics — motion = REAL events only, never a timer):
> a `pipeline-runs` SSE event whose owning subsystem resolves produces one flight — `running` →
> a DISPATCH from the orb out to the subsystem (orb→node); `done`/`failed`/`parked` → a REPORT
> back (node→orb). Unattributable events produce nothing. Concurrency capped (~12); a flood thins
> the oldest.
>
> RECON (already shipped — do NOT re-derive):
> - `apps/web/features/subsystems/components/SubsystemWeb/particle-mapping.ts` (KEPT, pure,
>   tested): `flightForEvent(event, runs, pipelines) -> { from: "orb"|SubsystemId, to:
>   "orb"|SubsystemId, subsystemId } | undefined`; `resolveEventOwner`; `appendParticle(list,item)`
>   (caps at `MAX_PARTICLES = 12`, drops oldest); `particleDuration(seed)` (~1.2–2s);
>   `hashJitter(seed)`. Reuse ALL of it as-is.
> - `apps/web/features/runs/runEvents` — `onRunEvent(cb)` subscribes to the shared SSE bus (one
>   EventSource); `RunStatusEvent` has `scope`/`runId`/`status`. The old `SubsystemWeb` subscribed
>   here, read `runs`/`pipelines` via refs (so a refetch didn't resubscribe), and rendered.
> - `sceneController.ts` — cluster group (world Y `CLUSTER_Y`) with central orb `core`, 8 mini-orbs
>   at `octagonSlots`, and the net = inner octagon `hubSlots` + spokes hub→mini-orb (from
>   `clusterGeometry.ts`). Single RAF `frame()`. A dev-only `__cosmicScene` handle already exists
>   (phase 96 added `replayEntry`/`scrubEntry`).
> - `CosmicScene.tsx` — owns the controller (ref); takes `subsystems/selectedId/onSelect` +
>   `mode/dock/streamChars/completedTick` today. `ChatScreen.tsx` already fetches `runs` and
>   `pipelineCatalog` (passed to the retired SVG overlay before; now free to pass to CosmicScene).
> - Registry colours (for the flight tint): forge #f97316, puls #14b8a6, sentinel #ef4444,
>   maestro #8b5cf6, beacon #f59e0b, scout #22c55e, herald #3b82f6, loom #6366f1.

## Goals (what "done" looks like)

1. **Flights ride the spokes in 3D.** A dispatch travels from the central orb (its hub vertex for
   that subsystem — the same spoke start the net uses, so the particle rides the visible spoke,
   never through the orb) out to the mini-orb; a report travels the reverse. Tinted the
   subsystem's registry colour, a small additive glow, over `particleDuration`. It reads as a mote
   of light flowing along the spoke.
2. **Real events only.** Driven by `onRunEvent` → `flightForEvent` (reused). No timers, no
   fabricated motion. Unattributable events → nothing. Concurrency capped via the existing
   `appendParticle`/`MAX_PARTICLES` (or the same cap in the controller's particle pool).
3. **Reduced motion.** No travelling motion — instead a brief static glow pulse at the flight's
   DESTINATION node (mirrors the Phase-89 reduced-motion behaviour), then fades. No timer-driven
   ambience.
4. **Fits the scene.** Cheap (≤12 concurrent), disposed cleanly, doesn't disturb the orb/net/mini-
   orbs or the entry animation; settles invisibly when idle (no events → no particles).

## Files (expected touch set)

- NEW `apps/web/features/chat/scene/particleLayer.ts` — a small WebGL particle pool (analogous to
  the other layers). Suggest a single `THREE.Points` (or a tiny sprite pool) of `MAX_PARTICLES`
  vertices with per-slot state `{ active, t, dur, from:Vector3, to:Vector3, color }`; `update(dt)`
  advances `t`, lerps position along from→to, fades near the ends, deactivates at `t>=1`; `emit(
  from, to, color, durS)` claims a free/oldest slot; exposes `object3d`, `update`, `dispose`. Add
  it to the cluster group so it inherits the cluster transform (positions are in cluster-local
  space, same as the slots).
- `apps/web/features/chat/scene/sceneController.ts` — build the particle layer into the cluster;
  call `particles.update(dt)` in `frame()`; add `emitFlight(from: "orb"|SubsystemId, to:
  "orb"|SubsystemId, color: string): void` that resolves the two cluster-local endpoints
  (`"orb"` → that subsystem's HUB vertex; a subsystem id → its mini-orb slot) and calls
  `particles.emit(...)` with a jittered duration. Under reduced motion, instead trigger a brief
  static glow at the destination (either a short-lived particle held at the end, or a tiny pulse
  on the destination mini-orb) — no travel. Dispose the layer in `dispose()`.
- `apps/web/features/chat/scene/CosmicScene.tsx` — accept `pipelines`/`runs` props; add an effect
  that subscribes to `onRunEvent`, reads `runs`/`pipelines` via refs (so a refetch never
  resubscribes — copy the old SubsystemWeb pattern), computes `flightForEvent`, resolves the
  subsystem's registry colour, and calls `controllerRef.current?.emitFlight(flight.from,
  flight.to, color)`. Subscribe once; unsubscribe on unmount.
- `apps/web/features/chat/components/ChatScreen.tsx` — pass `pipelines={pipelineCatalog ?? []}`
  and `runs={runs}` into `<CosmicScene/>` (both already fetched there).
- KEEP `particle-mapping.ts` where it is (still under `subsystems/.../SubsystemWeb/`) and reuse it;
  moving it is optional churn — only relocate if trivial and it keeps its tests. Do not change its
  logic.

## Constraints

- Reuse `flightForEvent`/`resolveEventOwner`/`appendParticle`/`particleDuration`/`hashJitter`
  verbatim — this phase is rendering, not re-deriving the mapping.
- No `Math.random()` in the render loop (repo rule) — jitter via `hashJitter(seed)` / the existing
  `particleDuration`, seeded by the event's `runId+status`.
- No `any`; no `forwardRef`; no JSX `style={{}}` on DOM. Colours only from the registry.
- Reduced motion strictly honored (no travel; brief destination glow only).
- Additive, faint, small — a mote riding the spoke, not a laser. Must not overpower the net/orbs
  (the whole arc's point was a calm, legible scene).
- Cheap + leak-free: fixed pool, no per-event geometry allocation, disposed on unmount.

## Tests

- `particle-mapping.test.ts` (existing) stays green (logic reused unchanged).
- The WebGL particle rendering is visual-only (no jsdom surface) — verify visually. If any small
  pure helper is added (e.g. an endpoint resolver mapping `"orb"|id` → slot), unit-test that.
- Keep `apps/web/features/chat` + `apps/web/features/subsystems` suites green.

## Verification (paste real output in the hand-back)

- `npx tsc -p apps/web/tsconfig.json --noEmit` — clean (ignore the pre-existing unrelated
  `apps/api/machine.service.ts` error).
- `npx eslint <touched/new files>` — clean.
- `npx vitest run apps/web/features/chat apps/web/features/subsystems` — green (only tolerated
  failure: the pre-existing `chat/Screen.test.tsx` "KNOWN GAP" test).
- Visual (REQUIRED): dev server at http://localhost:3000/chat. Particles are event-driven, so to
  screenshot deterministically add a dev-only `emitFlight` passthrough on the `__cosmicScene`
  handle and fire a dispatch + a report via `browser_evaluate`, capturing a mote mid-spoke (tinted
  the subsystem colour), plus one showing several concurrent flights (cap respected). Also verify
  the reduced-motion path shows a destination glow with NO travel. Save to the SESSION scratchpad
  (ask the orchestrator for the path), NOT the repo; never touch the tracked `.playwright-mcp/`.
  Do NOT send real chat messages (they spawn runs that mutate `.zibby/data`); if anything under
  `.zibby/data` changes, `rtk git restore` it.
- Do NOT run `graphify update .` (orchestrator handles graphify + the self-knowledge note at
  commit time).

## Arc close-out (orchestrator, after this lands)

- Run `graphify update .`, regenerate the self-knowledge note, final commit.
- The redesign arc (93–97) is then complete: prominent central orb, top-third octagon of colour-
  unique WebGL mini-orbs with Forge at the bottom, an orb-hugging net, a mitosis entry fork, and
  restored handoff flights.
