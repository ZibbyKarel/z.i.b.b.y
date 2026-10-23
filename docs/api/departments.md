# Departments (GAIA-style federation registry)

<!-- Reviewed 2026-07-29 (roadmap-sync-mine arc): the release/security changes this
session were test-fixture-only (the now-required `GitHubConfig.username`); no
department behaviour changed. This doc remains accurate. -->

<!-- Reviewed 2026-08-08 (get_status hang fix): apps/api/src/release/ changed
this session — `ReleaseService`'s GitHub PR enrichment was parallelized and
bounded with per-request timeouts (a fully sequential, untimed loop was
stalling the briefing/`get_status` chat tool for 30s+). That's the *merge
queue* service, unrelated to the department registry this doc describes beyond
"Release" sharing a name/color entry; no department identity, status, or
endpoint behaviour changed. This doc remains accurate. -->

<!-- Reviewed 2026-09-30 (arch-audit approval flood fix): apps/api/src/arch/
changed this session — `ArchService.audit()` now bundles a run's new findings
into ONE signal (kind `audit-batch`, emitted on the signal bus) instead of one
signal per finding, so a nightly audit no longer floods the approval queue with
one item per god node/community/cycle. That's Arch's producer-side signal
emission, not the department registry's identity/status/roster/endpoints this
doc describes; "Arch" still just a name/color entry here. This doc remains
accurate. -->

Phase 80 of the department-federation arc — see
`docs/superpowers/specs/2026-07-08-department-federation-design.md` for the design
doc, `docs/plans/phase-80-department-registry.md` for the registry plan, and
`docs/plans/phase-82-department-status-aggregation.md` for the live-status plan.
Since **D-022** (`docs/plans/zibbycorp/DECISIONS.md`) departments are **data, not a
closed enum**: the original eleven (Dev, Ops, Security, Release, Incident, R&D, Comms, QA,
Knowledge, Finance, Personal) are only the first-boot seed, and the operator can add more
on demand (`POST /api/departments`). The registry is typed: identity (phase 80) + real
aggregated status (phase 82). D-022 supersedes the closed-enum clauses of D-004, D-016
and D-021.

**Not to be confused with** `apps/api/src/health/department-health.service.ts` —
an unrelated, pre-existing concept (M8 health-liveness aggregation of
backend/vault/integrations/scheduler). Never touch or reuse it for this resource.

## Pieces

