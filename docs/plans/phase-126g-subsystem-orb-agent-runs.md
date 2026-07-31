# Phase 126g — subsystem orbs are blind to agent-kind runs

> TODO.md item 7: _"pokud běží task a je přiřazen subsystému, ten subsystém by okolo svého
> orbu měl mít obíhající kuličky symbolizující každá jeden task který subsystém zpracovává.
> Zároveň mezi orbem subsystému a centrálním orbem musí probíhat 'komunikace' po spojité
> čáře tak jak je v designu Velínu-D."_

Arc: [`phase-126/PROGRESS.md`](./phase-126/PROGRESS.md) · decisions:
[`phase-126/DECISIONS.md`](./phase-126/DECISIONS.md)

---

## The feature is already built. It just never fires.

`OrbitField` (orbiting dots), `ConnectorLayer`'s marching-ants dash (continuous comms along
the line) and `HandoffFlare` (the comet) all exist in `libs/design-system/src/immersive/**`,
are direct ports of `design/Z.I.B.B.Y/zibby/velin-d-map.jsx`, and are already wired to live
data. **No new animation is needed.** What is broken is attribution: a run only ever reaches
a subsystem if it is `kind === "pipeline"`.

Two independent hard gates, one on each side of the wire:

| # | where | code | effect |
| --- | --- | --- | --- |
| 1 | `apps/web/features/subsystems/components/SubsystemWeb/particle-mapping.ts:73` | `runs.find((r) => r.kind === "pipeline" && …)` | agent-kind runs contribute **0** to any subsystem's `activeCount` → no orbiting dots |
| 2 | `apps/api/src/subsystems/subsystems.service.ts:229` | `const owner = run.kind === "pipeline" ? pipelineOwner.get(run.owner) : undefined;` | the subsystem's own `state` never goes live for agent work → `node.live` stays false → **no dash on the connector** |

`RunKindSchema` is `["agent", "pipeline", "goal", "scheduled"]`
(`libs/contracts/src/tasks/task-run.schema.ts:20`). Sampling the operator's real data
(`.zibby/data/tasks/scheduled/*.json`, n=50): **24 pipeline / 20 agent / 5 orchestrator
(persisted agent-kind) / 1 none.** So roughly half of real dispatched work is invisible to
the orb map — which is exactly what the operator is reporting.

The field needed to fix it already exists and is already populated: `Agent.ownerSubsystem`
(`libs/contracts/src/agents/agent.schema.ts:93`) is set on **all 50** stored agents.
`subsystems.service.ts:180` already loads `agents.filter((a) => a.ownerSubsystem === id)` for
the subsystem's *roster* — it just never uses it for live-run attribution.
`task-scheduler.service.ts:399-401` documents the intended symmetry in so many words.

The stale premise is a comment: `particle-mapping.ts:12-16` claims "Agent/GoalRun carry
none". That was true before NS2 F1a. Fix the comment along with the code.

## Decisions to record in DECISIONS.md

- **D14 — no new animation is added.** The operator's own wording is "as it is in the Velín-D
  design", and `ConnectorLayer`'s `imDash` marching-ants stroke (drawn whenever `node.live`)
  plus `HandoffFlare`'s comet are direct ports of that design. Inventing a third continuous
  particle would diverge from the named reference. The comms line is fixed by making
  `node.live` true for agent work — a data fix, not a visual one.
- **D15 — client and server must land in the same commit.** `activeCount` (dots) is computed
  client-side; `live` (connector dash) comes from the server's subsystem `state`
  (`OrbMap.tsx:128` → `ORB_STATE[n.state].live`). Fixing only gate #1 makes dots appear on a
  dark connector; fixing only #2 does the reverse. Either half alone is a visibly
  inconsistent orb, so this sub-phase is not splittable.
- **D16 — goal-kind runs stay unattributed.** No `ownerSubsystem` exists anywhere on the goal
  schemas, and goal runs are explicit-target-only and rare. Adding one is a contract change
  with its own blast radius. Out of scope; recorded here so the omission is deliberate rather
  than forgotten.

## Implementation

### 1. Server — `apps/api/src/subsystems/subsystems.service.ts`

Build an `agentOwner` map next to the existing `pipelineOwner` map, from the agents already
loaded at line ~180, then attribute both kinds:

```ts
const owner =
  run.kind === "pipeline"
    ? pipelineOwner.get(run.owner)
    : run.kind === "agent"
      ? agentOwner.get(run.owner)
      : undefined;
```

Keep the explicit `undefined` arm — it is what documents that goal/scheduled runs are
deliberately unattributed (D16). Do not collapse it to a fallthrough.

