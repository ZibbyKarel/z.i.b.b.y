# Goals (Phase 10)

> The delivery loop, generalized: "**Architekt → Kodér ⇄ Code-Review → Tester →
> Dokumentátor**" — a goal is the loop's outer shell, iterating a *maker* against a
> *verifier* until the verifier is satisfied or bounded effort runs out.

A **goal** is the 4th `TaskTarget` kind (alongside `agent`, `pipeline`, `orchestrator`):
a stored `.goal.md` recipe naming a maker (an existing agent or pipeline, dispatched
through its own runner **unchanged**) and a verifier (a deterministic `checks` shell or
a fresh `claude` judge run). `GoalRunnerService` is the outer loop that dispatches the
maker, runs the verifier, and either finishes, parks for the operator, or feeds the
verifier's output back into the next iteration as resume-context. This is deliberately
thin glue over delivered machinery — no new dispatch path, no new session model.

## Pieces

| Piece            | File                                              | Role                                                                                                  |
| ---------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Contract         | `libs/contracts/src/goals/goal.schema.ts`         | `Goal`, `MakerRef`, `VerifierSpec`, `CreateGoalInput`/`UpdateGoalInput` schemas                        |
| Contract (runs)  | `libs/contracts/src/goals/goal-run.schema.ts`     | `GoalRun`, `GoalIteration`, `GoalState`, `GoalParkedReason` — the run aggregate shape                  |
| Contract (HTTP)  | `libs/contracts/src/goals/goals.contract.ts`      | CRUD-only ts-rest router; run operations live on the unified `taskRuns` contract, not here             |
| Storage          | `apps/api/src/goals/goals.storage.service.ts`     | `GoalsStorageService` — file-backed CRUD over `<id>.goal.md` (frontmatter = config, body = instructions) |
| Errors           | `apps/api/src/goals/goals.errors.ts`              | `GoalNotFoundError`/`GoalConflictError`/`InvalidGoalError`/`CorruptGoalFileError` + run-side errors      |
| Runner           | `apps/api/src/goals/goal-runner.service.ts`       | `GoalRunnerService` — the outer maker/verifier loop, one worktree per run, park/resume/reconcile         |
| Stop logic       | `apps/api/src/goals/goal-stop.ts`                 | `decideStop` (pure stop-condition matrix) + `renderGoalProgress` (resume-context progress block)         |
| Controller       | `apps/api/src/goals/goals.controller.ts`          | Implements `goalsContract` against `GoalsStorageService`                                                |

## Endpoints (`/api/goals`)

`goalsContract` covers only the **goal definition** (the recipe), mirroring
`agentsContract`/`pipelinesContract`:

- `POST /goals` — create a goal (`409` on id conflict, `422` on a structurally invalid
  maker/verifier).
- `GET /goals` — list all goals.
- `GET /goals/:id` — get one goal (`404` if unknown).
- `PATCH /goals/:id` — partial update (`404`/`422`).
- `DELETE /goals/:id` — delete the definition.

**A goal *run* has no per-kind HTTP surface.** A run is started only by creating a
task with a `goal` target (`POST /api/tasks`); every run operation — detail, logs,
resume, delete, artifact fetch — lives on the unified `taskRuns` contract under
`/api/tasks/runs/*` (see `docs/api/tasks.md`). There is intentionally no
`goalRunsContract`. The one goal-specific detail on that unified surface is the
artifact allowlist: a goal run only ever exposes `objective.md`, `verdict.txt`, and
`resume-context.md` (`GOAL_RUN_ARTIFACTS`).

## Flow

### Starting a run

`GoalRunnerService.start(goalId, prompt, project, files, title, taskId, matchedTerms, attachments)`
reads the goal definition, resolves the target project, and creates a run root under
`GOAL_RUNS_DIR/<goalId>_<startedAtMs>` holding a forensic `objective.md`. If the
project is a git repo, the run gets **one worktree for its whole lifetime** (Phase
3.1) — every iteration's maker spawns there so its commits land on the same branch;
the worktree itself lives *outside* the repo/data tree (`prepareWorktreeDir`, Phase
12.7), only the forensic artifacts (`objective.md`, `run.json`, per-iteration verdict
files) stay under the run root. A worktree-setup failure on a git project fails the
run outright — there is no silent fallback to the main checkout. `start()` returns
immediately; `drive()` runs the loop in the background.

### The iteration loop

`drive()` is the outer loop, keyed by iteration index (not a phase id):

