# ZibbyCorp — decisions log

This log is append-only. Each entry records the call, the alternatives, and the reason.
A later session must read it before reopening any of these questions.

- **Binding decisions** are D-001 to D-004. The operator made them on 2026-09-24.
- **Architecture calls** are D-005 onward. The planner made them within the operator's
  latitude ("máš volnou ruku"). A night run treats them as binding.
- **Open questions** are in [`OPEN-QUESTIONS.md`](./OPEN-QUESTIONS.md). Each one has a
  default the night run may apply.

---

## D-001 — Chains return, built on handoff

**Call:** re-introduce the chain concept: an ordered route of departments.

- A parent task walks the chain.
- Each department runs its own pipeline (or its single owned agent) as a **subtask**.
- Gates between steps use the handoff tier (see D-005).
- Signal handoffs (e.g. a CVE → DEV fix) remain a second entry path.

**Alternatives rejected:**
- A chain as a pure UI label with no backend.
- Handoff rules only, with no ordered route: this cannot express "DEV goes to REL in
  *feature* but nowhere in *bugfix*".

**Why:** the operator's model is "sharing between departments goes through chains; handoff
inside a department goes through pipelines" (2026-09-24).

**Do not repeat the mistake of the amputated chain runner.** Commits `469c3d48` and
`44b1b9ab` removed it. Its `chain-runner.service.ts` had a path-containment bug; see
`docs/audit/batches/api-automations-chains.md`. Nothing from that file is restored.

---

## D-002 — Every agent belongs to exactly one department

**Call:** `Agent.department` is required and single-valued. It is today's `ownerSubsystem`,
renamed. There is no shared pool and no runtime borrowing.

- **ORG → People** is a company-wide *directory* of all agents. It is grouped by department
  and filterable by state and role. Clicking an agent opens its profile.
- The department **Team** tab lists only that department's agents.
- The design's "roles this department borrows" table and "borrowed agents" metric are
  **dropped**. The metric becomes "AGENTS".
- Work crosses departments **only** via chains (D-001/D-005) or signal handoff.
- Work stays within a department via pipelines (rework loops live only there).

**Why:** operator correction, 2026-09-24. The design mock (`zc-data.js` / IA doc) models a
pool. Where the mock and this decision differ, this decision wins.

---

## D-003 — Companies and Teams both stay

**Call:**
- Re-skin both entities.
- Companies go to WORK → Companies.
- Teams become WORK → Teams, a sibling sub-tab.
- "ZibbyCorp" is a **brand only** (wordmark, splash). It is never an entity, so there is no
  naming collision with `Company`.

---

## D-004 — Full rename subsystem → department, with data migration

**Call:** rename in code, contracts, API routes, web, i18n, tests, docs, and on-disk data.

**New id table** (closed enum `DepartmentIdSchema`):

| New id | Code | Display name | Old subsystem id | Old API module dir → new |
|---|---|---|---|---|
| `dev` | DEV | Development | `forge` | — |
| `ops` | OPS | Monitoring & Ops | `puls` | — |
| `sec` | SEC | Security | `sentinel` | `apps/api/src/sentinel` → `apps/api/src/security-scan` |
| `rel` | REL | Release Management | `maestro` | `apps/api/src/maestro` → `apps/api/src/release` |
| `inc` | INC | Incident Response | `beacon` | — |
| `rnd` | RND | R&D | `scout` | — |
| `com` | COM | Communications | `herald` | `apps/api/src/herald` → `apps/api/src/comms` |
| `qa` | QA | QA & Architecture | `loom` | `apps/api/src/loom` → `apps/api/src/arch-audit` |
| `knw` | KNW | Knowledge Management | `codex` | — |
| `fin` | FIN | Finance | `ledger` | — |
| `per` | PER | Personal Office | `hearth` | — |

**Field renames** (all occurrences):

| Before | After |
|---|---|
| `ownerSubsystem` | `department` |
| `SubsystemId` | `DepartmentId` |
| `SUBSYSTEMS` | `DEPARTMENTS` |
| `TaskTarget {kind:"subsystem"}` | `{kind:"department"}` |
| `HandoffSignal.from` | unchanged name, value is a `DepartmentId` |
| `Note.subsystem` | `Note.department` |
| `Approval.ownerSubsystem` | `Approval.department` |
| `/api/subsystems/*` | `/api/departments/*` |
| `features/subsystems` | `features/departments` |
| `SubsystemDrawer` | — (replaced by a routed page) |

