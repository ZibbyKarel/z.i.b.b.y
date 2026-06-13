Phase 10 — Loop engine: goals, verifier, work discovery

▎ First implementation step: save this plan verbatim as docs/plans/phase-10.md
▎ and commit it ("phase 10 plan"), matching the phase-1…6/8/9 workflow.

Context

ROADMAP.md Phase 10 (lines 622–735): promote ZIBBY from an "agent and pipeline
launcher" into a **loop engine** — it discovers work itself, proposes it through
the gate, iterates a maker against a separate verifier, persists every iteration
to disk, and parks when bounded effort is exhausted. The outer loop sitting above
a single run's inner loop. Four sub-items: 10.1 `goal` task target + `GoalRun`
(stored goal definition + run aggregate with `iterations[]`; the maker is an
existing agent OR pipeline, dispatched through the same runner seams); 10.2
verifier as a first-class stop condition (generalize the 2.1 `verify` stage; stop
= satisfied OR maxIterations/budget exhausted → parked into the 2.3 queue; failed
verification feeds the next iteration as context); 10.3 discovery triage (a
scheduled automation scans git log / failing tests / `daily/` / `MEMORY.md` →
emits task **candidates** into the approvals queue as a new `kind: "proposed-task"`
— *proposed ≠ dispatched*; approving dispatches via the existing `createTask`
path); 10.4 loop run-log + resume + goal UI (per-iteration record + activity
entries; restart survival; a goal iteration that dies on a usage limit goes
`paused-limit` **without burning an iteration**; polymorphic goal detail view).
Exit criterion: the discovery automation proposes a task from a seeded failing
test; the operator approves it from the queue; the goal iterates maker → verifier,
survives an API restart mid-loop, and either finishes verifier-green or parks with
its full iteration log — and nothing reached the remote.

**The mandate, restated (ROADMAP lines 644–646): Phase 10 is deliberately thin
glue over delivered machinery.** Anything below that smells like re-implementing
2.x (verify stage, parking, escalation, resume-context), 3.x (worktrees, gated
push), 5.3 (approval-queue kind), 6.1 (activity log), 8.1 (budget), or 9.x
(paused-limit, continuation-not-restart) is a design error. The deliverable is the
*connective tissue* — the outer loop — not a new subsystem.

Dependencies (ROADMAP lines 753–759), all verified delivered: 2.1 verify-stage
command assembly, 2.3 parking + resume-with-note, 3.1 worktrees, 5.3 approval-kind
pattern, 6.1 activity log, 8.1 budget. 9.1 (paused-limit) is complementary but
should be respected so a limit hit inside an iteration pauses rather than burning
the iteration budget.

Verified ground truth that shapes the design (2026-06-13):

- **The task-target union is a clean discriminated union with three known
  touch-points.** `TaskTargetSchema = z.discriminatedUnion("kind", [agent,
  pipeline, orchestrator])` (task.schema.ts:46–51); the display shape
  (`name/glyph/category`) is shared (task.schema.ts:10–15). Adding a fourth arm
  ripples to exactly: the dispatch switch (task-scheduler.service.ts:441–453 —
  `kind === "agent"` → `agentRunner.start`, `=== "pipeline"` →
  `pipelineRunner.start`, else `startOrchestrator`), the classifier coherence
  check (task-classifier.service.ts:107–112 — orchestrator is synthetic and
  returns false; the new `goal` arm is also never auto-classified, only
  explicitly created — so it returns false there too), and the web fallback-glyph
  map (apps/web/features/tasks/task.ts:22, 38–39). The budget ledger already
  records `target.kind` as an opaque string (task-scheduler.service.ts:490) — no
  change.

- **Definitions are `gray-matter` `.md` files behind one base class.**
  `MarkdownEntityStore<T>` (apps/api/src/shared/file-storage/markdown-entity-store.ts:1–39)
  with `toFrontmatter` / `bodyOf` / `fromFrontmatter`. AgentsStorageService
  (`.md`, agents.storage.service.ts:32–152, tolerant enum-dropping parse) and
  PipelinesStorageService (`.pipeline.md`, pipelines.storage.service.ts:30–122,
  `PipelineSchema.safeParse`) are the two templates; SkillsStorageService is a
  third. A `GoalsStorageService extends MarkdownEntityStore<Goal>` with ext
  `.goal.md` is the same five-method shape. Definition dirs are DI tokens
  (`AGENTS_DIR`/`PIPELINES_DIR`/`SKILLS_DIR` via `resolveXxxDir` factories) under
  `apps/api/data/`.

- **The contract + module + controller skeleton is uniform.** ts-rest
  `c.router` with `{ pathPrefix: "/api", strictStatusCodes: true }`
  (agents.contract.ts:19–93 splits `agentsContract` CRUD from `agentRunsContract`
  execution; pipelines.contract.ts:42–154 mirrors it). NestJS module wires the
  DIR provider + storage + runner and exports them (pipelines.module.ts:26–52);
  controller is `@TsRestHandler(contract)` + `tsRestHandler` over the storage
  (pipelines.controller.ts:29–52). A `goals` module follows this exactly.

- **A RUN aggregate is the model for `GoalRun`.** `PipelineRunSchema`
  (pipeline-run.schema.ts:93–147): `pipelineRunId`, `pipelineId`, `status:
  PipelineStateSchema`, `taskId?`, `currentStage`, `stageRuns: StageRun[]`
  (`{ phaseId, runId, attempt, status }`, :44–50), `cwd`, `projectPath?`,
  `workspace?`, `resumeAt?`, `limitResumeCycles?`, `parkedReason?`, `parked?`,
  `retries?`, `checkpoints?`, `matchedTerms?`. `GoalRun` is the same shape with
  `iterations: GoalIteration[]` replacing `stageRuns` and a goal-specific state.
  The aggregate is written to `<runRoot>/run.json` on every transition
  (`writeAggregate`, pipeline-runner.service.ts:1158–1167) and rebuilt by
  `reconstruct()` on init (:1169–1207).

- **The verify-stage command assembly IS the verifier.** A `type: "verify"` phase
  resolves `phase.commands ?? project?.checks ?? DEFAULT_VERIFY_CHECKS` and runs
  them through one `RunnerCore.start` as `{ command: "/bin/sh", args: ["-c",
  cmds.join(" && ")] }` — exit 0 → `done`, non-zero → `error`, no tokens, no
  intents, no gate (pipeline-runner.service.ts:1070–1077). `DEFAULT_VERIFY_CHECKS
  = ["pnpm lint", "npx tsc --noEmit", "pnpm test"]` (pipeline.schema.ts:45);
  `ProjectSchema.checks` is the per-project override (project.schema.ts:45–48).
  10.2's "deterministic project checks" reuse this assembly verbatim; extracting
  it into a tiny shared helper (`buildVerifyCommand(commands, cwd)`) is the only
  refactor.