1. **Pre-flight scope guard** (Phase 12.1/12.2, `checks` verifier only): before
   spending a single maker iteration, refuse to run if the verifier has no resolvable
   scope (no explicit `commands` and no project `checks` — this would otherwise fall
   through to the full-monorepo `DEFAULT_VERIFY_CHECKS`) or no safe cwd (no worktree
   and no project path — the only fallback would be `run.cwd`, which climbs to the
   monorepo root). Either failure parks the goal immediately with reason
   `verifier-scope`.
2. **Budget check** — both the project's own daily/weekly/monthly run cap
   (`BudgetService.check`, see `docs/api/budget.md`) and the goal's *own* windowed
   budget (`goalBudgetExceeded`, Phase 13.1: a rolling count of the goal's own
   iteration `startedAt` timestamps against `goal.budget.dailyRuns`/`weeklyRuns`).
   Either over-cap parks with reason `budget`, before the maker ever dispatches.
3. **Dispatch the maker** — `dispatchMaker` calls `AgentRunnerService.start` or
   `PipelineRunnerService.start` verbatim (with the run's worktree as cwd), so the
   inner runner's own mid-run approval gate and usage-limit handling apply unchanged.
4. **Wait for the maker** (`waitForMaker`) — polls the maker run to a terminal state.
   A maker that pauses on the usage limit does **not** burn the iteration: the goal
   reflects `paused-limit` (with the maker's `resumeAt`) and keeps polling; the
   maker's own auto-resume (Phase 9.2) respawns it, and the same iteration completes
   when it does — no re-dispatch.
5. **Run the verifier** — a `checks` verifier runs the resolved shell command
   (`buildVerifyCommand`) under Phase 12.3 resource governance (detached process
   group so a kill reaps the whole tree, a wall-clock deadline that SIGTERMs then
   escalates to SIGKILL after a grace period, a capped rolling output tail); satisfied
   on exit 0. A `claude` verifier is a **fresh** agent run on its own model with no
   shared session, satisfied when it completes. **Phase 12.6 shortcut:** if the maker
   was a pipeline that already ran its own deterministic verify phase with the exact
   same commands the goal's `checks` verifier would run, the runner synthesizes a
   satisfied verdict instead of re-running the suite.
6. **Decide** (`decideStop`, pure): satisfied → checkpoint the worktree (a local,
   ungated, never-pushed commit) and finish `done`. Not satisfied and this was the
   last allowed attempt (`maxIterations`) → park with reason `iterations`. Otherwise
   → compose the next iteration's resume-context from the verdict output
   (`buildResumeContext`, shared with the pipeline resume path) and continue.

Every transition is persisted to `<runRoot>/run.json` (the aggregate) so the loop
survives an API restart.

### Storage format

A goal definition is one `<id>.goal.md` file (`GoalsStorageService`, extending the
same `MarkdownEntityStore` agents/pipelines use): YAML frontmatter carries `name`,
`desc`, `objective`, `maker` (`{kind: "agent"|"pipeline", id}`), `verifier`
(`{kind: "checks", commands?}` or `{kind: "claude", agent, model?, thinking?}`),
`maxIterations`, and an optional `budget`; the Markdown body is `instructions` —
standing guidance handed to every maker iteration. A goal missing a valid
maker/verifier is treated as corrupt (`CorruptGoalFileError`) rather than silently
dropped, since it cannot loop without them.

A goal *run* is the JSON aggregate at `<GOAL_RUNS_DIR>/<goalRunId>/run.json`
(`GoalRunSchema`) — a clone of the pipeline run's shape with `iterations[]` in place
of `stageRuns[]`. Each `GoalIteration` records its maker's run ref, the verifier
verdict (`kind`, `satisfied`, `output`), and status. Restart rebuilds the whole
registry from these files (`reconstruct()`); a `running`/`paused-limit` goal is
**not** auto-re-dispatched on boot by default (Law 3 / Tier 3 — a bare respawn must
not spawn a maker without approval) but parked `awaiting-resume` for an explicit
operator resume, unless the `GOAL_AUTO_RESUME=1` daemon flag is set (see
`docs/ops/environment.md`).

### Park reasons and resume

A parked run (`GoalParkedReason`) is always durable and resumable with an operator
note: `iterations` (the `maxIterations` fuse blew), `budget` (a project or per-goal
cap went over), `limit` (the usage-limit auto-resume flapped past its cap),
`verifier-scope` (a `checks` verifier had no resolvable scope or safe cwd —
a misconfiguration to fix, not a retryable failure), or `awaiting-resume` (rehydrated
on boot, pending an explicit operator decision). `resumeParked(goalRunId, note)`
re-enters `drive()` at the parked iteration index with a resume-context built from the
parked verdict plus the operator's note.