**Persona-named automation ids and activity kinds** get neutral names:

| Before | After |
|---|---|
| `sentinel-scan` | `security-scan` |
| `loom-audit` | `arch-audit` |

The same pattern applies to any `herald-*` / `maestro-*` ids that recon step ZC-01a finds.

**Read tolerance, for one version:**
- Every schema that holds a department id accepts the old id and maps it through
  `LEGACY_SUBSYSTEM_ID_MAP`.
- Every stored object accepts the old field names.
- Both are implemented once, in `libs/contracts/src/departments/legacy.ts`.
- The tolerance is removed in a follow-up arc, not in this one.

**Migration:** `tools/migrate/zibbycorp-departments.mjs` rewrites a data dir. It is dry-run
by default, `--apply` writes, and it backs up first (D-008).

**Grep gate:** the persona words must be gone from code (see ROADMAP § Hard invariants,
I-6). The allowlist is the legacy map, the migration script, `docs/plans/**` (history) and
CHANGELOG-type history.

---

## D-005 — Chains are a view over HandoffService (no new service)

**Context:** the operator asked (2026-09-24): "the current HandoffService already hands
work between subsystems, so we theoretically need no new service?" Checked against the
code, the answer is **yes, with four small, additive extensions**.

Today:
- `pipeline-runner.service.ts` `recordArtifact` already emits a `research-artifact` signal
  from `scout` on delivery.
- A handoff rule routes that signal to `forge`.

That is a two-step chain built entirely from handoff. What the service cannot express
today:

1. **Route dependence.** Rules match on `(from, signalKind)` globally. "DEV finished" goes to
   REL in chain *feature* but ends the chain in *bugfix*, so the signal kind must carry the
   chain.
2. **Parent linkage.** `dispatchTask` creates a bare task (title/body only). It passes no
   parent id, chain step, or artifact input.
3. **A generic completion signal.** Today only scout's pipeline emits one; every
   department's completed subtask must.
4. **Chain metadata** (name, description, entry department) for the library/editor UI.

**Call:**
- **Chain = a signal kind with `chain: true`, plus the rules that carry that kind.**
  - Extend `HandoffSignalKindSchema` with `chain?: true` and `entry?: DepartmentId`.
    The id, label and description already exist.
  - The route is **derived** by starting at `entry` and following the enabled rules
    `{signalKind: chainId, from: X}` → `to`. There is no separate `Chain` store and no
    second copy of the route that could drift.
  - Chain CRUD is new endpoints on the existing handoff controller:
    `GET/PUT/DELETE /api/handoff/chains/:id`. A `PUT` atomically rewrites the kind and
    exactly that kind's rules.
  - Validation on `PUT`:
    - linear: ≤1 rule per `from` for that kind;
    - no cycles;
    - every step is a department target;
    - 1 ≤ length ≤ 11.
- **Gate per hop = rule tier.** UI **AUTO = tier 2** (act, then report in the briefing).
  UI **ASK = tier 3** (a `handoff-proposal` approval). Tier 1 (silent) stays available
  only for signal rules, not for chain hops. See O-05.
- **Signal gains optional `chain` context:**
  `HandoffSignalSchema.chain?: { chainId, parentTaskId, step, artifactRef? }`.
  - The fingerprint for chain signals is `${parentTaskId}:${step}`. The existing
    `(ruleId, fingerprint)` idempotency then guarantees a step never double-dispatches.
- **`dispatchTask` threads context through:**
  - `CreateTaskInput` / `ScheduledTask` gain `parentTaskId?` and
    `chain?: {id, step}`, both additive and optional.
  - The artifact ref becomes the pipeline `input`, via the existing N2b `input` param of
    `PipelineRunnerService.start`.
- **Completion emitter.** It is a private method in the existing run-completion path, not
  a service. It generalises scout's snippet in `recordArtifact` and adds a terminal-status
  hook for single-agent department runs.
  - When a task with `chain` context completes green, it emits
    `{from: task.department, kind: chain.id, chain: {…, step: step+1}}`.
  - No matching rule means the chain has ended, so the parent is marked done.
  - A red subtask **does not advance**. The parent shows `blocked`/`error`. Rework happens
    inside the department pipeline, never across the chain.
