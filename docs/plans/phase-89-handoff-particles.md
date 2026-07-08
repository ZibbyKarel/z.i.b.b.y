# Phase 89 — Alive, not merely animated: event-driven handoff particles

> Design doc: particles travel the web's spokes/rim ONLY when a real handoff happens — center→
> node on dispatch, node→center on report, node→node on subsystem-to-subsystem sharing.
> "Staggered, never synchronized — a swarm of real things happening, not one animation loop."
> A particle fires on an actual event, never on a timer.

## 1 — Event source: reuse the existing SSE plumbing

`RunEventsProvider` already holds the ONE `EventSource` on `/api/events` and sees every
`RunStatusEvent` (scopes: agent-runs, pipeline-runs, goal-runs, channel-items, activity).
Extend it minimally: alongside query invalidation, expose a subscribe API
(`onRunEvent(cb)` — a plain listener set, no new connection, no state library). Do NOT open a
second EventSource and do NOT re-shape the events.

## 2 — Mapping events → particle flights

In the `SubsystemWeb` layer (the particle `<g>` reserved in phase 83):

- run STARTED on an owned pipeline/chain → particle **center → node** (dispatch).
- run reached a TERMINAL state (done/error/parked) on an owned pipeline → **node → center**
  (report). Approval-pending events also fire node→center — a Tier-3 handup IS a report.
- **node → node (rim)**: only when a chain step hands an artifact from a pipeline owned by
  subsystem A to one owned by B (derivable from the phase-N2 completion-driven chain events —
  if the SSE payload doesn't identify the chain step transition, SKIP rim particles and note
  it; do not fake them on a timer. The design's whole point is honesty of motion).
- Resolution run→owner reuses the run→pipeline→owner mapping; unattributable events produce
  no particle (the scene's existing ambience already represents "something happened").

## 3 — Particle rendering

- SVG `<animateMotion>` along the existing spoke/rim path geometry (phase 83's helper already
  knows the paths — export path-for-(from,to)). Small glowing dot in the subsystem's color,
  ~1.2–2s flight, slight random-ish per-flight duration jitter derived from event id hash (no
  `Math.random` in render), independent lifecycles, removed on animation end.
- Cap concurrent particles (~12) — drop oldest, never queue into a synchronized burst.
- `prefers-reduced-motion`: particles become a brief static glow at the destination node.

## Tests

- Provider: subscribe API delivers events to listeners and still invalidates queries
  (no behavior regression); unsubscribe works (no leak across unmount).
- Mapping: started/terminal fixtures produce the right (from,to) flights; unattributable →
  none; cap enforced.
- Rendering: jsdom asserts particle elements mount with correct path refs and unmount on end
  (fire the animationend/endEvent handler manually).

## Verification (paste real output)

- `npx tsc -p` web — clean; `npx eslint <touched>` — clean.
- `npx vitest run apps/web/features/subsystems apps/web/features/runs` — green.
- Visual: with `pnpm web:dev` + a demo run dispatched, record/screenshot a particle flight.

## Constraints

- No timers, no decorative loops — every particle traces to one real event (this constraint is
  the phase; if an event class can't be attributed, it gets no motion).
- One EventSource total (existing invariant).