- **The per-phase model override + claude pass is the optional second verifier.**
  `model: escalation?.model ?? phase.model ?? agent.model` /
  `thinking: …` threads to `--model` / `--effort`
  (pipeline-runner.service.ts:1103–1109 → claude-run-command.service.ts:220–254,
  `AgentModelSchema = ["opus","sonnet","haiku"]`,
  `AgentThinkingSchema = ["high","medium","low"]`, agent.schema.ts:20–26). A
  claude verifier on a cheaper model reuses this; it is a fresh spawn with its own
  command — it never shares the maker's session.

- **Both runners dispatch through one `RunnerCore.start(spec)`** distinguished
  only by `spec.kind` ("agent" | "pipeline-stage") (runner-core.ts:318–360,
  `cwd: spec.spawnCwd ?? spec.cwd`). `AgentRunnerService.start(agentId, prompt,
  project, files, title, taskId, matchedTerms)` →
  `launch` → `core.start` → `toAgentRun` (agent-runner.service.ts:130–245);
  `PipelineRunnerService.start(...)` drives stages over the same core. The goal
  runner dispatches a maker by calling **the existing `start` of whichever runner
  the maker kind names** — no new spawn path.

- **`paused-limit` is a non-terminal, restart-durable, retry-free pause.**
  `RunnerRunStatus` includes `"paused-limit"` (runner-core.types.ts:17–23);
  `PipelineStateSchema` includes it (pipeline-run.schema.ts:27–36). A stage child
  that dies with a usage-limit line is reclassified error → `paused-limit`
  (runner-core.ts:887–909), bubbled to the aggregate **without touching the
  retries map** (pipeline-runner.service.ts:668–687), and `reconstruct()`
  preserves it (:1186–1193). `resumeAt` (pipeline-run.schema.ts:118–123) drives
  the auto-resume tick and UI countdown. `windowExhausted()` / `resolveResumeAt`
  guard at the phase boundary (:633–651). `countRunning` treats `paused-limit` as
  occupying a concurrency slot (budget.service.ts:119–134). 10.4's "a goal
  iteration dying on a limit goes paused-limit without burning an iteration" is
  the same classification one level up.

- **Parking + resume-with-note is delivered.** `then: "park"` → `parked` +
  `parkedReason "retries"` + `ParkedDetail { phaseId, attempts, failureFile, note? }`
  (pipeline-runner.service.ts:733–749; ParkedDetailSchema pipeline-run.schema.ts:79–86);
  `resumeParked` resets the counter, injects the note, re-enters the driver
  (Phase 2.3). `ParkedReasonSchema = approval | retries | limit` (Phase 9.2). The
  goal's "iterations/budget exhausted → parked into the existing 2.3 queue" is the
  same surface — goals get their own `GoalParkedReason` so they don't pollute the
  pipeline enum.

- **The approval gate is a registry of `ResumableRunner`s keyed by `kind`.**
  `ApprovalRunKindSchema = z.enum(["agent","pipeline-stage","channel","task"])`
  (approval.schema.ts:11); `ApprovalSchema { id, runId, kind, skill, action,
  detail, risk, status, requestedAt, decidedAt }` (:25–40).
  `ApprovalsService.register(kind, runner)` (:54–57), `requestApproval(input)`
  creates a pending record + records activity (:60–90), `approve` →
  `runners.get(kind)?.resume(runId)` (:101–110), `reject` →
  `runners.get(kind)?.cancel(runId)` (:113–122). **The channel flow is the exact
  precedent for 10.3:** `ChannelTriageFlowService` registers
  `approvals.register("channel", this)` (channel-triage-flow.service.ts:77–80),
  parks via `requestApproval({ kind: "channel", runId: compoundRef, … })`
  (:183–210), and `resume()` performs the action (sendReply, :215–222). A
  `proposed-task` kind whose `resume()` calls `createTask` is a one-for-one copy.

- **The activity log is a closed-enum, never-throws append-only JSONL.**
  `ActivityKindSchema` (activity.schema.ts:10–38, ~23 values incl. the Phase 9
  trio `run-paused-limit`/`run-resumed-limit`/`task-deferred-limit`);
  `ActivityRefsSchema` strict all-optional (`taskId/runRef/pipelineId/agentId/
  projectId/approvalId/integrationId/itemId/action/decision/status/noteId`,
  :47–64); `record(input, now)` stamps id/at/traceId/runId and `fs.appendFile`s
  one line, swallowing errors (activity-log.service.ts:69–87). `ActivityRecorderService`
  listens to both runners' `onRunStatus`, dedups in-memory, emits transitions.
  Briefing reads `readSince(cursor)`; `DID_KINDS` (briefing-assembly.ts:35–41)
  and `buildWatching` (:146–170, already carries `paused-limit` runs) are the
  growth points for goal lines.

- **Budget is fail-closed, run-count based, and already parks over-cap work.**
  `ProjectBudgetSchema { dailyRuns?, weeklyRuns?, maxConcurrent? }`
  (project.schema.ts:20–28 — **run-count caps, NOT token cost**).
  `BudgetService.check(projectId, now)` (budget.service.ts:53–102): fail-closed
  global ceiling (`pauseAtRollingPct`/`pauseAtWeeklyPct` vs LimitsService) then
  per-project daily/weekly ledger counts → `{ ok }` or `{ ok:false, over, detail }`;
  `recordDispatch(entry, now)` appends to the ledger (:104–107);
  `countRunning` (:119–134) counts `paused-limit` as live. `attemptDispatch`
  consults budget then concurrency, `holdForApproval` parks over-cap tasks behind
  a `kind: "task"`, `action: "spend-past-cap"` approval, released with
  `skipBudget` once approved (task-scheduler.service.ts:282–324, 334–361,
  budgetApproved set :73–81). **No per-run token accounting exists anywhere** —
  the only cost currency in the system is run-count.

- **The automations tick is the discovery heartbeat.** `SchedulerService.tick(now)`
  (scheduler.service.ts:54–71) fires cron automations idempotently per wall-minute,
  each in its own trace scope; `dispatch()` switches on `automation.target.type`
  (:87–106) — today `agent` / `pipeline` / `briefing`, where `briefing` calls
  `briefing.generate()` **deterministically, not through a runner**. The morning
  briefing (data/automations/morning-briefing.json, cron `0 7 * * *`) is the
  template-first-plus-optional-claude-pass precedent 10.3 copies: a new
  `discovery` target type calling `DiscoveryTriageService.run()`. `AUTOMATION_TICK_MS`
  "0" disables; tests drive `tick(now)` directly.

