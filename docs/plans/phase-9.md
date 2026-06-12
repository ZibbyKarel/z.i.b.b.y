Phase 9 — Limit resilience: pause, checkpoint, auto-resume

▎ First implementation step: save this plan verbatim as docs/plans/phase-9.md
▎ and commit it ("phase 9 plan"), matching the phase-1…6/8 workflow.

Context

ROADMAP.md Phase 9 (lines 530–618): a subscription-limit outage is a **pause,
not a failure**. Three sub-items: 9.1 limit-aware halt (new `paused-limit`
terminal-ish status that does not burn retry budget, persisted `resumeAt`,
pre-dispatch + between-stage guards, web badge + countdown), 9.2 auto-resume on
window reset (`LimitResumeService` on a tick, LimitsService confirms headroom,
bounded N cycles then parked, Tier-1 silent + recorded), 9.3 checkpointed
delivery (checkpoint commits on the run branch after each phase + green
verify, `plan.md` checkboxes + `PROGRESS.md`, resume-context prefix on every
resumed/retried phase: "items 1–4 done and committed, continue with item 5").
Exit criterion: a seeded long pipeline halts on a simulated usage limit, the
operator does nothing, the window resets, the run finishes — checkpoint
commits on the branch, `plan.md` fully ticked, briefing accounts for the
pause. Dependencies all delivered: 1.2 stage resume, 3.1 worktrees, 8.1
limits/budget plumbing. 9.1+9.2 land before 9.3.

Verified ground truth that shapes the design (2026-06-12):

- **`detectLimit` is pure and already extracts the reset.**
  apps/api/src/runner/detect-limit.ts:34–45 — four priority-ordered patterns
  (Claude's own "usage limit reached | <epoch-seconds>" first, then the same
  without epoch, generic rate-limit phrasing, bare 429); returns `{ hit,
  resetsAt }` with seconds→ms conversion (:41). Unit-tested
  (detect-limit.test.ts).
- **The detection's only consumer discards everything but the cache bust.**
  runner-core.ts wire(): per-child `limitSeen` flag (:658), first hit calls
  `this.onLimitHit(resetsAt)` (:706–711). agent-runner.service.ts:78 passes
  `() => this.limits.noteLimitHit()` — `resetsAt` dropped.
  **PipelineRunnerService passes `undefined`** (pipeline-runner.service.ts:114)
  — pipeline stages today neither bust the cache nor see the signal at all.
  Fixing that wiring is part of 9.1, not an afterthought.
- **`finalize()` closes over `limitSeen` — classification has a natural home.**
  runner-core.ts:723–758 (inside wire()): awaiting-approval child death →
  `interrupted`; `handle.interrupting` → `interrupted`; else exit code 0 →
  `done`, non-zero → `error`. The closure can see `limitSeen` (and can stash
  the detected `resetsAt`), so "died AND limit seen" is decidable exactly
  where the terminal status is chosen.
- **The safe-paused-state precedent exists and survives restart.**
  `RunStatusSchema = ["running","done","error","interrupted",
  "awaiting-approval"]` (libs/contracts/src/common.schema.ts:19–26) — shared
  by agent runs and stage runs in lockstep (`AgentRunStatusSchema =
  RunStatusSchema`, agent-run.schema.ts:27). The schema comment (:14–18)
  defines the pattern `paused-limit` copies: "a safe paused state with no
  live child … survives a restart unchanged rather than being reconciled to
  interrupted."
- **The respawn machinery is already generic.** Spawn-boundary pause: a
  `pendingSpec` (RunSpec) stashed in memory and on disk
  (runner-core.ts:73, writePendingSpec :828 / readPendingSpec :836 /
  clearPendingSpec :848); `init()` rebuilds handles with it (:235–238);
  `resume()` (:348–387) either releases a live Variant-B child or spawns the
  stashed spec. `resume()` currently no-ops unless
  `status === "awaiting-approval"` (:351) — widening that guard (plus
  stashing the spec at limit-death time) is the whole resume mechanism for
  9.2; nothing new to invent.
- **LimitsService already knows when the window resets.**
  limits.service.ts: `snapshot(): Limits { rolling, weekly:
  { usedPct 0–100, resetsAt epoch-ms|null }, capturedAt, stale }`
  (limits.schema.ts:14–34); 5-min cache that also expires at the earliest
  window reset (:75–83); `noteLimitHit()` busts it (:59–61); in-flight dedup.
  Source precedence: live `UsageFetcher` → `RateLimitsReader` capture file.
  **E2E seam (verified): `UsageFetcher` returns null under VITEST
  (usage-fetcher.ts:119) and the reader resolves
  `${CLAUDE_CONFIG_DIR ?? ~/.claude}/rate-limits.json`
  (rate-limits.reader.ts:46)** — a temp CLAUDE_CONFIG_DIR with a fixture
  capture file gives a test full control of usedPct/resetsAt/stale with zero
  network. Capture goes stale after 10 min (reader :27).
