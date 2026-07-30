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
queued       ← project hit maxConcurrent, OR the system-wide maxConcurrentRuns
                 ceiling is full (FIFO, no approval). A task queued by the
                 global cap need not belong to any project.
held         ← spend exceeded the budget cap (waits for approval to release)
pending      ← interactive path (dialog): accepted, classification + spawn run IN THE BACKGROUND
    ↓
dispatched   ← handed to a runner
    ↓
awaiting-output ← legacy: a `pr` output parked at the old gate (durable; approve/reject
    ↓             → outcome, back to dispatched). New `pr` outputs open immediately
    ↓             (Tier-2, no park) — this state only drains runs parked before that change.
success | failed | cancelled
```

`TaskSchedulerService` owns the whole lifecycle.

### `pending` — background dispatch (interactive path)

So the New Task dialog doesn't block on the full spawn (Haiku naming, classification,
and starting the runner can take seconds), the interactive path (`POST /api/tasks` from
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
the caller (Law 4). The same rule keeps **`roadmapItemId`/`roadmapItemLabel`** off
this input: they are provenance too, written onto the persisted `ScheduledTask` by
`RoadmapGateService.release()` (see
[roadmap.md](./roadmap.md#the-issue--run-link-both-directions)) and enriched onto
`TaskRun` in `enrichRunWithTask`, so a run detail can link back to the issue it
solves. A client-settable "this task belongs to issue X" would be forgeable
provenance.

`scheduledAt` absent or in the past → `createTask` runs classification + dispatch
immediately. From the dialog (`background = true`), dispatch happens in the
background and the endpoint returns `pending` right away (see "`pending` —
background dispatch" above).

## Classification (TaskClassifierService)

**File:** `apps/api/src/tasks/task-classifier.service.ts`

The classifier finds the best target for the task's text, in up to two stages:

1. **Stage 1 — the switchboard.** Loads every active agent (minus the explicit-only
   ones — see below), every pipeline, and one
   coarse `subsystem` candidate per subsystem that owns ≥1 pipeline or agent
   (`ownerSubsystem`) — `stage1SubsystemCandidates`. A subsystem candidate's `search`
   is its Czech mandate, so mandate-term overlap ranks it in the keyword-scorer leg
   too. Owned agents/pipelines are still ALSO listed individually at stage 1 — a
   subsystem candidate is additive, not a replacement, so the router can pick either
   the whole subsystem or one of its specific units.
2. Keyword scoring — counts word overlap between the task text and each candidate's
   `search` blob (an LLM router runs first in production; the keyword scorer is the
   deterministic fallback; `isCoherent` rejects an orchestrator/goal pick, but a
   seated `subsystem` pick is coherent)
3. Returns a `TaskRouting`:
   ```typescript
   {
     target: "agent" | "pipeline" | "subsystem" | "orchestrator"
     id?: string        // agent/pipeline/subsystem id (the orchestrator has none)
     confidence: number // 0–1
     reason: string     // why this target
   }
   ```
4. If the catalog is empty → `EmptyCatalogError` → HTTP 422

`POST /api/tasks/classify` returns this **raw stage-1 verdict** — a `subsystem`
target is NOT resolved further by this endpoint, so previewing a task shows the
switchboard's coarse pick as-is.

### Explicit-only agents (never in the catalog)

`EXPLICIT_ONLY_AGENT_IDS` (`libs/contracts/src/tasks/task.schema.ts`) lists agents the
classifier must **never** pick out of free text. They are real, stored, dispatchable
agents — the only sanctioned way in is a caller supplying an `explicitTarget`, i.e. the
house rule "an explicit target skips the classifier", read from the other side.

The filter lives in `TaskClassifierService.agentCandidates` — the single projection shared
by `buildCandidates` (stage 1) and `subsystemCandidates` (stage 2) — so neither the
top-level switchboard nor a scoped subsystem pass can reach one, even if such an agent is
later given an `ownerSubsystem`. Because the id is then absent from `candidates`,
`isCoherent` also rejects an LLM verdict that names it outright.

Current members:

| Agent id             | Explicit dispatcher                                 | Why                                                                      |
| -------------------- | --------------------------------------------------- | ------------------------------------------------------------------------ |
| `roadmap-decomposer` | `RoadmapDecompositionService.dispatch` (Phase 125g) | Answers only with a decomposition artifact — any other task yields `[]`. |

This is a **structural** guarantee on purpose. Before it existed, the promise lived only as
a sentence in the decomposer's own system prompt, and an ordinary roadmap task — whose text
the roadmap gate itself stamps with an epic/roadmap-heavy "ZIBBY ROADMAP CONTEXT" footer —
out-scored every real delivery target, ran the decomposer, got `[]` back, produced no
artifact, and died `failed`. See [roadmap.md](./roadmap.md#the-artifact).

### Stage 1 only — `classifySubsystem` (subsystem-first callers)

A caller that wants the switchboard to answer **only** "whose domain is this?" — and
to let the subsystem pick its own unit — calls `classifySubsystem(input, preferred?)`
instead of `classify`. `RoadmapGateService.release()` is the first such caller (see
[roadmap.md](./roadmap.md#subsystem-first-release)). It is the North-Star-2 Subsystem
Charter read literally: _"The global classifier only picks the subsystem; the subsystem
picks the unit."_

Three differences from `classify` that carry weight:

- **The catalog is subsystem-only** — concrete agents/pipelines are never offered, so
  the verdict cannot skip the subsystem layer. A router verdict naming a concrete unit
  fails `isCoherent` (it isn't in this catalog) and falls through.
- **Every candidate is SEATED by construction.** `stage1SubsystemCandidates` only emits
  subsystems owning ≥1 pipeline or active agent, so the returned target can never trip
  `SubsystemEmptyRosterError` downstream — the one real hazard of routing this way,
  since 7 of the 11 subsystems own nothing today.
- **No `enrich`** — no loop synthesis, no tool-grant proposal. Those belong to the
  interactive composer; a gate release wants the bare verdict.

`preferred` is the caller's domain default, used only when nothing matches confidently
and only if that subsystem is actually seated (otherwise the first seated candidate
wins). Returns `null` only when NO subsystem is seated at all — which a caller must
read as "don't direct this task", not as a failure.

⚠️ A stage-1 subsystem candidate's `search` blob is the subsystem's **mandate**, not its
owned units' descriptions. Keyword-leg overlap is therefore against mandate wording
(and the mandates are Czech).

### Stage 2 — inside a subsystem (`classifyWithinSubsystem`)

When an actual task dispatch (not the preview endpoint) lands on a `kind: "subsystem"`
target — either the switchboard's own stage-1 pick, or an operator's explicit
`@`-mention — `TaskSchedulerService` resolves it to a concrete unit before starting a
run, via `resolveSubsystemTargetOrNull` / `resolveSubsystemTarget`:

- **0 owned units** (no pipeline or active agent with that `ownerSubsystem`) — the
  undirected switchboard path falls back to the orchestrator (soft, like any other
  low-confidence verdict); the explicit `@mention` path instead throws
  `SubsystemEmptyRosterError` (a clear Czech message) → HTTP 422 — a mandate without
  capability shouldn't pretend to execute.
- **1 owned unit** → dispatches straight to it (pipeline before agent); the scoped
  classifier is never called.
- **2+ owned units** → `classifyWithinSubsystem(input, subsystemId)` — the same
  router/keyword-scorer machinery reused with the catalog restricted to that
  subsystem's own pipelines + active agents (never another subsystem), and the LLM
  router prompt gets an extra `preamble` (the subsystem's mandate + an "owned units"
  list + `EFFORT_RULE`) so it reasons about the mandate, not bare catalog rows. A
  low-confidence stage-2 verdict resolves per `SUBSYSTEM_FALLBACK[subsystemId]`:
  `"orchestrator"` (defer to the global orchestrator) or `"primary"` (stay inside the
  subsystem, dispatch its first owned unit) — a typed `Record` over the closed
  `SubsystemId` enum, so a new subsystem id fails `tsc` until it's given a policy.

**This is where "a small change shouldn't run the whole pipeline" is decided.** Forge
is the only subsystem that owns both a pipeline (`delivery`) and specialist agents
(`architect`, `fullstack-developer`, `code-reviewer`, `test-automator`,
`documentation-engineer`), so it is the only one where stage 2 is a real
pipeline-vs-agent call. Nothing else in the routing chain has any notion of how BIG a
change is, so `EFFORT_RULE` (`task-classifier.service.ts`) is appended to the
preamble: a narrow single-surface change goes to one owned agent; a pipeline is
reserved for multi-surface work or work that genuinely needs design + review + tests +
docs. It is prose in the preamble rather than a contract field on purpose — the
preamble is already the one place per-subsystem routing policy lives. Promote it to
data (a `routingHint` on the subsystem) only if the prompt proves too blunt.

**`SUBSYSTEM_FALLBACK.forge` is `"primary"`, not `"orchestrator"`.** It used to be
`"orchestrator"`, on the reasoning that forge's units are delivery _specialists_ so an
unsure pick was better self-delegated. That is wrong for the work forge actually
receives: escaping to the global orchestrator yields a session with no PR-shaped
output, and `RoadmapGateService.reconcileRunning` then kills the item as _"Run finished
without producing an artifact"_ — the very failure the fallback was meant to avoid.
`"primary"` makes "unsure" mean "run `delivery`" (pipelines are listed first in
`subsystemCandidates`, so `candidates[0]` **is** forge's pipeline) — the safe direction
for delivery, at the cost of being the expensive one.

The resolved target IS the run's "via `<subsystem>`" attribution — any consumer can
already read `Pipeline.ownerSubsystem` / `Agent.ownerSubsystem` off the dispatched id,
so no extra run-level field is needed for that. The stage-1 verdict itself (target,
confidence, reason, matchedTerms, and — when it named a subsystem — the subsystem id)
is separately persisted as the task's `ClassificationTrace` and enriched onto the run
(`TaskRun.classification`, read-only) so `RunDetail` can show "why this was routed
here."

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

Two ceilings apply. Every project has a `maxConcurrent` (how many of its runs may be
active at once), and the runtime system config has a system-wide `maxConcurrentRuns`
(Phase 125c; `null` = uncapped, the historical behaviour).

1. `capacityStatus(project)` resolves which ceiling is blocking, returning
   `"ok" | "project" | "global"`. The **global** cap is checked first — before the
   `project == null` short-circuit — so an unattributed task is gated exactly like an
   attributed one, even though it has no project budget to check. It reads the knob
   live via `systemConfig.current()`, so a `/settings` save applies to the very next
   dispatch attempt.
2. `countRunning(projectId)` / `countRunningGlobal()` — the two counters behind those
   ceilings (see [budget.md](./budget.md)).
3. At either limit → the task moves to the **queued** state (no approval needed). There
   is no separate status or queue for the global cap.
4. On every terminal run → `drainQueues()` — moves the oldest queued task of each
   project into dispatch. Queued tasks are grouped by `projectId`, with **`undefined`
   as its own bucket** so a task queued by the global cap without an attributed
   project is still drained. A `"project"` result skips to the next project's bucket;
   a `"global"` result stops the whole drain, since nothing can dispatch anywhere.

`withCapacityLock` serializes the read-then-dispatch window so two concurrent creates
can't both pass the gate. When a global cap is configured it wraps the per-project
lock — **always global-outer, project-inner**, so there is no lock-order inversion and
every dispatch contends on the global count exactly once. With `maxConcurrentRuns:
null` no global lock is taken at all and the behaviour is exactly as it was before
125c.

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

| Target         | Dispatcher                                                                                                                                    |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `agent`        | `AgentRunnerService.startRun(agentId, { prompt, project })`                                                                                   |
| `pipeline`     | `PipelineRunnerService.startRun(pipelineId, { prompt, project })`                                                                             |
| `subsystem`    | Resolved to a concrete `agent`/`pipeline` target first (stage 2, see above), then dispatched like any other — never reaches a runner directly |
| `orchestrator` | `AgentRunnerService.startRun(ORCHESTRATOR_ID, { prompt })`                                                                                    |

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
GET    /api/tasks/runs/archive                                the `/archiv` page's feed: cursor-paginated, search/subsystem-
                                                                filtered, archived-only (below)
GET    /api/tasks/runs/archive/counts                          per-subsystem archive counts (search-scoped) + the unsearched total
GET    /api/tasks/runs/:runId                                a single run's detail
GET    /api/tasks/runs/:runId/logs?offset=                   log chunk from a byte offset
GET    /api/tasks/runs/:runId/logs/stream                    SSE tail (falls back to the offset-poll above)
GET    /api/tasks/runs/:runId/stages/:phaseId/logs?offset=    one pipeline stage's log
GET    /api/tasks/runs/:runId/stages/:phaseId/logs/stream     SSE tail for a pipeline stage's log
GET    /api/tasks/runs/:runId/artifacts/:name                a whitelisted artifact (pr-draft.md, verdict.txt, …)
POST   /api/tasks/runs/:runId/stop                            stop a running run
POST   /api/tasks/runs/:runId/resume                          resume a parked pipeline/goal run (with a note), or re-run an
                                                                errored/interrupted agent run (with `--resume` if a session id
                                                                was captured, else a fresh run of the same task)
DELETE /api/tasks/runs/:runId                                  delete a run and its artifacts
PATCH  /api/tasks/runs/:runId/project                          assign a run into a project, or clear it back to "bez projektu"
                                                                with a null projectId
```