- **Parent task:**
  - It is a `ScheduledTask` with `target {kind:"chain", id}`. `TaskTargetSchema` gains a
    `chain` member.
  - The scheduler does not spawn a run for it. It dispatches step 0 directly to `entry`
    with `parentTaskId` set.
  - Its status is derived from its subtasks (read model in the tasks store).
- **Scout's `research-artifact` rule** remains an ordinary signal rule. It is optionally
  re-expressible as a chain later.

**Why:**
- It reuses the idempotency, tiers, proposals/approvals, activity reporting and
  `ResumableRunner` that already work and are tested.
- It meets Law 1: the gate is the existing approval floor.
- It is much smaller than a walker service plus storage, and it does not resurrect the
  deleted chain-runner.

**Cost:**
- A chain's route lives in N rule rows, so the editor must write them atomically (a
  single store write under the rule store's existing lock).
- Rules of chain kinds are **hidden from the generic Handoff-rules table**, filtered by
  `kind.chain === true`, so an operator cannot half-edit a chain there.

---

## D-006 — Three stacked branches, three nights

**Call:**

| Part | Branch | Cut from | Content |
|---|---|---|---|
| Part 0 | `feat/zc-0-departments` | `main` | Rename + migration |
| Part A | `feat/zc-a-design-system` | tip of Part 0 | DS + visual |
| Part B | `feat/zc-b-ia` | tip of Part A | IA, routes, logic, chains |

- Each part ends **parked at the PR gate** (never merged, never pushed without the
  operator).
- The PR for B targets A's branch, and A's targets 0's.
- Night runs execute one part each.

**Why:** a ~35-phase arc in one branch is unreviewable and one red wave blocks everything.
The order is forced:
- The rename first, so Part B never writes screens with names that change again.
- The DS second, so Part B composes only from finished DS components.

---

## D-007 — No Tailwind in apps/web is a lint rule

**Call:** Part A (ZA-07) extends the ESLint block for `apps/web/**`.

- `react/forbid-dom-props`: forbid `["style", "className"]`.
- `no-restricted-imports`: ban `clsx`, `tailwind-merge`, `class-variance-authority`, and
  any `*.css` other than the DS global stylesheet imported in `app/layout.tsx`.
- `no-restricted-syntax`: flag `className=` JSX attributes on **any** element. DS props
  already omit `className`, so this catches passthrough attempts too.
- The DS is exempt. Stories are exempt.
- The 20 files that use `className` today (list in PART-A.md, ZA-07) are migrated in the
  same phase.
- `components/LoadingScreen/*` is deleted and replaced by the DS `Splash` (ZA-06).
- There are no per-line escapes for `className`. The `style` escape stays only for
  genuinely dynamic SVG values, as today.

**Why:** the operator: "Nechci vidět žádný tailwind uvnitř app samotné." A convention
without a gate decays, and every past arc showed that.

---

## D-008 — Data migration never runs unattended on the operator's real data

**Call:**
- The night run executes the migration script on:
  - `apps/api/data-test` (committed fixture, `--apply`);
  - a **copy** of `.zibby/data` in the scratchpad (`--apply`, to prove it works).
- Against the real `.zibby/data` it runs **dry-run only**. It writes the report to
  `docs/plans/zibbycorp/migration-dry-run.md`.
- The operator runs `--apply` in the morning. Read tolerance (D-004) keeps the API working
  on unmigrated data in the meantime.

**Why:** the data is the operator's source of truth (Law 2), and rewriting it is Tier-3.
The fixture exception is deliberate: changing it once via the script, in its own commit,
is the only sanctioned mutation.

---

## D-009 — Routes are Next App Router paths, grouped by section

**Call:**
- The design's hash routes become real segments under
  `apps/web/app/(company)/<section>/…`. The full table is in `ROUTE-MAP.md`.
- Old segments get permanent redirects in `apps/web/next.config.*`, kept for one version.
- `/` → `/org`.

---

## D-010 — The DS absorbs the whole visual layer

**Call:**
- `HudCard`, `HudPanel`, `ImmersivePage`, `SkipLink`, `MarkdownProse` and the chat shell
  either move into the DS or are replaced by DS components.