- **The dispatch choke point survived Phase 8 intact and is guard-shaped.**
  `attemptDispatch(task, project, at, …)`
  (task-scheduler.service.ts:270–303): budget check :278 → `markHeld` +
  `holdForApproval`; capacity check :285 → `markQueued`; dispatch :290;
  ledger :296. Both `createTask` (immediate) and `tick()` (:209–232, fires
  `scheduled` tasks whose `scheduledAt ≤ now`; TASK_TICK_MS :123–127, "0"
  disables) funnel through it. `ScheduledTaskStatusSchema =
  ["scheduled","queued","held","dispatched","cancelled","failed"]`
  (task.schema.ts:118–125); `scheduledAt` is absolute epoch ms (:150) — **the
  scheduled+tick machinery is a ready-made "try again at T" mechanism for
  limit-deferred tasks; no new status needed.**
- **Terminal-status sets are load-bearing and must not learn `paused-limit`.**
  `TERMINAL_AGENT = {done,error,interrupted}` / `TERMINAL_PIPELINE =
  {done,failed}` (task-scheduler.service.ts:47–49) drive outcome write-back +
  queue drain (:102–111); agent-runner's onStatus cancels pending approvals
  on terminal (:100–106); RunRecorder sweeps terminal runs. A paused run
  must not write a task outcome, drain a queue slot, or cancel its approvals.
- **The stage driver has clean insertion points.** drive()
  (pipeline-runner.service.ts:480–576): cursor loop; `runStage` :496;
  done → advance (:506–513); failed + loop + retries left → increment retry
  map, `writeFailureContext` (:748–759 → `<phaseId>.failure.txt`, becomes
  handoffSource via placeHandoff :733–745), cursor = loop.to (:517–529);
  exhausted + `then: "park"` → durable `parked`/`parkedReason: "retries"`
  (:534–546). `waitForStage` polls through awaiting-approval (:621–634).
  Escalation rung selection `escalationFor` (:582–586) keys off the retry
  map — a limit pause that skips the retry increment automatically skips
  escalation too. Between-stage check goes at the top of the loop, before
  `runStage`.
- **Restart reconciliation is explicit about what survives.**
  `reconstruct()` (:887–920): running + approval-parked → `failed`
  (:907–914), retries-parked preserved (:918). runner-core `init()`
  (:234–250): awaiting-approval with pendingSpec survives, without one →
  interrupted. Both reconcilers must learn `paused-limit` (survive when a
  pendingSpec or boundary marker exists).
- **resumeParked is the resume-context precedent.** (:288–341): guards
  `parkedReason === "retries"` (:296), note → `<phaseId>.note.md` + appended
  to the failure file (:304–312), retry counter reset, cursor = `loop.to`,
  drive with `handoffSource: parked.failureFile`. `ParkedReasonSchema =
  ["approval","retries"]` (pipeline-run.schema.ts:47–48), `ParkedDetailSchema
  { phaseId, attempts, failureFile, note? }` (:51–58). `PipelineStateSchema =
  ["running","done","parked","failed"]` (:24–25).
- **Checkpoint commits are already legal and half-practiced.** Local
  `git commit` is NOT a gated action: the approval hook classifies only
  rm/clean/push/PR (claude-approval-hook.mjs isDestructive :94–99,
  classifyGit :141–177, classify :252–260) and POLICY.md has no `git.commit`
  rule. Kodér's seed prompt already says commit your work
  (data/agents/koder.md:25); fake-claude has `FAKE_CLAUDE_COMMIT`
  (test/fixtures/fake-claude.mjs:124). Worktrees: branch
  `zibby/<runId>-<slug>` (workspace.service.ts:80), `createWorktree` records
  `{ branch, path, baseRef }` (:74–99), stages spawn with
  `spawnCwd = run.workspace?.path` (pipeline-runner :605), `removeWorktree`
  never deletes the branch (:404–411) — checkpoints persist after worktree
  cleanup.
- **Prompt-assembly seam for the resume prefix exists.**
  `buildClaudeCommand` (claude-run-command.service.ts:207–240):
  `--append-system-prompt` = `withOperatingContract(instructions, grounding)`
  (:219, :126–134); the pipeline composes grounding per-stage
  (pipeline-runner :815–829). A `resumeContext` block rides the same channel.
