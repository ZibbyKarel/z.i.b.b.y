# Budget (Phase 8.1, dollar caps Phase 12)

The budget guard decides whether a dispatch (an agent run, a pipeline run, or one
goal iteration) is allowed to start. It is **fail-closed**: an unreadable ledger or
usage snapshot reads as "spend position unknown" and is treated as over-cap (hold +
approval), never as "assume fine." This is the one place in ZIBBY where fail-open
would be wrong.

## Pieces

| Piece         | File                                        | Role                                                                                              |
| ------------- | -------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Contract      | `libs/contracts/src/budget/budget.schema.ts` | `GlobalBudget`, `BudgetStatus`, `ProjectBudgetStatus`, `CostWindowUsage` schemas                    |
| Contract (HTTP) | `libs/contracts/src/budget/budget.contract.ts` | ts-rest router — read-only status + the global config read/write                                  |
| Config store  | `apps/api/src/budget/budget-config.store.ts` | `BudgetConfigStore` — reads/writes `data/budget.json` (operator-owned, committed, atomic writes)     |
| Ledger        | `apps/api/src/budget/ledger.store.ts`        | `BudgetLedgerStore` — append-only `<YYYY-MM-DD>.jsonl` ledger; dispatch lines (run counts) + cost lines (Phase 12, dollar sums) |
| Service       | `apps/api/src/budget/budget.service.ts`      | `BudgetService` — the guard: `check`, `recordDispatch`, `recordCost`, `countRunning`, `status`      |
| Controller    | `apps/api/src/budget/budget.controller.ts`   | Implements `budgetContract` against `BudgetService` + `BudgetConfigStore`                            |

## Endpoints (`/api/budget`)