| Piece        | File                                                                       | Role                                                                                                                                                                                                                                                |
| ------------ | -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Schema       | `libs/contracts/src/departments/department.schema.ts`                      | `DepartmentIdSchema` (regex `^[a-z][a-z0-9-]{1,23}$`, open set), `DepartmentSchema`, `CreateDepartmentInputSchema` / `UpdateDepartmentInputSchema`, `DEPARTMENT_SEED` (first-boot seed only), `DepartmentStateSchema`, `DepartmentWithStatusSchema` |
| Contract     | `libs/contracts/src/departments/departments.contract.ts`                   | `departmentsContract` — `getDepartments`, `createDepartment`, `updateDepartment`, `getDepartment`, `markDepartmentSeen`, `getDepartmentSubtasks` and the roster/unowned reads; see _Endpoints_ below for paths and status codes                     |
| Store        | `apps/api/src/departments/departments.storage.service.ts`                  | `DepartmentsStorageService` — one `.zibby/data/departments/<id>.json` per department ; seed-once; `exists()` / `firstMissing()` / `assertExists()` write-boundary guards                                                                            |
| Errors       | `apps/api/src/departments/departments.errors.ts`                           | `DepartmentNotFoundError`, `DepartmentConflictError` (409), `InvalidDepartmentIdError`, and the `unknownDepartment422()` helper write boundaries return                                                                                             |
| Seen store   | `apps/api/src/departments/department-seen.store.ts`                        | `DepartmentSeenStore` — `.zibby/data/department-seen.json`, `{ [id]: IsoDateTime }`, missing file/key = epoch, atomic writes                                                                                                                        |
| Service      | `apps/api/src/departments/departments.service.ts`                          | `DepartmentsService.list()` / `.get(id)` / `.markSeen(id)` — real aggregation over workflows/agents/runs/approvals (phase 82; agents added in 126g)                                                                                                 |
| Controller   | `apps/api/src/departments/departments.controller.ts`                       | implements `departmentsContract` via the shared `makeErrorMapper` 404 pattern                                                                                                                                                                       |
| Module       | `apps/api/src/departments/departments.module.ts`                           | imports `WorkflowsModule`, `ApprovalsModule`, `TasksModule` (for `TaskRunsService`), `AgentsModule`, `IntegrationsModule`, and `MandateModule` (the roster's derived integration set reads the mandate) — registered in `app.module.ts`             |
| Web query    | `apps/web/features/departments/queries/useDepartmentsQuery.ts`             | `refetchInterval` ~15s, `select: selectApiResponseBody`, same posture as `useHealthQuery`/`useSelfStatusQuery`                                                                                                                                      |
| Web mutation | `apps/web/features/departments/mutations/useMarkDepartmentSeenMutation.ts` | `makeInvalidatingMutation` over `markDepartmentSeen`, invalidates the departments query key — called when the operator opens a department's drawer (phase 84)                                                                                       |

## The registry

Departments live in a file store (D-022): one file per department at
`.zibby/data/departments/<id>.json` (`_`-prefixed files are never read as a
department; the `findings/` subdirectory is likewise not an entity). Files
that fail `DepartmentSchema` are skipped by the listing, never fatal. There are no
divisions: a legacy `division` key in a stored file is ignored on read.

**Seed-once rule.** `DEPARTMENT_SEED` (the original eleven)
is written to disk only when the directory holds **no** non-`_` `*.json` file.
Afterwards the stored files always win — editing or deleting a seeded department
is permanent and never re-seeded unless the directory is emptied. Seeding is
memoised per process.

**Id.** `DepartmentIdSchema` is the regex `^[a-z][a-z0-9-]{1,23}$`, not an enum.
Whether an id _exists_ is a runtime check against the store, not a schema fact.

Each entry: `{ id, code, name, tagline, mandate, color, icon, fallback,
tierDefault, createdAt? }`. `name` is the English display name, `tagline` a short
Czech epithet, `mandate` the one-line Czech mandate, `code` an org-chart code
(`^[A-Z0-9]{2,6}$`). Three fields replace
the former closed `Record` maps:

| Field         | Values                                    | Was                       | Meaning                                        |
| ------------- | ----------------------------------------- | ------------------------- | ---------------------------------------------- |
| `icon`        | DS icon name, default `"folder"`          | `DEPARTMENT_GLYPH`        | icon on the org map and chips                  |
| `fallback`    | `"primary"` (default) \| `"orchestrator"` | `DEPARTMENT_FALLBACK`     | stage-2 classifier terminal fallback           |
| `tierDefault` | `"ask"\|"deny"\|"allow"\|"notify"\|null`  | `DEPARTMENT_TIER_DEFAULT` | default gate decision for its actions (`null`) |

Departments list in org-chart order: seeded ones in seed order, later ones by
`createdAt`, then id.

**Creation is an operator action** — `POST /api/departments`, the _New department_
dialog on the org map, or a hand-written file. ZIBBY never creates a department on
its own. D-022 added two departments to the seed: `pub` (Publishing) and `dist`
(Distribution).

**Existence checks replace the enum.** The write boundaries that name a department
— workflow create/update, agent create, and the gate-rule
writes — check the store: an unknown department is a **422**
`Unknown department "<id>"` (`unknownDepartment422`), not a schema error.
(`PATCH /api/agents/:id` does not check yet: its contract declares no 422.)

**A department carries no portrait.** Phase 90 shipped photographic hero art for
all eight (`heroImage: "/departments/<id>.jpg"`, assets under
`apps/web/public/departments/`); the Velín-D alignment removed both the field and
the files. Identity now rides entirely on `color`, through the live orb — the
same orb on the chat map and in the drawer header, so clicking a node and
reading its detail are visibly the same object. Two identity marks (a portrait
and an orb) read as two different things, so the art went rather than sitting
dark. `departments.contract.test.ts` guards that no orphaned art returns; recover
the files from git history if the decision is ever revisited.

**Colors are the ZT palette hues** (Velín-D phase-2 alignment): dev `#5b8def`,
comms `#56c4d6`, security `#34c9bd`, research `#46cf8b`, release `#e0a83c`, incident
`#f4785c`, ops `#f2749e`, arch `#b07cff`. Each is swappable by editing one
registry line, but it is now a department's ENTIRE visual identity — it colors the
orb body on the map and in the drawer header — so a change is a design decision,
not a tweak.

## Status shape (phase-82 real aggregation)

`DepartmentWithStatusSchema` extends the identity schema with
`{ state, tier2Count, tier3Count, errorCount }`, where `DepartmentStateSchema` is
`"idle" | "running" | "report" | "waiting" | "error"`. `DepartmentsService`
computes this per department, read-only over the workflows store
(`department`, phase 81), the **agents** store (same field — phase 126g), the
unified task-runs feed (`TaskRunsService.listTaskRuns()`), and `ApprovalsService`
— it duplicates no run/approval semantics, only reads and correlates:

- **`running`** — an owned workflow **or an owned agent** has a currently-`running`
  run. Agent-kind runs were excluded until phase 126g, which is why a department
  could look idle while its agent was mid-run; roughly half of dispatched runs are
  agent-kind, so this was the common case, not an edge one.
- **`waiting`** (+ `tier3Count`) — pending approvals attributable to an owned
  **workflow** run. This half stays workflow-only: attribution mirrors the web's
  `approvalForRun` (`apps/web/features/runs/run.ts`), whose two matchable kinds
  (`workflow-output`, `workflow-stage`) are both workflow-shaped — a
  `workflow-output` approval's `runId` IS the workflow run id (exact match); a
  `workflow-stage` approval's `runId` is the STAGE run id, prefixed with the
  workflow run id (`${workflowRunId}.${phaseId}_…`, prefix match). Every other
  approval kind (`agent`, `channel`, `task`, `proposed-task`, `task-output`,
  `jira-issue`, `machine`, `agent-proposal`) has no workflow to attribute through
  and is silently excluded — the global approvals surface still shows it; this is
  a lens, not the source of truth.
- **`report`** (+ `tier2Count`) / **`error`** (+ `errorCount`) — owned workflow
  **or agent** runs that went terminal after the department's `lastSeenAt`
  (`DepartmentSeenStore`), split by outcome: `done` counts toward `tier2Count`,
  `error` toward `errorCount`, never both. `WorkflowRun` carries no completion
  timestamp of its own, so this reads the best available signal: the backing
  task's `taskOutcomeFinishedAt` when the run was dispatched from one, else the
  run's own `startedAt`.
- **Not attributed:** goal-kind runs (no `department` concept exists on any
  goal schema — phase-126g D16) and `scheduled`-kind rows, which are tasks that
  have not dispatched into a run yet.
- **Precedence** when several conditions apply to one department:
  `waiting > error > running > report > idle` — waiting-on-you is never masked by
  ambient activity. Counts are independent of the headline state (a department can
  carry a `tier2Count` while its state reads `waiting`).

## Ownership is load-bearing (NS2 F9)

Before F9, `department` was attribution: it decided what the Roster listed and
nothing else. It now decides **whether a unit can be dispatched at all.**

The task classifier's stage 1 routes only to departments ("whose domain is this?"),
and a department's stage-2 catalog offers only units it owns. So an agent or
workflow with no owner is **unroutable by construction** — no catalog contains it
and the classifier can emit nothing else. Ownership stopped being metadata and
became the wiring.

Two consequences worth knowing:

- **Both create endpoints 422 without an owner** (`POST /api/agents`,
  `POST /api/workflows`). The field stays `.optional()` in the schemas so that a
  file which somehow lost its owner is still _readable_ and therefore reportable
  via `GET /api/departments/unowned` — a required field would make it vanish
  silently from a tolerant listing instead.
- **Only seated departments appear in the stage-1 catalog.** A department owning
  zero workflows and zero active agents is excluded, because offering it invites a
  verdict that immediately unwinds at stage 2's empty-roster check. **incident** and
  **ledger** are unseated _by design_ — incident IS the Tier-3 surface-and-wait
  contract rather than a work-doer, and ledger is a budget/limits service — so no
  free-text task is ever "for incident". The other nine each carry a crew and a
  complexity ladder (see `docs/api/workflows.md` → _the ladder rung_).

## Roster is derived from `Agent.department`

There are no employees: an agent belongs to a department's roster IFF its own
frontmatter `department:` names that department. `DepartmentsService.roster(id)`
filters the active agents by that field; an agent with no `department` is unowned.

The task classifier's stage-1 seating (`stage1DepartmentCandidates`, used by
both `classify()`'s full catalog and `classifyDepartment()` for the roadmap
gate — see [tasks.md](./tasks.md) → _Classification_) follows the same rule:
a department is a routable stage-1 candidate when it owns ≥1 workflow
(`Workflow.department`) **or** ≥1 active agent (`Agent.department`).

