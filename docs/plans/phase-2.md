Phase 2 — The delivery loop

Context

ROADMAP.md Phase 2: the Architekt → Kodér ⇄ Code-Review → Tester → Dokumentátor
cycle as a bounded state machine that parks instead of thrashing. Four sub-items:
2.1 deterministic verify stage, 2.2 loop-aware authoring UI, 2.3 escalating retries +
parked queue, 2.4 the seeded delivery pipeline.

Builds directly on Phase 1 (docs/plans/phase-1.md): preflight + 503 refusal exist,
pipeline stage gates/resume are wired (onIntent + holdForApproval → aggregate
"parked" + approvals kind "pipeline-stage"), waitForStage waits until terminal,
runs carry taskId, restart reconciliation flips parked → failed.

Verified ground truth that shapes the design:

- Loop machinery already exists and is tested: PhaseLoopSchema { to, maxRetries,
  escalate, then } (pipeline.schema.ts:11–16), retry counting in an in-memory Map
  (pipeline-runner.service.ts:247–248), failure tail written to
  `<phaseId>.failure.txt` and used as the retry handoff (lines 255, 334–345),
  escalate adds a synthetic error stageRun, then `then` jumps or fails (260–280).
  e2e covers loop-back + maxRetries fuse (pipelines.e2e.test.ts:115–151).
- "parked" exists in PipelineStateSchema but today means awaiting-approval (Phase 1
  uses it for stage gates; web run.ts:62–70 maps parked → awaiting-approval).
  2.3's retries-exhausted parking is a *different* parked: no live child, durable,
  resumable with a note — the two must be distinguishable.
- PipelinePhaseSchema requires agent/model/thinking/consumes/produces on every
  phase — a verify stage has none of agent/model/thinking, so the schema needs a
  `type` discriminator with conditional requirements (superRefine pattern already
  in place at pipeline.schema.ts:52–73).
- ProjectSchema (project.schema.ts:20–26) has no `checks` field; the `project`
  param on StartPipelineRunSchema is accepted but intentionally unused by the
  runner (pipeline-runner.service.ts:99–100).
- RunnerCore is command-agnostic — buildStageCommand() already branches
  demo/claude (pipeline-runner.service.ts:357–378); a third shell branch gets
  logs/sidecar/SSE/status for free. Verify stages never raise intents, so they
  bypass the Phase 1 gate path naturally.
- Web: edit/duplicate buttons on pipelines Screen.tsx:119–120 are stubs;
  NewPipelineDialog is plain-state, create-only, no loop fields; PhaseChain
  *already renders* back-edge arcs with maxRetries (PhaseChain.tsx:101–134).
  updatePipeline/deletePipeline contract endpoints exist; there is no duplicate
  endpoint and no useUpdate/useDelete/useDuplicate mutations.
- Pipelines are committed `.pipeline.md` files discovered at runtime (no seed
  script); e2e isolates via ZIBBY_DATA_DIR=apps/api/data-test. Classifier builds
  its catalog dynamically from pipelines.list() — desc is the routable signal
  (task-classifier.service.ts:104). Classifier tests live in
  keyword-scorer.test.ts (no task-classifier.service.test.ts).
- The retries Map is in-memory only — parking must persist it (and the failure
  pointer) in run.json or resume-after-restart can't work.

Decisions taken (defaults chosen, flag if you disagree):

1. Parked disambiguation: new optional `parkedReason: "approval" | "retries"` on
   PipelineRunSchema. Phase 1's holdForApproval path sets "approval"; 2.3 sets
   "retries". Web maps parked+approval → awaiting-approval (unchanged) and
   parked+retries → new first-class "parked" RunStatus. Restart reconciliation
   becomes reason-aware: approval-parked → failed (child died with the API, the
   Phase 1 decision stands); retries-parked stays parked (no child — durable).
2. Parking trigger: `then` gains the literal "park" (alongside phase ids and
   "fail"). Existing pipelines keep their exact semantics; the delivery pipeline
   opts in with `then: park`. Escalate-marker behavior is untouched.
3. Verify cwd: project.path when the run was started with a resolvable project,
   else the stage sandbox. (Worktrees are Phase 3 — until then verify runs against
   the project checkout directly, which is also what the operator does by hand.)
