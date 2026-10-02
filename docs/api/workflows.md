# Workflow Orchestration

## Workflow — definition

A workflow is a Markdown file with YAML frontmatter at
`.zibby/data/workflows/<id>.workflow.md`.

### Frontmatter fields

```yaml
id: delivery-loop
name: Delivery Loop
desc: "Architekt → Kodér ⇄ Code-Review → Tester → Dokumentátor"
department: dev # required on create (422 without it) — see below
complexity: deep # the ladder rung: light | standard | deep
project: my-app # optional default project binding (see below)
budget: # optional per-run spend cap (see "Budget")
  maxCostUsd: 5
  warnAtPct: 70 # default 70
phases:
  - id: architekt
    type: agent
    agent: architekt
    model: opus # overrides the agent's default model for this phase
    thinking: high
    produces: spec.md # handoff file for the next phase
    approval: ask # operator checkpoint once this phase lands green (see "Approval gate")

  - id: render
    type: tool # deterministic transform in the stage sandbox, no tokens
    consumes: spec.md
    produces: assets.zip
    commands:
      - product-factory render spec.md assets.zip

  - id: kodér
    type: agent
    agent: kodér
    consumes: spec.md # input from the previous phase
    produces: diff.patch
    loop:
      to: code-review # back-edge on failure
      maxRetries: 3
      escalation:
        - rung: 1
          model: sonnet
          thinking: medium
        - rung: 2
          model: opus
          thinking: high

  - id: code-review
    type: agent
    agent: code-reviewer
    consumes: diff.patch
    then:
      pass: tester # on OK → go to tester
      fail: kodér # on FAIL → back to kodér

  - id: tester
    type: verify # deterministic phase, no tokens
    commands:
      - pnpm check:types
      - pnpm test
    then:
      pass: dokumentátor
      fail: kodér

  - id: dokumentátor
    type: agent
    agent: dokumentátor
    produces: docs.md

outputs: # what happens to the finished work (delivery sinks)
  - type: pr # opens a PR from docs.md (gated — "the PR is the gate")
    from: docs.md
  - type: folder # copies <run dir>/book/ to ~/Workspace/zibby-publishing/books/<runId>/
    from: book
    to: ~/Workspace/zibby-publishing/books
  - type: file # writes review.md into the project (on a zibby/* branch)
    from: review.md
    dest: project
    to: reports/review.md
```

The body of the `.md` file is the instructions for the whole workflow
(context hint).

**Default project (`project`).** Optional project id a run binds to when the caller
names none (an automation, a manual start); the runner resolves
`projectRef ?? workflow.project`. The project supplies the stage env + secrets (for
example which image provider a `tool` phase uses) and its checkout as the agent cwd.
An explicit project on the start request still wins.

**Phase types.** `type` is `agent` (default), `verify` or `tool`. Schema rules: an
`agent` phase requires `agent`/`model`/`thinking`/`consumes`/`produces`; a `verify`
phase must not name an agent; a `tool` phase requires `commands` and `produces` and must
not set `agent`/`model`/`thinking`.

### Ownership (`department`) and the ladder rung (`complexity`)

Since NS2 F9 these two fields decide whether a workflow is reachable at all.

`department` names the department that owns this workflow. It is **required on
create** — `POST /api/workflows` returns **422 `"department is required"`**
without it, mirroring the same guard on `POST /api/agents`. The field is still
`.optional()` in the schema on purpose: the entity store's listing is tolerant (a
file failing validation is skipped, never fatal), so a required field would turn a
hand-edited file that lost its owner into a _silent disappearance_ from the catalog
instead of something `GET /api/departments/unowned` can report.

The real enforcement is structural rather than schema-level: the task classifier's
stage 1 routes **only to departments**, and a department offers only the units it
owns — so an unowned workflow is unroutable by construction. Nothing has to reject
it; no path reaches it. See `docs/api/tasks.md` → _Classification_.

`complexity` places the workflow on its department's **complexity ladder**, ordered
cheapest first:

