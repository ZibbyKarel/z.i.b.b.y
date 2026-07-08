# Subsystems (GAIA-style federation registry)

Phase 80 of the subsystem-federation arc — see
`docs/superpowers/specs/2026-07-08-subsystem-federation-design.md` for the design
doc, `docs/plans/phase-80-subsystem-registry.md` for the registry plan, and
`docs/plans/phase-82-subsystem-status-aggregation.md` for the live-status plan.
The eight named subsystems (Forge, Puls, Sentinel, Maestro, Beacon, Scout, Herald,
Loom) are a real, typed registry: identity (phase 80) + real aggregated status
(phase 82). No UI yet (phase 83+).

**Not to be confused with** `apps/api/src/health/subsystem-health.service.ts` —
an unrelated, pre-existing concept (M8 health-liveness aggregation of
backend/vault/integrations/scheduler). Never touch or reuse it for this resource.

## Pieces

| Piece      | File                                                    | Role                                                                 |
| ---------- | -------------------------------------------------------- | --------------------------------------------------------------------- |
| Schema     | `libs/contracts/src/subsystems/subsystem.schema.ts`       | `SubsystemIdSchema` (8-value enum), `SubsystemSchema`, `SUBSYSTEMS` registry constant, `SubsystemStateSchema`, `SubsystemWithStatusSchema` |
| Contract   | `libs/contracts/src/subsystems/subsystems.contract.ts`     | `subsystemsContract` — `getSubsystems` (`GET /api/subsystems`), `getSubsystem` (`GET /api/subsystems/:id`, 404 on unknown id), `markSubsystemSeen` (`POST /api/subsystems/:id/seen`, 404 on unknown id) |
| Errors     | `apps/api/src/subsystems/subsystems.errors.ts`             | `SubsystemNotFoundError`                                              |
| Seen store | `apps/api/src/subsystems/subsystem-seen.store.ts`           | `SubsystemSeenStore` — `.zibby/data/subsystem-seen.json`, `{ [id]: IsoDateTime }`, missing file/key = epoch, atomic writes |
| Service    | `apps/api/src/subsystems/subsystems.service.ts`             | `SubsystemsService.list()` / `.get(id)` / `.markSeen(id)` — real aggregation over pipelines/chains/runs/approvals (phase 82) |
| Controller | `apps/api/src/subsystems/subsystems.controller.ts`          | implements `subsystemsContract` via the shared `makeErrorMapper` 404 pattern |
| Module     | `apps/api/src/subsystems/subsystems.module.ts`              | imports `PipelinesModule`, `ChainsModule`, `ApprovalsModule`, `TasksModule` (for `TaskRunsService`, now exported from `TasksModule`) — registered in `app.module.ts` |
| Web query  | `apps/web/features/subsystems/queries/useSubsystemsQuery.ts` | `refetchInterval` ~15s, `select: selectApiResponseBody`, same posture as `useHealthQuery`/`useSelfStatusQuery` |
| Web mutation | `apps/web/features/subsystems/mutations/useMarkSubsystemSeenMutation.ts` | `makeInvalidatingMutation` over `markSubsystemSeen`, invalidates the subsystems query key — called when the operator opens a subsystem's drawer (phase 84) |

## The registry

`SUBSYSTEMS` is a checked-in TS constant (not a `.zibby/data` file) — a config
file, per the design doc's own framing, that both API and web import
type-safely with zero fs plumbing, since the eight entries are fixed,
non-user-generated data. Each entry: `{ id, name, tagline, mandate, color,
heroImage }`. `name` is the mythic name ("Forge"), `tagline` a short Czech
epithet, `mandate` the one-line Czech mandate from the design doc's federation
table, `heroImage` a root-relative path or `null` (all `null` until phase 90
ships the art).

**Colors are PROVISIONAL.** Forge is orange `#f97316`, established by its
existing hero art (`design/Z.I.B.B.Y/uploads/Forge.png`). The other seven carry
placeholder hues (puls teal, sentinel red, maestro violet, beacon amber, scout
green, herald blue, loom indigo) — each swappable by editing one registry line.
Visual identity for the seven non-Forge subsystems is a deliberately-deferred
design-doc item; do not treat these as final.

