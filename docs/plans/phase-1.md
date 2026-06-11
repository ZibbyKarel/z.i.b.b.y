Phase 1 — Trustworthy autonomous core

Context

ROADMAP.md Phase 1 (lines 49–107): one task typed into NewTaskDialog must run a real
multi-phase pipeline end-to-end — pause on approval, resume after it, and report its
outcome. Four sub-items: 1.1 Claude preflight, 1.2 pipeline stage gates + resume,
1.3 task → run → outcome linkage, 1.4 real mode as the supported path.

Verified ground truth that shapes the design:

- GET /api/health returns only { status: "ok", uptime, timestamp }
  (apps/api/src/health/health.controller.ts, schema libs/contracts/src/health/health.schema.ts).
  No preflight exists; CLAUDE_BIN is read ad hoc at claude-run-command.service.ts:184.
- PipelineRunnerService constructs its RunnerCore without onIntent
  (pipeline-runner.service.ts:79–85), so ApprovalsService.register("pipeline-stage", …)
  resume is a no-op. Trap: waitForStage (pipeline-runner.service.ts:311–317) returns
  on any non-running status — holdForApproval flips a stage to awaiting-approval,
  which the driver would misread as stage completion. Must change to wait-until-terminal.
- Immediate task dispatches are never persisted (task-scheduler.service.ts:82–84) —
  outcome write-back has nowhere to land without adding persistence.
- Agent e2e seam is CLAUDE_BIN=test/fixtures/fake-claude.mjs (writes intent-request.json,
  the real Variant B trigger); pipelines additionally have demo-stage.mjs (no intent capability).
- Web approval matching is exact approval.runId === run.runId (RunDetail.tsx:60);
  stage runIds are ${pipelineRunId}.${phaseId}\_… so pipeline rows need prefix matching.

Operator decisions (asked & confirmed):

1.  Parked pipeline at restart → honest reconcile to failed (visibility, not resumption —
    the blocking child died with the API; mirrors agent Variant B behavior).
2.  Preflight refusal = HTTP 503 + reason on interactive run start; scheduler-fired
    dispatches mark the task record failed with the reason. No dead run records.
3.  Auth probe = version-check now, auth check behind a private-method seam, exact
    mechanism confirmed during the 1.4 smoke audit.

Implementation order: 1.1 → 1.2 → 1.3 → 1.4 (fake-claude --version handling is a
prerequisite for everything else not regressing; 1.4's manual audit comes after the
builder is final).

---

1.1 Claude preflight — ✅ HOTOVO

New ClaudePreflightService — apps/api/src/runner/claude-preflight.service.ts,
provided + exported by the runner module so Health/Agents/Pipelines can inject it. ↓
↓

- Probe: spawn ${CLAUDE_BIN ?? "claude"} --version, ~5s timeout.
  ENOENT → { ok: false, reason: "missing" }; non-zero/timeout → { ok: false, reason: <message> }; ↓
  success → { ok: true, version }. Auth check is a private method stub (returns ok)
  until the 1.4 audit pins the real mechanism. ↓
- Cache: in-memory TTL — 30s for ok, 5s for failure; probe({ force }) escape hatch.
- Contract: HealthSchema → status: z.enum(["ok", "degraded"]) + ↓
  claude: z.object({ ok: z.boolean(), version: z.string().optional(), reason: z.string().optional() }).
  degraded when claude.ok === false. ↓
- Refusal: new ClaudeUnavailableError(reason) thrown from AgentRunnerService.launch()
  (agent runs are always claude-shaped) and PipelineRunnerService.start() only when ↓
  AGENT_RUNNER_MODE === "claude" (demo pipelines keep working). Controllers map it to
  503 — add the 503 response to the run-start contracts. TaskSchedulerService.tick() ↓
  already catches dispatch errors → markFailed carries the readable reason for free.
- Test seam: extend apps/api/test/fixtures/fake-claude.mjs to answer --version ↓
  (print fake version, exit 0) before its main flow — otherwise every run-starting e2e
  has preflight execute fake-claude's main path. ↓