- `libs/design-system/src/immersive/*` (orb map, GlassSurface, HandoffFlare…) is
  **deleted** at the end of Part B (ZB-13), once nothing imports it.
- Tokens have a single source: `tokens.ts` → generated `@theme` in `theme/globals.css`.
  Light and dark are complete sets per `design/ZibbyCorp/ZibbyCorp Design System.md`.

**Why:** the design's "instrument paper" language is incompatible with the WebGL orb scene
(05 §5). Keeping both means two visual languages.

---

## D-011 — Integrations stay project-scoped

**Call:**
- An integration (Slack/Jira/GitHub/email/calendar) remains a child of a Project or
  Company, as today.
- The department **Integrations** tab is a derived read-only list: the integrations
  whose adapter/monitor signals are routed to that department. The mapping is a static
  `integrationKinds` field on the `DEPARTMENTS` registry.
- There is no new FK.

**Why:** integrations carry credentials and "mine and mentions" scope per project. That is
DNA, not a design detail.

---

# Operator answers, 2026-09-24 evening (night-run kickoff)

These **supersede** the entries above where they conflict.

## D-012 — One branch, pushed, one draft PR (supersedes D-006)

**Call:** the whole arc lives on `feat/zibbycorp`, cut from `main`.

- There is one commit per (sub)phase.
- At the end, the branch is pushed and a **draft PR** is opened into `main`. This is a
  Tier-2 act-then-report step, and there is no merge.
- A backup tag `v3.0` is set on `main` @ `6ccf889c` and pushed.
- A tarball of `.zibby/data` is at `.zibby/backups/data-v3.0-*.tgz` (gitignored).

## D-013 — Real data may be migrated (supersedes D-008)

The system is not running and has no other users. The night run runs the migration with
`--apply` on the real `.zibby/data`, after the script's own backup. Tracked data files are
committed.

## D-014 — Resolved open questions

| Question | Resolution |
|---|---|
| O-01 | **Light is the default theme**, with a dark toggle. |
| O-02 | **Czech is the default**, and English is switchable in System → Settings → General. |
| O-13 | **Approve with a single click everywhere.** `HoldButton` is removed from approval surfaces. This is still an explicit operator decision, so Law 1 holds. |
| O-26 | **The orb map is deleted.** |
| Brand | **ZibbyCorp.** The operator is the CEO, and **Zibby is the COO** (the root orchestrator and chat). |
| Priority, when time or context runs short | The rename comes first, then Employees, then visuals, then IA. **Chains come last** (Part C). |

## D-015 — Agents are positions; Employees are instances (refines D-002)

The operator's analogy: *an employee relates to an agent as a process relates to a program.*

**Agent = position / job definition** (prompt, tools, model).
- A global library with CRUD, as today.
- It **no longer belongs to a department.** `Agent.department` is removed once the
  employee migration has run.

**Employee = an instance of an agent.**
- Fields: `{id, name, agentId (position), department, status: active|fired, hiredAt,
  firedAt?}`.
- It belongs to **exactly one department**.
- It has a unique name drawn from the **name pool**.
- Its identity is its name + live state + run history. Its prompt and memory are inherited
  from the position. There is no per-employee memory.

**Name pool:**
- A file-backed "table", `employee-names.json`, with CRUD in the UI under
  System → Registries → Names.
- It is seeded with **30 Minion-style names**.
- A name is used by at most one active employee.
- Firing an employee returns the name to the pool. The fired employee record stays as an
  archive with its run history.

**Hiring:**
- From the department Team tab: pick a position and a name, where the name is optional and
  a random free one is used if omitted.
- `POST /api/departments/:id/employees`.
- `DELETE` means fire.

**Pipelines:**
- Pipelines stay department-owned.
- Every step names a **position** (agent id), exactly as steps name an agent today.
- At stage start the runner asks `EmployeeAllocator.acquire(department, agentId)`:
  - If a free active employee of that position exists in the department, it is leased.
    The run and stage records get `employeeId`.
  - If all employees of that position are busy, it **waits in a FIFO queue** and the stage
    shows `thinking` / queued.
  - If the department has **no employee of that position**, the run parks with the reason
    `no-employee` and the operator gets a notify-only "hire a <position> in <department>"
    notice.
  - The lease is released when the stage ends.
  - The allocator is in-memory. Leases reset on API restart, because boot re-dispatch
    re-acquires them.

