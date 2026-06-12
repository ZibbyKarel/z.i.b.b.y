Phase 8 — Multi-engagement scale

▎ First implementation step: save this plan verbatim as docs/plans/phase-8.md
▎ and commit it ("phase 8 plan"), matching the phase-1/2/3/4/5/6 workflow.

Context

ROADMAP.md Phase 8 (lines 425–462): the long-term purpose — several delivery
engagements in parallel, the operator only at the decision points. Three
sub-items: 8.1 budgets and caps (per-project budget in ProjectSchema,
LimitsService feeds a BudgetService, exceeding a cap parks new dispatches
behind a Tier 3 approval via a `spend-past-cap` gate action on the floor, web
budget bars + cap-hit state), 8.2 engagement isolation and parallelism
(per-project concurrency limits — queue, not reject; contention-safe run-dir
and vault writes; briefing groups by project; channel triage tags items with
the matched project), 8.3 ops hardening (launchd service, crash-restart
reconciliation verification, log rotation, Playwright CI on a self-hosted
runner, backup strategy for data/ + vault). Exit criterion: two seeded
engagements progress overnight on a machine that rebooted once, and the
morning briefing accounts for everything.

Phase 7 (voice/operator UX) is deliberately skipped for now — the roadmap
marks it independent of 3–6 and nothing in Phase 8 needs it. Phase 8's stated
dependencies are satisfied: Phase 3 worktrees exist (workspace.service.ts),
Phase 6 briefing exists (verification marked complete 2026-06-12 in
docs/plans/phase-6.md).

Verified ground truth that shapes the design:

- **Tasks are never project-attributed today — the threading exists, unfilled.**
  `TaskSchedulerService.dispatch()` (task-scheduler.service.ts:215) calls
  `agentRunner.start(target.id, text, "" /* project */, …)` and
  `pipelineRunner.start(target.id, taskId, undefined /* projectRef */, …)` —
  both runners accept a project reference and resolve it against the registry
  (`PipelineRunnerService.resolveProject(projectRef)`
  pipeline-runner.service.ts:253–260 — id first, then exact name; never
  throws), but the task path always passes nothing. The classifier
  (task-classifier.service.ts / task-router.ts) has zero project vocabulary
  (verified by grep). Only the manual RunModal path sets a project. Per-project
  budgets, queues, briefing grouping, and triage tagging all hang on closing
  this one gap — and the fix is filling two existing parameters, not new
  plumbing.
- **Runs carry project differently per runner.** `AgentRunSchema.project` is a
  free-form display string (agent-run.schema.ts:30–65);
  `PipelineRunSchema.projectPath` is an absolute path
  (pipeline-run.schema.ts:64–101). `RunRecorderService` already resolves both
  back to a registry id (`resolveProjectRef(run.project)`
  run-recorder.service.ts:98, `resolveProjectByPath(run.projectPath)` :110) —
  the pattern budget accounting copies. Neither run schema has any
  usage/tokens/cost field (verified — nothing parses claude CLI usage output).
- **LimitsService is account-level percentages, not per-project tokens.**
  `LimitsSchema { rolling, weekly: LimitWindowSchema { usedPct 0–100,
  resetsAt }, capturedAt, stale }` (limits.schema.ts:14–34). Source precedence
  (limits.service.ts:75–76): live `UsageFetcher` (minimal `/v1/messages` POST,
  reads `anthropic-ratelimit-unified-5h/7d-utilization` + `-reset` headers,
  usage-fetcher.ts:28–44, OAuth token from the macOS Keychain :47) → fallback
  `RateLimitsReader` (~/.claude/rate-limits.json statusline capture,
  rate-limits.reader.ts:68–94, stale after 10 min :27; memory:
  project_limits_statusline_source). 5-min cache (limits.service.ts:23);
  `noteLimitHit()` (:59–61) busts it and is already wired from the agent
  runner (agent-runner.service.ts:78). **Consequence: a per-project "token
  cap" is unmeasurable today — the honest budget unit is run-count per window,
  plus a global dispatch ceiling expressed in utilization percent.**
- **ProjectSchema is small and registry-backed**: `{ id (ProjectIdSchema =
  AgentIdSchema), name, path, desc?, category?, checks? }`
  (project.schema.ts:20–31), stored as one `_projects.json` registry
  (projects.storage.service.ts:17, atomic temp-file+rename :91–93). CRUD +
  search contract (projects.contract.ts:14–69). `PROJECTS_DIR` env ??
  dataDir("projects") (projects.module.ts:14–16).
- **The dispatch choke point is exactly one method.**
  `createTask(input, now)` (task-scheduler.service.ts:115): future
  `scheduledAt` → persist `scheduled`; else `taskId = storage.newId()` is
  generated BEFORE dispatch (:131) so the run is born linked, then
  `dispatch(text, paths, title, taskId)` → persist `createDispatched`. The
  scheduled-task `tick(now)` (:168, TASK_TICK_MS default 30 s :82–83, "0"
  disables) fires due tasks through the same private `dispatch`. Both
  entrances funnel through one place a guard can wrap.
  `ScheduledTaskStatusSchema = z.enum(["scheduled", "dispatched", "cancelled",
  "failed"])` (task.schema.ts:113–118); `ScheduledTaskSchema` has no
  projectId. `EmptyCatalogError` propagates (no dead task records).
