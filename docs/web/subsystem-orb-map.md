# Subsystem orb map (`features/chat/components/SubsystemOrbMap.tsx`)

The ambient backdrop of ZIBBY's chat surface (the Velín-D "velín"): a central
conversational core orb ringed by one orb per subsystem, laid out on an
ellipse and connected by state-coloured connector lines. It replaced the
retired `CosmicScene` (a vanilla-three.js WebGL scene) with a plain **DOM**
component — no canvas, no render loop of its own, CSS animations only.

`SubsystemOrbMap` itself is a thin domain→DS adapter: it owns no layout math.
The actual ellipse geometry, orb rendering and connector/flare drawing live in
the design system's `OrbMap` (`libs/design-system/src/immersive/OrbMap`); this
component's job is mapping ZIBBY's subsystem registry, live runs and the
`RunEventsProvider` event bus onto `OrbMap`'s generic node/core/flare props.

## Layout

`OrbMap` measures its container and computes a responsive ellipse
(`ellipseLayout.ts`, pure — no DOM): `count` nodes are spread evenly starting
at 12 o'clock, clockwise (`angle_i = -PI/2 + i * 2PI / count`); on short
canvases the core and node diameters shrink so the ring fits above the bottom
reserve without overlap. `SubsystemOrbMap` always renders the fixed 8-entry
`SUBSYSTEMS` registry in registry order, so the ring never reflows when the
feed order changes.

`insets` (`{ top, left, right, bottom }`) reserve chrome the ellipse must
clear — `ChatScreen` passes its top-bar height and a bottom band sized for the
floating composer/live-log — and pass straight through to `OrbMap`, which
merges them over an all-zero default.

## Props

| Prop                            | Purpose                                                               |
| ------------------------------- | --------------------------------------------------------------------- |
| `subsystems`                    | `SubsystemWithStatus[]` — the live subsystem roster + state           |
| `runs` / `pipelines` / `agents` | Feed `activeRunsBySubsystem` for each node's orbit-field dot count    |
| `thinking`                      | Chat streaming flag — feeds the core orb's thinking pulse             |
| `insets`                        | Layout reserves, merged over `OrbMap`'s all-zero default (Task 13)    |
| `onOpenCore`                    | Fires when the core orb is selected (opens `CoreOverviewDialog`)      |
| `onSelectSubsystem`             | Fires with a subsystem id when its orb is selected (opens the drawer) |

There is no selection-ring visual on the node itself — picking a subsystem
only reports the id; whatever opens on selection owns showing that it's
selected.

## Nodes and core

Each `SUBSYSTEMS` entry becomes an `OrbMapNode`: its status state maps through
`SUBSYSTEM_ORB_STATE`, its glyph through `SUBSYSTEM_GLYPH`, and its active-run
count comes from `activeRunsBySubsystem(runs, pipelines, agents)`. A run
attributes to a subsystem via its owning pipeline's `ownerSubsystem` (a
`pipeline`-kind run) OR its owning agent's `ownerSubsystem` (an `agent`-kind
run, Phase 126g — `run.owner` is the agent id, resolved the same way a
pipeline run's `owner` resolves against the pipeline catalog); a `goal`-kind
run never attributes (D16 — no `ownerSubsystem` concept exists on the goal
schemas). The core's
intensity ramps with total running-run count — calm at rest, busier with more
concurrent work, capped (`CORE_BASE_INTENSITY` + `CORE_INTENSITY_PER_RUN` per
run, clamped to `CORE_MAX_INTENSITY`) so a flood of work never blows past a
readable glow; its orbit-field dot count is a fixed `CORE_ACTIVE_COUNT` (4),
mirroring the original prototype.

## Handoff flares

`SubsystemOrbMap` owns the comet handoff-flares' state end to end — the gap
the retired `CosmicScene`'s `emitFlight` used to close. It subscribes to the
shared `RunEventsProvider` bus (`onRunEvent`) once and, for every event, runs
the same pure `flightForEvent` classifier the old scene's WebGL particles used
(real dispatch/report transitions only — never a timer, never a guess): a
`pipeline-runs` OR `agent-runs` event (Phase 126g widened the accepted-scope
gate to both) that resolves to an owning subsystem becomes a flare from the
core to that subsystem (`running`, a dispatch) or from the subsystem back to
the core (a report — pipeline: `done`/`failed`/`parked`; agent:
`done`/`error`/`awaiting-approval`). Flares are appended and bounded by
`particle-mapping.ts`'s own cap (the same "~12, thin the tail" bound the old
scene enforced) and pruned via `OrbMap`'s `onFlareDone` once each comet's
lifetime ends — fully internal: the caller never drives `flares` itself.

The live SSE bus really does emit a distinct `agent-runs` scope for an agent
run's own dispatch/report transitions
(`apps/api/src/events/events.controller.ts`'s `fromRunStatus<AgentRun>` call,
`runId: run.runId` — the same id `RunView.runId` carries for that run), so
after the 126g review pass `resolveEventOwner`'s scope gate accepts both
`pipeline-runs` and `agent-runs` (`ATTRIBUTABLE_SCOPES` in
`particle-mapping.ts`) — a comet now fires for agent dispatch/report exactly
as it already did for pipeline dispatch/report. `goal-runs` stays rejected
(D16 — no `ownerSubsystem` concept exists on the goal schemas).

`runs`/`pipelines`/`agents` are read through refs so a query refetch's fresh
array reference never tears down and resubscribes the `onRunEvent` listener —
the shared bus's one `EventSource` keeps delivering events the whole time
regardless. `agents` comes from `ChatScreen`'s own `useAgentsQuery()`, which
is async: if the FIRST SSE event for a given run lands before that query's
first response resolves, `agentsRef.current` is still `[]` and
`resolveEventOwner` returns `undefined` for that one event — a single dropped
decorative comet, not a stuck or wrong one; the very next event for the same
subsystem (or the query settling) resolves normally. Accepted as-is, same
posture as the run-cache race already documented on `resolveEventOwner` — no
handling added for it.

## Colours

Each subsystem's identity colour comes straight from the `SUBSYSTEMS`
registry (`sub.color`); the core uses `resolveStateToneHex("accent")`. No new
brand colour — same semantic-token approach the rest of the app uses.

## Mounted by `ChatScreen`

`ChatScreen` (`features/chat/components/ChatScreen.tsx`) renders
`SubsystemOrbMap` full-page, behind every interactive surface (its DOM layers
are `pointer-events: none` apart from the orbs themselves), inset by the top
bar (`CHAT_TOPBAR_INSET`) and a bottom band that clears the floating
composer + live log (`CHAT_BOTTOM_INSET`). The `thinking` pulse is bridged up
from the bottom bar's chat dock — `ChatScreen` keeps no stream of its own.
