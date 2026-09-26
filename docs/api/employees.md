# Employees API

Phase ZE-01 (ZibbyCorp Part E). Model: D-015 in `docs/plans/zibbycorp/DECISIONS.md`
(agents are positions, employees are instances). Dispatch ladder: D-017 in the
same file. Migration: `docs/plans/zibbycorp/employees-migration-dry-run.md`.

## The model (D-015)

An **agent** is a _position_ — a prompt, a set of tools, a job description. An
**employee** is a _hired instance_ of a position: a process to the agent's
program. An employee has:

- `id` — `employee_<random>`, filename-safe.
- `name` — a unique, human name drawn from the employee-name pool (Kevin,
  Stuart, Bob, … — see "The name pool" below). Display identity; never reused
  by two active employees at once.
- `agentId` — the position this employee holds (a stored `Agent.id`).
- `department` — exactly one department. This is the only place department
  ownership of a position now lives (see "Department ownership" below).
- `status` — `active` (lease-eligible) or `fired` (soft-deleted, kept as a
  read-only archive — no delete path exists).
- `hiredAt` / `firedAt` — ISO timestamps.

An employee carries no memory or prompt of its own — those are inherited from
its position (`agentId`). Its identity is its name, its live state, and its
run history.

`EmployeeWithState` (what `list`/`get` actually return) adds a **derived**
projection on top of the stored record, computed server-side from the
in-memory `EmployeeAllocator` lease table (the client never sees that table
directly):

- `state` — the O-04 vocabulary (`working | thinking | blocked | error | done
| idle`), reusing the same enum `deriveAgentState` used client-side before
  positions were staffed by instances.
- `currentRunId` — the run it's leased to, while `working`/`blocked`.
- `currentTaskTitle` — best-effort title of that run's task, when known.
- `position` — `{ id, name, title? }`, the position's display shape
  (`title` falls back to the agent's `category` — `Agent` has no dedicated
  title field yet).

## Department ownership is an employee fact

Before ZE-01, `Agent.department` was the single source of truth for "which
department owns this position." That field still exists on `Agent` (schema
back-compat / pre-migration fixtures), but as of this phase **it is no longer
read for ownership anywhere new employee-aware code touches**:

- `DepartmentsService.roster()` — an agent belongs to a department's roster
  IFF it currently has at least one `active` employee there.
- `TaskClassifierService` (`stage1DepartmentCandidates`, used by both the full
  classifier's `buildCandidates()` and `classifyDepartment()` for the roadmap
  gate) — a department is a routable stage-1 candidate when it owns a
  pipeline (`Pipeline.department`) OR has at least one active employee.
- `TaskSchedulerService` (single-agent dispatch department resolution) —
  same employee-based rule.
- `EmployeeAllocator` / `EmployeesStorageService.listActiveByPosition(...)` —
  the allocator's roster read is always `(department, agentId)` against
  active employees, never `Agent.department`.

**One deliberate, documented gap:** `DepartmentsService.aggregateAll()` (the
`running`/`report`/`error` aggregation behind `list()`/`get()`'s headline
`state`) still attributes an _agent-kind run_ to a department via
`Agent.department` — it was left alone as an out-of-scope corner of this
phase, not an oversight. Pipeline-kind runs already attribute via
`Pipeline.department`, unaffected.

Practical effect: an agent record with a stale/absent `department` field is
now harmless — hiring an employee for it into a department is what actually
seats it there. An agent can be unowned, owned by one department, or (through
its employees) even multi-department, purely through who's hired.

## The name pool

`EMPLOYEE_NAME_SEED` is a fixed 30-name Minion-style list (Kevin, Stuart, Bob,
Dave, Jerry, Carl, Phil, Tim, Mark, Tom, Jorge, Norbert, Otto, Mel, Lance,
Steve, Donnie, Mike, Ken, Chris, John, Paul, Larry, Herb, Walter, Gus, Barry,
Frank, Lenny, Ziggy), duplicated **byte-for-byte** in two places on purpose (no
shared import between the NestJS store and the standalone migration script):
`apps/api/src/employees/employee-names.store.ts` and
`tools/migrate/zibbycorp-employees.mjs`.

`EmployeeNamesStore` persists the pool as a single `employee-names.json`
manifest, seeded from `EMPLOYEE_NAME_SEED` the first time it's read if the
manifest doesn't exist yet. Beyond the seed, names are an operator-editable
"table" (`employeeNamesContract` below) — `create`/`rename`/`delete` grow or
edit the pool past the 30 seeds.

