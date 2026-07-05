# Pipeline Orchestration

## Pipeline — definition

A pipeline is a Markdown file with YAML frontmatter at
`apps/api/data/pipelines/<id>.pipeline.md`.

### Frontmatter fields

```yaml
id: delivery-loop
name: Delivery Loop
desc: "Architekt → Kodér ⇄ Code-Review → Tester → Dokumentátor"
phases:
  - id: architekt
    type: agent
    agent: architekt
    model: opus # overrides the agent's default model for this phase
    thinking: high
    produces: spec.md # handoff file for the next phase

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
      - pnpm typecheck
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
  - type: file # writes review.md into the project (on a zibby/* branch)
    from: review.md
    dest: project
    to: reports/review.md
```

The body of the `.md` file is the instructions for the whole pipeline
(context hint).

### Outputs (`outputs`) — delivery sinks

What happens to finished work is **not done by any agent** (it used to be a
`pr-autor` agent), but is pipeline-level configuration instead. `outputs` is
an array of terminal sinks the runner processes after the phase loop goes
green — deterministic, system-owned (no agent, no model, no tokens; the
output-side counterpart of the `verify` phase). A pipeline can have more than
one (open a PR _and_ write a report). Each sink draws from `from` — a
relative path some phase `produces`.

| `type` | Fields               | What it does                                                                                                                                                                                                       |
| ------ | -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pr`   | `from`               | Composes a PR from `from` (Markdown `# title` + body) and opens it via `git push && gh pr create`. **Always parks for approval** — the PR is the gate, enforced structurally by the system (Law 3), not by agent config.  |
| `file` | `from`, `dest`, `to` | Copies `from` to `to` — into the project worktree (`dest: project`, on a `zibby/*` branch) or as a vault note (`dest: vault`, a durable second-brain record for pipelines whose result is information, not code). |

A `pr` sink parks the aggregate with `parkedReason: "output"` (durable across
a restart — the phase loop has already finished, no live child), writes
`pr-draft.md` + `diffstat.txt` as the decision surface, and opens an approval
of `kind: "pipeline-output"` (runId = pipelineRunId). Approval → the system
runs the gated push and the run finishes `done`; rejection → the work stays
on the branch without a PR (the run is still `done`). `file` sinks are Tier-1
and run immediately.

**Per-run override.** When the pipeline is the target of a directed task that
carries its own `output` (the New Task dialog — see
[tasks.md](./tasks.md)), that choice **overrides** the declared `outputs:`
for that run: it's stored as `PipelineRun.outputsOverride` (`void` → `[]`,
which suppresses even a declared PR) and the runner reads
`outputsOverride ?? outputs`. `from` is derived from the pipeline's last
`produces` (a task carries no `from`).

### Artifact registry (N2a) — provenance records

Every successful delivery writes a **durable provenance record** to the
artifact registry — one plain-JSON file under `ARTIFACTS_DIR` (default
`ZIBBY_DATA_DIR/artifacts`), owned by `ArtifactsStorageService` (the
`artifacts/` module — see `docs/api/artifacts.md`). A record carries `kind`
(`vault-note` | `project-file` | `pr`), `locator` (note id / project path /
PR URL), `from` (the handoff name), and `producedBy` (`runRef`,
`pipelineId`, `taskId?`, `projectId?`). The record id is the stable
`<runRef>_<kind>_<slug(from)>` — an idempotent re-delivery replaces the
record rather than duplicating it. The write is best-effort: a registry
failure never fails an (already green) delivery. A failed delivery writes no
record — provenance is never faked. The registry is read-only over HTTP:

```
GET /api/artifacts                    list records (newest-first; ?projectId= &pipelineId=)
GET /api/artifacts/:id                one record
```

The registry is the foundation for pipeline chaining (N2b, see
`docs/api/chains.md`): a downstream pipeline anchors its input on an
upstream output's record, so a chain survives a restart or the source run
being evicted from memory.

### CRUD API

```
GET    /api/pipelines           list every pipeline
POST   /api/pipelines           create a pipeline
GET    /api/pipelines/:id       pipeline detail
PUT    /api/pipelines/:id       update a pipeline
DELETE /api/pipelines/:id       delete a pipeline
```

## Starting a pipeline run

> **A pipeline only starts via a task.** No operator path starts it
> directly — a task is created (`POST /api/tasks`) with target
> `{ kind: "pipeline", id }`; the scheduler internally calls
> `PipelineRunnerService.start(...)`. The only per-kind run endpoint that
> remains is the catalog-liveness `GET /api/pipelines/runs` (running +
> just-finished runs, for retry counters in the catalog).

### Pipeline Run lifecycle

```
running → done       (every phase passed + outputs delivered)
        → failed     (a phase failed, retry/escalation were exhausted, and there's no then.fail)
        → parked     (the loop was exhausted → durable parking for human review;
                      or a `pr` output is waiting on the gate → parkedReason "output")
```

### Log polling (unified surface)

Detail, stage logs, artifacts, resume, and delete for a pipeline run all live
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

## PipelineRunnerService

**File:** `apps/api/src/pipelines/pipeline-runner.service.ts` (~84 KB)

### Phase: agent

1. Loads the handoff file (`consumes`) from the previous phase (if any).
2. Builds the prompt = pipeline prompt + phase instructions + the handoff file's content.
3. Calls `RunnerCore.spawn()` for a `pipeline-stage` kind.
4. Waits for it to finish (polling the sidecar status).
5. Reads the output from the `produces` file (or the log's last N lines).
6. Evaluates the result (success / failure).

### Phase: verify

Deterministic commands — no agent, no tokens, no intents:

1. Runs each command from the `commands` array (in sequence).
2. Exit code 0 = pass, anything else = fail.
3. Command logs are appended to the pipeline run log.

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

Files shared between a pipeline run's phases:

- Stored in the pipeline run's sandbox directory.
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

- **`context/`** — pipeline-level inputs, shared across the whole run (not a
  handoff between phases). Every phase sees it through a relative symlink
  `<sandbox>/context -> ../context` (the same style as the P1-T2 handoff).
  Files are `chmod`ed to `0o444` once written — they're input to the whole
  run, not owned by one phase. The only content today: `context/input.md` —
  the N2b chain-fed input (chained content from `chain-runner`, formerly
  `<run>/input.md`); it's the only "pipeline-level input" concept in the
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
- or explicitly via `then: { fail: park }`.

A parked pipeline run:

- Is durable (survives an API restart).
- Shows up in the UI with a human-review option.
- Can be manually decided by the operator (resume / abandon).
- Writes a `pipeline-parked` event to the activity log.

## Consistency after a restart

Same as for agent runs: `PipelineRunnerService` checks running stage runs on
init and reconciles orphaned `running` → `interrupted`.
