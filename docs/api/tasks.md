# Task scheduling & routing

## What is a Task

A `ScheduledTask` is a deferred or immediate unit of work created by the operator.
At dispatch it goes through classification → routing → the same runners a direct
agent start would use.

## Task lifecycle

```
scheduled    ← created with a future scheduledAt
    ↓
  tick()     ← daemon runs once per configured interval
    ↓
queued       ← project hit maxConcurrent (FIFO, no approval)
held         ← spend exceeded the budget cap (waits for approval to release)
pending      ← interactive path (dialog): accepted, classification + spawn run IN THE BACKGROUND
    ↓
dispatched   ← handed to a runner
    ↓
awaiting-output ← run finished `done` and the chosen `pr` output is parked at the gate
    ↓             (durable; approve/reject → outcome written, back to dispatched)
success | failed | cancelled
```

`TaskSchedulerService` owns the whole lifecycle.

### `pending` — background dispatch (interactive path)

So the New Task dialog doesn't block on the full spawn (Haiku naming + classification
+ starting the runner can take seconds), the interactive path (`POST /api/tasks` from
the dialog) runs with `background = true`: the fast guards (limit / budget /
capacity) run synchronously, then the task is persisted as `pending` and the
response returns **immediately** as `{ outcome: "pending", task }`. Classification
and spawn finish in the background (`dispatchPending`) → the task flips to
`dispatched` (born linked to `taskId`), or to `failed` with a reason when there's
nowhere to route it (never a silent no-op — Law 5). The dialog redirects to
`/runs?run=<task.id>` and the feed row flips in place from `pending` to the run
(selection follows `taskId`).

Server-side callers (chat, channel triage, proposed-task) don't set `background` —
they stay synchronous and keep the original `dispatched` / `EmptyCatalogError`
semantics.

## Creating a task

```
POST /api/tasks
Body: {
  title?: string             # optional short name
  text: string                # the task description (the classifier reads this)
  paths?: string[]            # files / directories (max 64)
  attachmentSetId?: string    # a previously-uploaded attachment set (POST /api/tasks/attachments)
  scheduledAt?: number         # epoch ms; absent or in the past → immediate dispatch
  output?: TaskOutput          # what happens to the finished work (PR / file / void).
                               # Absent = inherit (a pipeline target keeps its own
                               # outputs:, an agent/orchestrator target delivers
                               # nothing). See "Task output" below.
  target?: TaskTarget          # Phase 11: a pre-chosen target that skips classification
                               # (a scheduled loop carries { kind: "goal", id }; the
                               # scheduler re-dispatches to that target on tick instead
                               # of re-classifying)
}
```

There is no client-supplied `projectId` field — project attribution is always
derived server-side by `matchProject` (deterministic, no tokens), never asserted by
the caller (Law 4).

