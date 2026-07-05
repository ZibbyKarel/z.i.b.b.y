# Run states

> Reference overview of the states that appear in the unified feed
> `GET /api/tasks/runs` (`TaskRunStatus`, `libs/contracts/src/tasks/task-run.schema.ts`).
> Complements [api/tasks.md](./api/tasks.md), [api/agents-runs.md](./api/agents-runs.md)
> and [api/pipelines.md](./api/pipelines.md) — this page gathers it all in one place.

## Why there are so many states: three layers of one lifecycle

`TaskRunStatus` is a flat enum with 11 values, but it is composed of **three
different internal models** projected onto it:

1. **`ScheduledTaskStatus`** (`ScheduledTask` — the task record, before any run
   exists) — `scheduled | queued | held | pending | dispatched | cancelled |
   failed | dead-letter | awaiting-output`. Answers the question "when, or even
   whether, should this start running".
2. **`RunStatus`** (the shared shape for an agent/skill/stage run) — `running |
   done | error | interrupted | awaiting-approval | paused-limit`. Answers
   "what is the live child doing".
3. **`PipelineState` / `GoalState`** — a layer on top of (2) for multi-level
   runs: `done | failed | running | paused-limit | parked` (a goal additionally
   keeps its own `failed` enum member, but semantically the same).

`scheduledTaskToView()` and the run mappers in `task-runs.service.ts` fold these
three layers into one flat state for the feed — and **some internal values are
deliberately remapped onto the same outward word** (see the Merging section
below). That is why the states you see in the feed don't map 1:1 onto any single
source enum.

## Table: all 11 feed states