Confirm `run.owner` for an agent-kind run really is the agent id (the same way it is the
pipeline id for pipeline runs). **Verify this against real data**, not by assumption —
if the owner field holds something else for agent runs, the whole fix is wrong and you must
stop and report.

### 2. Client — `particle-mapping.ts`

`resolveEventOwner` gains an `agents` catalog and resolves the agent branch symmetrically
with the pipeline branch. Update the stale header comment at L12-16.

Keep the function pure and keep its existing early return for non-`pipeline-runs` scopes
unless the callers demand otherwise — read every caller before widening the scope check,
`flightForEvent` shares this module.

### 3. Client — `subsystemLoad.ts`

`activeRunsBySubsystem` threads the agent catalog through to `resolveEventOwner`. The
`"running" | "queued"` status set and `MAX_ORBITERS = 6` cap stay as they are — six dots is
a legibility cap, not a bug, and the operator's ask ("one dot per task") is satisfied for any
realistic subsystem load.

### 4. Client — `ChatScreen.tsx` / `SubsystemOrbMap.tsx`

`ChatScreen.tsx:169-171` currently fetches only `usePipelinesQuery()`. Add the agents query
(reuse the existing `features/agents` query hook — do **not** write a new one) and pass an
`agents` prop through `SubsystemOrbMap` into `activeRunsBySubsystem`.

Follow this repo's TanStack conventions: the hook returns the `useQuery` result directly and
the call site supplies its own default (`data ?? []`).

### 5. Performance — do not make it worse

`OrbitField` already runs one `requestAnimationFrame` loop per mounted `OrbNode`, and there
is **no** pause-on-hidden/blur logic in the current DOM scene. Fixing attribution will light
up more nodes more often, so this is the first change that makes that cost real.

- Respect `prefers-reduced-motion` exactly as the existing components do: the global CSS kill
  in `immersive.css.ts:25-27` plus `OrbitField.tsx:75-77,107`'s explicit `matchMedia` check
  that skips scheduling rAF entirely.
- Do **not** add a new always-on rAF loop.
- `SystemConfigSchema.powerSaver` still exists and is editable in Settings, but **nothing in
  the current DOM scene reads it** — it is a dead knob here. Do not wire it in as part of this
  fix; note it in your report if you think it should come back.

## Tests

### Server (`--project api`)
`apps/api/src/subsystems/subsystems.service.test.ts`:
- A running **agent**-kind run whose agent has `ownerSubsystem: "forge"` puts forge in a live
  state. **This must fail against the current code** — verify and report the red output.
- A running **pipeline**-kind run still attributes as before (pin the existing behaviour).
- A running **goal**-kind run attributes to nothing (pins D16).

### Design system (`--project design-system` — check the actual project name in `libs/design-system/vitest.config.ts`)
No changes expected. Run `libs/design-system/src/immersive` anyway to prove nothing regressed.

### Web (`--project web-components`)
`apps/web/features/chat/subsystemLoad.test.ts`:
- Agent-kind running run + agent with `ownerSubsystem` → count of 1 for that subsystem.
  **Must fail before the fix.**
- Mixed agent + pipeline runs for one subsystem → counts sum.
- Cap still applies at `MAX_ORBITERS`.
- Goal-kind run → not counted.

`apps/web/features/chat/components/SubsystemOrbMap.test.tsx` already imports
`OrbitFieldTestId` and uses `installEventSourceMock` + `RunEventsProvider`. Extend it: with an
agent-kind running run, that subsystem's `OrbitField` renders one dot.

## Definition of done

1. Red-before-green evidence pasted for **both** the server test and the `subsystemLoad` test.
2. `pnpm exec vitest run apps/api/src/subsystems --project api` green.
3. `pnpm exec vitest run apps/web/features/chat --project web-components` green.
4. `pnpm exec vitest run libs/design-system/src/immersive` green.
5. Prettier + ESLint clean; both tsc projects clean.
6. One commit: `fix(subsystems): attribute agent-kind runs to their owning subsystem`.

## Out of scope

- Any new animation, or edits to `OrbitField` / `ConnectorLayer` / `HandoffFlare` visuals.
- Goal-run attribution (D16).
- Reviving `powerSaver` or adding pause-on-hidden throttling — real, but a separate perf phase.
- `docs/plans/phase-94`, `-101`, `-107`, `-117`: all target the **retired WebGL scene**
  (`apps/web/features/chat/scene/*`, `sceneController.ts`, `CosmicScene`), which no longer
  exists. They are superseded — do not resume them.