## Status shape (phase-82 real aggregation)

`SubsystemWithStatusSchema` extends the identity schema with
`{ state: "klid" | "bezi" | "hlaseni" | "ceka", tier2Count, tier3Count }`.
`SubsystemsService` computes this per subsystem, read-only over the pipelines/
chains stores (`ownerSubsystem`, phase 81), the unified task-runs feed
(`TaskRunsService.listTaskRuns()`), and `ApprovalsService` — it duplicates no
run/approval semantics, only reads and correlates:

- **`bezi`** — an owned pipeline/chain has a currently-`running` run.
- **`ceka`** (+ `tier3Count`) — pending approvals attributable to an owned
  pipeline's run. Attribution mirrors the web's `approvalForRun`
  (`apps/web/features/runs/run.ts`): a `pipeline-output` approval's `runId` IS
  the pipeline run id (exact match); a `pipeline-stage` approval's `runId` is
  the STAGE run id, prefixed with the pipeline run id
  (`${pipelineRunId}.${phaseId}_…`, prefix match). Every other approval kind
  (`agent`, `channel`, `task`, `proposed-task`, `task-output`, `jira-issue`,
  `machine`, `agent-proposal`) has no pipeline to attribute through and is
  silently excluded — the global approvals surface still shows it; this is a
  lens, not the source of truth.
- **`hlaseni`** (+ `tier2Count`) — owned pipeline/chain runs that went
  terminal (`done` or `error`) after the subsystem's `lastSeenAt`
  (`SubsystemSeenStore`). Neither `PipelineRun` nor `ChainRun` carries its own
  completion timestamp, so this reads the best available signal: the backing
  task's `taskOutcomeFinishedAt` when the run was dispatched from one, else
  the run's own `startedAt`.
- **Precedence** when several conditions apply to one subsystem:
  `ceka > bezi > hlaseni > klid` — waiting-on-you is never masked by ambient
  activity. Counts are independent of the headline state (a subsystem can
  carry a `tier2Count` while its state reads `ceka`).

## Seen-state (`SubsystemSeenStore`)

`.zibby/data/subsystem-seen.json` → `{ [subsystemId]: IsoDateTime }`. A
missing file or missing key reads as the epoch (everything unseen); writes are
atomic (temp file + rename), mirroring `GateRulesStorageService`/
`MachineConfigStore`. `POST /subsystems/:id/seen` resets the id's entry to now
and returns the refreshed `SubsystemWithStatus` — this is what drives
`hlaseni`'s window. Tier-3 (`ceka`) items are NOT cleared by this; they
resolve only through the existing approvals flow (different acknowledgment
model, per the design doc).

## Endpoints (`/api/subsystems`)

- `GET /subsystems` — all 8 entries, sorted for LISTS/BRIEFINGS: `ceka` first
  (by `tier3Count` desc), then `hlaseni` (by `tier2Count` desc), then `bezi`,
  then `klid`; registry (insertion) order is the stable tiebreak. Note this
  ordering differs from the state PRECEDENCE above (`bezi` outranks `hlaseni`
  there) — the list ordering is about "what needs a look", not which single
  state wins for one subsystem. The web subsystem strip does NOT consume this
  ordering — it keeps every node at a fixed position (nodes never move); this
  sort exists for feeds that read top-to-bottom.
- `GET /subsystems/:id` — 200 with the matching entry, 404 `{ message }` for an
  unknown id. `:id` is validated as a plain string in the contract (not the
  `SubsystemIdSchema` enum) so an unrecognized id reaches the controller and
  comes back as the contract's declared 404 — an enum-typed `pathParams` would
  fail ts-rest's own request validation first and throw a 400
  `BadRequestException` before the handler's 404 mapping ever ran.
- `POST /subsystems/:id/seen` — same plain-string `pathParams` pattern; 200
  with the refreshed entry, 404 for an unknown id.