- **Worktrees are per-run and branch-preserving.** `WorkspaceService.createWorktree`
  → branch `zibby/<runId>-<slug>` at `git rev-parse HEAD` baseRef
  (workspace.service.ts:76–101); spawn cwd = worktree (runner-core.ts:330);
  `removeWorktree` never deletes the branch (:109–123); `checkpoint(workspace,
  phaseId, summary)` commits `zibby-checkpoint(<phase>): <summary>` guarding the
  `.git` marker (:134–175, Phase 9.3); `commitLog`/`diffstat` (:183–211). The
  goal owns ONE worktree per run; iterations accumulate commits on its branch.

- **Session resume does NOT exist — continuation is resume-context injection.**
  `buildClaudeCommand` (claude-run-command.service.ts:220–254) has **no
  `--session-id`/`--resume` flag**; every spawn is fresh. The delivered
  continuation mechanism is Phase 9.3's `resume-context.ts`
  `buildResumeContext({ progressMd, checkpointLog, note?, failureTail? })`
  (apps/api/src/pipelines/resume-context.ts:24–54), injected via
  `--append-system-prompt` (`composeResumeContext`,
  pipeline-runner.service.ts:833–848). **Decision below: Phase 10 does NOT build
  native claude session resume — `sessionId` is a captured-if-available forensic
  field, and the real cross-iteration / cross-restart continuation rides the
  existing resume-context channel.** This is the "thin glue" mandate, not a
  shortcut: 9.3's principle (continuation, not restart) is already satisfied
  without a new CLI integration.

- **The vault read surface covers discovery scanning.** `VaultService`
  (memory/vault.service.ts): `scan()` walks all notes with tier/frontmatter/links/body
  (:276–305, 5 s cache); `search(q)` substring over title+body (:136–152);
  `note(id)` single note + backlinks (:106–121); tiers `memory`/`daily`/`knowledge`
  (:45); `appendDaily` writes `- HH:MM <text>` (:155–164). Discovery reads
  `daily/*` via `scan().filter(tier==="daily")` and `MEMORY.md` open items via
  `note("MEMORY")` body parse. **Git log + failing tests are read deterministically**
  (spawn `git log`, run the project checks) — not from the vault.

- **Demo seams cover every Phase 10 path token-free.** fake-claude.mjs knobs
  (FAKE_CLAUDE_STEPS/_DELAY_MS/_MARKER/_DUMP_ARGS_FILE/_INTENT/_COMMIT/_PRODUCE/
  _LIMIT/_FAIL; the LIMIT knob flows through the real detectLimit/finalize path,
  test/fixtures/fake-claude.mjs:125–130); demo-stage.mjs knobs
  (AGENT_DEMO_STEPS, PIPELINE_DEMO_FAIL_PHASES, PIPELINE_DEMO_LIMIT_PHASES
  marker-once, PIPELINE_DEMO_EMIT_LEARNED). The verifier in e2e is a marker-file
  fixture check script (fail N times then pass) — the exact pattern Phase 2.1's
  verify e2e already uses. E2E limits control: temp `CLAUDE_CONFIG_DIR` + fixture
  `rate-limits.json` (UsageFetcher self-disables under VITEST).

- e2e house conventions (unchanged, memories pinned): per-suite mkdtemp dirs,
  tick knobs "0" with `tick(now)` driven directly, the quarantined pipeline e2e
  pair + documented Playwright reds baselined via git worktree BEFORE the phase
  (project_api_flaky_pipeline_e2e, project_playwright_e2e_preexisting_failures),
  rtk typecheck lies → call `npx tsc -p` directly (project_rtk_typecheck_masking).

Decisions taken (defaults chosen, flag if you disagree)

1. **`goal` is a fourth `TaskTargetSchema` arm AND a file-backed definition +
   run aggregate — a parallel to `pipeline`, not a new dispatch path.** New
   `libs/contracts/src/goals/goal.schema.ts` (`GoalSchema`: `id`, `name`,
   `desc`, `objective`, `maker: { kind: "agent" | "pipeline", id }`, `verifier:
   VerifierSpecSchema`, `maxIterations: z.number().int().positive()`, optional
   per-goal `budget` mirroring `ProjectBudgetSchema`'s run-count shape,
   `instructions` body) + `goal-run.schema.ts` (`GoalRunSchema` modeled on
   `PipelineRunSchema`: `goalRunId`, `goalId`, `status: GoalStateSchema`,
   `taskId?`, `cwd`, `projectPath?`, `workspace?`, `iterations:
   GoalIterationSchema[]`, `currentIteration: number | null`, `resumeAt?`,
   `limitResumeCycles?`, `parkedReason: GoalParkedReason?`, `parked:
   GoalParkedDetail?`, `sessionId?`, `matchedTerms?`). `GoalIterationSchema =
   { index, makerKind, makerRunRef, verifier: { kind, runRef?, satisfied,
   output }, startedAt, endedAt?, status: ("running"|"done"|"failed"|
   "paused-limit") }`. `GoalStateSchema = ["running","done","parked","failed",
   "paused-limit"]` (a deliberate clone of `PipelineStateSchema` semantics so the
   web `FeedStatus` mapping and `paused-limit`/`parked` handling are reused, not
   reinvented). `GoalParkedReason = ["iterations","budget","limit"]`.
   `TaskTargetSchema` gains `GoalTaskTargetSchema { kind: "goal", id, …display }`.
   YAML frontmatter (`maker`, `verifier`, `maxIterations`, `budget`) round-trips
   through `GoalsStorageService` (`.goal.md`).

2. **The goal runner is the OUTER loop; the maker is dispatched through the
   existing inner runners untouched.** `GoalRunnerService` (new
   apps/api/src/goals/goal-runner.service.ts) owns a `drive(goalRun)` loop that is
   the structural twin of the pipeline `drive()` cursor loop, but the cursor is an
   **iteration index**, not a phase id:

       create/reuse one worktree per goalRun (WorkspaceService)
       loop:
         budget.check → over-cap? park (parkedReason "budget")           [10.2]
         windowExhausted? → paused-limit + resumeAt, return              [9.1 shape]
         dispatch maker (agent|pipeline .start, cwd = worktree)          [inner loop]
         wait for maker terminal (or paused-limit → bubble up, return)   [9.1 shape]
         run verifier (deterministic checks ± claude pass)               [10.2]
         verdict satisfied? → checkpoint commit, status done, return     [9.3]
         index+1 >= maxIterations? → park (parkedReason "iterations")    [10.2]
         else: compose resume-context from verifier output, continue     [9.3]

   The maker dispatch reuses `AgentRunnerService.start` / `PipelineRunnerService.start`
   verbatim — so demo mode stays the deterministic e2e seam and the **mid-run
   approval gate (Variant B) applies unchanged inside every iteration** (it is a
   property of the inner run, not the goal). To spawn the maker against the goal's
   worktree, both `start` methods gain ONE optional param `workspace?: Workspace`
   — when present the runner skips self-creating a worktree and spawns with
   `cwd = workspace.path` (the Phase 2/3 cwd=worktree rule, just externally
   supplied). This is the single new seam on the inner runners; everything else is
   additive in the new `goals` module.