`scheduledAt` absent or in the past → `createTask` runs classification + dispatch
immediately. From the dialog (`background = true`), dispatch happens in the
background and the endpoint returns `pending` right away (see "`pending` —
background dispatch" above).

## Classification (TaskClassifierService)

**File:** `apps/api/src/tasks/task-classifier.service.ts`

The classifier finds the best target for the task's text:

1. Loads every agent and pipeline (their `description` field)
2. Keyword scoring — counts word overlap between the task text and each description
3. Returns a `TaskRouting`:
   ```typescript
   {
     target: "agent" | "pipeline" | "orchestrator"
     id?: string        // agent or pipeline id (the orchestrator has none)
     confidence: number // 0–1
     reason: string     // why this target
   }
   ```
4. If the catalog is empty → `EmptyCatalogError` → HTTP 422

The operator can also call `POST /api/tasks/classify` to test classification without
creating a task.

## Budget guard

Before every dispatch (immediate or from the scheduler):

1. `matchProject(task, projects)` — attributes the task to a project (deterministic, no tokens)
2. `BudgetService.check(projectId, now)` — checks the project's daily/weekly budget
   (see [budget.md](./budget.md) for the enforcement details; not duplicated here)
3. Over the cap → the task moves to the **held** state:
   - A `task`-kind `Approval` is created with `action: "spend-past-cap"`
   - The operator approves it via the generic approvals surface
     (`POST /api/approvals/:id/approve` — see [approvals.md](./approvals.md)), which
     triggers the scheduler's `releaseHeld` for this task
   - Once approved, the task re-enters dispatch (the budget check is skipped once for
     this id)

## Concurrency guard

Every project has a `maxConcurrent` (how many runs may be active at once):

1. `countRunning(projectId)` — counts the project's active agent + pipeline runs
2. At the limit → the task moves to the **queued** state (no approval needed)
3. On every terminal run → `drainQueues()` — moves the oldest queued task of each
   project into dispatch

`budgetApproved: Set<string>` in memory — task ids that were released past the cap;
a drain skips the budget check for these once, then removes them from the set.

## Daemon tick

```typescript
// taskTickMs (runtime system config) = 30_000 by default (0 = disabled, used in tests);
// the scheduler re-arms live via SystemConfigStore.onChange() when the config changes.
setInterval(() => tick(), systemConfig.current().taskTickMs);
```

`tick()`:

1. Loads every `scheduled` task with `scheduledAt <= now`
2. Calls `attemptDispatch(task)` for each
3. `attemptDispatch` → budget check → concurrency check → route → dispatch

## Routing and dispatch

| Target         | Dispatcher                                                        |
| -------------- | ------------------------------------------------------------------ |
| `agent`        | `AgentRunnerService.startRun(agentId, { prompt, project })`         |
| `pipeline`     | `PipelineRunnerService.startRun(pipelineId, { prompt, project })`   |
| `orchestrator` | `AgentRunnerService.startRun(ORCHESTRATOR_ID, { prompt })`          |

After dispatch, `runRef` is written back to the task record.

## Outcome

The daemon watches the run's terminal state:

- `AgentRun.status: done | error | interrupted` → the task gets `outcome: { status, summary }`
- `PipelineRun.status: done | failed` → the same
- `summary` is truncated to `SUMMARY_MAX_CHARS = 200` characters

## API endpoints

```
POST   /api/tasks/classify            classify text without creating a task
POST   /api/tasks                     create a task — dispatch now, or schedule for scheduledAt
GET    /api/tasks/scheduled           list deferred tasks (newest first)
DELETE /api/tasks/scheduled/:id       cancel a still-waiting task (scheduled | queued | held)
POST   /api/tasks/attachments         upload files as a durable attachment set (multipart)
```

There is no dedicated "list all tasks" or "update a scheduled task" endpoint — the
unified run feed (`GET /api/tasks/runs`, below) is how every task/run is browsed, and
a held task is released through the generic approvals surface, not a task-specific
override endpoint.

## The unified run surface (`/api/tasks/runs`)

A task is the entity that runs; the processor (agent / pipeline / goal) is metadata.
Every operation on a run lives under one surface — no per-kind run routes. A run is
only ever started by creating a task (`POST /api/tasks`); starting is not part of
this surface. `TaskRunSchema` is a superset of the feed row plus an optional
`processor: { kind, id, name }` (the name falls back to the id when the definition
was deleted). Goal maker/verifier child runs are folded into the feed (not peer
rows), but stay reachable from the goal's detail view.

```
GET    /api/tasks/runs                                       the unified feed (newest-first; agent/pipeline/goal/scheduled)
GET    /api/tasks/runs/:runId                                a single run's detail
GET    /api/tasks/runs/:runId/logs?offset=                   log chunk from a byte offset
GET    /api/tasks/runs/:runId/logs/stream                    SSE tail (falls back to the offset-poll above)
GET    /api/tasks/runs/:runId/stages/:phaseId/logs?offset=    one pipeline stage's log
GET    /api/tasks/runs/:runId/stages/:phaseId/logs/stream     SSE tail for a pipeline stage's log
GET    /api/tasks/runs/:runId/artifacts/:name                a whitelisted artifact (pr-draft.md, verdict.txt, …)
POST   /api/tasks/runs/:runId/stop                            stop a running run
POST   /api/tasks/runs/:runId/resume                          resume a parked run (with a note)
DELETE /api/tasks/runs/:runId                                  delete a run and its artifacts
```

Both `/logs/stream` endpoints live outside the ts-rest contract as raw NestJS `@Sse`
routes (ts-rest doesn't model event streams) — the concrete implementation of the
"SSE for live streams, polling for state" DNA rule. The resolver looks up `runId` and
dispatches to the owning runner. The only per-kind run endpoints left are the catalog
liveness routes `GET /api/agents/running` and `GET /api/pipelines/runs` (badges/counts
in the catalog) — see [agents-runs.md](./agents-runs.md) and [pipelines.md](./pipelines.md).

## Task output (`output`)

In the New Task dialog, the operator chooses **what happens to the finished work** —
the counterpart to a pipeline's `outputs:` block. It's deterministic and owned by the
system (no agent, no tokens); the output side is "the PR is the gate". `TaskOutput`
is a discriminated union:

| `type` | Fields       | What it does                                                                                                                                          |
| ------ | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `pr`   | —            | Opens a PR from the finished run's branch. **Always parks** behind a `task-output` approval before pushing (the PR is the gate, structurally).        |
| `file` | `dest`, `to` | Writes the run's result (a summary) to a file — into the project's worktree (`dest: project`) or as a vault note (`dest: vault`). Tier-1, immediate.  |
| `void` | —            | Explicitly no output (also suppresses a pipeline-declared `pr`).                                                                                       |

**A missing field means inherit, not void.** For a pipeline target, its own
`outputs:` apply; for an agent/orchestrator target, nothing is delivered (today's
behavior). "Didn't choose" and "chose void" are two different states.

**Two paths, one gate.**

- **Pipeline target** — `output` is passed to the runner as a per-run override of the
  declared `outputs:` (stored as `PipelineRun.outputsOverride`; `void` → `[]`). The
  rest is handled by the existing pipeline output gate (`parkedReason: "output"`).
- **Agent / orchestrator target** — the gate lives at the task level
  (`TaskOutputService`), because agent runs have no durable park of their own. When
  the run ends `done`:
  - `file` is delivered immediately (Tier-1), the outcome is written normally.
  - `pr` **commits** the branch (`checkpoint` — `git add -A && commit`, owned by the
    system, independent of the agent; commit ≠ push), captures `branch` + `repoPath`
    into `pendingOutput`, creates a `task-output` approval (`runId` = `taskId`), and
    the task moves to `awaiting-output`. This parked state is **durable** (the run has
    already finished, no live child — the `ScheduledTask` record IS the state, it
    survives a restart for free). Once approved, the system pushes from `repoPath`
    against `branch` (the ref survives worktree cleanup too) and writes the outcome;
    rejecting leaves the work on the branch with no PR. When the branch has no commits
    or the run has no worktree → a soft no-op (no gate, outcome as usual).

## Phase 11 — unified assignment (loop shape + path scoping)

Classification stays **free of side effects**, and the catalog still only routes to
agent/pipeline/orchestrator (an `isCoherent` `goal` target is still excluded). But
`TaskRouting` now carries three additional, backward-compatible fields (an old client
ignores them):

```typescript
{
  // …target, confidence, reason, matchedTerms, candidates…
  mode: "single" | "loop"            // default "single"
  proposedGoal: ProposedGoal | null  // the synthesized goal, when mode === "loop"
  paths: ResolvedPath[]              // detected paths attributed to projects
}
```

- **Loop detection (two paths).** The LLM router may return `loop: true` (an
  annotation on its own agent/pipeline pick), or the deterministic
  `detectLoopCue(text)` (cs+en, diacritic-folded) finds a cue like "until it passes"
  or "keep retrying". When either fires and there is a concrete maker, the classifier
  assembles a `proposedGoal` (`synthesizeGoal`): `objective`/`instructions` = the raw
  task text (Law 4 — data, not a command), `maker` = the chosen agent/pipeline
  (orchestrator → the first pipeline in the catalog, otherwise `mode` falls back to
  `single`), `verifier: { kind: "checks" }` (the project's default checks),
  `maxIterations = DEFAULT_GOAL_ITERATIONS`. **Nothing is written** — the `.goal.md`
  is only created on submit from the web (`createGoal` → `startGoalRun`; for a
  scheduled loop, `createGoal` → `createTask` with `target: goal`).

- **Path scoping.** The classifier attributes each `paths[]` entry to a project via
  `matchProject` (read-only attribution). The web renders "in project <name>", or —
  for a path outside any project — offers to **grant access**; the operator's confirm
  calls `createProject` (registers the folder as a workspace root). No autonomous
  path ever calls the grant (Law 1). A non-git granted folder runs directly as the
  cwd (no worktree, no `WorkspaceSetupError`).

## Activity records

| Event              | When                                        |
| ------------------ | -------------------------------------------- |
| `task-created`     | A task was created                            |
| `task-dispatched`  | A task was handed to a runner                 |
| `task-queued`      | A task was queued (maxConcurrent)             |
| `task-held`        | A task was parked for budget approval         |
| `task-outcome`     | A run finished, outcome written back          |