4. Duplicate = client-side createPipeline with copied body + new id (no new
   endpoint; create already returns 409 on collision).
5. Claude stages of a project-targeted run spawn with cwd = project.path, not
   the stage sandbox — --add-dir grants file access but loads no context; the
   target's real CLAUDE.md/.claude (skills, hooks, settings) only apply with
   cwd inside the repo. Sandbox stays the artifact home, granted via --add-dir
   in the reverse direction; handoff paths must be passed absolute. Registering
   a project = trusting its repo config (its settings/hooks execute on spawn);
   ZIBBY's approval hook via --settings + the locked floor apply regardless.
   No project resolved → sandbox cwd unchanged (demo/e2e deterministic).
   Phase 3 worktrees replace the checkout with a worktree, same cwd rule.

Implementation order: 2.1 → 2.3 → 2.2 → 2.4. (2.3 before 2.2 so the authoring UI
can expose `then: park` + escalation; 2.4 needs 2.1 and 2.3.)

---

2.1 Deterministic verification phase — ✅ HOTOVO

Contracts (libs/contracts/src/pipelines/pipeline.schema.ts + projects/project.schema.ts):

- PipelinePhaseSchema gains `type: z.enum(["agent", "verify"]).default("agent")`;
  agent/model/thinking become optional at the object level, with superRefine
  enforcing: type "agent" requires all three (so every committed file stays
  valid via the default), type "verify" forbids agent and allows optional
  `commands: z.array(z.string().min(1))` (per-phase override). consumes/produces
  become optional on verify phases only.
- ProjectSchema gains optional `checks: z.array(z.string().min(1))`.
- Default checks constant exported from contracts (shared by API + web display):
  `["pnpm lint", "npx tsc --noEmit", "pnpm test"]`.

Runner (apps/api/src/pipelines/pipeline-runner.service.ts):

- buildStageCommand() gets a verify branch ahead of the demo/claude split:
  resolve commands (phase.commands ?? project.checks ?? defaults), run via
  `["/bin/sh", "-c", commands.join(" && ")]` through the same RunnerCore spawn —
  logs, sidecar, statuses, SSE all come for free; exit 0 → done, else error.
- Resolve the project: StartPipelineRunSchema.project → ProjectsStorage lookup;
  store resolved path on the aggregate (new optional `projectPath` on
  PipelineRunSchema) so restart/parking keep it. Missing/unresolvable project →
  verify runs in the stage sandbox (deterministic for demo/e2e).
- The same resolved projectPath drives stage cwd across the board (decision 5):
  the claude branch of buildStageCommand sets spawn cwd = projectPath when
  present (sandbox otherwise) so the target project's real context loads; the
  stage sandbox is passed via --add-dir and all handoff/intent paths in the
  prompt and env stay absolute. Demo branch is untouched (sandbox cwd).
