# Subsystems (GAIA-style federation registry)

<!-- Reviewed 2026-07-29 (roadmap-sync-mine arc): the maestro/sentinel changes this
session were test-fixture-only (the now-required `GitHubConfig.username`); no
subsystem behaviour changed. This doc remains accurate. -->

<!-- Reviewed 2026-08-08 (get_status hang fix): apps/api/src/maestro/ changed
this session — `MaestroService`'s GitHub PR enrichment was parallelized and
bounded with per-request timeouts (a fully sequential, untimed loop was
stalling the briefing/`get_status` chat tool for 30s+). That's the *merge
queue* service, unrelated to the subsystem registry this doc describes beyond
"Maestro" sharing a name/color entry; no subsystem identity, status, or
endpoint behaviour changed. This doc remains accurate. -->

Phase 80 of the subsystem-federation arc — see
`docs/superpowers/specs/2026-07-08-subsystem-federation-design.md` for the design
doc, `docs/plans/phase-80-subsystem-registry.md` for the registry plan, and
`docs/plans/phase-82-subsystem-status-aggregation.md` for the live-status plan.
The **eleven** named subsystems (Forge, Puls, Sentinel, Maestro, Beacon, Scout,
Herald, Loom, plus Codex + Ledger seated in NS2 F1a and Hearth in F8a) are a real,
typed registry: identity (phase 80) + real aggregated status (phase 82). No UI yet
(phase 83+).

**Not to be confused with** `apps/api/src/health/subsystem-health.service.ts` —
an unrelated, pre-existing concept (M8 health-liveness aggregation of
backend/vault/integrations/scheduler). Never touch or reuse it for this resource.

## Pieces