Files: create claude-preflight.service.ts + .test.ts; modify runner module, ↓
health.schema.ts/health.contract.ts, health.controller.ts/health.module.ts,
agent-runner.service.ts, pipeline-runner.service.ts, run-start contracts + both runs ↓
controllers, fake-claude.mjs, apps/api/test/health.e2e.test.ts.
↓
Web: apps/web/features/overview/SummaryWidget.tsx gains a degraded state (between
online/offline; existing StatusDot warn tone + HudPanel tone system). Extract pure ↓
derivation into features/overview/healthPresentation.ts + test. i18n keys
overview.systemDegraded, overview.claudeUnavailable (cs + en). ↓

Tests: unit (mocked spawn: missing/error/ok/timeout + cache TTL); e2e: health degraded ↓
(CLAUDE_BIN=/nonexistent) and ok (fake-claude) shapes + one 503 refusal on run start;
web-components test for the degraded banner. ↓

1.2 Pipeline stage gates + resume — ✅ HOTOVO ↓

All in apps/api/src/pipelines/pipeline-runner.service.ts (pattern donor: ↓
agent-runner.service.ts:178–245); PipelinesModule imports GatesModule + ApprovalsModule.
↓

- Wire onIntent into the pipeline RunnerCore constructor. New onStageIntent(stageRunId, action):
  resolve stage → pipelineRunId/phaseId → phase agent → gates.rulesForAgent → ↓
  gates.evaluate. deny → core.denyIntent; ask → core.holdForApproval(stageRunId)
  (stage sidecar already supports awaiting-approval), flip aggregate status = "parked" + ↓
  writeAggregate (fires SSE; web already maps parked → awaiting-approval and invalidates
  approvals), then approvals.requestApproval({ kind: "pipeline-stage", runId: stageRunId, … }); ↓
  else allow.
- Fix waitForStage: loop while status is "running" or "awaiting-approval"; ↓
  return only on terminal (done/error/interrupted). The driver's await then rides
  through the pause and the same phase continues after approval (Variant B decision ↓
  file unblocks the live child — no restart).
- Register in onModuleInit: approvals.register("pipeline-stage", { resume, cancel }). ↓
  resume(stageRunId) → core.resume() + aggregate back to "running" + writeAggregate.
  cancel(stageRunId) → core.cancel() → stage interrupted → driver takes the existing ↓
  failure path (loop back-edge if configured, else run failed — matches "reject → failed").
  Guard in the driver: if run.status === "parked" at stage completion, reset to "running". ↓
  Make resume/cancel tolerant of RunNotFoundError (log + no-op).
- Restart reconciliation: extend reconstruct() (~line 423) to reconcile aggregates left ↓
  "parked" → "failed" (same treatment as "running"), per operator decision.
- Web prefix matching: pure helper approvalForRun(queue, run) in ↓
  apps/web/features/runs/run.ts — exact match, plus for kind === "pipeline" match
  a.runId.startsWith(run.runId + "."). Use it in RunDetail.tsx (and runs Screen.tsx ↓
  if it matches on its own). Unit-test the helper.
- e2e seam: AGENT_RUNNER_MODE=claude + CLAUDE_BIN=fake-claude.mjs + its intent env — ↓
  exercises the production claude stage branch and the real intent-request.json watcher;
  zero changes to demo-stage.mjs. (placeHandoff tolerates a missing produces file.) ↓

Tests: unit pipeline-runner.service.test.ts (resume bookkeeping with mocked ↓
core/gates/approvals; waitForStage rides through awaiting-approval; parked reconcile);
e2e in pipelines.e2e.test.ts: park on gated intent → approve → done; reject → failed; ↓
parked-at-restart → failed. Leave the 2 quarantined flaky pipeline tests alone.
↓
1.3 Task → run → outcome linkage — ✅ HOTOVO
↓

- Persist immediate tasks: createTask immediate path persists a record with
  status: "dispatched", runRef, target after successful dispatch (new storage method ↓
  on scheduled-tasks.storage.service.ts). EmptyCatalogError keeps throwing 422 without
  persisting. Add the persisted task to the dispatched variant of CreateTaskResultSchema. ↓
- taskId on runs: optional taskId in agent-run.schema.ts + pipeline-run.schema.ts;
  thread through AgentRunnerService.start/startOrchestrator/launch (via spec.extra + ↓
  agent-run.record.ts), PipelineRunnerService.start(pipelineId, taskId?), and
  TaskSchedulerService.dispatch(…, taskId) — generate the task id before dispatch so ↓
  the run is born linked (tick path passes task.id).
