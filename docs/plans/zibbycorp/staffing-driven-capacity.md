# Staffing-driven capacity — replace the concurrency caps with headcount

Status: implemented 2026-10-07 (agreed in a grilling session 2026-09-30). See
"Implementation notes" for where the shipped version differs from the design below.

## Principle

Whether and when a task advances through its lifecycle is decided **only** by
whether a free employee exists for its next stage. The company's capacity is
steered by headcount per department ("a living company"), not by a global
"parallel runs" number.

Most of the mechanism already exists (D-015): every pipeline `agent` phase leases
an employee via `EmployeeAllocator` (`apps/api/src/employees/employee-allocator.ts`)
and waits FIFO per `(department, agentId)`. This change removes the second,
coarser brake on top of it and refines how leases are granted.

## Decisions

1. **Remove** the system-wide `maxConcurrentRuns` and the project / company
   `budget.maxConcurrent`.
2. **Add a machine fuse** — "max concurrently working agents" in the System
   settings section. It counts every running agent process, leased or not
   (a D-017 unleashed single-agent run counts too). Waiting runs do NOT hold a
   fuse slot. Its default is migrated from the current `maxConcurrentRuns` value
   (3). Subscription-limit parking (`LimitsService`) is unchanged.
3. **Task release is unchanged** — project auto-sync, manual start of
   implementation, and the queue for tasks created via chat / the "New task"
   button all stay. A queued task leaves the queue only when the fuse has room
   **and** an employee for its first stage is free. Only then are the run and its
   worktree created.
4. **A lease is held only while the agent is working.** Waiting for an approval,
   a subscription limit, or a park releases the lease; on resume the run
   re-acquires an employee through the normal ordering (memory and prompt belong
   to the position, so a different employee picking it up is fine).
5. **Grant ordering** (applies to both employee leases and fuse slots):
   1. progress — furthest stage ever reached / number of phases (a loop-back,
      e.g. review → koder, keeps its reached progress);
   2. task priority;
   3. round-robin across projects (replaces per-project `maxConcurrent` as the
      fairness mechanism between engagements);
   4. FIFO.
6. **Missing position** — a pipeline parks (`no-employee`) and the briefing
   proposes a hire; no auto-hiring (headcount is the operator's decision). A
   single-agent task with no employee anywhere still runs unleashed (D-017).
7. **Visibility (files are the source of truth)** — a waiting run writes the
   status `waiting-for-staff` (+ department / position) to its run file on disk.
   The UI shows queues per department ("QA: 5 waiting"); the briefing flags
   persistently long queues (the hiring nudge from point 6). Ordering is computed
   from disk on every release, so the in-memory FIFO promise chain in
   `EmployeeAllocator` goes away.

## Migration

- `maxConcurrentRuns` value → the new fuse (same number, new meaning: working
  agents, not whole runs).
- `budget.maxConcurrent` on projects / companies: the schema silently drops it on
  read and it disappears on the next write. No hard migration.

## Out of scope

Parallel stages inside one run (e.g. frontend + backend coding at once —
fan-out / join in the pipeline DSL). Separate decision — deliberately not planned; headcount-driven parallelism across tasks covers it.

## Known touch points

- `apps/api/src/tasks/task-scheduler.service.ts` — capacity guard, queue drain,
  `acquireEmployeeForDispatch`
- `apps/api/src/pipelines/pipeline-runner.service.ts` — per-phase `acquire`,
  lease release on approval / park
- `apps/api/src/employees/employee-allocator.ts` — replace FIFO chain with
  disk-derived ordering
- `apps/api/src/budget/budget.service.ts` — `countRunning` / `maxConcurrent`
- `apps/api/src/roadmap/roadmap-gate.service.ts` — references `maxConcurrentRuns`
  as the single ceiling
- `apps/api/src/handoff/handoff.service.ts` — the `"scheduled"` outcome
- `libs/contracts` — system config, project / company budget schemas, run status
- `apps/web`: `SystemSection`, `ProjectBasicsPanel`, `ProjectCompanyPanel`,
  `CompanyBasicsPanel`, department queue display

## Implementation notes (what shipped vs the design)

- Waiting is recorded as a `waitingForStaff` field (the workflow run stays
  `running`; the task stays `queued`), not a new `waiting-for-staff` lifecycle status.
- Grant ordering is in-memory ranked waiters (`GrantQueue`: progress -> project
  round-robin -> FIFO); the priority tier is a no-op until tasks carry a priority.
  Ordering is re-established by re-drive after a restart rather than recomputed from
  disk.
- The fuse counts task-system agents: single-agent / orchestrator task runs for their
  whole lifetime (including `awaiting-approval` / `paused-limit` — they keep their lease
  too), workflow agent stages per stage. Goal-loop iterations, chat and channel-triage
  agents are not counted. The fuse is in-memory: runs surviving an API restart are not
  counted.
- Workflow dispatch checks (does not reserve) the first-stage employee + fuse room; a
  drain hands out at most one workflow per first-stage position per pass.
- Legacy `maxConcurrentRuns: null` migrates to the default 3 (the fuse always exists).
- Deferred follow-ups: per-department queue UI ("QA: 5 waiting") and the briefing flag
  for persistently long queues (the data is on disk via `waitingForStaff`); stopping a
  run that waits for staff / fuse; a cross-department probe for a staff-waiting task
  with no known department. The briefing already proposes a hire for a `no-employee`
  park.
