BATCH: api-tasks-scheduler

[SEVERITY: Critical] [FILE: apps/api/src/tasks/task-scheduler.service.ts:1124] [CATEGORY: race-condition]
`writeAgentOutcome` reads `existing.outcome` as an early-exit guard, then `await`s `taskOutput.handleTerminal` (which opens a PR — a real, non-idempotent side effect) before finally calling `storage.writeOutcome`; nothing serializes this read-modify-write, so two terminal handlers for the same run (the `onRunStatus` fast path plus `reconcileOutcome`/`sweepOutcomes`) can both pass the guard and both open a PR / write an outcome.
Doporučení: wrap the whole per-task outcome write (guard → handleTerminal → writeOutcome) in `withPathLock(\`task:${taskId}\`, …)` so the first terminal handler wins before any side effect runs.

[SEVERITY: High] [FILE: apps/api/src/tasks/scheduled-tasks.storage.service.ts:336] [CATEGORY: race-condition]
Every mutator (`writeOutcome`, `setTitle`, `setApproval`, `markDispatched`, `reassignRun`, `markHeld`, `markQueued`, `resolveOutput`, …) is an unserialized `get()` → mutate → `writeEntity()`; the atomic rename prevents a torn file but not lost updates — a background `setTitle` racing a terminal `writeOutcome` silently clobbers one side.
Doporučení: route all task read-modify-write mutations through a per-id `withPathLock` (primitive already used by `drainQueues`).

[SEVERITY: High] [FILE: apps/api/src/tasks/task-scheduler.service.ts:570] [CATEGORY: race-condition]
The immediate-create path checks `atCapacity(project)` then dispatches with no lock, while only `drainQueues` is serialized; two concurrent `createTask` calls for the same project both read `countRunning < max` and both dispatch, exceeding `maxConcurrent`.
Doporučení: serialize capacity-check-plus-dispatch per project, or make the concurrency reservation atomic.

[SEVERITY: High] [FILE: apps/api/src/tasks/task-runs.service.ts:272] [CATEGORY: performance]
`collect()` fans out ten whole-directory `listAll()`/`list()` reads of the entire run history + all definitions, and is invoked by `listTaskRuns`, by `getTaskRun` (scans the whole universe to return one run), and by `kindOf`'s disk fallback (reachable per SSE stage-log chunk for a historical run). No pagination or index; cost grows unbounded with history.
Doporučení: add a by-id lookup that doesn't rebuild the full feed, and paginate `listTaskRuns`.

[SEVERITY: Medium] [FILE: apps/api/src/tasks/task-scheduler.service.ts:844] [CATEGORY: error-handling]
Inside `drainQueues`, `attemptDispatch` is awaited with no try/catch and the whole drain is fire-and-forget; a thrown transient dispatch leaves the task `queued` with no retry/dead-letter — unlike the `tick` path. The task silently stalls until a later terminal event or restart.
Doporučení: mirror the tick's transient-failure handling (retry/backoff → dead-letter) in the drain loop.

[SEVERITY: Medium] [FILE: apps/api/src/tasks/task-scheduler.service.ts:683] [CATEGORY: duplication]
The post-dispatch bookkeeping block (`recordLedger` → `markDispatched` → `recordDispatchedActivity` → `reconcileOutcome` → `log.info`) is copy-pasted across `attemptDispatch`, `dispatchPending`, and `persistDispatched`; argument-threading into `dispatch(...)` repeats 10 positional args at three call sites.
Doporučení: extract one `finalizeDispatch(task, dispatched)` helper and pass the task object into `dispatch`.

[SEVERITY: Medium] [FILE: apps/api/src/tasks/task-scheduler.service.ts:1170] [CATEGORY: duplication]
`writePipelineOutcome`, `writeGoalOutcome`, and `writeChainOutcome` are near-identical: terminal-status guard, build outcome, `storage.writeOutcome` in try/catch, identical `activity.record` + `log.info`. Only summary string and cost line differ.
Doporučení: collapse into one `writeRunOutcome(taskId, {...})` with per-kind summary builders.

[SEVERITY: Medium] [FILE: apps/api/src/tasks/task-scheduler.service.ts:132] [CATEGORY: correctness]
`budgetApproved` is in-memory; a released (approved-past-cap) task that re-queues and survives an API restart loses its bypass — `drainQueues` re-runs the budget check and re-holds it behind a brand-new approval, re-prompting the operator for an already-approved overage.
Doporučení: persist the release decision on the task record.

[SEVERITY: Medium] [FILE: apps/api/src/tasks/task-scheduler.service.ts:120] [CATEGORY: file-size]
At 1341 lines the scheduler mixes create/guard flow, dispatch, budget/hold/queue, limit-defer, four outcome writers, attachment sweep, and title logic.
Doporučení: split out a `TaskOutcomeWriterService` and a `TaskDispatchService`/attachment-sweep helper.

[SEVERITY: Low] [FILE: apps/api/src/tasks/task-scheduler.service.ts:1298] [CATEGORY: sensitive-data]
`agentRunSummary` takes the raw last log line of the claude CLI process and writes it verbatim (length-truncated only) into the persisted task outcome summary and the `activity.record` feed; if the agent printed a secret/token it lands in the durable activity log.
Doporučení: consider redaction of the surfaced log tail.

[SEVERITY: Low] [FILE: apps/api/src/tasks/scheduled-tasks.storage.service.ts:60] [CATEGORY: duplication]
The same task object literal is rebuilt in `create`, `parkedTask`, `createPending`, `createDeferredLimit`, and `createDispatched`.
Doporučení: build all create* records from one base factory.

[SEVERITY: Low] [FILE: apps/api/src/tasks/task-scheduler.service.ts:426] [CATEGORY: duplication]
Title refinement (Haiku `namer.name` → `storage.setTitle`) is implemented twice — in `refineTitle` and inline inside `dispatchPending`.
Doporučení: have `dispatchPending` reuse `refineTitle`.

[SEVERITY: Low] [FILE: apps/api/src/tasks/task-runs.service.ts:441] [CATEGORY: maintainability]
The run-status mapping ladders in `pipelineRunToView`, `goalRunToView`, `chainRunToView`, and `scheduledTaskToView` are duplicated deeply-nested ternaries.
Doporučení: replace each with a small explicit status lookup map per kind.

[SEVERITY: Low] [FILE: apps/api/src/tasks/task-scheduler.service.ts:919] [CATEGORY: input-validation]
`dispatch` forwards `task.paths` straight into the agent/goal runners (`--add-dir` grant material) with no validation at this layer; absolute/existing-dir gating lives only in the runner (defense-in-depth gap).
Doporučení: re-assert path constraints before threading into the runner.

[SEVERITY: Low] [FILE: apps/api/src/tasks/task-scheduler.service.test.ts:666] [CATEGORY: missing-tests]
The `writeOutcome` idempotency test exercises sequential calls only; no test for two terminal handlers racing through `handleTerminal` (double-PR window), the create-path `atCapacity` TOCTOU, or a thrown dispatch inside `drainQueues`.
Doporučení: add concurrent-invocation tests around outcome write, capacity, and drain-failure paths.

STATS: 6 souborů (+2 supporting), 2675 řádků. Top 3: task-scheduler.service.ts (1341), task-runs.service.ts (635), scheduled-tasks.storage.service.ts (453).