- `GET /budget` — the full readout: the global account ceiling (5h rolling + weekly
  usage, whether it's currently paused) plus one row per project that has a `budget`
  set (daily/weekly/monthly used vs. cap, the Phase-12 dollar-window counterparts,
  live concurrency, queued/held task counts).
- `GET /budget/config` — read the operator-owned global pause thresholds
  (`data/budget.json`).
- `PUT /budget/config` — replace them.

There is deliberately **no write path for per-project caps** here — those live on the
project record itself (`PATCH /projects/:id`), the single source of truth for an
engagement's `dailyRuns`/`weeklyRuns`/`monthlyRuns`/`maxConcurrent`/
`dailyCostCapUsd`/`weeklyCostCapUsd`/`monthlyCostCapUsd`. See
`docs/ops/environment.md`'s budgets & caps section for the full field reference and
`pauseAtRollingPct`/`pauseAtWeeklyPct` semantics.

## Flow

### The dispatch-time check

Every dispatch path (agent run, pipeline run, one goal iteration) calls
`BudgetService.check(projectId, now)` before starting:

1. **Global account ceiling first**, regardless of project — read `budget.json`
   (`pauseAtRollingPct`/`pauseAtWeeklyPct`) and the current usage snapshot from
   `LimitsService` (see `docs/api/limits.md`). If the account's 5h rolling or weekly
   usage is at or above the configured pause percentage, the dispatch is refused
   (`over: "global"`). Any read error here is also refused — fail-closed.
2. **Per-project run-count caps** — if the resolved project has a `budget` with
   `dailyRuns`/`weeklyRuns`/`monthlyRuns` set, count how many runs have already been
   recorded for that project in the matching window (`BudgetLedgerStore.countDaily`/
   `countWeekly`/`countMonthly`) and refuse if the cap is reached
   (`over: "project-daily"|"project-weekly"|"project-monthly"`). A ledger read error
   also refuses.
3. **Per-project dollar caps** (Phase 12) — if the project's `budget` has
   `dailyCostCapUsd`/`weeklyCostCapUsd`/`monthlyCostCapUsd` set, read that window's
   cost-line sum + count (`BudgetLedgerStore.sumCostDaily`/`sumCostWeekly`/
   `sumCostMonthly`) and estimate `spentUsd + averageCostPerRun` (average cost per
   *finished* run in the window; no cost line yet → average is 0, estimate =
   spentUsd). Refuse when the estimate exceeds the cap
   (`over: "project-daily-cost"|"project-weekly-cost"|"project-monthly-cost"`,
   carrying `metrics: { costUsd, capUsd }` on the `BudgetCheck`). A ledger read error
   also refuses. Skipped entirely for a project with no dollar cap set.
4. Otherwise `{ ok: true }`.

A refused check surfaces to the operator as a held task or a parked run, depending on
which layer called it (a goal iteration parks with reason `budget` — see
`docs/api/goals.md`). A dollar-cap hold's `metrics` ride into
`GateEvaluatorService.evaluate({ action: "spend-past-cap", metrics })` so a
`threshold` floor rule can read `costUsd`/`capUsd`.

### Recording a dispatch

Once a dispatch actually starts, the caller awaits
`BudgetService.recordDispatch(entry, now)`, which appends one line
(`{ at, projectId?, taskId?, runRef, kind }`) to the **enforcement ledger** — a
`<YYYY-MM-DD>.jsonl` file per day under `BUDGET_LEDGER_DIR`, cut on the
**Europe/Prague** calendar day. This is deliberately separate from the best-effort,
never-throws accountability activity log (`docs/api/activity.md`): the ledger is the
data the next `check()` counts against, so its writes are awaited, not fire-and-forget.
Reads are tolerant per line and per day (a missing day file counts as zero); a
genuinely unreadable ledger directory throws `LedgerUnreadableError` so `check()` can
fail-closed rather than silently under-count.

### Recording a cost line (Phase 12)

Once a dispatched run reaches a terminal state with a known price, `task-scheduler.
service.ts`'s `reconcileOutcome` (via `writeAgentOutcome`/`writePipelineOutcome`) awaits
`BudgetService.recordCost(entry, now)` best-effort — a write failure is logged, never
thrown, so it can't crash the outcome write-back. This appends a `type: "cost"` line
(`{ at, projectId, taskId?, runRef, kind, costUsd }`) to the SAME ledger file the
dispatch lines live in; `BudgetLedgerStore.countDaily`/`countWeekly`/`countMonthly`
skip `type: "cost"` lines so the run-count caps are unaffected, while the new
`sumCostDaily`/`sumCostWeekly`/`sumCostMonthly` read only them. A pipeline run's cost
is the sum of its stage costs (`sumStageCosts`, shared with `task-runs.service.ts`'s
`TaskRun.costUsd` projection); a goal or chain run carries no aggregate `costUsd` today,
so no cost line is written directly on their outcomes — a goal's own maker runs are
themselves agent/pipeline runs whose outcomes record cost individually.

### Live concurrency

`countRunning(projectId)` counts top-level runs currently holding a concurrency slot
for a project — agent runs in `running`/`awaiting-approval`/`paused-limit` labelled
with the project, and pipeline runs in `running`/`paused-limit` whose `projectPath`
matches. Pipeline **stage** runs live inside the pipeline runner's own core and are
never counted separately (no double-counting). A run `paused-limit` on the usage
window still holds its slot — releasing it early would let a queued task and the
auto-resumed run both start at once when the window resets.

### The status readout

`status(now)` is a pure read assembling `GET /budget`'s payload: the global ceiling
plus `paused` flag, and one row per project with a `budget` set — `daily`/`weekly`/
`monthly` (`{ used, cap? }`), the Phase-12 `dailyCost`/`weeklyCost`/`monthlyCost`
(`{ spentUsd, capUsd? }` — `spentUsd` always reported, `capUsd` only when the project
set a dollar cap on that window), `running` (from `countRunning`), `maxConcurrent` (if
set), and `queued`/`held` task counts. Projects with no `budget` configured don't
appear in the readout at all.