- **"Pool order"** — the order `claimAndAssign()` walks when no preferred name
  is given — is the seed's own order (Kevin first), read from the raw
  manifest. This is _not_ the same as `list()`'s output, which alphabetizes
  entries for display.
- `claimAndAssign(preferredName, employeeId)` — claims a specific free name
  (409 `EmployeeNameUnavailableError` if taken or unknown) or, when
  `preferredName` is omitted, the first free pool-order entry (409
  `EmployeeNamePoolEmptyError` if every entry is claimed).
- `releaseByEmployeeId(employeeId)` — returns a held name to the free pool;
  a harmless no-op if the employee holds none.
- A name currently held by an active employee cannot be deleted (409
  `EmployeeNameInUseError`) or claimed by another hire/rename (409
  `EmployeeNameUnavailableError`).

The pool is sized against ZIBBY's own delivery crew (`apps/api/data-test` has
5 agents), not against an arbitrary external catalog — see
`docs/plans/zibbycorp/employees-migration-dry-run.md` for what happens (a
clean, all-or-nothing refusal) when a target roster needs more distinct
positions than the pool has names.

## Hire / fire lifecycle

`EmployeesService` is the two-store transaction every write keeps in sync — a
name is claimed exactly when an employee holds it, released exactly when it
doesn't:

- **Hire** (`hire(departmentId, { agentId, name? })`) — validates the
  department and the position (`agentId` must be a real, registered agent;
  unknown position throws, mapped to 404, and leaves no orphaned employee or
  name claim behind), claims a name (specific or pool-order), then writes the
  employee record. If the record write fails after the name was claimed, the
  claim is rolled back (`releaseByEmployeeId`) rather than leaked.
- **Fire** (`fire(id)`) — **soft**: `status` flips to `fired`, `firedAt` is
  set, and the held name returns to the pool immediately (free for the next
  hire). The record itself is never deleted — it stays a readable archive of
  who held the position and when. Idempotent: firing an already-fired
  employee is a no-op that returns it unchanged. Refuses (409
  `EmployeeLeasedError`) while the employee currently holds a run lease
  (`EmployeeAllocator.isBusy(id)`) — you cannot fire someone mid-stage.
- **Update** (`update(id, { name?, department? })`) — rename (releases the
  old name, claims the new one; a failed claim rolls back to the _old_ name,
  never leaves the employee unheld) and/or move department. `agentId`/`status`
  are not editable here — status only changes through hire/fire.

## `EmployeeAllocator` — the lease broker

`EmployeeAllocator` (`apps/api/src/employees/employee-allocator.ts`) is the
in-memory broker between a pipeline stage / single-agent dispatch and the
department's hired employees. Entirely in-memory — a lease does not survive
an API restart; boot re-dispatch re-acquires it, mirroring the
retries/limit-park machinery's own restart posture.

- `acquire(department, agentId, { runId? })` — leases a **free** active
  employee holding `agentId` inside `department`. When every matching
  employee is busy, the call queues **FIFO** behind earlier callers for the
  _same_ `(department, agentId)` key (a promise chain, the same idiom
  `withPathLock` uses for a path lock) — a caller that arrives while a slot is
  free still waits its turn behind an earlier waiter; it never cuts the line.
  Two different `(department, agentId)` keys are fully independent and never
  block each other. Rejects immediately with `NoEmployeeError` when the
  department owns **no** active employee of that position at all — this is a
  park condition, never a queue.
- `release(lease)` — frees the employee and wakes the longest-waiting queued
  caller for its key, if any.
- `isBusy(employeeId)` / `busy()` — the fire-while-leased 409 guard, and a
  snapshot of every held lease (`employeeId -> runId | undefined`) used by
  D-017's any-department fallback to prefer a currently-free candidate.

## Wiring: pipeline stage dispatch

An `agent`-type pipeline phase's dispatch **is** leasing an employee — a
hired instance of `phase.agent` (the position), leased from the **pipeline's
own** department (`PipelineRunnerService`, around the stage-dispatch loop):

- The lease is acquired **before** the stage's sandbox directory is created,
  so a park never leaves a half-built stage folder behind.
- On `NoEmployeeError` (the department owns no employee of that position at
  all), the run **parks**: `status: "parked"`, `parkedReason: "no-employee"`
  (a new member of `ParkedReasonSchema`, alongside `approval` / `retries` /
  `limit` / `output`), `currentStage` set to the phase that couldn't
  dispatch.