3. **The verifier is a `VerifierSpec`, not a new engine.**
   `VerifierSpecSchema = z.discriminatedUnion("kind", [ { kind: "checks",
   commands: z.array(z.string().min(1)).optional() }, { kind: "claude", agent:
   AgentIdSchema, model: AgentModelSchema.optional(), thinking:
   AgentThinkingSchema.optional() } ])`. `checks` reuses the extracted
   `buildVerifyCommand` helper (decision: lift the verify-stage assembly,
   pipeline-runner.service.ts:1070–1077, into
   apps/api/src/pipelines/verify-command.ts shared by both the pipeline verify
   stage AND the goal verifier — `commands ?? project.checks ??
   DEFAULT_VERIFY_CHECKS`, run via `/bin/sh -c`, exit 0 → satisfied) and runs in
   the worktree. `claude` spawns a fresh agent run on its own (cheaper) model,
   given the maker's diff/output as input — **a fresh spawn with no shared session
   (decision 8 makes "no shared session" structural since no session resume
   exists at all)**. The verifier's output (the failing check tail, or the claude
   verdict text) is written to `<goalRun cwd>/iteration-<n>.verdict.txt` and
   becomes the next iteration's resume-context `failureTail` — the Tester→Kodér
   feedback shape, generalized.

4. **Stop conditions are a small pure matrix; exhaustion parks into the 2.3
   queue.** `decideStop({ satisfied, index, maxIterations, budgetOk }) →
   "satisfied" | "continue" | "park-iterations" | "park-budget"`. Park →
   `GoalRun.status = "parked"`, `parkedReason`, `parked: { iteration, attempts:
   index+1, verdictFile }`, last verifier output attached as failure context.
   Resume-with-note reuses the **same operator surface as pipeline parks** — a new
   `POST /api/goals/runs/:goalRunId/resume` (body `{ note? }`) on the goal-runs
   contract whose handler resets nothing destructive, injects the note into the
   next iteration's resume-context, and re-enters `drive()` at
   `currentIteration`. (Distinct endpoint from the pipeline resume because the run
   types differ; identical UX.)

5. **A goal is a valid task target but is NEVER auto-classified.** The classifier
   (task-classifier.service.ts) keeps routing to agent/pipeline/orchestrator only;
   `isCoherent` returns false for `goal` like it does for `orchestrator`
   (synthetic/explicit-only). A goal-targeted task is created **either** explicitly
   via the goals contract (start a stored goal) **or** by approving a
   `proposed-task` whose suggested target is a goal. Dispatch:
   task-scheduler.service.ts:441–453 gains `if (target.kind === "goal") return
   { runRef: (await this.goalRunner.start(target.id, …)).goalRunId, target }`.
   This routes goals through `createTask` → budget guard → concurrency queue →
   outcome write-back **for free** (the Phase 8.1/1.3 plumbing), so per-goal
   dispatch respects the same caps as everything else.

6. **Budget for a goal is run-count, layered, no new currency.** Three guards,
   all reusing 8.1: (a) the **task-level** dispatch guard already gates the goal's
   *creation* (one `held`-able dispatch, like any task). (b) **Per-iteration**,
   `drive()` calls `BudgetService.check(projectPath→projectId, now)` before
   dispatching each maker and `recordDispatch` after — so every iteration's maker
   counts against the project's `dailyRuns`/`weeklyRuns` exactly like a standalone
   run, and an over-cap mid-goal parks the goal (`parkedReason "budget"`) rather
   than silently exceeding. (c) **`maxIterations`** is the goal's own hard fuse.
   The web "cost bar vs budget" (10.4) renders **iterations-used / maxIterations**
   plus the project run-cap headroom — there is no token cost to show, and
   inventing one would be re-implementation. `GoalRunSchema` carries no
   token/dollar field; `iterations[]` length is the cost.

7. **`proposed-task` is the channel-kind pattern, one-for-one.**
   `ApprovalRunKindSchema += "proposed-task"` (approval.schema.ts:11). New
   `apps/api/src/discovery/` module with `DiscoveryTriageService` (the scanner +
   candidate producer) and `ProposedTaskFlowService` (the `ResumableRunner`):
   `onModuleInit` → `approvals.register("proposed-task", this)`; a candidate is
   parked via `requestApproval({ kind: "proposed-task", runId: proposalId,
   skill: "discovery", action: "dispatch-task", detail: <title + rationale +
   suggested target>, risk: "low" })` and persisted as a file-backed proposal
   (`data/proposals/<id>.json`, closed `ProposalSchema`); `resume(proposalId)` →
   `taskScheduler.createTask({ text, title, target? })` (the existing path →
   budget/concurrency/outcome free); `cancel(proposalId)` → mark proposal ignored.
   **The gate IS the inbox** — proposals show up in the briefing's `needsYou`
   (pending approvals) with zero new surface. *Proposed ≠ dispatched*: discovery
   never calls `start`/`createTask` itself; only an approval does.

8. **Discovery is a `discovery` automation target, template-first + one optional
   claude pass — mirroring the morning briefing.** `AutomationTargetSchema` gains
   `{ type: "discovery" }`; `SchedulerService.dispatch` (:87–106) gains a
   `discovery` arm calling `DiscoveryTriageService.run()`. `run()` is
   deterministic-first: scan signals — `git log --oneline -n N` on registered
   projects, the project `checks` exit status (failing tests), `vault.scan()`
   `daily/` tail, `MEMORY.md` open-item (`- [ ]`) lines — assemble a structured
   signal set, then **one optional claude pass** turns signals into well-formed
   candidates. **Law 4 is structural here:** scanned repo/vault content is wrapped
   as quoted data in the prompt, and the claude output is validated against a
   **closed `CandidateSchema`** (`{ title, text, rationale, suggestedTarget?:
   { kind, id }, confidence }`) — a candidate that fails the schema is dropped; it
   can never carry a gate override, raise its own tier, or name an action. A
   seeded `data/skills/triage.skill.md` documents the scan contract (it is the
   prompt content for the claude pass; the *scanning* is code, not a skill the
   model executes). New `discovery-triage.json` automation (cron e.g.
   `0 * * * *`), disabled by default until the operator turns it on.