| rung            | shape                         | when                                                     |
| --------------- | ----------------------------- | -------------------------------------------------------- |
| _(no workflow)_ | a single owned agent          | single-surface: one file, a rename, a copy fix, a lookup |
| `light`         | 2–3 phases, cheap models      | narrow, but wants a second pair of eyes or a check       |
| `standard`      | 3–4 phases                    | ordinary work with review + verification                 |
| `deep`          | 4–6 phases, loops, escalation | multi-surface, or needs design + review + tests + docs   |

It defaults to `"standard"`, so every workflow written before F9 parses unchanged.
`WORKFLOW_COMPLEXITY_ORDER` (exported beside `WorkflowComplexitySchema`) is the
canonical cheapest-first sort key — consumers use it rather than re-deriving an
order from the enum's declaration order.

The rung is data rather than file order because the stage-2 routing fallback
resolves a low-confidence verdict to the department's **cheapest owned workflow**;
file order would silently change that meaning the first time a directory listing
reordered.

> Note: `complexity` is round-tripped explicitly by `WorkflowsStorageService`
> (`fromFrontmatter` reads it, `toFrontmatter` always writes it). Because the
> schema defaults the field, a missing copy would not fail — every workflow would
> just read as `"standard"` and the ladder would collapse to a constant.

### Outputs (`outputs`) — delivery sinks

What happens to finished work is **not done by any agent** (it used to be a
`pr-autor` agent), but is workflow-level configuration instead. `outputs` is
an array of terminal sinks the runner processes after the phase loop goes
green — deterministic, system-owned (no agent, no model, no tokens; the
output-side counterpart of the `verify` phase). A workflow can have more than
one (open a PR _and_ write a report). Each sink draws from `from` — a
relative path some phase `produces`.

| `type`   | Fields               | What it does                                                                                                                                                                                                                                                                                                                                                                   |
| -------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `pr`     | `from`               | Composes a PR from `from` (Markdown `# title` + body) and opens it via `git push && gh pr create`. **Always parks for approval** — the PR is the gate, enforced structurally by the system (Law 3), not by agent config.                                                                                                                                                       |
| `folder` | `from`, `to`         | Copies the run folder `<run dir>/<from>` (relative, no `..`; **not** a handoff file, so no phase has to `produce` it) recursively into `<to>/<workflowRunId>/`. `to` is an absolute path or `~/…` (expanded to the home dir); parents are created. A missing source is logged and skipped. Recorded as a `project-file` run artifact whose locator is the delivered directory. |
| `file`   | `from`, `dest`, `to` | Copies `from` to `to` — into the project worktree (`dest: project`, on a `zibby/*` branch) or as a vault note (`dest: vault`, a durable second-brain record for workflows whose result is information, not code).                                                                                                                                                              |

A `pr` sink parks the aggregate with `parkedReason: "output"` (durable across
a restart — the phase loop has already finished, no live child), writes
`pr-draft.md` + `diffstat.txt` as the decision surface, and opens an approval
of `kind: "workflow-output"` (runId = workflowRunId). Approval → the system
runs the gated push and the run finishes `done`; rejection → the work stays
on the branch without a PR (the run is still `done`). `file` and `folder` sinks
are Tier-1 and run immediately.

**Per-run override.** When the workflow is the target of a directed task that
carries its own `output` (the New Task dialog — see
[tasks.md](./tasks.md)), that choice **overrides** the declared `outputs:`
for that run: it's stored as `WorkflowRun.outputsOverride` (`void` → `[]`,
which suppresses even a declared PR) and the runner reads
`outputsOverride ?? outputs`. `from` is derived from the workflow's last
`produces` (a task carries no `from`).

### Artifact registry (N2a) — provenance records