| Piece        | File                                                                     | Role                                                                                                                                                                                                                                    |
| ------------ | ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Schema       | `libs/contracts/src/subsystems/subsystem.schema.ts`                      | `SubsystemIdSchema` (11-value enum), `SubsystemSchema`, `SUBSYSTEMS` registry constant, `SubsystemStateSchema`, `SubsystemWithStatusSchema`                                                                                             |
| Contract     | `libs/contracts/src/subsystems/subsystems.contract.ts`                   | `subsystemsContract` — `getSubsystems` (`GET /api/subsystems`), `getSubsystem` (`GET /api/subsystems/:id`, 404 on unknown id), `markSubsystemSeen` (`POST /api/subsystems/:id/seen`, 404 on unknown id)                                 |
| Errors       | `apps/api/src/subsystems/subsystems.errors.ts`                           | `SubsystemNotFoundError`                                                                                                                                                                                                                |
| Seen store   | `apps/api/src/subsystems/subsystem-seen.store.ts`                        | `SubsystemSeenStore` — `.zibby/data/subsystem-seen.json`, `{ [id]: IsoDateTime }`, missing file/key = epoch, atomic writes                                                                                                              |
| Service      | `apps/api/src/subsystems/subsystems.service.ts`                          | `SubsystemsService.list()` / `.get(id)` / `.markSeen(id)` — real aggregation over pipelines/agents/runs/approvals (phase 82; agents added in 126g)                                                                                      |
| Controller   | `apps/api/src/subsystems/subsystems.controller.ts`                       | implements `subsystemsContract` via the shared `makeErrorMapper` 404 pattern                                                                                                                                                            |
| Module       | `apps/api/src/subsystems/subsystems.module.ts`                           | imports `PipelinesModule`, `ApprovalsModule`, `TasksModule` (for `TaskRunsService`), `AgentsModule`, `IntegrationsModule`, and `MandateModule` (the roster's derived integration set reads the mandate) — registered in `app.module.ts` |
| Web query    | `apps/web/features/subsystems/queries/useSubsystemsQuery.ts`             | `refetchInterval` ~15s, `select: selectApiResponseBody`, same posture as `useHealthQuery`/`useSelfStatusQuery`                                                                                                                          |
| Web mutation | `apps/web/features/subsystems/mutations/useMarkSubsystemSeenMutation.ts` | `makeInvalidatingMutation` over `markSubsystemSeen`, invalidates the subsystems query key — called when the operator opens a subsystem's drawer (phase 84)                                                                              |

## The registry

`SUBSYSTEMS` is a checked-in TS constant (not a `.zibby/data` file) — a config
file, per the design doc's own framing, that both API and web import
type-safely with zero fs plumbing, since the eleven entries are fixed,
non-user-generated data. Each entry: `{ id, name, tagline, mandate, color }`.
`name` is the mythic name ("Forge"), `tagline` a short Czech epithet, `mandate`
the one-line Czech mandate from the design doc's federation table.

**A subsystem carries no portrait.** Phase 90 shipped photographic hero art for
all eight (`heroImage: "/subsystems/<id>.jpg"`, assets under
`apps/web/public/subsystems/`); the Velín-D alignment removed both the field and
the files. Identity now rides entirely on `color`, through the live orb — the
same orb on the chat map and in the drawer header, so clicking a node and
reading its detail are visibly the same object. Two identity marks (a portrait
and an orb) read as two different things, so the art went rather than sitting
dark. `subsystems.contract.test.ts` guards that no orphaned art returns; recover
the files from git history if the decision is ever revisited.

**Colors are the ZT palette hues** (Velín-D phase-2 alignment): forge `#5b8def`,
herald `#56c4d6`, sentinel `#34c9bd`, scout `#46cf8b`, maestro `#e0a83c`, beacon
`#f4785c`, puls `#f2749e`, loom `#b07cff`. Each is swappable by editing one
registry line, but it is now a subsystem's ENTIRE visual identity — it colors the
orb body on the map and in the drawer header — so a change is a design decision,
not a tweak.

## Status shape (phase-82 real aggregation)

`SubsystemWithStatusSchema` extends the identity schema with
`{ state, tier2Count, tier3Count, errorCount }`, where `SubsystemStateSchema` is
`"idle" | "running" | "report" | "waiting" | "error"`. `SubsystemsService`
computes this per subsystem, read-only over the pipelines store
(`ownerSubsystem`, phase 81), the **agents** store (same field — phase 126g), the
unified task-runs feed (`TaskRunsService.listTaskRuns()`), and `ApprovalsService`
— it duplicates no run/approval semantics, only reads and correlates:

- **`running`** — an owned pipeline **or an owned agent** has a currently-`running`
  run. Agent-kind runs were excluded until phase 126g, which is why a subsystem
  could look idle while its agent was mid-run; roughly half of dispatched runs are
  agent-kind, so this was the common case, not an edge one.
- **`waiting`** (+ `tier3Count`) — pending approvals attributable to an owned
  **pipeline** run. This half stays pipeline-only: attribution mirrors the web's
  `approvalForRun` (`apps/web/features/runs/run.ts`), whose two matchable kinds
  (`pipeline-output`, `pipeline-stage`) are both pipeline-shaped — a
  `pipeline-output` approval's `runId` IS the pipeline run id (exact match); a
  `pipeline-stage` approval's `runId` is the STAGE run id, prefixed with the
  pipeline run id (`${pipelineRunId}.${phaseId}_…`, prefix match). Every other
  approval kind (`agent`, `channel`, `task`, `proposed-task`, `task-output`,
  `jira-issue`, `machine`, `agent-proposal`) has no pipeline to attribute through
  and is silently excluded — the global approvals surface still shows it; this is
  a lens, not the source of truth.
- **`report`** (+ `tier2Count`) / **`error`** (+ `errorCount`) — owned pipeline
  **or agent** runs that went terminal after the subsystem's `lastSeenAt`
  (`SubsystemSeenStore`), split by outcome: `done` counts toward `tier2Count`,
  `error` toward `errorCount`, never both. `PipelineRun` carries no completion
  timestamp of its own, so this reads the best available signal: the backing
  task's `taskOutcomeFinishedAt` when the run was dispatched from one, else the
  run's own `startedAt`.
- **Not attributed:** goal-kind runs (no `ownerSubsystem` concept exists on any
  goal schema — phase-126g D16) and `scheduled`-kind rows, which are tasks that
  have not dispatched into a run yet.
- **Precedence** when several conditions apply to one subsystem:
  `waiting > error > running > report > idle` — waiting-on-you is never masked by
  ambient activity. Counts are independent of the headline state (a subsystem can
  carry a `tier2Count` while its state reads `waiting`).

## Ownership is load-bearing (NS2 F9)

Before F9, `ownerSubsystem` was attribution: it decided what the Roster listed and
nothing else. It now decides **whether a unit can be dispatched at all.**

The task classifier's stage 1 routes only to subsystems ("whose domain is this?"),
and a subsystem's stage-2 catalog offers only units it owns. So an agent or
pipeline with no owner is **unroutable by construction** — no catalog contains it
and the classifier can emit nothing else. Ownership stopped being metadata and
became the wiring.

Two consequences worth knowing:

- **Both create endpoints 422 without an owner** (`POST /api/agents`,
  `POST /api/pipelines`). The field stays `.optional()` in the schemas so that a
  file which somehow lost its owner is still _readable_ and therefore reportable
  via `GET /api/subsystems/unowned` — a required field would make it vanish
  silently from a tolerant listing instead.
- **Only seated subsystems appear in the stage-1 catalog.** A subsystem owning
  zero pipelines and zero active agents is excluded, because offering it invites a
  verdict that immediately unwinds at stage 2's empty-roster check. **beacon** and
  **ledger** are unseated _by design_ — beacon IS the Tier-3 surface-and-wait
  contract rather than a work-doer, and ledger is a budget/limits service — so no
  free-text task is ever "for beacon". The other nine each carry a crew and a
  complexity ladder (see `docs/api/pipelines.md` → _the ladder rung_).

## Roster (`GET /api/subsystems/:id/roster`)

A subsystem's `{ agents, integrations, monitors }`, served by
`SubsystemsService.roster(id)`. `agents` is filtered off the stored
`ownerSubsystem` tag. `integrations` is **derived, not stored** — integrations
carry no owner tag:

- **puls** lists EVERY integration (the heartbeat watcher listens to all).
- **herald** lists the reply-enabled ones
  (`mandate.channels[id].reply ?? mandate.defaults.reply`) — the same set
  herald replies through.
- every other subsystem lists none.

`monitors` is the subset of that set that are GitHub integrations with a `ci`
stream (there is no standalone monitor entity). `listUnowned()`
(`GET /api/subsystems/unowned`) reports only unowned pipelines/agents — never
integrations, whose membership is derived and so can never be "missing".

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
