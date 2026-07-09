# Phase 96 — Mitosis entry animation (mini-orbs fork from the central orb)

> Operator brief (CS): _"Při načtení stránky by se subsystémy měli 'forknout' z centrálního orbu
> nějakou animací (napadá mě třeba obdoba mitózy). Pokud je mitóza moc složitá tak jen vymysli
> nějakou jinou animaci při vstupu do Chat UI."_
>
> Fourth phase of the redesign arc (93–97). Phase 95 placed the 8 WebGL mini-orbs statically at
> their octagon slots with the net drawn immediately. This phase makes them **fork out of the
> central orb on entry to the Chat UI** — a division/budding animation — then settle into the
> octagon, with the net drawing in behind them. Reduced motion → instant placement (today's look).
>
> RECON (from phases 93–95, already shipped — do NOT re-derive):
> - `sceneController.ts` owns a `cluster` group (world Y = `CLUSTER_Y`) containing the half-scale
>   central orb `core`, 8 mini-orbs placed at `octagonSlots` (from `clusterGeometry.ts`), and the
>   WebGL net (`LineSegments`: inner octagon `hubSlots` + spokes hub→mini-orb). Single RAF
>   `frame()`; everything eases via `damp()`/lerp. `reducedMotion` is threaded from inputs.
> - Each mini-orb is a `createOrbLayer(opts)` instance; the controller holds each one's group and
>   sets its slot position at build time. `setSubsystems(list)` drives per-mini-orb colour/state.
>   `subscribeProjections(cb)` pushes per-frame screen positions to `SubsystemOrbsOverlay`, so the
>   DOM hit-targets/labels track wherever the mini-orbs are each frame (they will track the fork
>   automatically).
> - `clusterGeometry.ts` is pure + unit-tested (octagon/hub slots, Forge at bottom).

## Goals (what "done" looks like)

1. **Fork on entry.** When the Chat UI mounts (controller creation), the 8 mini-orbs appear to
   BUD/DIVIDE out of the central orb: each starts at the cluster centre (at/inside the central
   orb), small, and travels outward to its octagon slot while growing to full size. Staggered per
   index for an organic ripple (not a single synchronized burst). A brief central-orb impulse
   (a small pulse/flash) at t=0 sells the "division". Total ~1.2–1.8s.
2. **A "mitosis" read, kept simple.** Literal cytokinesis is not required — a budding/division
   feel is enough: e.g. a slight squash-stretch as each mini-orb detaches, and an ease-out
   settle (a touch of overshoot is welcome) as it arrives. If a squash-stretch is fiddly, a clean
   scale-0→1 + travel with `easeOutBack` is an acceptable "jiná animace" per the brief.
3. **Net draws in behind them.** The inner octagon + spokes must NOT render to empty space during
   the fork — fade/scale the net in over roughly the second half of the animation (after the
   mini-orbs are mostly out), so at rest it's the phase-95 look.
4. **Reduced motion → instant.** With `prefers-reduced-motion`, skip all travel: mini-orbs at
   their slots, net visible, full size, immediately (exactly the phase-95 rest state) — no motion.
5. **Runs on every entry to /chat** (controller is created on each `CosmicScene` mount) — a fresh
   fork each time the operator opens the Chat UI. Nothing snaps at the end; it settles into the
   normal idle scene and the live states (`setSubsystems`) take over seamlessly.

## Files (expected touch set — keep it controller-side)

- `apps/web/features/chat/scene/clusterGeometry.ts` — add a PURE, unit-tested entry-animation
  helper, e.g. `mitosisProgress(elapsed: number, index: number, count: number, opts?): number`
  returning a per-mini-orb eased progress in [0,1] given a total duration + per-index stagger.
  Also export an easing (e.g. `easeOutBack`/`easeOutCubic`) or keep it internal — but the
  stagger/clamp math must be testable without WebGL.
- `apps/web/features/chat/scene/sceneController.ts` — add a one-shot entry-animation clock
  (starts at controller creation). Each frame while active: for each mini-orb i, set its group
  `position = lerp(clusterCentre, slot_i, p_i)` and `scale = lerp(0, fullMiniScale, p_i)` (with
  the optional squash-stretch), where `p_i = mitosisProgress(elapsed, i, 8)`; fade the net in over
  the tail; add the central-orb impulse at t≈0. When all `p_i` reach 1, deactivate and hand back
  to the static slot placement (no re-trigger). Under reduced motion, place everything at rest
  immediately and skip the clock. Keep it allocation-light (reuse temp vectors).
- `apps/web/features/chat/scene/SubsystemOrbsOverlay.tsx` — OPTIONAL: fade the DOM overlay
  (labels/badges) in near the end of the fork so labels don't fly across the screen with the
  orbs (the hit-targets can track; only the visible label/badge opacity needs the delayed fade).
  Keep all a11y/testids/behaviour unchanged; the overlay must still render immediately in jsdom.

Do NOT change the mini-orb shader/colours (phase 95), the net geometry (phase 95), the central
orb look (phase 93), or the top-third composition (phase 95 rework). This phase only adds the
entry transition on top of the existing rest state.

## Constraints

- Rest state after the animation is byte-for-byte the phase-95 look — the fork is purely additive.
- Nothing snaps at settle; ease into idle.
- No `any`; no `forwardRef`; no JSX `style={{}}` on DOM (imperative `el.style.*` via ref is fine
  for the optional overlay fade).
- Reduced motion strictly honored (no travel, no scale-in, no impulse).
- Perf: the animation is a per-frame transform update on 8 groups — cheap; don't rebuild geometry.
- Trigger timing: run on controller creation. If the mini-orbs have no colours yet (subsystem
  query still loading), the fork still plays on the geometry and colours pop in via `setSubsystems`
  when data arrives — acceptable; do not block the animation on data.

## Tests

- `clusterGeometry.test.ts` — `mitosisProgress`: 0 at/before its staggered start, monotonic
  increasing, clamped to 1 at/after end; later indices start later (stagger); all reach 1 by the
  total duration. Easing stays in [0,1] (or documents its overshoot bound if `easeOutBack`).
- The controller animation itself is WebGL/time-driven — covered by the visual verification, like
  every prior scene phase. Keep existing `chat`/`subsystems` suites green.

## Verification (paste real output in the hand-back)

- `npx tsc -p apps/web/tsconfig.json --noEmit` — clean (ignore the pre-existing unrelated
  `apps/api/machine.service.ts` error).
- `npx eslint <touched files>` — clean.
- `npx vitest run apps/web/features/chat apps/web/features/subsystems` — green (only tolerated
  failure: the pre-existing `chat/Screen.test.tsx` "KNOWN GAP" test).
- Visual (REQUIRED): dev server at http://localhost:3000/chat. Capture the fork — a few frames
  across the animation (early: orbs bunched near the centre/small; mid: travelling out; settled:
  the phase-95 octagon) — e.g. reload and screenshot at intervals, or drive it via the exposed
  `__cosmicScene` dev handle if you add a replay hook. Save to the SESSION scratchpad (ask the
  orchestrator for the path), NOT the repo; never touch the tracked `.playwright-mcp/`. Also
  confirm the reduced-motion path renders the settled scene with no motion.
- Do NOT run `graphify update .` (orchestrator handles graphify + the self-knowledge note at
  commit time).

## Out of scope

- Handoff particles restored in WebGL (phase-89 port) → Phase 97 (the final phase of the arc).