Both `/logs/stream` endpoints live outside the ts-rest contract as raw NestJS `@Sse`
routes (ts-rest doesn't model event streams) — the concrete implementation of the
"SSE for live streams, polling for state" DNA rule. The resolver looks up `runId` and
dispatches to the owning runner. The only per-kind run endpoints left are the catalog
liveness routes `GET /api/agents/running` and `GET /api/pipelines/runs` (badges/counts
in the catalog) — see [agents-runs.md](./agents-runs.md) and [pipelines.md](./pipelines.md).

### The archive feed (`/api/tasks/runs/archive`)

The `/archiv` page's flat, lazy-loaded list: every archived run (`done` / `error` /
`interrupted` / `parked` — NOT `paused-limit`, a mid-run pause), newest-first, with
search and subsystem filtering both running server-side so they reach every archived
run rather than only whatever page the frontend has already loaded. Built on the same
in-memory merge `GET /api/tasks/runs` uses (`TaskRunsService.collect()`) — there is no
separate archive store.

```
GET /api/tasks/runs/archive?search=&subsystems=&before=&limit=
  search       free text, matched against a run's display title and project
  subsystems   comma-separated subsystem ids, or "none" for runs with no subsystem
               attribution (an agent/goal run, or a pipeline whose owner isn't
               tagged) — omitted/empty means "all subsystems"
  before       opaque `<startedAt>|<runId>` cursor from the previous page's
               `nextCursor` — keyset pagination, not offset-based
  limit        clamped to [1, 100], default 40

  → { items: TaskRun[], nextCursor: string | null }   nextCursor is null once exhausted

GET /api/tasks/runs/archive/counts?search=
  → { counts: Record<string, number>, total: number }
    counts: per-subsystem-id (or "none") count among archived + search-matched runs,
            computed BEFORE any subsystem selection (picking one subsystem in the UI
            must not zero out every other option's count)
    total:  every archived run, ignoring search entirely — feeds the page's
            "archive is genuinely empty" vs. "this filter matched nothing" distinction
```