- **Delivery seed:** data/pipelines/delivery.pipeline.md — architekt → koder
  (loop self, maxRetries 3) → review (loop→koder) → verify → dokumentator →
  pr-autor; handoffs task.md → plan.md → implementation.md → review.md →
  docs.md → pr-draft.md. Agent prompts in data/agents/*.md, seeded by
  apps/api/scripts/seed.mjs.
- **Activity/briefing growth points:** ActivityKindSchema is a closed
  19-value enum (activity.schema.ts:10–31), refs strict all-optional incl.
  runRef/pipelineId/status/projectId (:40–57), `record()` never throws
  (activity-log.service.ts:69). Briefing: needsYou from approvals + parked
  (briefing-assembly.ts:117–134), didForYou via DID_KINDS (:32–39),
  watching + engagements rollup (:88–115).
- **Web ripple surface:** `FeedStatus = RunStatus | "scheduled" | "parked" |
  "held" | "queued"` (features/runs/run.ts:21–26), RUN_STATE display map
  (:203–261), `scheduledTaskToView` (:165–192); Screen.tsx FILTERS (:29–41)
  + "in X m/h" countdown for scheduled (:82–90) + `relative()` (:191–200);
  utils/time.ts `relativeTime`/`compactAgo`; TaskCard held/queued captions
  (TaskCard.tsx:44–49); RunDetail tone switch (:70–76); RunParkedPanel for
  parked runs.
- **Demo seams:** fake-claude.mjs env knobs (FAKE_CLAUDE_FAIL/_COMMIT/
  _STEPS/_DELAY_MS/_INTENT/_PRODUCE/_DUMP_ARGS_FILE); demo-stage.mjs
  (AGENT_DEMO_STEPS, PIPELINE_DEMO_FAIL_PHASES, PIPELINE_DEMO_EMIT_LEARNED).
  runner-core scans every stdout/stderr chunk through detectLimit — a demo
  child that prints a fixture limit line exercises the real classifier.
- e2e house conventions: per-suite mkdtemp dirs, tick knobs "0" with
  `tick(now)` driven directly, the quarantined pipeline e2e pair + documented
  Playwright reds stay quarantined (memories: project_api_flaky_pipeline_e2e,
  project_playwright_e2e_preexisting_failures — baseline via git worktree).

Decisions taken (defaults chosen, flag if you disagree)

1. **`paused-limit` is a new value on the shared `RunStatusSchema`** — agent
   runs and stage runs move in lockstep (the schema's own rule), and the
   pipeline aggregate gains `"paused-limit"` in `PipelineStateSchema`. It is
   modeled on `awaiting-approval`: a safe paused state that survives restart
   unchanged. New persisted fields: `resumeAt: number | null` (epoch ms) and
   `limitResumeCycles: number` on the run sidecar (RunnerRunRecord) and the
   pipeline aggregate. NOT `error` (it isn't a failure), NOT `parked` (it
   must not look like an operator decision and must not burn loop retries).
2. **Classification lives in runner-core's `finalize()`, resumeAt resolution
   lives with the owners.** wire() stashes the detected `resetsAt` next to
   `limitSeen`; finalize: would-be `error` + `limitSeen` → `paused-limit`
   (an `interrupted` stays interrupted — operator intent wins). RunnerCore's
   constructor gains an optional `resolveResumeAt(detected: number | null):
   Promise<number>` callback; both runners supply one backed by
   LimitsService: detected resetsAt → earliest window `resetsAt > now` from
   `snapshot()` → conservative fallback `now + 30 min`. Priority order is the
   roadmap's verbatim. On classification the run's RunSpec (kept on the
   handle from spawn time) is written as a `pendingSpec` — the existing
   spawn-boundary machinery then gives restart survival and respawn for free.
   `resume()`'s status guard widens from `=== "awaiting-approval"` to
   `awaiting-approval | paused-limit`. Secondary signal: if the child died
   without a limit line but LimitsService (fresh, non-stale) reports a window
   at 100 %, classify as `paused-limit` too — the roadmap's "or LimitsService
   shows the window exhausted" clause; implemented in the owners' status
   hook, not in runner-core (keep the core dumb).
3. **Pipeline-side: two pause shapes, one status.** (a) Mid-stage: the stage
   child dies on a limit → stage run becomes `paused-limit` with a stashed
   pendingSpec; `waitForStage` returns the new status; drive() persists the
   aggregate as `paused-limit` (currentStage retained, resumeAt copied up)
   and returns — **without touching the retry map**, so loop budget and the
   escalation ladder are untouched (roadmap: must not burn the retry budget).
   (b) Phase boundary: top of the drive() loop consults
   `LimitsService.snapshot()` before `runStage`; exhausted (decision 6) →
   persist aggregate `paused-limit` with `resumeAt` = earliest reset, no
   stage spawned. Resume (9.2) re-enters: shape (a) via `core.resume(stage)`
   then resume the waitForStage poll; shape (b) by re-driving from
   `currentStage`. PipelineRunnerService finally wires `onLimitHit` (today
   `undefined`) → `limits.noteLimitHit()`.
4. **Limit-deferred tasks reuse the `scheduled` machinery — no new task
   status.** The pre-dispatch guard runs **limit → budget → concurrency**
   (limit first: nothing can run, so neither holding for approval nor
   queueing is the right shape). Exhausted window at dispatch → re-persist
   the task as `scheduled` with `scheduledAt = resumeAt` plus new optional
   fields `deferredReason: "limit"` and `limitDeferrals: number` (counter,
   diagnostic only). The existing tick fires it and the full guard re-runs —
   still exhausted means re-defer with the new resumeAt. Deferral is cheap
   (no spawn, no token), so tasks defer unboundedly; the bounded-cycles rule
   (decision 7) applies only to runs, which are expensive to flap.
5. **Guard failure mode is fail-open at dispatch, fail-closed at resume.**
   Dispatch guard: `stale` or unreadable limits → dispatch anyway (a wrongly
   dispatched run gets classified by 9.1 when it dies; blocking all work on
   a stale capture file would be the outage). Resume scan: `stale` or
   `usedPct ≥ 100` → skip this tick (the roadmap's "LimitsService confirms
   actual headroom — the file may lag"). Exhausted threshold: either window
   `usedPct ≥ 100` with `stale === false`. No new config knob this phase —
   8.1's `pauseAtRollingPct`/`pauseAtWeeklyPct` global budget ceilings remain
   the operator's tunable and run in the budget check as before.
6. **`LimitResumeService` is a new small module on its own tick, runs-only.**
   apps/api/src/limits-resume/ (imports LimitsModule, AgentsModule,
   PipelinesModule; TasksModule untouched — deferred tasks ride the existing
   task tick per decision 4). `LIMIT_RESUME_TICK_MS` env ?? 60 000, "0"
   disables, `tick(now)` public for tests (house convention). Scan both
   runners' registries for `paused-limit`; for each with `now >= resumeAt`:
   confirm headroom (decision 5), then increment `limitResumeCycles` and
   resume. Cycles > `LIMIT_RESUME_MAX` (env ?? 3): pipelines → `parked` with
   NEW `parkedReason: "limit"` + ParkedDetail `{ phaseId: currentStage,
   attempts: cycles, failureFile: <log tail written like writeFailureContext> }`
   — resumable via `resumeParked` (guard widened from `"retries"`-only to
   `retries | limit`; a "limit" resume re-enters at `parked.phaseId`, not
   `loop.to`, and does NOT reset the loop retry map); agent runs → `error`
   with a readable reason ("usage limit flapped N times") since agent runs
   have no parked state. Resume order: oldest `resumeAt` first, and re-check
   headroom between resumes — a thundering herd at window reset would
   re-exhaust instantly.
7. **Tier 1 silent + recorded.** New activity kinds `"run-paused-limit"` and
   `"run-resumed-limit"` (refs: runRef, pipelineId?, projectId?, status —
   all existing fields), emitted by the owners' status hooks (pause) and
   LimitResumeService (resume). Briefing: `watching[]` gains currently
   paused-limit runs ("pipeline X paused on the usage limit, resumes ~04:30")
   assembled from live run state like parked runs are today; the two activity
   kinds join the feed but NOT DID_KINDS (the existing
   run-finished/pipeline-finished entry already accounts for the eventual
   completion; the roadmap's briefing sentence falls out of watching+finished
   without double counting). No notification — pausing is not one of Phase
   6.3's three notification kinds, and stays that way (a parked-after-flap
   run IS already covered by the parked notification).
8. **Checkpoint commits are a runner concern (9.3), deterministic, not a
   prompt hope.** After a stage lands `done` and `run.workspace` exists,
   pipeline-runner runs `git add -A && git commit -m
   "zibby-checkpoint(<phaseId>): <first line of produces file, else attempt
   n>"` in the worktree via a new `WorkspaceService.checkpoint(workspace,
   phaseId, summary)`; skipped when `git status --porcelain` is empty.
   "Inside Kodér after each green verify pass" is satisfied structurally:
   verify is its own phase, and its `done` triggers a checkpoint like any
   other. Kodér's incremental commits stay prompt-driven (koder.md already
   commits). Checkpoints recorded on the aggregate: `checkpoints:
   Array<{ phaseId, sha, at }>`. Local commits on the zibby/* branch are
   Tier 1 (verified ungated); 3.2 push/PR gates untouched.
9. **`PROGRESS.md` is runner-maintained; `plan.md` checkboxes are
   agent-maintained.** Runner: after every stage transition (done / failed /
   paused / parked) rewrite `<run cwd>/PROGRESS.md` from the aggregate —
   sections Done (phase + checkpoint sha), In progress, Next, derived
   deterministically from `stageRuns` + `checkpoints` + cursor; pure
   `renderProgress(run)` function, snapshot-tested. Agents: architekt.md
   gains "author plan.md as a checkbox work plan (`- [ ]` items)";
   koder.md/code-review.md/dokumentator.md gain "tick completed plan.md
   items (`- [x]`) as part of done — never re-implement a ticked item."
   Seed .md files + seed.mjs updated together (the seed is data, not code —
   re-seed instructions in the commit message).
10. **One resume-context builder feeds every continuation path.** Pure
    `buildResumeContext({ progressMd, checkpointLog, note?, failureTail? })`
    in apps/api/src/pipelines/resume-context.ts → a fenced block "## Resume
    context — continuation, not restart" stating what is done+committed,
    what to continue with, and "do not re-implement completed items".
    Injected into the stage's `--append-system-prompt` (new optional
    `resumeContext` param threaded through `buildStageCommand` →
    `buildClaudeCommand` alongside grounding) for: limit resume (9.2),
    `resumeParked` with or without note (2.3 path — note rides in),
    and loop back-edge retries (2.x path — failureTail rides in; the
    failure FILE keeps flowing as the consumes handoff exactly as today,
    the prompt block is additive). `checkpointLog` = `git log --oneline
    <baseRef>..HEAD` in the worktree (empty/no-worktree → omitted).
11. **Demo seams for all of it (CI stays token-free).** fake-claude.mjs
    gains `FAKE_CLAUDE_LIMIT` (= reset epoch seconds or "auto" → now+2s:
    print `Claude AI usage limit reached|<epoch>`, exit 1 — flows through
    the real detectLimit/finalize path); demo-stage.mjs gains
    `PIPELINE_DEMO_LIMIT_PHASES` (comma-separated phase ids that emit the
    limit line + exit 1 **on first attempt only**, marker-file convention
    like the fail-once fixtures, so the respawned stage succeeds). E2E
    limits control: temp `CLAUDE_CONFIG_DIR` + fixture rate-limits.json
    (UsageFetcher self-disables under VITEST). LimitResumeService e2e drives
    `tick(now)` with `LIMIT_RESUME_TICK_MS=0`.
12. **Web: `paused-limit` joins FeedStatus with a countdown, no new DS
    component.** RUN_STATE entry `{ badge: "neutral", dot: "wait", glyph:
    "pause", pulse: false }`; runs feed badge text "paused — resumes ~04:30"
    via a new `resumeEta(resumeAt, now)` in utils/time.ts (absolute HH:MM
    when < 24 h, else relative; locale via existing i18n); Screen FILTERS +=
    "paused-limit"; RunDetail shows pause reason, reset countdown, and
    `limitResumeCycles` ("auto-resume 2/3"); TaskCard scheduled caption
    swaps to "waiting for the usage window (~04:30)" when
    `deferredReason === "limit"`. i18n keys cs+en.

Implementation order: 9.1 (schema + classifier + pendingSpec stash → guards →
web badge) → 9.2 (resume service → bounded parking → activity/briefing) →
9.3 (checkpoints → PROGRESS/plan contract → resume-context injection). Each
sub-item lands with its tests, per the standing rules.

---

9.1 Limit-aware halt

Contracts:

- common.schema.ts: `RunStatusSchema` += `"paused-limit"` (update the
  doc-comment — second safe-paused state). Ripple is decision-12 web +
  every exhaustive status switch (see Watch-outs).
- agents/agent-run.schema.ts + pipelines/pipeline-run.schema.ts: run records
  gain `resumeAt: z.number().int().nullable().optional()` and
  `limitResumeCycles: z.number().int().nonnegative().optional()`;
  `PipelineStateSchema` += `"paused-limit"`. Contract tests extended.
- tasks/task.schema.ts: `ScheduledTaskSchema` += `deferredReason:
  z.enum(["limit"]).optional()`, `limitDeferrals:
  z.number().int().nonnegative().optional()`. No status change.

API:

- runner-core.ts: stash detected `resetsAt` in wire(); finalize classifies
  per decision 2; new constructor option `resolveResumeAt`; keep the RunSpec
  on the handle at spawn so classification can `writePendingSpec`; `resume()`
  guard widened to `awaiting-approval | paused-limit`; `init()` treats
  `paused-limit` like awaiting-approval-with-spec (survives); sidecar
  persists resumeAt/cycles.
- agent-runner.service.ts: pass `resolveResumeAt` (LimitsService-backed,
  decision 2); status hook: skip approval-cancel for `paused-limit`;
  secondary classification (fresh snapshot shows 100 %) before relabeling an
  error.
- pipeline-runner.service.ts: wire `onLimitHit` → noteLimitHit; same
  `resolveResumeAt`; `waitForStage` returns `"paused-limit"`; drive() handles
  it per decision 3a (aggregate paused, retry map untouched, return); top-of-
  loop boundary check per decision 3b; `reconstruct()` preserves
  `paused-limit` aggregates (and their stage pendingSpecs via core.init).
- task-scheduler.service.ts: `attemptDispatch` gains the limit guard first
  (decision 4/5): exhausted → re-persist as `scheduled` with `scheduledAt =
  resumeAt`, `deferredReason: "limit"`, `limitDeferrals + 1`; activity kind
  `task-deferred-limit` (new, see 9.2 contracts note) or reuse —
  **decision: one new kind `"task-deferred-limit"`** so the briefing can
  distinguish "waiting on the window" from operator-scheduled. TERMINAL_*
  sets unchanged (paused-limit is not terminal — verify nothing treats it
  as such).

Web:

- features/runs/run.ts: FeedStatus += "paused-limit" (it arrives via
  RunStatus, so the union grows automatically — update RUN_STATE map +
  pipeline aggregate mapping); Screen FILTERS += entry; countdown per
  decision 12; RunDetail pause panel; TaskCard deferred caption; i18n cs+en.

Tests:

- runner-core unit: finalize matrix (error+limit → paused-limit with
  resumeAt from detection; error+limit+no-epoch → resolveResumeAt fallback
  chain; interrupted+limit → interrupted; done+limit → done — a run that
  finished despite a transient 429 line must not pause); pendingSpec written
  on classification; resume() spawns a paused-limit run; init() survives a
  restart with a paused-limit sidecar + spec.
- detect-limit tests: already cover extraction — extend only if patterns
  change (they don't this phase).
- limits-guard unit (task-scheduler): exhausted → deferred with resumeAt;
  stale → dispatches; guard order limit→budget→concurrency pinned.
- e2e (NEW limit-pause.e2e.test.ts, demo runner): agent run with
  FAKE_CLAUDE_LIMIT → `paused-limit` + resumeAt persisted; restart over the
  same dirs → state survives; pipeline with PIPELINE_DEMO_LIMIT_PHASES=koder
  → aggregate `paused-limit`, retry map shows zero consumed retries;
  exhausted fixture rate-limits.json + createTask → task `scheduled` with
  deferredReason "limit"; fresh fixture → dispatches.
- web-components: RUN_STATE paused-limit badge + countdown rendering,
  RunDetail panel, TaskCard deferred caption.

9.2 Auto-resume on window reset

Contracts:

- activity.schema.ts: kinds += `"run-paused-limit"`, `"run-resumed-limit"`,
  `"task-deferred-limit"` (9.1 emits the latter; land the enum growth here
  in one change if 9.1/9.2 ship together, else split).
- pipeline-run.schema.ts: `ParkedReasonSchema` += `"limit"`. Ripple:
  reconstruct() preserve-guard (`parkedReason !== "retries"` at :907 becomes
  a set membership — approval-parked reconciles, retries/limit survive),
  resumeParked guard, RunParkedPanel copy, contract tests.

API:

- NEW apps/api/src/limits-resume/ (module + limit-resume.service.ts + unit
  tests): tick per decision 6 — scan, headroom confirm, oldest-first,
  re-check between resumes, cycle cap → park (pipelines) / error (agent
  runs), activity emissions per decision 7. Registries already expose
  list(); pipelines resume via a new
  `PipelineRunnerService.resumeLimitPaused(runId)` (shape a: core.resume on
  the stage + re-arm waitForStage; shape b: re-enter drive at currentStage —
  with 9.3, both inject resume context).
- briefing-assembly.ts: watching[] gains paused-limit runs (pure, fixtures).
- Both runners: emit `run-paused-limit` activity at classification time
  (9.1 emits state; the activity line belongs to whichever sub-phase lands
  first — keep it in 9.1's owner hooks, listed here because the briefing
  consumes it).

Web:

- No new surfaces beyond 9.1's badge/countdown; BriefingCard renders the
  watching line (existing list — verify copy fits); approvals untouched.

Tests:

- limit-resume.service unit against fake clock + fake limits + fake runner
  registries: not-yet-resumeAt → skip; resumeAt passed but
  reset-still-exhausted → skip; reset-with-headroom → resume + cycle
  increment; cap exhausted → pipeline parked with parkedReason "limit" /
  agent run error; stale snapshot → skip; oldest-first + inter-resume
  re-check (second resume skipped when the first re-exhausts the fixture).
- resumeParked unit: "limit" parked resume re-enters at parked.phaseId, does
  not reset loop retries; "retries" behavior unchanged.
- e2e (extend limit-pause.e2e.test.ts): paused pipeline + flip the fixture
  rate-limits.json to reset → drive limitResume.tick(now) → run continues at
  the same stage to `done`; activity log holds the pause/resume pair with
  matching runRef; cycle-cap path: keep fixture exhausted, tick N+1 times
  with resumeAt elapsing each time (fake-clock the service, not the world) →
  parked, RunParkedPanel-resumable; briefing endpoint shows the watching
  line while paused.

9.3 Checkpointed delivery — commit + mark progress

API:

- workspace.service.ts: `checkpoint(workspace, phaseId, summary)` →
  `{ sha } | null` (clean tree → null); never pushes; tolerant of a deleted
  worktree (logs, returns null).
- pipeline-runner.service.ts: after stage `done` + workspace → checkpoint
  (commit-message summary per decision 8), append to `run.checkpoints`,
  rewrite PROGRESS.md (`renderProgress` pure fn, NEW
  apps/api/src/pipelines/progress.ts) — also rewritten on failed / paused /
  parked transitions so the file always tells the truth.
- NEW apps/api/src/pipelines/resume-context.ts (decision 10) + threading:
  `buildStageCommand` gains `resumeContext?`; injection on limit resume,
  resumeParked, and loop back-edge (assemble from PROGRESS.md +
  `git log --oneline <baseRef>..HEAD` + note/failure tail).
- Seed updates: architekt.md (checkbox plan), koder/code-review/dokumentator
  (.md tick contract per decision 9), delivery.pipeline.md unchanged
  structurally; seed.mjs mirrors; pipeline-run.schema.ts +=
  `checkpoints: Array<{ phaseId, sha, at }>` (contract test).

Web:

- RunDetail: checkpoints list (phase + short sha) and a PROGRESS.md viewer
  (existing log/file panel pattern — read via the run-files surface if one
  exists, else render from the aggregate's checkpoints only and defer the
  file viewer; decide at impl, smallest honest surface wins).

Tests:

- workspace unit (temp git fixture): checkpoint commits when dirty, null
  when clean, message format pinned, branch untouched by cleanup.
- progress unit: renderProgress snapshot for done/in-progress/next +
  checkpoint shas; round-trip stability (render → render = identical).
- resume-context unit: block assembly from fixture PROGRESS + git log +
  note; empty inputs → omitted sections, never an empty fence.
- e2e (fixture repo, demo): delivery-shaped pipeline with
  PIPELINE_DEMO_LIMIT_PHASES on a middle phase + FAKE/demo commits → after
  pause+resume, branch history shows checkpoint commits, the resumed
  stage's dumped argv (FAKE_CLAUDE_DUMP_ARGS_FILE pattern) contains the
  resume-context block, and the marker work product was not produced twice
  (the roadmap's "no item implemented twice", pinned via marker files);
  loop back-edge run also receives the block.

---

Verification

After each sub-item: pnpm lint → npx tsc -p apps/web/tsconfig.json --noEmit
(rtk typecheck lies — memory: project_rtk_typecheck_masking) → pnpm test →
pnpm exec vitest run --project web-components.

Phase exit: pnpm e2e green on a clean tree (worktree baseline BEFORE the
phase; quarantines stay quarantined). Then the roadmap's manual proof: seed
the delivery pipeline on a fixture project, run real-mode with a nearly
exhausted window (or fixture-force it), watch it halt at a phase boundary
with `paused-limit` + countdown in the UI, do nothing, and after reset
confirm: run `done`, branch shows `zibby-checkpoint(...)` commits, plan.md
fully ticked, PROGRESS.md final, activity holds the pause/resume pair, and
the morning briefing reads "pipeline X paused on the usage limit, resumed
~HH:MM, finished".

Watch-outs

- **`RunStatusSchema` growth is THE ripple of this phase.** Grep every
  consumer of RunStatus/AgentRunStatus/stage status before calling 9.1 done:
  TERMINAL_AGENT/TERMINAL_PIPELINE (task-scheduler:47–49 — paused-limit must
  NOT join, or queue drain + outcome write-back fire on a pause),
  agent-runner approval-cancel hook (:100–106), RunRecorder terminal sweep,
  runner-core readers (`status !== "running" && !== "awaiting-approval"`
  loops like waitForStage:621–634 — each must decide pause-aware behavior
  explicitly), web RUN_STATE (a missed entry renders blank cards, not
  errors), Screen filters, seed.mjs, Playwright global-setup, e2e fixtures.
- **A done run that merely SAW a limit line must stay done** — classify only
  on the error path. A 429 that claude retried through is noise; the
  finalize matrix test pins this.
- **`interrupting` beats limit classification** — operator cancel during a
  limit-struck run must land `interrupted`, never `paused-limit` (a pause
  would auto-respawn work the operator killed). finalize order: interrupting
  → awaiting-approval guard → limit → exit code.
- **Concurrency slots: paused-limit counts as occupied.** BudgetService's
  countRunning (8.x) must treat paused-limit as active — releasing the slot
  would double-dispatch at window reset (the queued task AND the resumed run
  both start). Verify what onRunStatus emits and what countRunning filters at
  impl; pin with a unit test.
- **Thundering herd at reset**: every paused run's resumeAt is the same
  epoch. LimitResumeService resumes oldest-first and re-confirms headroom
  between resumes (decision 6); without that, run #1 re-exhausts the window
  and runs #2–#N all flap, burning their cycle caps. The inter-resume
  re-check test is not optional.
- **The 5-min limits cache vs the resume scan**: snapshot() may serve a
  pre-reset cached reading right after resumeAt passes — but the cache
  already expires at the earliest window reset (limits.service.ts:80), so a
  post-reset tick re-fetches. Don't add manual cache busting in the scan;
  rely on the existing expiry (and pin it with the fake-clock unit test).
- **Restart double-resume race**: after a reboot, core.init rebuilds
  paused-limit handles with pendingSpecs AND the resume tick may fire
  immediately. resume() is idempotent-by-guard (status flips to running on
  first call), but verify the tick can't race two resumes of one run
  (in-flight set in LimitResumeService, same pattern as LimitsService's
  inflight dedup).
- **pendingSpec for stages must respawn in the worktree** — the spec's
  spawnCwd is the worktree path; if the worktree was cleaned (run deleted)
  resume must fail soft (log + park), not crash the tick loop. Tolerant
  per-run try/catch in the scan; one bad run never blocks the rest.
- **Boundary-pause aggregates have no pendingSpec** — reconstruct() must
  preserve them by status alone (shape b), while core.init's "awaiting-
  approval without spec → interrupted" rule must NOT swallow paused-limit
  stage runs the same way: a paused stage without a spec after restart is a
  real orphan (its child died unclassified mid-write) → reconcile to
  interrupted and let the aggregate's resume path re-run the stage fresh.
- **Checkpoint commits and the verify stage**: verify runs project checks —
  a checkpoint AFTER verify-done commits whatever lint --fix mutated, which
  is correct (it passed); but never checkpoint after a FAILED stage (a
  red-test tree on the branch is fine for forensics but must not be a named
  checkpoint — `PROGRESS.md` records the failure instead).
- **`git add -A` in the worktree only** — checkpoint() must run with cwd =
  worktree and refuse (log + null) if `workspace.path` doesn't contain a
  `.git` file (worktree marker); never fall back to the project checkout
  (committing the operator's dirty tree would be a Law-1 violation in
  spirit).
- **Prompt-contract drift**: the plan.md tick rule lives in agent .md seed
  files — existing installations keep old agent files. seed.mjs re-seed
  overwrites only on explicit re-run; document in the phase commit that
  delivery agents need re-seeding (or version the seed and log a warning at
  startup when the catalog predates 9.3 — smallest honest answer: a
  README/docs note, no auto-migration this phase).
- **POLICY untouched**: no new gate actions this phase — verify no test
  asserts the floor's exact action list anywhere it would break, and resist
  adding a "limit-override" gate; the cycle cap parks to the operator, which
  is already the Tier-3 surface.
- The quarantined pipeline e2e pair + documented Playwright reds: baseline
  on a clean worktree BEFORE the phase (memories:
  project_api_flaky_pipeline_e2e,
  project_playwright_e2e_preexisting_failures).

Critical files

- libs/contracts/src/common.schema.ts (RunStatusSchema += paused-limit),
  agents/agent-run.schema.ts + pipelines/pipeline-run.schema.ts (resumeAt,
  limitResumeCycles, PipelineState += paused-limit, ParkedReason += limit,
  checkpoints), tasks/task.schema.ts (deferredReason, limitDeferrals),
  activity/activity.schema.ts (3 new kinds)
- apps/api/src/runner/runner-core.ts (finalize classification, resolveResumeAt,
  pendingSpec stash, resume guard, init survival),
  apps/api/src/runner/detect-limit.ts (unchanged, the foundation),
  apps/api/src/agents/agent-runner.service.ts (resolveResumeAt, hook guards),
  apps/api/src/pipelines/pipeline-runner.service.ts (onLimitHit wiring,
  waitForStage, drive boundary check, resumeLimitPaused, reconstruct,
  checkpoint call, resume-context threading),
  apps/api/src/tasks/task-scheduler.service.ts (limit guard, deferral),
  apps/api/src/limits/limits.service.ts (consumed, unchanged)
- NEW apps/api/src/limits-resume/{limit-resume.module.ts,
  limit-resume.service.ts, limit-resume.service.test.ts},
  apps/api/src/pipelines/{progress.ts, resume-context.ts} (+ tests),
  apps/api/src/workspace/workspace.service.ts (checkpoint)
- apps/api/src/briefing/briefing-assembly.ts (watching),
  apps/api/src/activity/ (kind emissions at owner hooks)
- Seeds: apps/api/data/agents/{architekt,koder,code-review,dokumentator}.md,
  apps/api/scripts/seed.mjs; demo seams:
  apps/api/test/fixtures/fake-claude.mjs (FAKE_CLAUDE_LIMIT),
  apps/api/src/pipelines/demo-stage.mjs (PIPELINE_DEMO_LIMIT_PHASES)
- apps/web/features/runs/run.ts (FeedStatus, RUN_STATE),
  features/runs/Screen.tsx (filters, countdown), components/{TaskCard,
  RunDetail, RunParkedPanel}.tsx, apps/web/utils/time.ts (resumeEta),
  i18n/messages/{cs,en}.json
- NEW apps/api/test/limit-pause.e2e.test.ts (+ extensions); restart
  assertions ride the same suite
