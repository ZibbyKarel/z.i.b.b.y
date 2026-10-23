# Remove employees, minions, the COO persona and divisions

Status: implemented 2026-10-22 (D-023). Supersedes D-015, D-017, D-018, D-021 and
`docs/plans/zibbycorp/staffing-driven-capacity.md`.

## Decisions (operator, 2026-10-22)

1. **No employees.** Agents work like in Claude Code: any agent can be spawned any time from
   anywhere; there is no headcount, no lease, no "the one frontend developer is busy" queue.
   Delete the employee model, the name pool, appearances, the allocator and its grant queue.
2. **Run slots are the only throttle.** One slot = one run instance (a single-agent run, an
   orchestrator run, or a whole workflow run — however many agents it spawns inside). A global
   cap (System settings) and an optional per-project cap (`budget.maxConcurrent`, revived).
   Everything that creates a run instance through the scheduler counts, including tasks started
   from chat. The chat conversation itself never takes a slot and is always available. A run
   waiting on an approval keeps its slot. Queued tasks wait in the existing scheduler queue
   (project round-robin, then FIFO). Nested sub-runs (a workflow's child workflow, a goal's own
   loop) ride on the parent's slot — see Implementation notes.
3. **Departments stay** as a flat grouping of agents of the same kind (`Agent.department`).
   **Divisions are removed.**
4. **Zibby / the COO is not an entity any more.** Delete `ZibbyAvatar`, the COO naming in chat
   (`CooDock` → `ChatDock`, chat bubble author `coo` → `assistant`), "reports to COO" etc. The
   chat itself stays. ZIBBY remains the product name.
5. **Old dashboard and the whole Minion theme are deleted** (`/dashboard-old`, OrgMap,
   `OrgFloorplan`, `Minion*`, `AgentGlyph`).
6. **Agent symbol.** An agent is shown as an `IconTile` with its DS icon (`Agent.glyph`, an
   existing field; default = its department's icon, else `bot`) tinted with the department
   colour, next to its name; run state is a `StatusDot`. New DS icons are added when needed
   (e.g. a React-like atom for the frontend developer).
7. **Data.** Delete `.zibby/data/employees/`, `.zibby/data/employee-names/`,
   `departments/_divisions.json`, `division` from every department file, `employee` pins. Old
   run files keep `employeeId`/`employeeName`/`waitingForStaff` on disk; the schemas drop them
   on read.
8. `/workforce/positions/*` (which rendered agents) redirects to `/workforce/agents/*`.

## Phases

Order is C → A → B → D so every commit typechecks (pre-commit typechecks base + web): the web
stops using employee/division contracts first, then the backend deletes them.

- **A — backend removal** (contracts + api + data-test seeds + real data migration): employees,
  name pool, allocator, divisions, `employee` pin kind, `no-employee` park, `waitingForStaff`,
  hiring nudge. Roster and classifier read `Agent.department` again. `WorkingAgentsFuse` stays
  untouched in this phase.
- **B — run-slot limiter** (critical, orchestrator): convert the fuse into per-run slots with a
  global + per-project cap, taken in `TaskSchedulerService.dispatch()` for single-agent,
  orchestrator and workflow targets and released on the run's terminal status; drop the
  per-stage `fuse.take` in the workflow runner. Rename `maxWorkingAgents` →
  `maxConcurrentRuns` (migrate on read), revive `budget.maxConcurrent`.
- **C — web + DS removal**: everything listed in decisions 4–6 and 8, settings UI for both caps.
- **D — docs**: `docs/api/*`, DECISIONS entry, READMEs, this file's status.

## Implementation notes

(filled in as phases land)

- **B (2026-10-22).** `RunSlots` (`apps/api/src/run-slots/run-slots.service.ts`) replaces the
  fuse: `tryTake(projectId?, projectCap?)`, no waiting; the scheduler queues. One slot per
  dispatched run (agent, orchestrator, workflow, goal), released on terminal status; parked /
  paused-limit / awaiting-approval keep it. Automations with `agent` / `workflow` targets now go
  through `createTask`. Known ceilings: counts are in-memory (over-admit briefly after a
  reboot).
- **Continue through the queue (2026-10-23).** An operator "continue" of a failed /
  interrupted task-backed run re-queues the task (`continueRun` marker) and the drain
  continues it under a new slot, so it counts like any dispatch.