9. **`paused-limit` for goals is the 9.1 classification one level up — and it
   does NOT consume an iteration.** When the maker run of iteration *n* lands
   `paused-limit` (its own 9.1 classification, mid-run or boundary), `drive()`
   bubbles it: `GoalRun.status = "paused-limit"`, `resumeAt` copied from the maker
   run, `currentIteration = n`, **the iteration record stays `status:
   "paused-limit"` and is NOT counted as a completed iteration** (the
   maxIterations fuse only counts `done`+verified attempts). On resume the SAME
   iteration re-dispatches with resume-context. `LimitResumeService` (9.2) gains
   `GoalsModule` and scans the goal registry too; `GoalRunnerService` exposes
   `resumeLimitPaused(goalRunId)` (re-enter `drive()` at `currentIteration`).
   Bounded like 9.2: `limitResumeCycles > LIMIT_RESUME_MAX` → goal `parked`
   (`parkedReason "limit"`), operator-resumable. `countRunning` (8.1) must count
   `paused-limit` goals as live (decision 6 already routes goals through the
   ledger; verify the count includes the goal registry).

9b. **Checkpoint commits between iterations (9.3).** After a verifier-satisfied
   iteration (the success path) the goal runner runs `WorkspaceService.checkpoint(
   workspace, "goal-iter-<n>", <objective slug>)` — local, Tier 1, ungated;
   intermediate iterations rely on the maker's own commits (koder.md-style) plus
   a checkpoint after the FINAL satisfied iteration so the branch is committed
   before the run ends. The 3.2 push/PR gates are untouched; no goal action ever
   reaches the remote.

10. **Restart survival is the `reconstruct()` pattern, run-ref-aware.**
    `GoalRunnerService.reconstruct()` (clone of pipeline-runner.service.ts:1169–1207):
    read every `<GOAL_RUNS_DIR>/<id>/run.json`; a `running` goal whose in-flight
    maker runRef reconciled to `failed`/`interrupted` (its child died with the API)
    → re-dispatch that iteration with resume-context (continuation, not restart —
    the worktree + checkpoints survive on disk); a `paused-limit` goal stays
    `paused-limit` (the auto-resume tick owns it); a `parked` goal stays parked.
    `sessionId` is read back if present but (decision 8) drives nothing this phase.
    An in-flight maker that is itself `paused-limit` keeps the goal `paused-limit`.

