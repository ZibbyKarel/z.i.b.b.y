BATCH: api-goals

[SEVERITY: Critical] [FILE: apps/api/src/goals/goal-runner.service.ts:400] [CATEGORY: Loop correctness / race condition]
`stopRequested` is only consumed right after `waitForMaker` for the MAKER (line 400), before `runVerifier`. A `stop()` issued while the verifier phase executes sets the flag but nothing checks it until the next maker's `waitForMaker` returns — the loop dispatches and runs one entire extra maker iteration before honoring stop, and the in-flight verifier (a live claude-verifier agent run or shell process) is never killed. (Párový vzor k pipeline-runner stop nález.)
Doporučení: check `stopRequested` immediately after the verifier settles too, and track/kill the verifier's own run ref (agent or shell pgid) in `stop()`.

[SEVERITY: High] [FILE: apps/api/src/goals/goal-runner.service.ts:492-496] [CATEGORY: Budget enforcement]
`budgetOk()` catches any error from `budget.check(...)` and returns `{ ok: true }`, i.e. fails OPEN — but the doc comment above claims "fail-closed via BudgetService." Any transient BudgetService/IO exception silently lets the loop keep dispatching makers past the cap (proti zákonu "no auto-spend past budget").
Doporučení: default to `ok: false` on error (or a distinct "budget-check-failed" park reason).

[SEVERITY: High] [FILE: apps/api/src/goals/*.test.ts] [CATEGORY: Missing test coverage]
Existing tests cover only pure helpers. There is no test exercising `drive()`'s park transitions, `resumeParked`, `stop()`, or `reconstruct()`/`reconcileGoal` (boot re-dispatch gate + GOAL_AUTO_RESUME re-attach vs re-dispatch) — exactly the highest-risk areas.
Doporučení: add integration-style tests around drive()/reconstruct() covering park-budget, park-iterations, resume, and boot re-attach/re-dispatch.

[SEVERITY: Medium] [FILE: apps/api/src/goals/goal-runner.service.ts:1058-1063] [CATEGORY: Resume correctness / error handling]
`writeAggregate` swallows write failures with `.catch(() => {})`. If `run.json` write fails, in-memory and on-disk state silently diverge; a subsequent crash reconstructs from the stale file, corrupting resume (wrong currentIteration, missing makerRunRef).
Doporučení: log the write failure; consider retry or marking the run unhealthy.

[SEVERITY: Medium] [FILE: apps/api/src/goals/goal-runner.service.ts:440-445] [CATEGORY: Dead / misleading code]
`decideStop` is always called with `budgetOk: true`, so its `"park-budget"` branch is unreachable in production — real budget parks happen earlier via `parkGoal(..., "budget", ...)`. `goal-stop.test.ts` tests a path that never fires from `drive()`.
Doporučení: drop the unused `budgetOk` parameter, or wire the real budget check through it.

[SEVERITY: Medium] [FILE: apps/api/src/goals/goal-runner.service.ts:780-803,870-888,1002-1003] [CATEGORY: Duplicate cross-cutting logic]
The `kind === "agent" ? agentRunner… : pipelineRunner…` branch is repeated near-identically in `dispatchMaker`, `makerStatus`, `makerResumeAt`, and `stop()`.
Doporučení: extract a maker-runner adapter (`{ start, get, stop }` keyed by kind).

[SEVERITY: Medium] [FILE: apps/api/src/goals/goal-runner.service.ts:1079-1089] [CATEGORY: Performance / unbounded read]
`readAllAggregates()` scans and parses every `<id>/run.json` with no limit — used by `listAll()` (every call) and `reconstruct()` (boot). Finished run dirs are never pruned from disk except via explicit delete, so this scan only grows. (Systémový list()-then-find vzor.)
Doporučení: add a disk-level retention sweep or cap/paginate `readAllAggregates`.

[SEVERITY: Low] [FILE: apps/api/src/goals/goal-runner.service.ts:359,365] [CATEGORY: Observability]
Both the project-level budget cap and the goal's own windowed budget park with the identical reason `"budget"`, so the operator can't tell which cap tripped.
Doporučení: use distinct reasons (`"budget-project"` vs `"budget-goal"`).

[SEVERITY: Low] [FILE: apps/api/src/goals/goal-runner.service.ts:422-425,647-648,665-671] [CATEGORY: Sensitive data in logs]
Verifier output (up to 1MB shell output or agent log tail) is written verbatim to `iteration-N.verdict.txt`, the activity log, and back into the next maker's prompt via `composeResumeContext`, with no redaction. (Párový nález k pipeline-runner writeFailureContext.)
Doporučení: add a secret-scrubbing pass before persisting/forwarding verifier output.

[SEVERITY: Low] [FILE: apps/api/src/goals/goal-runner.service.ts (1202 lines)] [CATEGORY: File size / SRP]
1202-line service mixes outer-loop orchestration, verifier-shell process governance (spawn/kill/timeout), reconciliation, and persistence.
Doporučení: extract the `runShell`/`liveShells` process-governance block into a `VerifierShellRunner`.

[SEVERITY: Low] [FILE: apps/api/src/goals/goal-runner.service.ts:994-999] [CATEGORY: Edge case]
`stop()` throws `GoalRunNotStoppableError` in the narrow window after `currentIteration` is set but before `makerRunRef` is persisted, so an operator stop in that instant is rejected rather than queued.
Doporučení: honor `stopRequested` before the dispatch completes.

STATS: 12 souborů, 2014 řádků. Top 3: goal-runner.service.ts (1202), goals.storage.service.ts (129), goal-double-verify.test.ts (117).