Every successful delivery writes a **durable provenance record** to the
artifact registry — one plain-JSON file under `ARTIFACTS_DIR` (default
`ZIBBY_DATA_DIR/artifacts`), owned by `ArtifactsStorageService` (the
`artifacts/` module — see `docs/api/artifacts.md`). A record carries `kind`
(`vault-note` | `project-file` | `pr`), `locator` (note id / project path /
PR URL), `from` (the handoff name), and `producedBy` (`runRef`,
`workflowId`, `taskId?`, `projectId?`). The record id is the stable
`<runRef>_<kind>_<slug(from)>` — an idempotent re-delivery replaces the
record rather than duplicating it. The write is best-effort: a registry
failure never fails an (already green) delivery. A failed delivery writes no
record — provenance is never faked. The registry is read-only over HTTP:

```
GET /api/artifacts                    list records (newest-first; ?projectId= &workflowId=)
GET /api/artifacts/:id                one record
```

The registry backed workflow chaining (N2b): a downstream workflow anchored its
input on an upstream output's record, so a chain survived a restart or the source
run being evicted from memory. That chains feature has since been retired; the
provenance registry itself remains for delivery-source answerability.

### CRUD API

```
GET    /api/workflows           list every workflow
POST   /api/workflows           create a workflow   (422 without department)
GET    /api/workflows/:id       workflow detail
PUT    /api/workflows/:id       update a workflow
DELETE /api/workflows/:id       delete a workflow
```

`POST` returns **422** for a body with no `department` (NS2 F9) as well as for
a dangling loop target; `409` on an id conflict; `404` for a missing/unsafe id.

## Starting a workflow run

> **A workflow only starts via a task.** No operator path starts it
> directly — a task is created (`POST /api/tasks`) with target
> `{ kind: "workflow", id }`; the scheduler internally calls
> `WorkflowRunnerService.start(...)`. The only per-kind run endpoint that
> remains is the catalog-liveness `GET /api/workflows/runs` (running +
> just-finished runs, for retry counters in the catalog).

### Workflow Run lifecycle

```
running → done       (every phase passed + outputs delivered)
        → failed     (a phase failed, retry/escalation were exhausted, and there's no then.fail)
        → parked     (the loop was exhausted → durable parking for human review;
                      or a `pr` output is waiting on the gate → parkedReason "output";
                      or a phase checkpoint / spend cap is waiting → parkedReason "gate" / "budget")
```

Run fields added by the gates and the budget:

| Field                      | When                                 | Meaning                                                                                                                             |
| -------------------------- | ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| `pendingGate`              | `parkedReason` is `gate` or `budget` | `{ phaseId, cursor, handoffSource }` — where the driver re-enters on approve (`cursor: null` = chain finished, deliver the outputs) |
| `budget`                   | the workflow declares a `budget`     | `{ maxCostUsd, warnAtPct, spentUsd, warned? }` — snapshot of the cap plus spend so far                                              |
| `StageRun.externalCostUsd` | a stage reported non-model spend     | sum of `costUsd` over the lines of `<stageDir>/costs.jsonl`; absent when none                                                       |

### Log polling (unified surface)

Detail, stage logs, artifacts, resume, and delete for a workflow run all live
on the unified `/api/tasks/runs/*` (see [tasks.md](./tasks.md)):

```
GET  /api/tasks/runs/:runId                              run state (+ stageRuns[])
GET  /api/tasks/runs/:runId/stages/:phaseId/logs?offset= a single phase's log (per phase)
GET  /api/tasks/runs/:runId/stages/:phaseId/logs/stream  SSE tail of the currently running phase's log
GET  /api/tasks/runs/:runId/artifacts/:name              a whitelisted artifact (pr-draft.md, …)
POST /api/tasks/runs/:runId/resume                       resume a retries-parked run
```

**Live log of the running phase.** A stage is only written into `stageRuns`
once it reaches a terminal state, so a still-running phase can't be found
there. While it runs, the runner exposes it via `currentStageRunId` (the
RunnerCore run id of the currently running child), and `readStageLog` tries
this live pointer first — so the frontend can tail a running phase's log as
it grows, instead of only seeing it once the phase finishes. On retry this
returns the log of the _current_ attempt, not an older terminal one.
`currentStageRunId` is cleared once the phase ends (its log is then
reachable from `stageRuns`).

## WorkflowRunnerService