11. **Activity + briefing, Tier 1 silent + recorded.** `ActivityKindSchema +=
    "goal-dispatched", "goal-verdict", "goal-parked"` (a fourth `"goal-resumed"`
    only if the briefing needs to distinguish it from `run-resumed-limit` — start
    with three, add iff a test demands it). `ActivityRefsSchema += goalRunId?,
    goalId?` (strict-optional, same as the rest). `ActivityRecorderService` gains
    a goal `onRunStatus` listener emitting started/finished/parked like pipelines;
    `goal-verdict` is emitted by the goal runner per iteration. Briefing
    `buildWatching` (briefing-assembly.ts:146–170) gains in-flight + paused-limit
    goals; `DID_KINDS` gains nothing (the goal's terminal `run-finished`-style
    entry already accounts for completion — no double counting, same rule as 9.2).
    **No new notification kind** — a parked-after-exhaustion goal IS already
    covered by the parked notification (6.3); discovery proposals are covered by
    the pending-Tier-3 notification (they're approvals).

12. **Web: a third polymorphic run kind, no new DS component.** `RunKind +=
    "goal"` (apps/web/features/runs/run.ts:19); `goalRunToView(r)` maps `GoalRun`
    → `RunView` with `kind: "goal"`, `pct: null`, `logBase: null`, reusing the
    `parked`/`paused-limit`/`failed→error` status mapping pipelines already do
    (run.ts:115–145). `RUN_STATE` already covers every `FeedStatus` the goal
    produces — no new entry. `RunDetail` (RunDetail.tsx) gains a `kind === "goal"`
    branch: an **iteration timeline** (per-iteration maker link + verifier verdict
    chip + status), a **cost bar = iterations-used / maxIterations**, and the
    parked/resume-with-note panel reused from the pipeline parked surface. New
    `apps/web/features/goals/` TanStack domain (`useGoalsQuery`,
    `useGoalRunsQuery`, `useResumeGoalRunMutation`, `useStartGoalMutation`) per
    conventions (`selectApiResponseBody`, exported `getXxxQueryKey`); `useRunsQuery`
    merges `goalRunToView` into the feed. i18n keys cs+en.

Implementation order: **10.1** (goal contract + schema + storage + module +
runner skeleton that dispatches a maker and records iterations, no verifier yet)
→ **10.2** (verifier spec + extracted `buildVerifyCommand` + stop-condition matrix
+ parking + resume endpoint) → **10.4** (per-iteration run-log + paused-limit +
restart reconciliation + LimitResume wiring + goal UI — makes the loop durable and
visible) → **10.3** (discovery automation + `proposed-task` approval kind +
candidate schema — the work-finding layer on top, thinnest because it only needs
the approval+createTask path; it ties the exit criterion together last). Each
sub-item lands with its tests, per the standing rules.

---

10.1 `goal` task target + `GoalRun`

Contracts (libs/contracts/src/):

- NEW goals/goal.schema.ts: `GoalSchema` (definition), `VerifierSpecSchema`
  (discriminated union, decision 3), `MakerRefSchema { kind: z.enum(["agent",
  "pipeline"]), id: AgentIdSchema }`, `CreateGoalSchema`/`UpdateGoalSchema`.
- NEW goals/goal-run.schema.ts: `GoalStateSchema`, `GoalParkedReasonSchema`,
  `GoalIterationSchema`, `GoalParkedDetailSchema`, `GoalRunSchema`,
  `StartGoalRunSchema { project?, files?, title? }` (mirror StartPipelineRunSchema).
- NEW goals/goals.contract.ts: `goalsContract` (CRUD, mirror agents.contract.ts:19–93)
  + `goalRunsContract` (`startGoalRun` POST /goals/:id/run → 201 GoalRun/404/503,
  `listGoalRuns`, `listAllGoalRuns`, `getGoalRun`, `resumeGoalRun` POST
  /goals/runs/:goalRunId/resume, `getGoalRunArtifact`, `deleteGoalRun` — mirror
  pipelineRunsContract:85–154). Export from libs/contracts/src/index.ts.
- tasks/task.schema.ts: `GoalTaskTargetSchema` + add to the `TaskTargetSchema`
  discriminatedUnion (:46–51). Contract tests extended for union round-trip.

API (apps/api/src/goals/):

- NEW goals.storage.service.ts (extends MarkdownEntityStore<Goal>, ext `.goal.md`,
  tolerant parse like agents.storage.service.ts:103–151; frontmatter carries
  maker/verifier/maxIterations/budget).
- NEW goal-runner.service.ts: `start(goalId, prompt, project, files, title,
  taskId, matchedTerms)` → create worktree (decision 2) → seed GoalRun aggregate
  (`running`, empty iterations) → write run.json → kick `drive()` (async, like
  pipeline start) → return GoalRun. `drive()` THIS sub-item: dispatch maker via the
  named inner runner with `workspace`, wait terminal, append an iteration record,
  advance `currentIteration`; stop after one iteration (no verifier yet — a
  scaffold the 10.2 stop matrix replaces). `RunnerCore`-style retention + an
  in-memory registry + `list()`/`get()`.
- NEW goals.module.ts (imports AgentsModule, PipelinesModule, WorkspaceModule,
  ProjectsModule, ActivityModule, BudgetModule; providers GOALS_DIR/GOAL_RUNS_DIR
  + storage + runner; controllers) + goals.controller.ts + goal-runs.controller.ts
  (`@TsRestHandler`). Register in AppModule.
- agent-runner.service.ts + pipeline-runner.service.ts: add the optional
  `workspace?: Workspace` param to `start` (decision 2) — spawn cwd =
  `workspace.path` when supplied, skip self-creating a worktree. Existing callers
  pass nothing (no behavior change).
- task-scheduler.service.ts:441–453: add the `goal` dispatch arm (decision 5).
  task-classifier.service.ts:107–112: `goal` → not coherent (explicit-only).

Web:

- apps/web/features/tasks/task.ts:22/38–39: `TaskTargetKind += "goal"`,
  `KIND_FALLBACK_GLYPH.goal` (e.g. "target"/"loop"). (Full goal feed/detail is
  10.4 — here just so a goal-targeted task renders.)

Tests:

- contract/schema unit (libs/contracts): TaskTargetSchema union round-trip incl.
  goal; GoalSchema + VerifierSpec discriminated-union parse; GoalRun round-trip;
  `.goal.md` frontmatter ↔ Goal (toFrontmatter/fromFrontmatter).
- goal-runner unit: start creates a worktree + aggregate; one-iteration scaffold
  dispatches the maker (demo) and records an iteration; registry list/get.
- e2e (NEW goal-loop.e2e.test.ts, demo maker): create goal via contract →
  startGoalRun → run.json appears with an iteration record + worktree branch;
  goal-targeted createTask dispatches to the goal runner (outcome write-back).

10.2 Verifier as a first-class stop condition

Contracts:

- goal.schema.ts: `VerifierSpecSchema` finalized (decision 3). goal-run.schema.ts:
  `GoalIterationSchema.verifier` shape pinned; `GoalParkedReasonSchema =
  ["iterations","budget","limit"]`. `resumeGoalRun` endpoint added to
  goalRunsContract (decision 4).

API:

- NEW apps/api/src/pipelines/verify-command.ts: `buildVerifyCommand(commands,
  cwd) → { command: "/bin/sh", args, spawnCwd? }` lifted from
  pipeline-runner.service.ts:1070–1077; the pipeline verify branch now CALLS it
  (pure refactor — pipelines e2e must stay green), and the goal verifier calls it
  too.
- goal-runner.service.ts: implement the real `drive()` loop (decision 2):
  per-iteration `budget.check` → over-cap park; maker dispatch + wait; run
  verifier (`checks` via buildVerifyCommand in the worktree, OR `claude` fresh
  spawn on the spec'd model — separate run, separate cwd, output captured);
  `decideStop` matrix (decision 4); satisfied → checkpoint (9b) + `done`;
  exhausted → `parked` + parkedReason + `iteration-<n>.verdict.txt` as failure
  context; continue → `composeGoalResumeContext` (reuse buildResumeContext with
  the verdict tail as `failureTail`). `resumeLimitPaused`/`resumeParked`
  (resume-with-note) re-enter `drive()` at `currentIteration` with the note
  injected.
- goal-runs.controller.ts: `resumeGoalRun` handler (guard `parkedReason` is set;
  409 if not parked — mirror pipeline resume 409 semantics).

Web:

- (Detail view lands in 10.4; here the contract/runner are the deliverable.)

Tests:

- verify-command unit: command assembly (override > project.checks > defaults),
  cwd threading; pipelines verify branch still maps exit 0/≠0 (regression).
- stop-matrix unit: satisfied / continue / park-iterations / park-budget across
  the {satisfied, index, maxIterations, budgetOk} grid; verdict-context assembly
  (verdict tail → resume-context failureTail; empty verdict → omitted section,
  never an empty fence).
- goal-runner unit: claude-verifier spawns a fresh run distinct from the maker
  (no session reuse); budget over-cap mid-goal → parked "budget".
- e2e (extend goal-loop.e2e.test.ts, marker-file fixture verifier): verifier
  fails twice then passes → goal `done` with 3 iterations recorded; never-passes
  with maxIterations 2 → `parked` parkedReason "iterations" with the verdict file;
  resumeGoalRun-with-note re-enters and (with a now-passing fixture) finishes.

10.4 Loop run-log + resume + goal UI

Contracts:

- activity/activity.schema.ts: kinds += `"goal-dispatched"`, `"goal-verdict"`,
  `"goal-parked"`; `ActivityRefsSchema += goalRunId?, goalId?` (decision 11).
- goal-run.schema.ts: confirm `resumeAt?`, `limitResumeCycles?`, `sessionId?`,
  `currentIteration` persisted (decisions 9/10). pipeline-run.schema-style
  durability comments.

API:

- goal-runner.service.ts: `reconstruct()` (decision 10) on init; paused-limit
  bubble from the maker run + `resumeLimitPaused` (decision 9); per-iteration
  `iteration-<n>` artifacts in the goal run dir; emit `goal-dispatched` /
  `goal-verdict` / `goal-parked` activity (never-throws record). `sessionId`
  captured-if-available, drives nothing (decision 8).
- limits-resume/limit-resume.service.ts (Phase 9.2): import GoalsModule, scan the
  goal registry for `paused-limit`, `now >= resumeAt` + headroom → `resumeLimitPaused`;
  cycle cap → goal `parked` "limit". Oldest-first + inter-resume re-check
  (the 9.2 thundering-herd guard) extended to the merged run set.
- budget.service.ts `countRunning`: include `paused-limit`/`running` goals
  (decision 6/9) so a live goal occupies a slot.
- activity-recorder.service.ts: goal `onRunStatus` listener (started/finished/
  parked), dedup like the existing two.
- briefing-assembly.ts: `buildWatching` += in-flight + paused-limit goals
  (decision 11; pure, fixtures).

Web (apps/web/features/):

- NEW goals/ TanStack domain (queries: useGoalsQuery, useGoalRunsQuery,
  getGoalRunsQueryKey; mutations: useStartGoalMutation, useResumeGoalRunMutation)
  per conventions (selectApiResponseBody, direct useQuery/useMutation returns).
- runs/run.ts: `RunKind += "goal"`, `goalRunToView` (decision 12); useRunsQuery
  merges goal runs into the feed.
- runs/components/RunDetail.tsx: `kind === "goal"` branch — iteration timeline
  (maker run link + verifier verdict chip + per-iteration status), cost bar
  (iterations / maxIterations), reused parked/resume panel. i18n cs+en.

Tests:

- goal-runner unit: iteration-record round-trip; reconstruct reconciles a
  `running` goal with a dead maker → re-dispatch w/ resume-context; paused-limit
  goal survives restart; maker paused-limit does NOT increment the counted-iteration
  fuse (decision 9).
- limit-resume unit (extend): a paused-limit goal at `now >= resumeAt` + headroom
  resumes; cycle cap → parked "limit"; oldest-first across goals+pipelines+agents.
- e2e (extend goal-loop.e2e.test.ts): FAKE_CLAUDE_LIMIT on a maker iteration →
  goal `paused-limit`, iteration not consumed; flip fixture rate-limits.json →
  limitResume.tick(now) → continues at the same iteration to `done`; activity log
  holds dispatch/verdict/pause/resume with matching goalRunId; kill the API
  mid-goal → restart → `reconstruct` continues at the same iteration.
- web-components: goalRunToView mapping; RunDetail goal iteration timeline + cost
  bar; paused-limit/parked goal cards.

10.3 Discovery triage — work finds itself

Contracts:

- approvals/approval.schema.ts:11: `ApprovalRunKindSchema += "proposed-task"`.
- NEW discovery/proposal.schema.ts: `CandidateSchema` (closed: `{ title, text,
  rationale, suggestedTarget?: { kind: TaskTargetKind, id? }, confidence:
  z.number().min(0).max(1) }`) + `ProposalSchema` (stored: candidate + `id`,
  `state: z.enum(["proposed","dispatched","ignored"])`, `approvalId?`,
  `createdAt`). discovery/discovery.contract.ts (`listProposals` GET — the queue
  is approvals, this is read-only detail) optional; the approvals contract already
  surfaces the gate.
- automations/automation.schema.ts: `AutomationTargetSchema += { type: "discovery" }`.

API (apps/api/src/discovery/):

- NEW discovery-triage.service.ts: `run(now)` — deterministic scan (git log per
  registered project, project `checks` exit status, `vault.scan()` daily tail,
  `MEMORY.md` open items) → signal set → one optional claude pass (Law-4 data
  envelope) → validate each against `CandidateSchema` (drop on failure) → for each
  surviving candidate, persist a `Proposal` (`data/proposals/<id>.json`) and call
  `proposedTaskFlow.park(proposal)`.
- NEW proposed-task-flow.service.ts (ResumableRunner): `onModuleInit` →
  `approvals.register("proposed-task", this)`; `park(proposal)` →
  `requestApproval({ kind: "proposed-task", runId: proposal.id, skill:
  "discovery", action: "dispatch-task", detail, risk: "low" })` (decision 7) +
  emit `goal-parked`/a `proposed` activity; `resume(proposalId)` →
  `taskScheduler.createTask({ text, title, target: suggestedTarget })`, mark
  proposal `dispatched`; `cancel(proposalId)` → mark `ignored`.
- NEW discovery.module.ts (imports VaultModule/MemoryModule, ProjectsModule,
  ApprovalsModule, TasksModule, ActivityModule); register in AppModule.
- automations/scheduler.service.ts:87–106: `discovery` dispatch arm →
  `discoveryTriage.run()`. Seed `data/automations/discovery-triage.json`
  (disabled by default) + `data/skills/triage.skill.md` (the scan-contract prompt
  content). seed.mjs mirrors.

Web:

- The approvals queue already renders pending approvals; a `proposed-task`
  approval needs a recognizable label/detail rendering (approvals screen kind →
  copy). Optional: a `/proposals` read view or an overview "proposed work" count —
  smallest honest surface; the gate IS the inbox, so start with the approval card
  copy only. i18n cs+en.

Tests:

- candidate/proposal schema unit: closed-schema rejection of an injection-shaped
  candidate (extra `action`/`gate`/tier fields stripped or rejected — stays inert
  data, Law 4); suggestedTarget union round-trip.
- discovery-triage unit (fixture repo + fixture vault): failing test → a
  candidate; clean tree → none; an injection-shaped commit message / daily line
  stays inert (no gate override, no tier raise).
- proposed-task-flow unit: park → pending approval `kind "proposed-task"`; resume
  → createTask called (mocked) with the proposal text; cancel → proposal ignored.
- e2e (NEW discovery.e2e.test.ts, demo): automation `discovery` tick(now) →
  proposal in the approvals queue, **no run started** (assert the runner registries
  are empty); approve via the approvals contract → task dispatched through the
  budget guard → outcome recorded.
- Playwright (extend e2e/, demo): seeded failing test → discovery proposal in the
  approvals UI → approve → goal runs to `done` (the phase exit throughline).

---

Verification

After each sub-item: pnpm lint → npx tsc -p apps/web/tsconfig.json --noEmit (rtk
typecheck lies — memory: project_rtk_typecheck_masking) → pnpm test → pnpm exec
vitest run --project web-components.

Phase exit: pnpm e2e green on a clean tree (worktree baseline BEFORE the phase;
quarantines stay quarantined — memories project_api_flaky_pipeline_e2e,
project_playwright_e2e_preexisting_failures). Then the roadmap's manual proof:
seed a failing test in a fixture project, enable the discovery automation, let a
tick propose a task → approve it from the approvals queue → the goal iterates
maker → verifier, kill+restart the API mid-loop and confirm it continues at the
same iteration, and watch it either finish verifier-green (branch shows
`zibby-checkpoint(goal-iter-…)` commits, iteration log complete, nothing pushed)
or park with its full iteration log — and the morning briefing accounts for it.

Watch-outs

- **The `workspace?` seam on the inner runners is the one place Phase 10 reaches
  INTO delivered code — keep it inert for existing callers.** `start` with no
  `workspace` must behave bit-identically (self-create or no worktree exactly as
  today). Pin with the existing agent/pipeline e2e re-run after the param lands;
  a goal-supplied worktree only changes the spawn cwd, never the artifact/sidecar
  layout.
- **Do NOT re-implement the verify stage — extract and share it.** If
  `buildVerifyCommand` is a copy rather than a lift, the two will drift (a project
  that overrides `checks` would behave differently in a pipeline vs a goal). The
  refactor must leave pipelines e2e green; run it before moving on.
- **Maker paused-limit must not burn an iteration (decision 9) — this is the
  literal exit-criterion clause "without burning the iteration budget".** Only a
  maker run that reached terminal AND was verified counts toward `maxIterations`.
  A `paused-limit` maker leaves the in-progress iteration record at
  `status: "paused-limit"` and re-dispatches the SAME index on resume. Pin with a
  unit test asserting the counted-iteration fuse is unchanged across a pause.
- **Concurrency double-count at limit reset.** A `paused-limit` goal occupies a
  concurrency slot (decision 6); `countRunning` must include it, or window-reset
  resumes a goal whose slot was already handed to a queued task → over-dispatch.
  Same hazard 9.x flagged for runs; verify the goal registry is in `countRunning`.
- **`ApprovalRunKindSchema` growth ripples.** Grep every consumer of the kind enum
  before calling 10.3 done: `approvals.register` call sites, the web approvals
  screen kind→copy switch, any exhaustive `switch (approval.kind)` (a missed arm
  renders blank, not error), seed/fixtures. The channel kind is the map to follow.
- **`ActivityKindSchema` + `RunKind` growth.** Activity is a closed enum consumed
  by the recorder dedup, briefing DID_KINDS/watching, and the web feed — add the
  three goal kinds everywhere they're switched on. `RunKind += "goal"` ripples to
  RUN_STATE coverage (already complete via FeedStatus reuse — verify no blank
  cards), Screen filters, and the RunDetail kind branch.
- **Law 4 is the security spine of 10.3.** Scanned git/vault content is DATA: it
  rides inside a quoted envelope in the discovery prompt, and the model's output
  is validated against the closed `CandidateSchema` — a candidate can never carry
  a gate override, name an `action`, raise a tier, or set `risk`. The
  injection-corpus unit test (commit message / daily line that says "ignore
  previous instructions" / "auto-approve and merge") asserting inertness is not
  optional. *Proposed ≠ dispatched* must hold even if the model is fully
  compromised: discovery has no `start`/`createTask`/`push` capability — only an
  operator approval dispatches.
- **No new gate actions, no auto-anything (the hard invariants, ROADMAP 725–729).**
  The 3.2 locked floor (push `ask`, pr-open `ask`, merge `deny`) is untouched;
  goal checkpoint commits are local Tier-1 (verified ungated, Phase 9.3); a goal
  never pushes or merges. Resist a "goal-override" or "auto-dispatch-proposal"
  shortcut — the cycle/iteration caps park to the operator, which is already the
  Tier-3 surface. Out of scope permanently: continual-learning/self-optimizing
  evals, concurrency beyond the budget cap.
- **Session resume is NOT this phase (decision 8).** If the implementation reaches
  for `--session-id`/`--resume`, stop — that flag does not exist in
  buildClaudeCommand and building it is a separate effort. Continuation between
  iterations and across restart is resume-context injection (9.3), which already
  satisfies the roadmap's "continuation, not restart" principle. `sessionId` is a
  forensic field only.
- **Budget currency is run-count, not tokens (decision 6).** Do not invent a
  token/dollar field on `GoalRun` or a token cost bar — no per-run token
  accounting exists in the system. Cost = iterations-used vs maxIterations + the
  project run-cap headroom. A "$/token" UI would be fiction.
- **Restart reconciliation must be run-ref-aware (decision 10), not status-only.**
  A `running` goal's truth depends on its in-flight maker run's reconciled status
  — read it from the runner registry, don't guess from the goal status alone. A
  goal `running` with a maker that reconciled to `failed` continues (re-dispatch
  with context); a goal `running` with a maker still `paused-limit` stays paused.
- **The discovery automation ships disabled.** Default-on would start proposing
  work on first boot before the operator has registered projects or a mandate —
  `enabled: false` in the seed, turned on from Settings, same posture as any
  autonomous surface.
- The quarantined pipeline e2e pair + documented Playwright reds: baseline on a
  clean worktree BEFORE the phase.

Critical files

- libs/contracts/src/: NEW goals/{goal.schema.ts, goal-run.schema.ts,
  goals.contract.ts}, tasks/task.schema.ts (GoalTaskTarget + union),
  approvals/approval.schema.ts (+ "proposed-task"), activity/activity.schema.ts
  (+3 goal kinds, +goalRunId/goalId refs), automations/automation.schema.ts
  (+discovery target), NEW discovery/proposal.schema.ts (Candidate/Proposal),
  index.ts (exports)
- apps/api/src/goals/: NEW goals.module.ts, goals.storage.service.ts,
  goal-runner.service.ts, goals.controller.ts, goal-runs.controller.ts (+ tests)
- apps/api/src/pipelines/: NEW verify-command.ts (extracted), pipeline-runner.service.ts
  (call the extracted helper), resume-context.ts (reused, unchanged)
- apps/api/src/agents/agent-runner.service.ts + pipelines/pipeline-runner.service.ts
  (optional `workspace?` param on start)
- apps/api/src/tasks/task-scheduler.service.ts (goal dispatch arm),
  task-classifier.service.ts (goal not coherent)
- apps/api/src/discovery/: NEW discovery.module.ts, discovery-triage.service.ts,
  proposed-task-flow.service.ts (+ tests)
- apps/api/src/automations/scheduler.service.ts (discovery dispatch arm)
- apps/api/src/limits-resume/limit-resume.service.ts (scan goals),
  budget/budget.service.ts (countRunning includes goals),
  activity/activity-recorder.service.ts (goal listener),
  briefing/briefing-assembly.ts (watching += goals),
  workspace/workspace.service.ts (checkpoint, reused)
- Seeds: apps/api/data/automations/discovery-triage.json (disabled),
  apps/api/data/skills/triage.skill.md, an example data/goals/*.goal.md,
  apps/api/scripts/seed.mjs; demo seams reused (fake-claude.mjs FAKE_CLAUDE_LIMIT,
  marker-file verifier fixtures)
- apps/web/features/goals/ (NEW TanStack domain), features/runs/run.ts (RunKind +
  goalRunToView), features/runs/components/RunDetail.tsx (goal branch),
  features/tasks/task.ts (goal glyph), i18n/messages/{cs,en}.json
- NEW apps/api/test/goal-loop.e2e.test.ts, discovery.e2e.test.ts; restart +
  paused-limit assertions ride the goal-loop suite; Playwright e2e/ throughline