- **No concurrency limit exists anywhere.** `RunnerCore` keeps `private
  readonly runs = new Map<string, RunHandle<R>>()` (runner-core.ts:112),
  registry rebuilt from sidecars on init (:193); dispatch is fire-and-forget —
  scheduler, channel triage and automations can all spawn unbounded parallel
  runs. Run ids: spawn path `${ownerId}_${startedMs}_${pid}` (:297 — child
  pid, unique among live processes), non-spawn path adds a random suffix
  (:329).
- **Restart reconciliation exists and is partially tested.** RunnerCore.init
  reconciles orphans (sidecar rebuild, interrupted relabel,
  runner-core.ts:89–110 docs); `PipelineRunnerService.reconstruct()` (:149)
  rebuilds pipeline runs — approval-parked runs resume only through the
  approval path (:53–59, :121–123), retries-parked runs survive and
  `resumeWithNote` guards `parkedReason === "retries"` (:296);
  `TaskSchedulerService.sweepOutcomes()` runs at bootstrap (:100 area);
  RunRecorder sweeps missed terminal runs. Existing restart e2e: agent runs
  (agent-runs.e2e.test.ts:306–399) + pieces in pipelines/approvals/channels
  suites. Missing: queued/held tasks (new in this phase), watcher cursors
  under kill, parallel-load restart.
- **Worktrees already isolate checkouts.** `WorkspaceService` creates
  `zibby/<runId>-<slug>` (workspace.service.ts:80) under the run dir; cleanup
  tolerates a failed remove by pruning metadata (:112). Parallel runs on one
  project never collide on the checkout — 8.2's isolation work is therefore
  about *shared API-side files*, not git.
- **Shared-file contention points (the actual 8.2 risk list):**
  `VaultService.updateIndex` is read-modify-write on a MOC with no lock
  (vault.service.ts:236–239) — two runs finishing on the same project can race
  the same MOC line; `createNote`/`updateNote` are writeFileAtomic
  (last-writer-wins, acceptable), `appendDaily` is O_APPEND (:154, safe);
  activity log is one appendFile per entry (safe); RunnerCore sidecar updates
  were reported as plain `fs.writeFile` (verify at impl — if so, switch to
  writeFileAtomic); projects `_projects.json` is atomic. The fix is an
  in-process per-path mutex, not file locks — the API is a single process.
- **Gate floor + approvals are ready to grow.** `ASK_FLOOR_ACTIONS = purchase,
  payment, git.force_push, git.push, pr.open, send_email, delete` +
  `pr.merge: deny` (policy.storage.service.ts:79–115); lockstep contract
  across data/POLICY.md, data-test/POLICY.md and DEFAULT_FLOOR (comment at
  :77). `ApprovalRunKindSchema = z.enum(["agent", "pipeline-stage",
  "channel"])` (approval.schema.ts:9); `ApprovalsService` routes
  resume/cancel through the runtime `ResumableRunner` registry keyed by kind
  (register at onModuleInit — the Phase-5 channel precedent, including the
  "unregistered kind silently no-ops" footgun).
- **Activity + briefing are the attribution surfaces.** `ActivityKindSchema`
  is a closed 18-value enum (activity.schema.ts:10–29) and
  `ActivityRefsSchema` is `.strict()` all-optional — new kinds/refs grow
  explicitly (the Phase-6 rule). `BriefingSchema { generatedAt, since,
  headline, nothingNeedsYou, needsYou[], didForYou[], watching[], counts }`
  (briefing.schema.ts:51–61) with flat item schemas (:9–32) — no project
  anywhere; assembly is pure functions in briefing-assembly.ts (snapshot-
  tested). `ChannelItemSchema` has no project field; triage verdicts are
  closed/strict (Phase 5).
- **DS has the budget-bar primitives already**: `Progress { value 0–100,
  tone, height, label }` + exported `getUsageTone(pct)` (0–59 ok / 60–84 warn
  / 85–100 bad, Progress.tsx:70–74), `ProgressRing`, `Stat` — LimitsRings
  (components/layout/LimitsRings/LimitsRings.tsx) is the in-repo example of
  Progress + reset countdown wiring. No new DS components needed.
- **Ops surface today**: API is ts-node runtime, no build step (`api:start` =
  `ts-node -P tsconfig.json src/main.ts`, apps/api/package.json:7; ci.yml
  comment confirms). main.ts reads `Number(process.env.PORT)` with **no
  default** (:65 area) and `CORS_ORIGIN ?? http://localhost:3000`;
  LoggerService is stdout-only JSON, no rotation anywhere. `resolveDataRoot()`
  (shared/data-dir.ts) anchors data to apps/api/data, ZIBBY_DATA_DIR
  repoints. No plist/Dockerfile/pm2/systemd artifacts exist (verified).
  .gitignore data section :9–21 (runs/approvals/tasks/vault/daily/credentials/
  channels/activity ignored; agents/automations/skills whitelisted).