`aggregateAll()` (the `running`/`report`/`error` aggregation behind
`list()`/`get()`'s headline `state`, described below) attributes an agent-kind run
to a department via the same `Agent.department` field; workflow-kind runs go via
`Workflow.department`.

## Roster (`GET /api/departments/:id/roster`)

A department's `{ agents, integrations, monitors }`, served by
`DepartmentsService.roster(id)`. `agents` is the `Agent.department` set above.
`integrations` is **derived, not stored** — integrations
carry no owner tag:

- **ops** lists EVERY integration (the heartbeat watcher listens to all).
- **comms** lists the reply-enabled ones
  (`mandate.channels[id].reply ?? mandate.defaults.reply`) — the same set
  comms replies through.
- every other department lists none.

`monitors` is the subset of that set that are GitHub integrations with a `ci`
stream (there is no standalone monitor entity). `listUnowned()`
(`GET /api/departments/unowned`) reports only unowned workflows/agents — never
integrations, whose membership is derived and so can never be "missing".

## Seen-state (`DepartmentSeenStore`)

`.zibby/data/department-seen.json` → `{ [departmentId]: IsoDateTime }`. A
missing file or missing key reads as the epoch (everything unseen); writes are
atomic (temp file + rename), mirroring `GateRulesStorageService`/
`MachineConfigStore`. `POST /departments/:id/seen` resets the id's entry to now
and returns the refreshed `DepartmentWithStatus` — this is what drives
`hlaseni`'s window. Tier-3 (`ceka`) items are NOT cleared by this; they
resolve only through the existing approvals flow (different acknowledgment
model, per the design doc).

## Endpoints (`/api/departments`)

- `/departments/unowned` is declared before `/departments/:id` so it is not captured
  as an id.
- `POST /departments` — create a department (body: `CreateDepartmentInputSchema`, i.e.
  all fields incl. `id`, minus `createdAt`). 201 with the stored entry; **409** when the
  id exists; **400** for a body that
  fails schema validation, including a malformed `id` (ts-rest body validation).
- `PATCH /departments/:id` — partial update of the editable fields (everything except
  `id`/`createdAt`; the id is immutable). 200 with the entry; 404 for an unknown or
  unsafe id.
- `GET /departments` — all entries (seed + operator-created), sorted for LISTS/BRIEFINGS: `ceka` first
  (by `tier3Count` desc), then `hlaseni` (by `tier2Count` desc), then `bezi`,
  then `klid`; registry (insertion) order is the stable tiebreak. Note this
  ordering differs from the state PRECEDENCE above (`bezi` outranks `hlaseni`
  there) — the list ordering is about "what needs a look", not which single
  state wins for one department. The web department strip does NOT consume this
  ordering — it keeps every node at a fixed position (nodes never move); this
  sort exists for feeds that read top-to-bottom.
- `GET /departments/:id` — 200 with the matching entry, 404 `{ message }` for an
  unknown id. `:id` is validated as a plain string in the contract (not the
  `DepartmentIdSchema`) so an unrecognized or malformed id reaches the controller and
  comes back as the contract's declared 404 (`InvalidDepartmentIdError` maps to 404 too)
  — a regex-typed `pathParams` would fail ts-rest's own request validation first and
  throw a 400 `BadRequestException` before the handler's 404 mapping ever ran.
- `POST /departments/:id/seen` — same plain-string `pathParams` pattern; 200
  with the refreshed entry, 404 for an unknown id.
- `GET /departments/:id/subtasks` — ZB-04a §5: every subtask (`ScheduledTask.parentTaskId`
  set) stamped with this department, via `TaskParentsService.getDepartmentSubtasks` (see
  [tasks.md](./tasks.md) → _Parent/subtask read model_). 404 for an unknown id, same
  plain-string `pathParams` pattern as the routes above. The longer path (rather than a
  query param on `/departments/:id`) avoids Express key-order shadowing against that
  single-param route. `DepartmentsService.subtasks(id)` first validates the id via `find(id)`
  (the existing `DepartmentNotFoundError` 404), then delegates to `TaskParentsService` — the
  ONE parent/subtask read model, not a second implementation.

<!-- Last reviewed 2026-10-23: still accurate after the verify-phase / project-checks removal (D-024). -->