**Single-agent targets** (the classifier picks an agent/position, or the operator names
one): the department is the explicit one, or else the department of the first free
employee of that position; the same queue and park rules apply.

**Migration:** each existing agent's `ownerSubsystem`/`department` becomes **one hired
employee** of that position in that department. This keeps the system working in the
morning.

**Classifier / roster:** a department's roster = its active employees, plus the distinct
positions they hold, plus its pipelines. The "0/1/N owned units" dispatch rule counts
positions held by employees plus pipelines.

**Reuse, not rebuild:**
- The queue piggybacks on the scheduler's existing held/queued machinery.
- `maxConcurrentRuns` stays as the global cap.
- Headcount becomes the natural per-department cap.

## D-016 — No legacy read tolerance; the migration covers everything (supersedes the D-004 tolerance clause)

**Call:** because D-013 lets the night run migrate the real data, there is no
`z.preprocess` read-tolerance layer, and no `legacy.ts` in contracts.

- `DepartmentIdSchema` stays a plain `z.enum`, so `.options` and `Record<DepartmentId, …>`
  keep working.
- The migration script rewrites **all** of these:
  - tracked and untracked data;
  - `activity/*.jsonl`;
  - `tasks`, `approvals`, `handoff` (fired, proposals, rules, kinds);
  - automation ids;
  - `subsystem-seen.json`;
  - the vault MOCs and wikilinks;
  - `herald/` and `maestro/`;
  - `apps/api` test fixtures.
- The only place persona ids may appear is the migration script's own map, under
  `tools/migrate/**`.
- The department registry keeps its `color` field until ZB-13, when the orb map (its only
  consumer) is deleted. That keeps Part 0 visually identical.

**Why:**
- Tolerance code is dead weight the moment the migration runs.
- The operator allowed dead code to be dropped.
- A preprocess-wrapped enum breaks `.options` and `Record` inference across hundreds of
  call sites.

## D-017 — Single-agent runs and the employee allocator (2026-09-24, orchestrator)

Pipelines always have an owning department, so a stage with no employee of its position in
that department **parks** (`no-employee`) and notifies (D-015). A single-agent task run
leases an employee of that position from the task's department if known, else from any
department that employs the position. If **no** employee of the position exists anywhere,
the run proceeds unleased — Zibby (COO) does it directly — because a described task is
always executed (North Star: no silent no-op).

## D-018 — Name pool grows to 60 (2026-09-25, orchestrator)

The real data has 50 agents with a department and the operator's seed list has 30 names, so
the 1-employee-per-agent migration (D-015) could not run. The operator's 30 names stay first
and in order; 30 more (Tony … Zeke) are appended in both `EMPLOYEE_NAME_SEED` copies (API
store + migration). The pool is a CRUD table, so the operator can rename or delete any of them.
Migration ids are deterministic (`employee_<agentId>`) for idempotency; hires through the API
get collision-resistant ids.

## D-019 — A chain target rejects with 400 until ZB-05a (2026-09-25, ZB-04a)

**Superseded by ZB-05a.** `{ kind: "chain" }` is now dispatchable:
`TaskSchedulerService.createTask` persists the chain's PARENT (no run of its own) and dispatches
step 0 straight to the chain's `entry` department; a missing/disabled chain is a clear, visible
error outcome on the parent, never the `ChainNotImplementedError` 400 this decision originally
specified — see PART-B.md's ZB-05a section for the full design. `ChainNotImplementedError` and
its controller mapping are removed; the paragraph below is kept for the historical record only.

~~`{ kind: "chain" }` is schema-only in ZB-04a — `HandoffService` doesn't dispatch chain steps
until ZB-05a. Creating a task with an explicit chain target must not silently no-op (North
Star: a described task is always executed) and must not persist a task record that can never
dispatch. `TaskSchedulerService.createTask` throws `ChainNotImplementedError` before any
persistence; the controller maps it to **400** — a validation rejection, distinct from the
422 "nothing to route to" family (`EmptyCatalogError` / `DepartmentEmptyRosterError`), because
the request itself is malformed for this phase, not merely unroutable right now. The
classifier never emits a chain target on its own (`RoutableTarget`'s type excludes it), so
this only fires for an explicit caller-supplied target — the same scope guard as `department`.~~