- Handoff: a successful verify leaves handoffSource untouched (it transforms
  nothing — the next phase consumes the last *producing* phase's output). On
  failure the existing `<phaseId>.failure.txt` mechanism applies unchanged, which
  is exactly the "failure tail as context" the roadmap asks for.
- Verify stages run identically in demo and claude mode (no claude spawn → no
  preflight refusal, no intents, no gates).

Web: PhaseChain + NewPipelineDialog/PipelineRunModal render verify phases with a
distinct glyph and "checks" label instead of agent/model/thinking badges (read
side only here; authoring comes in 2.2).

Tests: unit (command assembly: phase override > project checks > defaults;
handoff passthrough; result mapping; claude-stage spawn cwd = projectPath when
resolved / sandbox when not, sandbox present in --add-dir); e2e in
pipelines.e2e.test.ts: pipeline
agent→verify→agent against a fixture project whose check script fails on first
invocation then passes (marker-file script in test/fixtures/), asserting
loop-back to the agent phase and eventual done; web-components snapshot of a
verify node in PhaseChain.

2.3 Escalating retries + parking surfaced — ✅ HOTOVO

Contracts:

- PhaseLoopSchema gains optional
  `escalation: z.array(z.object({ model: AgentModelSchema.optional(), thinking: AgentThinkingSchema.optional() }))`
  — attempt n (1-based retry) applies escalation[n-1], later attempts clamp to
  the last entry. `then` accepts literal "park" (superRefine updated).
- PipelineRunSchema gains optional `parkedReason`, `parked: { phaseId, attempts,
  failureFile, note? }`, `retries: z.record(z.number())`, `projectPath` (2.1).
- New endpoint in pipelineRunsContract: POST
  /api/pipelines/runs/:pipelineRunId/resume, body `{ note: z.string().optional() }`,
  200/404/409 (409 when the run isn't retries-parked — approval-parked resumes
  only via the Phase 1 approvals path, keeping one gate).

Runner:

- runStage() applies the escalation override for the current attempt before
  building the claude command (model/thinking already thread through per
  Phase 1 / claude-run-command.service.ts opts).
- Exhaustion with `then: "park"`: write aggregate status "parked" +
  parkedReason "retries" + parked detail + persisted retries map, emit SSE,
  drive() returns. No synthetic error marker on the park path (the parked detail
  is the surface).
- resumeParked(pipelineRunId, note): guard parkedReason === "retries"; write
  note to `<phaseId>.note.md` in the run root and append it to the failure
  context file (so the retried phase sees failure + operator note in one
  handoff); reset the parked phase's retry counter; status → "running"; re-enter
  the drive loop at loop.to with handoffSource = failure context file. Driver
  must be re-enterable from a phase cursor — extract the loop body so both
  start() and resumeParked() drive the same machine.
- Restart reconciliation (the Phase 1 reconstruct() extension): branch on
  parkedReason — "approval" → failed (unchanged), "retries" → keep parked
  (rebuild in-memory registry entry from run.json including retries map).

Web:

- run.ts: parked+retries → new RunStatus "parked" (badge tone: warn); RunView
  carries parked detail. parked+approval keeps mapping to awaiting-approval —
  RunApprovalGate and Phase 1 prefix matching are untouched.
- runs Screen.tsx: "parked" filter row; RunDetail: parked panel showing the
  failure tail (via existing getStageRunLogs for the failed stage's last
  attempt), a note TextArea, and a Resume button →
  new useResumePipelineRunMutation (invalidates runs + pipeline-run keys).
- Overview right rail: parked section listing retries-parked runs (reuse the
  runs query — filter client-side; no new endpoint), linking into /runs.
- i18n: runs.parked, runs.parkedContext, runs.resumeWithNote, runs.resumeNote
  placeholder (cs + en).

Tests: unit (escalation ladder incl. clamp; park path bookkeeping; resume resets
counter + injects note; reason-aware reconcile); e2e: retries exhaust with
`then: park` → parked + parkedReason retries → resume with note → phase re-runs
and run completes; restart while retries-parked → still parked; web-components:
parked queue rendering + resume-with-note fires the mutation.

2.2 Loop-aware pipeline authoring UI — ✅ HOTOVO

All in apps/web/features/pipelines/:

- Refactor NewPipelineDialog into a single PipelineDialog with
  `mode: "create" | "edit"` + optional `initial: Pipeline` (keep the existing
  plain-state pattern — it already manages a dynamic phase array; @zibby/forms
  buys little here). Keep NewPipelineDialog as a thin create-mode wrapper so the
  existing test file and Screen import stay stable.
- Per-phase additions: type picker (agent | verify — verify swaps the agent
  select for an optional commands list), loop editor (toggle; `to` select limited
  to earlier phases; maxRetries number; escalate toggle; `then` select of phase
  ids + "fail" + "park"; optional escalation ladder rows of model/thinking per
  attempt). Submit emits `phases[].loop` exactly per PhaseLoopSchema.
- Mutations: new useUpdatePipelineMutation (PATCH updatePipeline; invalidates
  getPipelinesQueryKey) and useDuplicatePipelineMutation (createPipeline with
  copied body + derived unique id per decision 4); export from mutations/index.ts.
  Wire Screen.tsx:119–120 stubs: edit opens PipelineDialog in edit mode,
  duplicate calls the duplicate mutation and selects the copy.
- PhaseChain: back-edge arc + maxRetries already render — add attempt counts when
  a current run is supplied (optional `attempts: Record<phaseId, number>` prop
  derived from stageRuns; shown as "attempt 2/3" on the looped node) and a
  distinct verify-node rendering (2.1).
- i18n keys for every new control (cs + en); DS-only primitives, no new local CSS.

Tests: web-components — PipelineDialog edit mode pre-fills and PATCHes only
changed fields; loop editor produces a schema-valid `loop` payload incl.
`then: park` + escalation rows; duplicate produces createPipeline with new id.
Playwright (extend e2e/pipeline-run.spec.ts or new pipeline-edit.spec.ts, demo
mode): edit a pipeline, add a loop, run it with PIPELINE_DEMO_FAIL_PHASES forcing
one failure, assert the retry visualization (attempt count on the node).

2.4 The delivery pipeline, seeded

- Seed apps/api/data/pipelines/delivery.pipeline.md (and a copy in
  apps/api/data-test/pipelines/ for deterministic e2e):
  task.md → architekt (plan.md, opus/high) → koder (implementation.md,
  sonnet/medium) → review (review.md, opus/high, loop { to: koder, maxRetries: 3,
  escalate + ladder, then: park }) → verify stage (type: verify, project checks,
  loop { to: koder, maxRetries: 3, escalate, then: park }) → dokumentator
  (docs.md, sonnet/low). Tester *is* the verify stage — four agent files, not
  five: architekt.md, koder.md, code-review.md, dokumentator.md in
  apps/api/data/agents/ (frontmatter per AgentSchema: glyph, model, thinking,
  tools, category "Delivery"; instructions describe role + handoff contract).
  Handoffs stay single files (the runner's placeHandoff is fs.copyFile — the
  roadmap's `implementation/` directory handoff is out of scope until the
  runner copies trees; implementation.md carries a change summary instead).
- desc carries the routable signal in both languages ("build / fix / implement a
  feature or bug in a project; deliver, postavit, opravit, implementovat") —
  the classifier catalog picks it up automatically; no classifier code change.
- Tests: keyword-scorer.test.ts gains the delivery candidate — "fix the failing
  test in project X" / "oprav rozbitý test" routes to it ahead of single agents;
  e2e (demo mode, data-test seed): run delivery with PIPELINE_DEMO_FAIL_PHASES
  forcing one review failure → loop-back to koder → done, asserting attempt
  counts and handoff files (plan.md → implementation.md → review.md → docs.md)
  exist in the run tree; second variant: exhaust retries → parked (ties 2.3 and
  2.4 together).

---

Verification

After each sub-item: pnpm lint → npx tsc -p apps/web/tsconfig.json --noEmit (rtk
typecheck lies) → pnpm test → pnpm exec vitest run --project web-components.

Phase exit: pnpm e2e green on a clean tree (the 2 quarantined pipeline e2e tests
stay quarantined — verify unchanged on a stashed tree, don't chase). Then the
manual proof per the roadmap exit criterion: "fix this failing test in project X"
typed as a task → classifier routes to delivery → pipeline loops on red checks →
finishes green, or exhausts retries and lands in the parked queue with failure
context — and resume-with-note from /runs continues it.

Watch-outs:

- Schema changes (phase type, loop.then "park", parkedReason) touch committed
  data files and Phase 1's parked handling — run the full pipelines e2e after
  each contract change, and keep `type` defaulted so every existing
  .pipeline.md parses unchanged.
- The web parked→awaiting-approval mapping is load-bearing for Phase 1 approvals;
  only split it on parkedReason, never on status alone.
- Verify against project.path mutates nothing but runs real commands in a real
  checkout — keep e2e on fixture projects only; never point a test at a live
  repo.
- cwd = project.path means the target repo's .claude settings and hooks execute
  in the spawned process — that is the point (real conventions apply), but it
  is a trust decision: only operator-registered projects, and the gate hook +
  locked floor ride along via --settings either way. Anything in the run
  command that was relative to the sandbox cwd (handoff files, intent-request
  watcher paths, log targets) must be absolute or it silently breaks when cwd
  moves.