- **CI**: ci.yml = lint/typecheck/test/build on ubuntu-latest, push+PR to
  main, concurrency-cancelled. e2e.yml is gated `if: github.event_name ==
  'workflow_dispatch'` — the DISABLED note says the approval throughline
  "needs the `claude` binary" and dev-server cold-start is flaky. But
  playwright.config.ts boots both servers with isolated `.e2e-data` dirs,
  demo knobs (`AGENT_DEMO_STEPS: "3"`, `CHANNEL_ADAPTER_MODE: "fake"`), and
  no AGENT_RUNNER_MODE/CLAUDE_BIN — the claude-binary claim is likely stale
  (verify at impl); cold-start flake + the documented red baseline (memory:
  project_playwright_e2e_preexisting_failures) are the real blockers.
  `reuseExistingServer: !CI`, workers: 1, 6 specs in e2e/.
- e2e house conventions: per-suite mkdtemp `<RESOURCE>_DIR` env (or one
  ZIBBY_DATA_DIR), every tick knob "0" with `tick(now)` driven directly,
  CLAUDE_BIN=fake-claude.mjs, the two quarantined pipeline e2e tests + the
  documented Playwright reds stay quarantined (memories:
  project_api_flaky_pipeline_e2e, project_playwright_e2e_preexisting_failures
  — baseline via git worktree, never stash/pop).

Decisions taken (defaults chosen, flag if you disagree)

1. **Project attribution is the phase's prerequisite chunk (lands first,
   inside 8.1).** NEW pure `matchProject(projects, { text, paths })` in
   apps/api/src/projects/project-matcher.ts: deterministic, index-first, no
   claude pass — (a) a `paths[]` entry under a project's `path` wins
   (longest-prefix), (b) else word-boundary match of project `id` or `name`
   in the text (longest name wins ties), (c) else null. Budget enforcement
   must be deterministic and token-free; the claude router never learns
   project vocabulary. `TaskSchedulerService.dispatch()` resolves the project
   once and threads `project.id` into the two existing parameters
   (agentRunner.start project arg; pipelineRunner.start projectRef — its
   resolveProject already accepts an id). `ScheduledTaskSchema` +=
   `projectId?: string` (stamped at create/fire). Matching runs over
   sanitized channel-item text too (8.2) — matching is read-only
   classification, no privilege, Law 4 intact.