**File:** `apps/api/src/workflows/workflow-runner.service.ts` (~84 KB)

### Phase: agent

1. Loads the handoff file (`consumes`) from the previous phase (if any).
2. **Leases an employee** for `phase.agent` from the workflow's own
   `department` (see "Wiring: workflow stage dispatch" below) — before the
   sandbox is created.
3. Builds the prompt = workflow prompt + phase instructions + the handoff file's content.
   The stage task (`buildStageTask`, `build-stage-task.ts`) also names the run folder
   (`$ZIBBY_RUN_DIR`, via the `runDirAbs` option) so an agent without Bash can still
   reach earlier phases' artifacts in its subfolders.
4. Calls `RunnerCore.spawn()` for a `workflow-stage` kind.
5. Waits for it to finish (polling the sidecar status).
6. Reads the output from the `produces` file (or the log's last N lines).
7. Evaluates the result (success / failure).
8. Releases the lease, on every terminal path.

### Wiring: workflow stage dispatch (D-015, ZE-01)

An `agent`-type phase's dispatch **is** leasing an employee — a hired
instance of `phase.agent` (the position), leased from the workflow's own
`department` via `EmployeeAllocator.acquire(workflow.department, phase.agent,
{ runId })`. Full model, the allocator's FIFO/park semantics, and D-017's
single-agent-task lease ladder live in `docs/api/employees.md`; this section
covers only what changes in the workflow runner itself:

- **Parking.** When the department owns **no** employee of that position at
  all (`NoEmployeeError`), the run **parks**: `status: "parked"`,
  `parkedReason: "no-employee"` — a new member of `ParkedReasonSchema`
  alongside `approval` / `retries` / `limit` / `output` — with
  `currentStage` set to the phase that couldn't dispatch. This is a new,
  durable-across-restart parked state distinct from the loop-exhausted /
  PR-gate parks already documented under "Parking" below.
- **Queued, not parked.** When every matching employee is busy but at least
  one exists, `acquire` blocks FIFO instead of throwing — `run.status` is
  untouched (stays `running`) while `currentStage` reflects the phase
  waiting on a free lease; no `stageRuns` entry is appended until the lease
  lands.
- **Release discipline.** The lease is released in a `finally` around
  `runStage`, covering every terminal outcome (`done`, `error`,
  `interrupted`, `paused-limit`) — it never outlives the dispatch it was
  acquired for.
- A `verify`-type phase spawns no agent and never leases (`phase.agent` is
  absent for it).
- The leased employee's `employeeId`/`employeeName` are recorded onto the
  stage's `AgentRun.extra` when present — see
  [agents-runs.md](./agents-runs.md) → "Employee attribution".

### Phase: verify

Deterministic commands — no agent, no tokens, no intents:

1. Runs each command from the `commands` array (in sequence).
2. Exit code 0 = pass, anything else = fail.
3. Command logs are appended to the workflow run log.

### Phase: tool

A deterministic **transform** between agents — no model, no tokens, no intents.
Where `verify` checks the project checkout, `tool` runs its `commands` **in the stage
sandbox** (`consumes` → `commands` → `produces`): the `consumes` symlink and the
`produces` file live there, never in the project checkout, and it never falls back to
project/default checks.

- Requires `commands` (max 50) and `produces`; `agent`/`model`/`thinking` are rejected.
- Supports `consumes`, `loop` (back-edge on failure, same retry/escalation machinery
  as any phase), and `approval: ask`.
- Exit code 0 = pass, anything else = fail. The `produces` file becomes the next
  phase's handoff.
- Env: the project's env + secrets, plus `ZIBBY_RUN_DIR` (the run root) and
  `ZIBBY_STAGE_DIR` (this stage's sandbox) so a tool can write run-wide artifacts
  (e.g. a `book/` folder) that survive a loop re-dispatch.
- **PATH:** the repo's `node_modules/.bin` goes **first** for a tool stage, so workspace
  CLIs (`product-factory`) resolve however the API was started. Agent stages get it
  appended **last**, so a project checkout's own toolchain is never shadowed.
- A tool that pays for something outside the model (a cloud image API) appends
  `{"costUsd": n}` lines to `<stageDir>/costs.jsonl`; see _Budget_.

### Phase: workflow (sub-run)

Runs another workflow as one step: `workflow: <id>`, with `consumes` and `produces`
required and `agent`/`model`/`thinking`/`commands` rejected. A phase cannot name its
own workflow.

- The child starts with the handoff file's content as its `input`, the parent's
  workspace, no task, and `parentRunId` set. The parent records `pendingChild` and
  waits durably.
- **Budget:** the child shares the parent's cap — it gets at most the parent's remaining
  spend (`min(own cap, remaining)`), and its total spend becomes the stage's `costUsd`.
- **Settling:** child `done` → its latest artifact is written to `<stage>/<produces>`
  and the parent continues; child `failed`/`interrupted` (or done without an artifact)
  → the stage errors and the normal loop/park/fail rules apply.
- **Parking:** a child parked (or paused on a limit) parks the parent with
  `parkedReason: "child"`; the parent un-parks when the child runs again.
- **Guards:** a cycle in the ancestor chain or a depth over 3 refuses the stage with an
  error (`sub-run.error.txt` in the stage dir).
- **Stop:** stopping the parent stops the child; the parent then lands `interrupted`.
- **Restart:** a parent with `pendingChild` is never failed on boot; it re-settles from
  the child's persisted state (a missing child counts as failed).
- Child runs are hidden from the task feed; the parent's stage links to them via
  `childRunId`.

### Approval gate (`approval: ask`)

Any phase type may carry `approval: ask` — an operator checkpoint, absent (the default)
meaning fully autonomous. Once the phase lands green (`produces` written):

1. the run parks: `status: "parked"`, `parkedReason: "gate"`, `pendingGate` set, and
   `currentStage` points at the next phase;
2. an approval of `kind: "workflow-gate"`, `action: "stage-approval"` (risk `low`,
   `runId` = workflowRunId, carrying the workflow's department) tells the operator to
   review the produced file;
3. **approve** re-enters the driver at the next phase (or delivers the outputs when the
   chain is finished); **reject** fails the run (`status: "failed"`).

### Budget (`budget`)

An optional per-run spend cap: `budget: { maxCostUsd, warnAtPct }` (`maxCostUsd > 0`,
`warnAtPct` 1–100, default 70). Absent = uncapped. The run carries a snapshot as
`WorkflowRun.budget` with `spentUsd`.

- **Spend** = the sum over every finished stage of `costUsd` (model) +
  `externalCostUsd` (the `costUsd` of each line of `<stageDir>/costs.jsonl`; a missing
  file is zero, a malformed line is skipped with a warning).
- **Warn:** the first time spend reaches `warnAtPct` of the cap, a warning is logged and
  `budget.warned` is set.
- **Cap:** the check runs at the **next phase boundary** — after the stage that crossed
  the cap, before the next one spends more. Over the cap the run parks with
  `parkedReason: "budget"` and a `workflow-gate` approval with
  `action: "spend-past-cap"` (risk `medium`).
- **Approve** raises the cap by another `maxCostUsd` (new cap = spend so far +
  `maxCostUsd`, `warned` reset) and continues; **reject** fails the run.

### Phase: qualify (an agent's verdict drives the loop, Phase 45)

An agent phase with `qualify: true` is a _subjective_ gate (a complement to
the objective `verify`). When the phase finishes `done`, the runner parses
the last `<verdict>pass|gap|drift</verdict>` tag (case-insensitive) out of
its `produces` artifact and drives an **existing** back-edge from it:

- `pass` → the cursor moves on (no behavior change).
- `gap` → back-edge to `loop.to` (Kodér fills in the missing part of the spec).
- `drift` → back-edge to `loop.driftTo` (Architekt replans; defaults to `loop.to`).
- missing/unreadable verdict → treated as `gap` (**fail-closed** — a gated
  phase never silently passes).

Schema rules (superRefine): `qualify` is only valid on `agent` phases and
requires `loop`; `loop.driftTo` must be an existing phase id. The parsed
verdict is stored on `StageRun.verdict` (an optional field, no migration
needed), a `stage-verdict` entry is written to the activity log, and it's
folded into the failure-context handoff so Kodér/Architekt know why they
were re-run. `qualify` doesn't apply to a phase's error path (only to
`done`) — a crashed phase takes the ordinary failure route.

**Who actually opts in.** The mechanism above is only as good as the definitions
that use it. The shipped `delivery` workflow gates **both** of its judging
phases — `review` (code-reviewer) and `n-9` (test-automator) — each with
`driftTo: architekt`, so a `gap` returns the work to Kodér while a `drift`
goes back for a replan. Before that, neither was gated: the phases wrote a
verdict into their artifact and the runner threw it away, leaving the claude
process's exit code as the only pass/fail signal — a reviewer could write
"this is broken" and the run would still advance to the PR. `qualify` is
absent from a definition by default, and absence is invisible at runtime,
so `apps/api/src/workflows/shipped-workflows.test.ts` parses every shipped
`.zibby/data/workflows/*.workflow.md` against `WorkflowSchema` and pins which
phases are gates.

### Demo stage (tests)

Without an LLM, stages run `demo-stage.mjs`. Besides its fail/gap/drift knobs,
`WORKFLOW_DEMO_FIXTURE_DIR` lets a demo run feed real artifacts to downstream `tool`
phases: when `<dir>/<phaseId>/<produces>` exists it is copied as the work product (the
verdict tag, if any, is appended); otherwise the usual placeholder text is written.

### Loop and escalation

```
Phase failed (or qualify: gap/drift/missing) and has loop.to
  → retry count < loop.maxRetries?
      Yes → find the escalation rung for the current retry count
            add failure context to the prompt (including the verdict, for qualify)
            re-run the phase with a (possibly higher) model/thinking
            (drift goes to loop.driftTo, gap/error to loop.to)
      No  → PARKED, or then.fail if it exists
```

**Escalation ladder** — successive "rungs":

- rung 1 after the first failure: e.g. `sonnet` + `medium`
- rung 2 after the second failure: e.g. `opus` + `high`

Rung definitions are optional — if missing, the phase retries with the same
model.

### Handoff files (consumes / produces)

Files shared between a workflow run's phases:

- Stored in the workflow run's sandbox directory.
- Each phase dispatch gets its own numbered folder `NN_<phaseId>` (e.g.
  `01_developer`, `02_code-review`, `03_developer`) in call order — a repeated
  run of the same phase via `loop` doesn't overwrite the previous output. The
  folder name is stored on `StageRun.dir`; older runs without numbers
  (`developer/`) stay readable (the lookup falls back to the bare `phaseId`).
- `produces: spec.md` → this phase writes `spec.md`.
- `consumes: spec.md` → this phase reads `spec.md` as input.
- **P1-T2:** a `consumes` handoff is a RELATIVE symlink to the source
  `produces` file of the previous phase (`placeHandoff()`), not a copy — so
  the agent reads the real artifact, not an independent duplicate that could
  (say, through an accidental edit) become a source of drift. The relative
  target (`path.relative` from the symlink's directory) survives moving the
  whole run folder. Once a phase finishes `done`, its `produces` file is
  `chmod`ed to `0o444` (read-only) — a later phase can't accidentally
  overwrite it through the symlink; this has no effect on `checkpointPhase`
  (the git checkpoint worktree), which only reads that file (for the commit
  summary) and commits a different directory (the worktree, not the
  sandbox). Deleting the whole run folder (`fs.rm`) is unaffected by
  read-only files — deletion goes through the parent directory's
  permissions, not the file's own. The sandbox grant (`--add-dir`) is
  widened to the whole run's root (not just the phase's own sandbox) on a
  `consumes` handoff, since the symlink may point into a sibling phase's
  folder.

### `context/` and `output/` (P1-T3)

Besides the per-phase sandboxes (`NN_<phaseId>`), a run's root has two shared
folders, created in `start()`:

- **`context/`** — workflow-level inputs, shared across the whole run (not a
  handoff between phases). Every phase sees it through a relative symlink
  `<sandbox>/context -> ../context` (the same style as the P1-T2 handoff).
  Files are `chmod`ed to `0o444` once written — they're input to the whole
  run, not owned by one phase. The only content today: `context/input.md` —
  the operator/task input (formerly `<run>/input.md`; once also chain-fed, before
  chains were retired); it's the only "workflow-level input" concept in the
  code (no other file plays this role), read exactly once, inside the same
  `start()` call that writes it — so older runs have no separate READ path
  that needs backward compatibility.
- **`output/`** — the canonical source for output delivery
  (`resolveOutputSource`). Instead of searching for a phase where
  `produces === from`, `deliverFileOutput` / `parkOnPrOutput` /
  `openPrOutput` read `output/<from>` directly — on first read, a relative
  symlink to the producing phase's current `produces` file is lazily
  (idempotently) created there (the same style as the handoff). Older runs
  on disk without an `output/` folder (pre-P1-T3) fall back to the original
  by-phase search.

### Parking

A run parks when:

- the `loop` is exhausted (`maxRetries` reached) and there's no `then.fail`,
- or explicitly via `then: { fail: park }`,
- or a phase with `approval: ask` finished (`parkedReason: "gate"`),
- or the run's spend passed its `budget` cap (`parkedReason: "budget"`).

A parked workflow run:

- Is durable (survives an API restart) for the parks that have no live child:
  `retries`, `output`, `gate` and `budget`. An `approval` park (a live stage child
  blocking on a gate decision) does not survive — its child dies with the API.
- Shows up in the UI with a human-review option.
- Can be manually decided by the operator (resume / abandon).
- Writes a `workflow-parked` event to the activity log.

## Consistency after a restart

Same as for agent runs: `WorkflowRunnerService` checks running stage runs on
init and reconciles orphaned `running` → `interrupted`.

Runs parked `retries`, `output`, `gate` or `budget` are **left parked** on reconstruct:
their `pendingGate` / `pendingOutput` / `parked` detail is in the persisted aggregate,
and the matching `workflow-gate` / `workflow-output` approval resumes them after the
restart.

A restart also drops every in-memory `EmployeeAllocator` lease (the allocator
holds no persisted state) — a stage found `running` with a dead PID
reconciles to `interrupted` same as always, and a subsequent resume/retry
re-acquires its lease fresh rather than assuming one is still held.

<!-- ZibbyCorp ZB-05a (2026-09-25): recordArtifact gains the chain-step emitter (fail-soft, like the scout emission). -->

<!-- Publishing factory P1/P4 (2026-10-01): tool phase, approval: ask, budget, default project, run-folder line in the stage task, WORKFLOW_DEMO_FIXTURE_DIR. -->

## Rename from "pipeline" (2026-10-02)

"Pipeline" is now "Workflow" everywhere (API `/api/workflows`, `workflowId` /
`workflowRunId`, `.workflow.md`, `.zibby/data/workflows/`). On boot `main.ts` runs the
idempotent `migrateWorkflowRename` (`apps/api/src/shared/migrations/workflow-rename.ts`)
**before** any module reads the data root: it moves `pipelines/` → `workflows/`, renames
`*.pipeline.md`, and rewrites only the known persisted keys/values (`pipelineId`,
`pipelineRunId`, `kind|type|targetKind|makerKind|actorKind: "pipeline"`, `pipeline-stage`,
`pipeline-started|finished|parked`, a phase's `pipeline:` field, `AUTO:PIPELINES` markers) in
JSON/JSONL and in workflow/goal frontmatter. Free text is never rewritten. A per-machine
marker (`.zibby/data/.workflow-rename.done`, git-ignored) makes it run once; an interrupted
run is simply re-run. The old env names (`PIPELINES_DIR`, `PIPELINE_RUNS_DIR`,
`PIPELINE_DEMO_*`) are still read as a fallback. Old web URLs (`/pipelines…`) redirect.