| State                    | Phase           | Live child? | Survives an API restart?                              | What it means                                                                                                                                                                                                                                              | How it resolves                                                                                                                                            |
| ------------------------ | --------------- | ----------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`pending`**            | pre-dispatch    | no          | yes (`recoverPending()` re-dispatches on bootstrap)    | The task was accepted (interactive dialog), but the heavy dispatch — Haiku naming + classification + spawn — is running **in the background**. The task doesn't have a `runId` yet (the feed shows it under `taskId`).                                     | Transient, typically < 10s. Flips in place to `running` (spawn succeeded) or `error` (dispatch failed to find a routing target).                          |
| **`scheduled`**          | pre-dispatch    | no          | yes (persisted as a file)                              | The task has a `scheduledAt` in the future — it's waiting for its time.                                                                                                                                                                                     | The daemon tick (`taskTickMs`) picks it up once `scheduledAt <= now` and calls `attemptDispatch`.                                                          |
| **`queued`**             | pre-dispatch    | no          | yes                                                     | The project is at `maxConcurrent` (already running as many concurrent runs as it's allowed). Purely a capacity concern, **no approval involved** — FIFO.                                                                                                   | Whenever another run in the project finishes, `drain()` advances the first `queued` task to dispatch.                                                     |
| **`held`**               | pre-dispatch    | no          | yes                                                     | Dispatch would exceed the project's budget cap. An `Approval` (`spend-past-cap`) is created — unlike `queued`, this waits on an **operator decision**, not on freed-up capacity.                                                                            | `POST /api/tasks/:id/approve-override` → the task returns to the queue (the budget check is skipped once for this id).                                    |
| **`running`**            | live            | yes         | no (the child dies with the API → reconciliation, see below) | The agent/pipeline/goal/chain is actually running.                                                                                                                                                                                                          | Ends in `done`/`error`, or parks into one of the durable-pause states below.                                                                                |
| **`awaiting-approval`**  | pause (durable) | no          | **yes**                                                 | The runner created an `Approval` and is waiting for a Tier-3 decision (gate) before taking a sensitive action.                                                                                                                                              | Approve/reject via the approval endpoint → continues, or is cancelled → `interrupted`.                                                                     |
| **`paused-limit`**       | pause (durable) | no          | **yes**                                                 | The run's child died on an exhausted subscription usage limit. **A pause, not a failure** — it does not burn retry budget, and it carries a `resumeAt` (when the window resets).                                                                           | The `LimitResumeService` daemon automatically respawns after the window resets — **without an operator**. After `LIMIT_RESUME_MAX` attempts → `parked` (`parkedReason: "limit"`). |
| **`parked`**             | pause (durable) | no          | **yes**                                                 | A pipeline/goal exhausted its bounded effort and is waiting for an operator note. The reason (`parkedReason`/`goalParkedReason`) has its own sub-structure: `retries`/`output`/`approval` (pipeline), `iterations`/`budget`/`limit`/`verifier-scope`/`awaiting-resume` (goal). | `POST .../resume` with an operator note → continues from the parked phase/iteration.                                                                       |
| **`done`**               | terminal        | —           | —                                                       | Successful completion.                                                                                                                                                                                                                                       | End.                                                                                                                                                        |
| **`error`**              | terminal        | —           | —                                                       | Unsuccessful completion — crash, bad exit code, unmet verifier, or (at the pre-dispatch layer) a task that couldn't be routed/paid for.                                                                                                                     | End (can only be re-submitted as a new task).                                                                                                              |
| **`interrupted`**        | terminal        | —           | —                                                       | The run was **deliberately stopped** — by the operator (stop/reject), or by the system during reconciliation at API startup (a live child died with the process and has no durable state to resume from). Distinct from `error`, because it isn't a failure of the work. | End.                                                                                                                                                        |

## Answering "can any of this be merged?"

Short answer: **three of the eleven states are already deliberately merged**
today (see below), and the rest look mergeable at first glance, but on closer
look each pair answers a different question, and merging them would lose
information the UI needs somewhere else.

### What IS already merged (deliberately, in code)

- **`error` also covers the internal `failed`.** The pipeline (`PipelineState`)
  and goal (`GoalState`) models have an internal `failed` state, not `error` —
  the mapper in `task-runs.service.ts` remaps it to `error` at the boundary, so
  the feed has one word for "failure" across agent/pipeline/goal/chain. This is
  exactly the kind of merge you'd ask about — and it has already happened.
- **`error` also covers a dead task.** `ScheduledTaskStatus` additionally has
  `failed`, `dead-letter`, and `awaiting-output`, which the feed doesn't
  distinguish — all three (except `awaiting-output`, which has its own gate and
  lives as `dispatched` until it resolves) fall into `error`, unless it's
  `cancelled` (→ `interrupted`) or an active state. Detail: `dead-letter` is the
  terminal variant of "repeatedly failing dispatch," interesting for the
  briefing, but externally indistinguishable from `error` in the feed.

### What looks similar, but merging it doesn't pay off

- **`awaiting-approval` / `paused-limit` / `parked`** — this is one family
  ("durable pause, no live child, resumable"), and the code names it that way
  itself (`paused-limit` is documented in a comment as "modeled on
  `awaiting-approval`"). They differ in **who/what unlocks them**:
  - `awaiting-approval` → an operator's yes/no on a specific action,
  - `paused-limit` → automatically, over time, with no operator involvement,
  - `parked` → only an explicit note + resume, never automatic.
    Merging into one state + a `reason` field (similar to how `parked` already
    has `parkedReason`) would save an enum member, but the UI (badge, limit
    countdown, approval button, parked text field) would still have to derive
    "how does this get resolved" — which is exactly what the state's name
    carries today.
- **`queued` / `held`** — both are "the task is waiting to start," but `queued`
  is purely capacity-driven (nobody decides, it frees up on its own) and `held`
  is budget-driven and **requires Tier-3 approval** (shows up under `/gates`).
  Merging them into one "blocked" state + reason would lose the distinction
  between "do nothing, just wait" and "this needs your decision" — exactly the
  distinction the autonomy law (tier 1 vs. tier 3) requires keeping separate.
- **`scheduled` / `pending` / `queued`** — all three are "not running yet," but
  three independent mechanisms trigger them: a timer (`scheduledAt`), a
  background dispatch finishing, and capacity freeing up. They aren't the same
  queue or the same handler.
- **`interrupted` vs. `error`** — both look like "failure," but `interrupted`
  explicitly **does not burn** anything (it's not a failure of the work, it's an
  intervention), while `error` is an actual failure. The UI/briefing must react
  differently (interrupted isn't escalated as a bug, error is).

### Practical conclusion

If anything were worth proposing here, it would be a **cosmetic rename** rather
than a merge of states: `queued`/`held` could carry a unified `blocked` +
`reason: "capacity" | "budget"` field (mirroring the pattern `parked` already
uses) — but functionally nothing would change, the feed would just gain one
more layer of indirection. Since every state today maps 1:1 onto a distinct
decision mechanism (who/what unlocks it), the current flat enum is kept as is —
it is exactly as granular as the number of genuinely distinct mechanisms behind
it, no more.

## Source files

| Layer                       | File                                                                                                 |
| ---------------------------- | ----------------------------------------------------------------------------------------------------- |
| Unified feed state           | `libs/contracts/src/tasks/task-run.schema.ts` (`TaskRunStatusSchema`)                                |
| Task pre-dispatch state      | `libs/contracts/src/tasks/task.schema.ts` (`ScheduledTaskStatusSchema`)                              |
| Shared run state             | `libs/contracts/src/common.schema.ts` (`RunStatusSchema`)                                             |
| Pipeline state               | `libs/contracts/src/pipelines/pipeline-run.schema.ts` (`PipelineStateSchema`, `ParkedReasonSchema`)   |
| Goal state                   | `libs/contracts/src/goals/goal-run.schema.ts` (`GoalStateSchema`, `GoalParkedReasonSchema`)           |
| Mapping into the feed        | `apps/api/src/tasks/task-runs.service.ts` (`scheduledTaskToView`, run mappers)                       |
| Scheduler decisions          | `apps/api/src/tasks/task-scheduler.service.ts` (`attemptDispatch`, `createTask`)                     |
| Restart reconciliation       | `apps/api/src/runner/runner-core.ts` (comments around `interrupted`)                                 |