2. **Budget unit = run-count per window; the global ceiling is utilization
   percent.** `ProjectSchema += budget?: z.object({ dailyRuns:
   z.number().int().positive().optional(), weeklyRuns:
   z.number().int().positive().optional(), maxConcurrent:
   z.number().int().positive().optional() }).strict()`. Token caps per
   project are NOT offered — runs carry no usage data and LimitsService is
   account-level; pretending otherwise would be a lie in the UI. The global
   guard lives in NEW data/budget.json (committed, operator-edited in
   Settings later): `GlobalBudgetSchema { pauseAtRollingPct?: number,
   pauseAtWeeklyPct?: number }.strict()` — when `LimitsService.snapshot()`
   reports usedPct ≥ ceiling (and not stale), every new dispatch is treated
   as over-cap. Windows: calendar day and ISO week in Europe/Prague (the
   scheduler's cron timezone precedent).
3. **BudgetService owns a dispatch ledger, not the activity log.** NEW
   apps/api/src/budget/: `BUDGET_LEDGER_DIR` (env ?? dataDir("budget")),
   `data/budget/<YYYY-MM-DD>.jsonl`, one
   `{ at, projectId?, taskId?, runRef, kind }` line per *started* run via
   single appendFile (the activity-log mechanics: O_APPEND, tolerant
   per-line reader, date-named rotation). Counting = read the window's day
   files, filter by projectId. The activity log stays a best-effort,
   void-recorded accountability record — enforcement data gets its own
   awaited write on the dispatch path. `.gitignore` += `apps/api/data/budget`
   (the ledger; data/budget.json global config is committed — name the
   ledger dir `data/budget-ledger` instead to avoid the ignore/commit clash:
   final call — **ledger at data/budget-ledger/, config at
   data/budget.json**).
4. **Cap semantics: held-for-approval, gate-checked, kind "task".** The
   guard wraps the single dispatch choke point: `createTask` immediate path
   and the tick fire path both call a new private
   `guardedDispatch(taskInput, taskId, projectId)`:
   - `BudgetService.check(projectId, now)` → `{ ok } | { over:
     "project-daily" | "project-weekly" | "global", detail }`.
   - Over-cap → persist the task with NEW status `"held"` (+ `heldReason`
     string), evaluate `{ action: "spend-past-cap" }` through
     `GateEvaluatorService` (floor rule, decision 5) and
     `requestApproval({ runId: taskId, kind: "task", skill: project?.name ??
     "global", action: "spend-past-cap", detail, risk: "medium" })`. The
     approval IS the Tier-3 budget override (Law 3: no auto-spend past
     budget — structural, not advisory).
   - TasksModule registers a `ResumableRunner` for kind `"task"` at
     onModuleInit: `resume(taskId)` re-reads the task and dispatches it
     bypassing the budget check exactly once (the operator just approved the
     overage); `cancel(taskId)` → status `"cancelled"`. Both tolerate a
     missing/already-dispatched task by logging and resolving (the Phase-5
     channel-runner rule).
   - Activity: NEW kinds `"task-held"` and `"task-queued"` (+ refs gains
     optional `projectId`); release rides the existing `task-dispatched`.
5. **Floor gains `spend-past-cap: ask` — three lockstep sites**
   (data/POLICY.md, data-test/POLICY.md, ASK_FLOOR_ACTIONS in
   policy.storage.service.ts:79–87). Harden-only semantics apply unchanged:
   an operator can raise it to deny per-agent context, never lower it below
   ask. The "Never" list is untouched.
6. **Budget failure mode is conservative (fail-closed to ask, never to
   deny).** An unreadable ledger dir or limits snapshot error means the spend
   position is unknown → treat as over-cap (hold + approval) and log loudly.
   "When unsure which tier applies, ZIBBY treats it as the higher one" — and
   Law 3 makes budget the one place fail-open is wrong. A torn/garbage ledger
   line is skipped by the tolerant reader (costs one count, not the day).
   The empty-catalog error path keeps precedence: classification happens
   only after the guard passes, so a held task has no target yet — target is
   assigned on release (re-classify at resume; text is durable on the task).
7. **Read contract**: NEW libs/contracts/src/budget/:
   `BudgetStatusSchema { global: { rolling: LimitWindowSchema, weekly:
   LimitWindowSchema, stale: boolean, pauseAtRollingPct?, pauseAtWeeklyPct?,
   paused: boolean }, projects: Array<{ projectId, name, daily: { used:
   number, cap?: number }, weekly: { used, cap? }, running: number,
   maxConcurrent?: number, queued: number, held: number }> }`.
   `GET /api/budget` (200) — pure read assembled from ledger counts + runner
   registries + task store; `GET /api/budget/config` + `PUT
   /api/budget/config` for the global ceilings (strict schema; the
   operator-owned file, same posture as mandate.json). Register in
   app.contract.ts + index.ts + contract test.
8. **Concurrency queue (8.2) lives in the task layer, drains on run
   terminal.** `maxConcurrent` per project (decision 2; absent = unlimited;
   unattributed tasks never queue). The guard checks
   `BudgetService.countRunning(projectId)` — an in-memory counter maintained
   by subscribing both runners' `onRunStatus` plus a bootstrap recount from
   the registries (they rebuild from sidecars, so restart is covered; the
   RunRecorder subscribe-from-above pattern). At capacity → persist task as
   NEW status `"queued"` (FIFO by createdAt) — no approval, no gate: a queue
   is Tier-1 bookkeeping, not a decision. Drain: TaskSchedulerService's
   existing onRunStatus subscription (outcome write-back) additionally, on
   any terminal status of a project-attributed run, dispatches the oldest
   queued task for that project through the full guard (a queued task can
   become held if the budget filled meanwhile — guard order: budget first,
   then concurrency). Bootstrap sweep re-arms queues after restart.
9. **Status-enum widening is the phase's ripple to chase.**
   `ScheduledTaskStatusSchema` += `"held"` + `"queued"`;
   `ScheduledTaskSchema` += `projectId?`, `heldReason?`, `approvalId?`. Grep
   every consumer before calling 8.1/8.2 done: web FeedStatus union
   (features/runs/run.ts:24), TaskCard status rendering, runs filters
   (Screen.tsx filter list), task contract tests, sweepOutcomes guards
   (`status !== "dispatched"` shortcuts), seed.mjs fixtures, Playwright
   global-setup. Cancel must work for held/queued tasks (extend the existing
   cancel guard from `scheduled`-only to `scheduled|held|queued`; cancelling
   a held task also rejects its approval — single source of truth is the
   approval record, so route held-cancel THROUGH approvals.reject).
10. **Briefing groups by engagement (8.2).** `BriefingNeedsYouItemSchema` and
    `BriefingDidItemSchema` gain `projectId?: string`;
    `BriefingSchema` gains `engagements: Array<{ projectId, name, needsYou:
    number, didForYou: number, queued: number, held: number }>` (sorted by
    needsYou desc, then name) — items keep the flat lists (the card groups
    visually by projectId, "no project" bucket last). Assembly stays pure;
    fixtures + snapshots updated. ActivityRefsSchema += `projectId?` and the
    dispatch/outcome/held/queued emission sites fill it — that's what makes
    didForYou attributable without re-deriving.
11. **Channel triage tags the matched project (8.2).** `ChannelItemSchema +=
    projectId?: string`. The triage flow runs `matchProject` over the
    *sanitized* item text + the integration name before dispatch; the
    dispatched task input carries `projectId` explicitly (createTask gains an
    optional trusted `projectId` input — set only by server-side callers;
    the public contract does NOT accept it from clients this phase — flag if
    you want operator-set project on NewTaskDialog now). InboxPanel shows a
    project Tag when present.
12. **Contention hardening (8.2) = one in-process mutex + atomic sidecars.**
    NEW shared/file-storage `withPathLock(key, fn)` — a Map<string,
    Promise> chain (single API process; multi-process is explicitly out of
    scope and documented). VaultService.updateIndex (and any other
    read-modify-write vault path) wraps its critical section per note path.
    Audit RunnerCore sidecar writes: any plain `fs.writeFile` on a JSON
    sidecar becomes `writeFileAtomic` (a torn sidecar breaks restart
    reconciliation — that's the actual failure mode, not interleaving).
    Run-id collision: spawn path is `ownerId_timestamp_pid` (child pid —
    fine); verify the non-spawn path's random suffix covers same-ms
    same-owner double dispatch (it does, :329); add a unit pin.
13. **launchd, not a daemon framework (8.3).** NEW ops/ directory:
    `ops/com.zibby.api.plist` (RunAtLoad + KeepAlive, WorkingDirectory =
    repo root, `ProgramArguments = [pnpm, api:start]` via absolute pnpm
    path, EnvironmentVariables: PORT=3333, LOG_LEVEL=info, PATH including
    the claude binary dir, StandardOut/ErrorPath →
    ~/Library/Logs/zibby/api.{out,err}.log) + `ops/zibby.newsyslog.conf`
    (newsyslog.d template rotating those two files weekly, keep 8) + NEW
    `docs/ops.md` runbook: install/uninstall (`launchctl bootstrap
    gui/$UID`), the full env-var inventory (every `*_DIR`, tick knobs,
    CLAUDE_BIN, ZIBBY_DATA_DIR, VAULT_DIR, CORS_ORIGIN), log locations,
    health check (`curl /api/health`), upgrade procedure (git pull → pnpm
    install → `launchctl kickstart -k`), crash behavior (KeepAlive restarts;
    reconciliation sweeps make it safe — link the e2e evidence). Hardening
    that falls out: main.ts PORT gets a default (`Number(process.env.PORT
    ?? 3333)`) so the plist can omit it and dev keeps working — today
    `Number(undefined)` is NaN (verify how dev gets a port at impl and pin
    the default accordingly). The web app is documented as
    `web:build` + `web:start` with its own optional plist — the API is the
    butler; the UI being down must never stop runs.
14. **Backup = git for the vault, rsync for data/ (8.3, documented +
    scripted).** The vault is markdown — the answer is a git repo:
    docs/ops.md documents one-time `git init` in the vault dir + a
    launchd-scheduled commit (`ops/com.zibby.backup.plist`, daily, runs NEW
    `apps/api/scripts/backup.sh`). backup.sh: (a) vault: `git add -A &&
    git commit -m "vault backup <date>"` (no remote, no push — Law 3; the
    operator adds a private remote if they want offsite), (b) data/: `rsync
    -a --delete` of the runtime dirs (runs, approvals, tasks, channels,
    activity, budget-ledger, integrations, projects — NOT credentials by
    default; a `--include-credentials` flag exists and the runbook explains
    the tradeoff) to `ZIBBY_BACKUP_DIR` with 7 rotating day-of-week
    subdirs. Idempotent, no-op safe, exits 0 on "nothing to back up".
15. **Playwright CI re-enable (8.3) targets a self-hosted runner, kept off
    fork PRs.** Register the operator machine as a self-hosted runner
    (labels: `[self-hosted, macOS, zibby]`); e2e.yml gains a second job
    `playwright-selfhosted` with `runs-on: [self-hosted, macOS, zibby]`,
    triggered on push to main only (never pull_request — self-hosted +
    untrusted PRs is the classic foot-gun; single-operator repo, but the
    guard costs nothing), `CI=1` so reuseExistingServer is off. First step
    at impl: prove the suite token-free on this machine with CLAUDE_BIN
    unset (the workflow's "needs the claude binary" note is likely stale —
    demo knobs are already in playwright.config.ts apiEnv; if a spec truly
    needs it, point CLAUDE_BIN at fake-claude.mjs in apiEnv, which is the
    documented seam). The ubuntu workflow_dispatch job stays as the manual
    fallback. Promotion to required checks stays deferred until it's been
    green for a while (the existing comment's own rule).
16. **Restart verification (8.3) extends existing suites, not a new
    harness.** Extend pipelines.e2e: retries-parked run survives module
    re-boot over the same data dirs and resume-with-note still works;
    approval-parked stage survives + approve-after-restart resumes (the
    Phase-1.2 promise, now pinned). NEW assertions in tasks e2e: held and
    queued tasks survive restart — held still resumable via its approval,
    queue drains on the next terminal event after re-boot. channels.e2e
    already covers cursor-after-restart dedup; add watcher-killed-mid-tick
    (cursor not advanced → re-poll, no dupes — dedup-by-id makes it safe).
    The "rebooted once" exit criterion is these tests run as one seeded
    scenario, not a new framework.

Implementation order: 8.1 (matcher → schema/ledger → guard+gate+approval →
web) → 8.2 (queue → contention → briefing/triage attribution) → 8.3 (launchd
+ rotation + backup → restart e2e → CI). Each sub-item lands with its tests,
per the standing rules.

---

8.1 Budgets and caps

Contracts:

- projects/project.schema.ts: `budget` object (decision 2) + contract test
  rows (strict, positive ints, partial update allowed).
- tasks/task.schema.ts: `ScheduledTaskStatusSchema` += "held" | "queued";
  `ScheduledTaskSchema` += `projectId?`, `heldReason?`, `approvalId?`
  (decision 9) + contract test.
- approvals/approval.schema.ts: `ApprovalRunKindSchema` += "task". Ripple:
  web approval card label map + testid, storage newId prefix, exhaustive
  switches (the Phase-5/6 grep).
- NEW budget/ (budget.schema.ts + budget.contract.ts + contract test):
  GlobalBudgetSchema, BudgetStatusSchema, GET /api/budget, GET+PUT
  /api/budget/config (decision 7). Register in app.contract.ts + index.ts.
- activity/activity.schema.ts: kinds += "task-held", "task-queued"; refs +=
  `projectId?` (decision 4/10).

API:

- NEW apps/api/src/projects/project-matcher.ts (pure, decision 1) + unit
  tests beside it.
- NEW apps/api/src/budget/: budget.module.ts (imports ProjectsModule,
  LimitsModule, AgentsModule, PipelinesModule — no TasksModule import,
  TasksModule imports BudgetModule; verify no cycle: runners don't import
  budget), ledger.store.ts (append + windowed count, date-named JSONL,
  tolerant reader, injectable now), budget.service.ts (`check(projectId,
  now)` per decisions 2/6 — project windows from ledger counts, global
  ceiling from LimitsService.snapshot() honoring `stale`; `recordDispatch()`
  awaited on the dispatch path; `countRunning(projectId)` per decision 8),
  budget-config.store.ts (data/budget.json, writeFileAtomic, tolerant read →
  `{}`), budget.controller.ts (TsRestHandler + makeErrorMapper).
- task-scheduler.service.ts: `guardedDispatch` wrapping both entrances
  (decision 4); project resolution via matcher before routing (decision 1);
  threading `project.id` into agentRunner.start / pipelineRunner.start;
  ResumableRunner kind "task" registration (resume = release-once, cancel);
  cancel guard widened (decision 9); activity emissions task-held/queued
  with projectId refs.
- Gates: spend-past-cap ask rule in the three lockstep sites (decision 5);
  gates e2e vocabulary extension.
- .gitignore += `apps/api/data/budget-ledger`; seed data/budget.json `{}`.

Web:

- features/projects: `useBudgetQuery` (+ key export) in
  features/projects/queries/; ProjectCard gains two Progress bars (daily /
  weekly: used vs cap, `getUsageTone`; hidden when no budget set) + running
  count Stat; project form dialog gains budget fields (dailyRuns,
  weeklyRuns, maxConcurrent — optional ints).
- features/runs: FeedStatus += "held" | "queued"; TaskCard renders the two
  states (held: warn tone + link to its approval; queued: neutral "waiting
  for a slot in <project>" caption); runs filter list gains them; approvals
  card renders kind "task" ("budget override" label).
- i18n keys (projects.budget*, runs.held/queued, approvals.kindTask) cs+en.
- RunEventsProvider: no new scope needed — task SSE/invalidation paths
  already cover the feed; verify the held→dispatched transition invalidates
  tasks + budget keys (add budget key invalidation on run status events).

Tests:

- project-matcher unit: path-prefix beats name, longest name wins, word
  boundary (no substring false-positives — "web" must not match "webapp"
  project name unless whole-word), diacritics-insensitive name compare
  (Czech project names), null when nothing matches.
- ledger.store unit: append+count across day boundary (injected now), ISO
  week windowing incl. year boundary, Europe/Prague day cut, tolerant
  reader, unreadable dir → check() returns over ("global", unknown-spend)
  per decision 6.
- budget.service unit: caps arithmetic (daily exhausts, weekly exhausts,
  both unset → ok), global ceiling honored only when not stale, fail-closed
  on errors, countRunning maintained over fake runner emitters + bootstrap
  recount.
- task-scheduler unit additions: guard order (budget before concurrency),
  release-once bypass, held cancel routes through approval reject.
- Extend tasks e2e (or NEW budget.e2e.test.ts): seed a project with
  dailyRuns: 1 → first task dispatches (demo runner) and the ledger gains a
  line; second task → status held + pending approval kind "task" with
  action spend-past-cap → approve → task dispatches, runs to done, outcome
  written; reject → cancelled; GET /api/budget reflects used/cap/held
  counts; gates e2e: spend-past-cap floor present, weakening rejected by
  validateHardenOnly.
- web-components: ProjectCard budget bars (tones, hidden when uncapped),
  TaskCard held/queued rendering, approval card kind task, form dialog
  emits budget payload.

8.2 Engagement isolation and parallelism

API:

- Concurrency queue per decision 8: BudgetService.countRunning +
  TaskSchedulerService queue/drain + bootstrap sweep. Queued tasks are
  visible in GET /api/budget (queued count) and the runs feed.
- Contention per decision 12: shared `withPathLock`; VaultService.updateIndex
  wrapped; RunnerCore sidecar write audit → writeFileAtomic; run-id unit pin.
- Channel triage tagging per decision 11: matcher over sanitized text,
  ChannelItemSchema.projectId, task born attributed; activity channel-*
  emissions carry projectId ref when present.
- Briefing per decision 10: schema growth, assembly grouping
  (`buildEngagements` pure fn), fixtures/snapshots.

Web:

- BriefingCard renders engagement groups (project heading + its needsYou/
  didForYou lines; ungrouped bucket last; counts line per engagement).
- InboxPanel project Tag; runs feed queued caption shows project name.

Tests:

- withPathLock unit: interleaved updateIndex calls on one MOC both land
  (sequential), different paths run concurrently.
- briefing-assembly unit: grouped fixture (two projects + unattributed) →
  snapshot; empty engagements when nothing attributed.
- triage flow unit: fixture item mentioning project name → task created
  with projectId; no match → undefined.
- NEW apps/api/test/parallel.e2e.test.ts — the roadmap's stress test: two
  fixture projects (temp git repos), `maxConcurrent: 1` on project A; fire
  two tasks at A + one at B in one tick → A's second task queues, B runs
  immediately; drive A's first run to terminal (demo) → queue drains; assert
  run dirs are disjoint, each activity entry carries the right projectId,
  both project MOCs gained their links (concurrent updateIndex), ledger has
  three lines with correct attribution. Registry stress: spawn N (≈20) demo
  runs across both runners concurrently, assert list()/listAll() integrity
  and no sidecar corruption after a reconstruct().
- Playwright: extend briefing.spec — seeded two-project state shows
  engagement-grouped briefing card (check the red baseline first).

8.3 Ops hardening

- NEW ops/com.zibby.api.plist, ops/com.zibby.backup.plist,
  ops/zibby.newsyslog.conf, apps/api/scripts/backup.sh, docs/ops.md
  (decisions 13/14). main.ts PORT default pin. README gains an "Ops" link
  row.
- Restart e2e extensions per decision 16 (pipelines parked×2, tasks
  held/queued, channels mid-tick kill).
- e2e.yml: playwright-selfhosted job per decision 15 (push-to-main only,
  CI=1); prove token-free locally first; document runner registration in
  docs/ops.md.
- Backup verification test (unit-level, not e2e): backup.sh against a temp
  data root creates the expected layout and is idempotent (run twice);
  credentials excluded by default. (Shell script — test via a small vitest
  exec wrapper in apps/api or a manual checklist in docs/ops.md; prefer the
  exec test, skip on CI-non-macOS if rsync flags differ.)
- Manual (documented in docs/ops.md, not CI): launchctl bootstrap → kill -9
  the API mid-run → KeepAlive restarts it → reconciliation sweeps pass —
  the "machine that rebooted once" rehearsal.

---

Verification

After each sub-item: pnpm lint → npx tsc -p apps/web/tsconfig.json --noEmit
(rtk typecheck lies — memory: project_rtk_typecheck_masking) → pnpm test →
pnpm exec vitest run --project web-components.

Phase exit: pnpm e2e green on a clean tree (worktree baseline BEFORE the
phase; the quarantined pipeline e2e pair + documented Playwright reds stay
quarantined). Then the roadmap's manual proof — the two-engagement overnight:
seed two fixture projects with budgets (A: dailyRuns 2 + maxConcurrent 1),
queue four tasks across them + a fake-channel bug report mentioning project
B, run under launchd, `kill -9` the API once mid-evening, and in the morning:
both engagements progressed, A's overflow is a held task behind a
spend-past-cap approval, the briefing groups by engagement and accounts for
every line (activity JSONL → ledger line → run dir → vault note), and the
log files rotated/landed under ~/Library/Logs/zibby/.

Watch-outs

- **The status-enum widening is this phase's ApprovalRunKind moment.** "held"
  and "queued" ripple through every ScheduledTaskStatus consumer (web
  FeedStatus, filters, TaskCard, sweeps, fixtures, seed.mjs, global-setup).
  Grep exhaustively before calling 8.1 done — a missed switch renders blank
  cards, not errors.
- **Guard placement: budget check must not run for future-scheduled tasks at
  create time** — they park as "scheduled" and get guarded when the tick
  fires them (the cap is about *spending now*, not about intent). Conversely
  the tick path must never bypass the guard.
- **Release-once must be once.** The kind-"task" resume bypasses the budget
  check for that single dispatch but still records to the ledger (the
  overage is real spend and tomorrow's counts must see it) and still honors
  maxConcurrent (an approved overage queues like anything else; budget and
  concurrency are independent axes — decision 8's guard order).
- **Fail-closed needs a circuit breaker for the absurd case**: if the ledger
  dir is unwritable, every dispatch holds and the approvals queue floods.
  Hold the FIRST task and log; subsequent checks within the same process
  lifetime reuse the cached failure → also hold, but requestApproval dedup
  by (kind, runId) prevents approval spam per task. Document in docs/ops.md
  ("if everything is held, check disk").
- **countRunning must not double-count pipeline stage runs** — pipeline
  stages spawn through the same RunnerCore as agent runs in places; count
  *top-level* runs only (agent runs without a parent + pipeline runs),
  verify what onRunStatus emits for stage-level transitions at impl before
  wiring the counter.
- **Briefing/activity projectId is attribution, not authorization** — it
  rides refs/items for grouping only. Channel-matched projects especially:
  matchProject output never feeds the gate evaluator or mandate; a crafted
  message naming a project gains nothing but a label (Law 4).
- **POLICY.md lockstep is three places** (data/POLICY.md, data-test/POLICY.md,
  ASK_FLOOR_ACTIONS) — the standing Phase-3/5 rule; miss one and prod/test
  floors diverge.
- **ApprovalRunKind "task" runner registration**: ChannelsModule's lesson —
  register in onModuleInit or approving a held task silently no-ops
  (`runners.get(kind)?.resume` is `?.`).
- **withPathLock is in-process only.** It fixes the single-API-process
  races (updateIndex). It does NOT make data/ safe for two API processes —
  docs/ops.md must say "one instance per data root" and the launchd plist's
  KeepAlive already guarantees it (launchd never double-starts a label).
- **Ledger vs activity divergence is fine and intended** — the ledger counts
  dispatches for enforcement (awaited), activity records them for
  accountability (void). Don't unify them "for DRY"; their failure modes
  must stay independent.
- **Self-hosted runner hygiene**: push-to-main only, never pull_request;
  the runner user's environment must NOT carry real credentials into e2e
  (the suite sets its own isolated dirs; verify CLAUDE_CONFIG_DIR doesn't
  leak the operator's real rate-limits/keychain into the API under test —
  set HOME-scoped env in the job if needed).
- **newsyslog vs launchd**: launchd holds the log files open; newsyslog
  needs the `B` flag absent and apps tolerant of rotation — or simpler,
  size-capped copytruncate-style rotation (`J` + `G`); verify the chosen
  flags actually rotate under a held-open file descriptor on this macOS
  version (Darwin 27) before documenting.
- **Backup never pushes anywhere** (Law 3): backup.sh commits locally and
  rsyncs to a local/mounted target. Offsite is the operator's explicit
  remote, documented as a manual step.
- The two quarantined pipeline e2e tests + documented Playwright reds:
  baseline on a clean worktree BEFORE the phase (memories:
  project_api_flaky_pipeline_e2e,
  project_playwright_e2e_preexisting_failures).

Critical files

- libs/contracts/src/projects/project.schema.ts (budget),
  tasks/task.schema.ts (statuses + projectId), approvals/approval.schema.ts
  (kind "task"), activity/activity.schema.ts (kinds + projectId ref),
  briefing/briefing.schema.ts (engagements), channels/channel.schema.ts
  (projectId); NEW budget/* (schema + contract + test); app.contract.ts,
  index.ts
- NEW apps/api/src/budget/* (module, ledger store, config store, service,
  controller), apps/api/src/projects/project-matcher.ts
- apps/api/src/tasks/task-scheduler.service.ts (guard, queue, drain, kind-
  "task" runner, projectId threading), apps/api/src/gates/
  policy.storage.service.ts + data/POLICY.md + data-test/POLICY.md
  (spend-past-cap), apps/api/src/memory/vault.service.ts (withPathLock),
  apps/api/src/shared/file-storage/* (withPathLock home),
  apps/api/src/runner/runner-core.ts (sidecar atomicity audit),
  apps/api/src/channels/channel-triage-flow.service.ts (project tagging),
  apps/api/src/briefing/briefing-assembly.ts (+ service), apps/api/src/main.ts
  (PORT default)
- apps/web/features/projects/* (budget bars, form, useBudgetQuery),
  features/runs/* (FeedStatus, TaskCard, filters), features/approvals (kind
  task), features/overview/components/BriefingCard, features/integrations
  (InboxPanel tag), i18n/messages/{cs,en}.json
- NEW ops/{com.zibby.api.plist, com.zibby.backup.plist, zibby.newsyslog.conf},
  apps/api/scripts/backup.sh, docs/ops.md; .github/workflows/e2e.yml;
  .gitignore; apps/api/data/budget.json (seed)
- apps/api/test/{budget,parallel}.e2e.test.ts (NEW) + tasks/pipelines/
  channels e2e extensions; e2e/briefing.spec.ts extension
