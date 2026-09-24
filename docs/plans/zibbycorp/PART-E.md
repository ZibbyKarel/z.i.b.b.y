# Part E — Employees (D-015)

**Branch:** `feat/zibbycorp`. This part runs after Part 0, so department ids already exist.

## ZE-01 — Contracts and API: employees, name pool, allocator

**Contracts** (`libs/contracts/src/employees/`, new):
- `EmployeeSchema`: `{id, name, agentId, department, status: "active"|"fired", hiredAt, firedAt?}`.
- `EmployeeNameSchema`: `{id, name, employeeId?: string}`. `employeeId` is set while an
  active employee holds the name.
- `EmployeeWithStateSchema` = employee plus:
  - a derived `state` (O-04 vocabulary);
  - `currentRunId?`;
  - `currentTaskTitle?`;
  - `position` (the agent's name and title).

**Router** (`employees.contract.ts`):

| Method | Path | Notes |
|---|---|---|
| GET | `/api/employees` | Query: `?department=&agentId=&status=` |
| GET | `/api/employees/:id` | |
| POST | `/api/departments/:id/employees` | Hire. Body `{agentId, name?}`. Returns 409 when the name is taken or the pool is empty. |
| PATCH | `/api/employees/:id` | Rename, which must pick a free name, or move department |
| DELETE | `/api/employees/:id` | Fire. Soft: status becomes fired and the name is released. Returns 409 while the employee has a leased run. |
| GET/POST | `/api/employee-names` | |
| PATCH/DELETE | `/api/employee-names/:id` | Delete returns 409 while the name is in use. |

**API** (`apps/api/src/employees/`, new module):
- **Stores:** `employees/<id>.json` and `employee-names.json`, in the same style as the
  other file stores (atomic writes, lock).
- **Seed:** the 30 names below are inserted when the file is absent.
- **`EmployeeAllocator`:**
  - `acquire(department, agentId, ctx)` returns a lease, waits FIFO when all matching
    employees are busy, and throws `NoEmployeeError` when the department has none of that
    position.
  - `release(lease)`.
  - `busy()` returns a map of employee id → run id.
  - Everything is in-memory.
- **Wiring:**
  - `PipelineRunnerService`: every stage start acquires, and stage end (any terminal
    status) releases.
  - Single-agent task runs: acquire at spawn, release at exit.
  - `employeeId` is recorded on the run and stage records (additive field).
  - `NoEmployeeError` parks the run with `parkedReason: "no-employee"` (add it to the
    enum) and emits a notify-only activity entry.
- The classifier and the roster (`DepartmentsService`) use employees for department
  membership, as described in D-015.
- **Agent:** `department` becomes optional, and it is removed from the create and edit
  forms in Part B. The migration clears it after hiring.
- `docs-sync` manifest row, and `docs/api/employees.md`.

**Tests:**
- The allocator: FIFO order, release, parallel different positions, the no-employee error.
- Hire and fire, including the name returning to the pool.
- Name uniqueness.
- The pipeline e2e with a fake runner, covering the queued wait when 1 employee serves
  2 stages.

**Migration** (extend `tools/migrate/zibbycorp-departments.mjs` or add
`zibbycorp-employees.mjs`):
- For each agent that has a department, hire one employee with the next free seed name.
  The order is deterministic: sorted by agent id.
- Then drop the department from the agent's frontmatter.
- It is idempotent: an agent with an existing active employee of the same position and
  department is skipped.

**Seed names:**

Kevin, Stuart, Bob, Dave, Jerry, Carl, Phil, Tim, Mark, Tom, Jorge, Norbert, Otto, Mel,
Lance, Steve, Donnie, Mike, Ken, Chris, John, Paul, Larry, Herb, Walter, Gus, Barry, Frank,
Lenny, Ziggy