- Outcome write-back, two layers: ↓
  a. Fast path: scheduler subscribes to agentRunner.onRunStatus + pipelineRunner.onRunStatus
  in onModuleInit; on terminal status of a run carrying taskId, write the outcome. ↓
  b. Catch-up sweep on init (init-order-proof, restart-durable): every dispatched task
  without outcome → resolve runRef against the matching runner; if terminal, write. ↓
- Outcome shape on ScheduledTaskSchema: optional
  outcome: { status: "done" | "error", summary: string, finishedAt: datetime } — existing ↓
  status enum untouched (failed keeps meaning dispatch failed). interrupted/pipeline
  failed map to error. Summary: last non-empty log line (agents, truncated ~200 chars) ↓
  or "<n> stages, <status>" (pipelines). Idempotent writeOutcome(id, outcome) in storage.
  listScheduledTasks carries the new fields automatically — no new endpoint. ↓
- Web: RunView gains taskId; useRunsQuery builds a taskId → task lookup from the
  scheduled-tasks data it already fetches and enriches run views with taskTitle/taskOutcome ↓
  (dispatched tasks stay hidden as separate feed rows — the run row is the canonical card).
  TaskCard.tsx renders a task-origin line + outcome badge; RunDetail.tsx a MetaCell ↓
  "task X → succeeded/failed". i18n keys runs.metaTask, runs.taskOutcome.done/error (cs+en).
  ↓
  Tests: unit beside scheduler/storage (outcome mapping, sweep); e2e in tasks.e2e.test.ts
  (immediate task with fake-claude → run finishes → task record holds outcome.status: "done" + ↓
  summary; failed-run variant); extend TaskCard.test.tsx for the outcome badge.
  ↓
  1.4 Real-mode pipelines as the supported path — ✅ HOTOVO (smoke audit 10/10 na tomto stroji; auth mechanismus = `claude auth status` → loggedIn)
  ↓
- Smoke script apps/api/scripts/claude-smoke.mjs (standalone Node, no Nest boot):
  (1) preflight probes (--version + auth — this is where the 1.1 auth seam gets its real ↓
  implementation), (2) one trivial real run mirroring the full flag matrix from
  claude-run-command.service.ts:154–185 (-p, --permission-mode dontAsk, --allowedTools, ↓
  --append-system-prompt, --agents, --settings approval hook, --output-format stream-json,
  --model haiku), asserting exit 0 + parseable result; per-flag-group pass/fail table so ↓
  CLI drift is visible. Honours CLAUDE_BIN. (3) context-loading probe: spawn with cwd in
  a fixture dir whose CLAUDE.md holds a marker phrase, a second marker dir passed via ↓
  --add-dir; assert the run sees the cwd marker and not the --add-dir one — pins the
  rule Phase 2/3 build on (project context loads from cwd, --add-dir is access only). ↓
- Root package.json: "api:smoke": "node apps/api/scripts/claude-smoke.mjs" — not in CI. ↓
- Run the smoke once on this machine; any flag drift → fix the builder + extend the existing
  flag-matrix tests (claude-run-command.service.test.ts). ↓
- Docs: README "Real mode runbook" — AGENT_RUNNER_MODE=claude pnpm api:dev, CLAUDE_BIN
  resolution, preflight semantics (degraded health + 503 refusal), pnpm api:smoke ritual; ↓
  demo mode documented as the deterministic test/e2e seam.
  ↓
  Verification
  ↓
  After each sub-item: pnpm lint → npx tsc -p apps/web/tsconfig.json --noEmit (rtk
  typecheck lies) → pnpm test → pnpm exec vitest run --project web-components. ↓

Phase exit: pnpm e2e green on a clean tree (the 2 quarantined pipeline e2e tests stay ↓
quarantined — verify unchanged on a stashed tree, don't chase). Then the manual proof:
pnpm api:smoke passes, and AGENT_RUNNER_MODE=claude pnpm api:dev + typed task → ↓
classified → real pipeline parks on approval → approve in UI → done, outcome visible on
the run card and task record. ↓

Watch-out: once preflight refusal lands, any e2e suite that starts runs without ↓
CLAUDE_BIN set will trip the 503 — point it at the fake-claude fixture rather than
weakening the gate.