## Task output (`output`)

In the New Task dialog, the operator chooses **what happens to the finished work** —
the counterpart to a pipeline's `outputs:` block. It's deterministic and owned by the
system (no agent, no tokens). `TaskOutput` is a discriminated union:

| `type` | Fields       | What it does                                                                                                                                            |
| ------ | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pr`   | —            | Opens a PR from the finished run's branch. **Tier-2 (act-then-report): opened immediately, no approval gate** — the north-star's "open a PR for a fix". |
| `file` | `dest`, `to` | Writes the run's result (a summary) to a file — into the project's worktree (`dest: project`) or as a vault note (`dest: vault`). Tier-1, immediate.    |
| `void` | —            | Explicitly no output (also suppresses a pipeline-declared `pr`).                                                                                        |

**A missing field means inherit, not void.** For a pipeline target, its own
`outputs:` apply; for an agent/orchestrator target, nothing is delivered (today's
behavior). "Didn't choose" and "chose void" are two different states.

**pr.open is autonomous (Tier-2).** It is deliberately **not** on the policy floor
(`ASK_FLOOR_ACTIONS`): opening a PR runs without asking. The raw `git.push` /
`git.force_push` it rides still gate, and `pr.merge` is a locked deny — publishing a PR
is the one outbound git step ZIBBY takes autonomously.

**Two paths, one behaviour.**

- **Pipeline target** — `output` is passed to the runner as a per-run override of the
  declared `outputs:` (stored as `PipelineRun.outputsOverride`; `void` → `[]`). A `pr`
  sink opens the PR immediately in `runOutputs` and records `PipelineRun.prOutput`
  (`{ url, additions, deletions }`).
- **Agent / orchestrator target** — the sink lives at the task level
  (`TaskOutputService`). When the run ends `done`:
  - `file` is delivered immediately (Tier-1), the outcome is written normally.
  - `pr` **commits** the branch (`checkpoint` — `git add -A && commit`, owned by the
    system, independent of the agent; commit ≠ push), then **pushes from `repoPath` and
    runs `gh pr create` immediately** (the branch ref survives worktree cleanup). The
    outcome carries `pr: { url, additions, deletions }` (line totals from
    `git diff --numstat`); the run detail's "Výstup úkolu" surface shows just the PR
    link and the coloured `+/−` totals. A failed push is a soft no-op (the work stays
    committed on the branch); no commits or no worktree → a soft no-op too.

_(A `task-output`/`pipeline-output` approval resolver is retained only to drain any run
parked on disk from before this change; new PR outputs never park.)_

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

| Event             | When                                  |
| ----------------- | ------------------------------------- |
| `task-created`    | A task was created                    |
| `task-dispatched` | A task was handed to a runner         |
| `task-queued`     | A task was queued (maxConcurrent)     |
| `task-held`       | A task was parked for budget approval |
| `task-outcome`    | A run finished, outcome written back  |