- When every matching employee is busy (but at least one exists), `acquire`
  itself blocks FIFO — this is the "queued" wait the design calls for, **not**
  a park: `run.status` stays `running` (or whatever it already was) while
  `currentStage` reflects the phase waiting to dispatch, and no `stageRuns`
  entry is appended until the lease lands.
- The lease is released on **every** terminal path out of `runStage` (`done`,
  `error`, `interrupted`, `paused-limit`) via a `finally` block — it never
  outlives the dispatch it was acquired for.
- A `verify`-type phase spawns no agent and never acquires (`phase.agent` is
  absent for it).
- The leased employee's `employeeId`/`employeeName` are recorded onto the
  stage's `AgentRun.extra` when present (see "Run attribution" below).

## Wiring: single-agent task dispatch (D-017)

`TaskSchedulerService.acquireEmployeeForDispatch(agentId, department)` is the
D-017 lease **ladder**, run once per dispatched single-agent task run:

1. **Department-known.** If the task's own classification already traced a
   department verdict, try to lease from _that_ department first.
2. **Any-department fallback.** If step 1 wasn't tried (no department known)
   or came back `NoEmployeeError` (that department has no one in the
   position), fall back to `EmployeesStorageService.listActiveByPositionAnyDepartment(agentId)`
   — every active employee holding the position, across **all** departments,
   sorted by department id for determinism. Prefers a currently-**free**
   candidate (checked against `EmployeeAllocator.busy()`); falls back to the
   first candidate (which then queues FIFO behind whoever holds it) when none
   are free.
3. **Unleased fallback.** Returns `undefined` only when the position has **no**
   employee **anywhere** — this is never a park (parking is a pipelines-only
   concept); the task still dispatches directly, unleased. This is the
   concrete mechanism behind the DNA law "a described task is always
   executed" — a described task never silently no-ops just because nobody
   happens to be hired into that role yet.

The acquired lease (if any) is tracked per in-flight run
(`employeeLeases: Map<runId, EmployeeLease>`) and released on that run's
terminal transition, same release discipline as the pipeline path.

## Run attribution

`AgentRun.extra` carries `employeeId`/`employeeName` when the run was
dispatched via a lease (either wiring above) — absent for runs that used
D-017's unleased fallback, or for non-task starts that predate any lease
concept. See `docs/api/agents-runs.md`.

## Endpoints

### `employeesContract` (`libs/contracts/src/employees/employees.contract.ts`)

| Method | Path                             | Notes                                                                                                                            |
| ------ | -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/api/employees`                 | List, filterable by `department` / `agentId` / `status` (all optional, combined with AND).                                       |
| GET    | `/api/employees/:id`             | 404 for an unknown id.                                                                                                           |
| POST   | `/api/departments/:id/employees` | Hire (see "Hire / fire lifecycle"). 404 unknown department/position, 409 requested/random name unavailable or the pool is empty. |
| PATCH  | `/api/employees/:id`             | Rename and/or move department. 404 unknown employee/department, 409 name unavailable.                                            |
| DELETE | `/api/employees/:id`             | Fire (soft — see above). 404 unknown employee, 409 while leased (`EmployeeLeasedError`).                                         |

### `employeeNamesContract` (`libs/contracts/src/employees/employee-names.contract.ts`)

| Method | Path                      | Notes                                                                      |
| ------ | ------------------------- | -------------------------------------------------------------------------- |
| GET    | `/api/employee-names`     | List every pool entry (seed + operator-added), alphabetized.               |
| POST   | `/api/employee-names`     | Add a name outside the seed. 409 duplicate (`EmployeeNameConflictError`).  |
| PATCH  | `/api/employee-names/:id` | Rename a pool entry. 404 unknown id, 409 target name already taken.        |
| DELETE | `/api/employee-names/:id` | Delete a free entry. 404 unknown id, 409 while held by an active employee. |

## Migrating existing data

`tools/migrate/zibbycorp-employees.mjs` walks `agents/*.md`, hires one
employee per agent still carrying a `department:` frontmatter line (claiming
names in seed-pool order), and is **all-or-nothing**: if the seed pool would
be exhausted partway through, it throws and writes nothing — no backup, no
partial hire plan, nothing touched. `apps/api/data-test` (5 agents, all
department `dev`) has been migrated and is the fixture data every e2e/unit
test above runs against. A dry run against the operator's own live
`.zibby/data` is **blocked** (50 departmented agents vs. a 30-name pool) — see
`docs/plans/zibbycorp/employees-migration-dry-run.md` for the finding and the
options going forward; this is a scoping decision for the
operator/orchestrator, not a code change.
