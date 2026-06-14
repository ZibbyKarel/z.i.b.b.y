Phase 12 — Self-development safety: resource governance + meta-circular isolation

Progress (loop tracking)

- [x] 12.5 — Global e2e data-dir + runner-mode isolation (DONE 2026-06-14). vitest.setup.ts
      now pins a fresh temp ZIBBY_DATA_DIR (seeded from real data, volatile/runtime
      subtrees filtered out), AGENT_RUNNER_MODE=demo, and a fake CLAUDE_BIN before any
      AppModule boots. data-dir.ts has a VITEST tripwire that refuses the live
      apps/api/data anchor without an override (+ unit test). Result: full `pnpm test`
      leaves apps/api/data untouched and never spawns real claude; 643/643 deterministic
      api tests green; the cross-suite contamination failures (briefing.e2e + 2 uncollected)
      are gone. Incidental: aligned a stray apps/web PageContainer test to the refactored
      `stretch` prop (pre-existing TS2322 from commit 98796a0, unrelated to Phase 12).
- [x] 12.1 — Scope/forbid the heavy default verifier (DONE 2026-06-14). Goal `checks`
      verifier with neither `commands` nor project `checks` now parks `verifier-scope`
      instead of falling through to the full-repo `DEFAULT_VERIFY_CHECKS`.
- [x] 12.2 — Never run checks from inside the repo (DONE 2026-06-14). Verifier `spawnCwd`
      never falls back to `run.cwd` (inside the repo); no worktree/project → park
      `verifier-scope`. Both guards live in the pure `checksVerifierBlocker` predicate,
      enforced by a `drive()` pre-flight park (before any maker spawns) + a `runVerifier`
      floor. New `verifier-scope` GoalParkedReason. Unit + 2 e2e (no-scope parks; scoped
      but no-project parks; iterations[] empty, suite never spawned). 651/651 api green.
- [x] 12.3 — Resource governance in runShell + shutdown hook (DONE 2026-06-14).
      runShell now spawns `detached` (own process group), tracks the child in a
      `liveShells` set, enforces a wall-clock deadline (`GOAL_VERIFY_TIMEOUT_MS`,
      default 10min) that SIGTERMs the group then escalates to SIGKILL after a 5s
      grace, and caps the output accumulator to a 1MB rolling tail. New
      `onModuleDestroy` reaps tracked children (mirrors RunnerCore.shutdown; reuses
      exported `killGroup`/`isAlive`). `main.ts` now calls `app.enableShutdownHooks()`
      so every service's reaper fires on SIGTERM, not just `app.close()`. Unit: hung
      command times out+killed, output cap holds, onModuleDestroy reaps. NOTE: the
      pipelines/agent-runs `ENOTEMPTY` flake is RunnerCore-side (kill-then-rm race +
      in-tree worktree), addressed by 12.7 — NOT this item.
- [x] 12.4 — Gate reconstruct() re-dispatch (Law 3) (DONE 2026-06-14). `reconstruct()`
      split into always-rehydrate + gated re-drive: by default a `running`/`paused-limit`
      goal on boot is parked `awaiting-resume` (new GoalParkedReason) and surfaced via the
      existing parked queue / `resumeParked` endpoint instead of auto-re-dispatching a
      maker (no silent real-claude spawn on `--respawn`). `GOAL_AUTO_RESUME=1` restores
      auto-reconcile for the eventual launchd daemon. All 4 fire-and-forget `drive()` sites
      wrapped in `.catch(onDriveError)` (dispatch throw → run failed, no unhandled rejection).
      Tests: onDriveError unit; e2e default-gate (restart → parked awaiting-resume → resume →
      done) + daemon-mode restart (GOAL_AUTO_RESUME=1 → auto-continues). **12.1–12.4
      blast-radius set COMPLETE.**
- [ ] 12.6 — Eliminate double verification
- [x] 12.7 — Worktrees outside the repo (DONE 2026-06-14). New shared
      `src/shared/worktree-root.ts` (`resolveWorktreeRoot` + `prepareWorktreeDir`),
      NOT derived from `resolveDataRoot`; default `os.tmpdir()/zibby-worktrees`,
      override `ZIBBY_WORKTREE_ROOT`. All THREE runners (goal/pipeline/agent) cut
      worktrees there instead of `path.join(<runDir>, "worktree")` — only forensic
      artifacts stay under `*_RUNS_DIR`. `vitest.setup.ts` pins a per-file temp
      worktree root. `workspace.removeWorktree` already used `git worktree remove
      --force` + `prune` (best practice). Unit: path resolves outside the data root,
      parent created/leaf left for git. CORRECTION: this does NOT fix the
      `pipelines/agent-runs` `ENOTEMPTY` flake — that is the RunnerCore detached
      child's `.log` write into the RUNS dir racing `afterAll`'s `fs.rm` after
      `app.close()`'s ASYNC SIGTERM (a shutdown-await race), independent of worktree
      location. See 12.9 below.
- [x] 12.9 — Synchronous reaping on shutdown (DONE 2026-06-14). `RunnerCore.shutdown()`
      is now `async` and awaits each live child's exit + log-stream `finish` (5s grace →
      SIGKILL, `unref`'d timer) via `reapOnShutdown`; both runners' `onModuleDestroy` now
      `await this.core.shutdown()`. CORRECTION to the original hypothesis: the e2e
      `ENOTEMPTY` was the post-exit log-flush transient on TERMINAL runs (shutdown skips
      them), so the actual flake fix was the project's own accepted idiom (already in
      `runner-core.test.ts:90-96`): `fs.rm(..., { maxRetries: 5, retryDelay: 50 })` on the
      `pipelines.e2e`/`agent-runs.e2e` cleanups — NOT a paper-over but the documented
      remedy for a benign async-flush race. shutdown-await is the production-correctness
      piece (real SIGTERM no longer exits mid-flush / orphans). Verified: `ENOTEMPTY` gone
      across 6 runs, full suite hit 660/660. Unit: `runner-core.test.ts` shutdown test.
- [ ] 12.8 — Durable self-development posture

Parked / known: two claude-mode worktree e2e suites (pipelines.e2e PR-gate, agent-runs.e2e)
flake at `afterAll` cleanup with `ENOTEMPTY` on their own temp run dirs — an unreaped-child /
in-tree-worktree race, pre-existing (baseline) and exactly the 12.3 (reaping) + 12.7
(worktree location) targets. NOT a 12.5 regression; all individual tests pass. Do not paper
over with retry-rm — the production reaping fix is the real resolution.

Context

ROADMAP.md Phase 12: make ZIBBY a safe target for its own loop engine. The "MEMORY BOMB"
(commit 96d1294, HEAD) was produced by pointing a Phase 10 goal loop at the ZIBBY monorepo
itself on the `ts-node-dev` dev server. It exhausted machine RAM. This phase removes the
structural cause so self-development can never again take the machine down, and is a
**prerequisite for safely pointing Phase 10's loop engine at this repo.**

The root cause is NOT an infinite cycle and NOT a single leaking buffer (both were
adversarially refuted). It is structurally unbounded heavy work with zero resource
governance, run against the very system that drives it. Three identities that stay
separate for a foreign target collapse when the target IS ZIBBY's own repo:

- Process — the verifier runs `pnpm test`, which boots a SECOND `AppModule` → a second
  `GoalRunnerService.reconstruct()` → re-dispatch of the SAME goal from the SAME data dir.
  Recursion.
- Filesystem — the worktree and run artifacts live INSIDE the watched/linted/tested tree,
  so the dev watcher and the verifier's own `pnpm test` traverse them; the builder edits
  files under its own feet.
- Resources — no timeout / kill / cap / reaping, so N overlapping copies (iterations ×
  pipeline retries × `--respawn`) accumulate RAM without a ceiling.

Verified ground truth (file:line) that shapes the design — all confirmed against the code,
not taken from the corrupted RCA note:

- The default checks verifier is the full monorepo suite. `DEFAULT_VERIFY_CHECKS =
  ["pnpm lint", "npx tsc --noEmit", "pnpm test"]` (libs/contracts/src/pipelines/
  pipeline.schema.ts:45). Resolution chain `opts.commands ?? opts.projectChecks ??
  [...DEFAULT_VERIFY_CHECKS]` (apps/api/src/pipelines/verify-command.ts:23) — reached when
  a goal's `{kind:"checks"}` verifier has neither explicit `commands` nor a project
  `checks` (goal-runner.service.ts:390-396). Assembled as `/bin/sh -c "<a> && <b> && <c>"`
  (verify-command.ts:18-29); no `--filter`/scope is ever injected. (Side caveat: the
  `npx tsc --noEmit` step uses the base tsconfig, which does not even cover apps/web.)
- It runs from INSIDE the repo when there is no project/worktree. cwd is
  `spawnCwd ?? run.cwd` where `spawnCwd = run.workspace?.path ?? project?.path`
  (goal-runner.service.ts:394-396); with neither, cwd = `run.cwd =
  path.join(this.dir, goalRunId)` (:121-134), and `this.dir = GOAL_RUNS_DIR` (:91,
  goals.module.ts:21) defaults to `dataDir("goals","runs")`, anchored to apps/api/data via
  `__dirname` (shared/data-dir.ts:15-22). So `pnpm test` runs from
  apps/api/data/goals/runs/<id> and climbs to the repo root → whole workspace suite. The
  bombed run had `projectPath: undefined` → no worktree → exactly this path.
- Double verification per iteration. The delivery pipeline maker has its OWN `verify`
  phase with `loop {to:koder, maxRetries:3, escalate:true, then:park}`
  (apps/api/data/pipelines/delivery.pipeline.md:38-44) → up to 4× the suite per pipeline
  run (retry taken while `(retries ?? 0) < maxRetries`,
  pipeline-runner.service.ts:664,725-742). Then `drive()` runs the goal verifier
  UNCONDITIONALLY afterward (goal-runner.service.ts:244-248) — no guard on `maker.kind`.
  ~5 deterministic suites per iteration in the worst case.
- Zero resource governance. `runShell` (goal-runner.service.ts:419-433) does
  `spawn(command, args, { cwd, stdio:['ignore','pipe','pipe'] })` — NO `detached`, NO
  `signal`, NO `timeout`; the child is a local const, never stored, never `kill()`ed; the
  Promise resolves only on the child's own `close`/`error`. `drive()` and `waitForMaker`
  are `for(;;)` loops with no wall-clock deadline (:210, :527-553). The output accumulator
  is uncapped (`output += d.toString()`, :426-429) — `tailOf` trims to 4000 chars only
  AFTER close (:397). `GoalRunnerService` is the ONLY one of 8 background services that
  lacks an `onModuleDestroy` (`implements OnModuleInit` only, :71) — every other one
  (AgentRunnerService :120-122, PipelineRunnerService :163-165, TaskSchedulerService,
  SchedulerService, ChannelWatcherService, LimitResumeService, RunRecorderService,
  ActivityRecorderService) implements it. So the `checks` verifier shell is orphaned on
  kill/respawn (the `claude` verifier path goes through AgentRunner → RunnerCore and IS
  reaped). Mirror template to copy: `RunnerCore.shutdown()` (runner-core.ts:298-311) +
  `killGroup(pgid)` via `process.kill(-pgid,'SIGTERM')` (:1083-1095), enabled by
  `detached:true` spawn (:336) + `pgid = pid` (:344) + a tracked `RunHandle.child` (:74-96).
- `reconstruct()` auto re-dispatch on every boot. `onModuleInit` unconditionally calls
  `reconstruct()` (:96-99), which reads all `run.json` and for every `running` or
  `paused-limit` run fires `void this.reconcileGoal(run)` (:760-767) → re-attach or
  RE-DISPATCH via `drive()` (:769-811). The dev script is `ts-node-dev --respawn ...`
  (apps/api/package.json:6), so every file save re-runs this; with `.env`
  `AGENT_RUNNER_MODE=claude` (apps/api/.env:4, no `CLAUDE_BIN`) a restart alone spawns a
  real `claude -p`. `drive()` is launched fire-and-forget (`void this.trace.run(...)`,
  :177,808-810) with no `.catch`, so a dispatch-time throw becomes an unhandled rejection.
- E2e meta-circular contamination. All 28 `*.e2e.test.ts` boot the full `AppModule`
  (GoalsModule is in AppModule.imports, app.module.ts:14,37), but only 2 isolate the goal
  dirs (goal-loop.e2e.test.ts:90-91, discovery.e2e.test.ts:37-38). `vitest.setup.ts`
  isolates ONLY `ACTIVITY_DIR` (:16-26) and its own comment names the exact hazard class.
  So 26 suites boot, read the REAL apps/api/data/goals/runs, and `reconstruct()` any live
  goal there. The committed `.env` `AGENT_RUNNER_MODE=claude` leaks into the test process
  (documented in limit-pause.e2e.test.ts:70-73,203-206 and the root cause of the
  pipelines.e2e flake), so a re-dispatched goal drives REAL claude from inside the test
  run. Note: the agent runner has NO demo mode (always real claude,
  agent-runner.service.ts:37,183); only the pipeline runner has the demo seam, gated on
  `AGENT_RUNNER_MODE !== "claude"` (pipeline-runner.service.ts:191,1090,1131-1136).
- Worktrees live inside the repo. `createWorktree` is called with
  `dir: path.join(root, "worktree")` under `GOAL_RUNS_DIR` (goal-runner.service.ts:151),
  i.e. apps/api/data/goals/runs/<id>/worktree — inside the working tree
  (workspace.service.ts:76-94 just runs `git worktree add` at the caller's dir). Latent
  here (the bombed run had no worktree) but a standing hazard for the dev watcher and any
  in-repo `pnpm test`.

Current disk state (verified 2026-06-13): apps/api/data/goals/runs no longer exists and
apps/api/data/goals is empty — the poisoned run is gone, so the acute danger is dormant.
But apps/api/.env:4 still forces `AGENT_RUNNER_MODE=claude`, and the trap reactivates the
instant a `running`/`paused-limit` goal exists on disk.

Operator decisions (to confirm — recommended defaults baked in below)

1.  Default verifier policy (12.1): REFUSE the heavy full-repo default for goals. A
    `{kind:"checks"}` goal verifier with neither `commands` nor project `checks` should
    fail fast with a readable error ("no verifier scope") rather than silently run
    `pnpm test` over the whole monorepo. Alternative (looser): keep a default but make it
    a scoped per-project command. Recommendation: refuse — explicit scope is cheap and the
    silent fallback is the blast trigger.
2.  reconstruct() resume (12.4): OPT-IN, gated. On boot, always rehydrate the in-memory
    registry from disk, but never auto-re-drive. Surface live `running`/`paused-limit`
    goals to the operator as a resume decision (Tier 3 — "prepare, don't auto-act").
    Alternative: an env flag (`GOAL_AUTO_RESUME=1`) for headless daemon mode. Recommendation:
    operator gate by default, env flag only for the eventual launchd daemon (Phase 8.3).
3.  Worktree relocation (12.7): move to `os.tmpdir()` under a `ZIBBY_WORKTREE_ROOT`
    override; keep logs/sidecars/handoffs in data/goals/runs for forensics.

Implementation order: 12.1 → 12.2 → 12.3 → 12.4 break the bomb and should land together on
one branch before any loop is pointed at the repo again. 12.5 also fixes the standing
pipelines.e2e flake and can land immediately/in parallel. 12.6 and 12.7 are
waste/blast-radius reduction. 12.8 is the durable posture and partly depends on Phase 8.1
budgets.

---

12.1 Scope/forbid the heavy default verifier

The single source of the fallback is verify-command.ts:23
(`opts.commands ?? opts.projectChecks ?? [...DEFAULT_VERIFY_CHECKS]`), shared by both the
pipeline verify stage and the goal checks verifier. The fix targets the GOAL caller, not
the shared helper, so the pipeline verify stage (which runs against a real project with a
worktree, Phase 2/3) is untouched.

- In `runVerifier`'s `kind:"checks"` branch (goal-runner.service.ts:390-396): before
  calling `buildVerifyCommand`, require a resolvable scope — explicit `spec.commands`, or
  the resolved project's `checks`. If neither exists, do NOT fall through to
  DEFAULT_VERIFY_CHECKS; mark the iteration's verdict as a hard error
  ("verifier has no scope — refuse full-repo checks") and park the goal (decision #1).
- Optionally make the schema enforce it: VerifierSpecSchema `checks` branch
  (libs/contracts/src/goals/goal.schema.ts:27-30) could require `commands` (or a `scope`)
  so the silent full-repo path is unrepresentable. Defer to a schema change only if the
  runtime guard proves insufficient — a schema change is a contract break.

Files: apps/api/src/goals/goal-runner.service.ts (runVerifier guard); optionally
libs/contracts/src/goals/goal.schema.ts + apps/api/src/pipelines/verify-command.ts (only
if a shared "no unscoped default for goals" param is cleaner than a caller-side guard).

Tests: unit — checks-verifier with no commands + no project → refused/parked, never builds
a `pnpm test` command; with explicit commands → builds them; with project checks → uses
them. e2e — a no-scope goal parks with the readable reason instead of spawning a suite.

12.2 Never run checks from inside the repo

Independent of 12.1: even a scoped command must not run with cwd inside the repo when there
is no project/worktree, or it can still climb to the root.

- In `runVerifier` (goal-runner.service.ts:394-396): when `spawnCwd` (=
  `run.workspace?.path ?? project?.path`) is undefined, do NOT fall back to `run.cwd`
  (which is apps/api/data/goals/runs/<id>, inside the repo). Either skip the checks
  verifier entirely (a project-less goal has nothing local to verify) or run it in an
  isolated temp dir created for the run. Recommendation: skip + record a verdict noting
  "no workspace — checks skipped", consistent with 12.1's refusal posture.
- Guard belongs in the goal runner, not in `buildVerifyCommand` (the pipeline verify stage
  legitimately runs in a resolved project/worktree).

Files: apps/api/src/goals/goal-runner.service.ts (cwd-fallback guard in runVerifier).

Tests: unit — no-project run never resolves a verifier cwd inside the repo; e2e — a
no-project goal completes without spawning any in-repo `pnpm test`.

12.3 Resource governance in runShell + shutdown hook

Mirror RunnerCore exactly so the goal runner inherits the same tracking + reaping the other
seven services already have.

- Tracking: add a registry field, e.g. `private readonly liveShells = new Set<ChildProcess>()`
  (goal-runner.service.ts:72-77), mirroring RunnerCore's runs Map of RunHandle
  (runner-core.ts:74-96,127). Add the child on spawn, remove it in the `close`/`error`
  handlers (:430-431).
- Detached spawn + group kill: spawn the verifier shell with `detached: true` and capture
  the pid as a pgid (goal-runner.service.ts:427), exactly like RunnerCore.start
  (runner-core.ts:336,344). Reuse `killGroup(pgid)` (runner-core.ts:1083-1095) — either
  export it from runner-core or route the verifier shell through RunnerCore so it inherits
  everything for free (preferred if the seam is clean).
- Per-call timeout: add a configurable deadline to `runShell` (env/DI constant) via
  `AbortSignal.timeout(ms)` into spawn, or a `setTimeout` that `killGroup`s the child and
  resolves a timed-out verdict (goal-runner.service.ts:420-433). A hung `checks` command
  must not wedge `drive()` forever.
- Shutdown hook: change the class to `implements OnModuleInit, OnModuleDestroy`
  (import OnModuleDestroy at :6, declare at :71) and add `onModuleDestroy()` next to
  `onModuleInit` (:96) that walks `liveShells` and `killGroup`s each — the mirror of
  AgentRunnerService.onModuleDestroy → RunnerCore.shutdown (:298-311).
- Output cap: stop appending past a max byte budget and keep only a rolling tail
  (goal-runner.service.ts:426-429), instead of relying solely on post-close `tailOf`
  (:397). Latent, but cheap to remove.
- Optional: an overall `drive()` wall-clock deadline that parks the goal on expiry
  (new GoalParkedReason), reusing decideStop/parkGoal (goal-stop.ts, goal-runner :272-289).

Files: apps/api/src/goals/goal-runner.service.ts (registry field, runShell timeout +
detached + tracking, onModuleDestroy, output cap); optionally export helpers from
apps/api/src/runner/runner-core.ts (killGroup/isAlive) or route through RunnerCore.

Tests: unit — runShell with a sleeping fixture command times out, killGroups it, and
returns a timed-out verdict; onModuleDestroy reaps tracked children (mock killGroup);
output accumulator stops at the cap. (Mirror runner-core's existing shutdown tests.)

12.4 Gate reconstruct() re-dispatch (Law 3 compliance)

Auto-resume on boot is an autonomous action without operator approval — it violates Law 3
("ZIBBY prepares; the operator commits") and Tier 3 ("prepare, don't auto-act"). So this is
both a safety fix and a contract fix.

- Split `reconstruct()` (goal-runner.service.ts:760-767) into (a) registry rehydration
  (ALWAYS: readAllAggregates → `this.runs.set`) and (b) re-driving (gated). By default do
  NOT call `reconcileGoal` for `running`/`paused-limit` runs; instead leave them in the
  registry and surface them as a pending resume decision (decision #2 — operator gate).
  A headless-daemon escape hatch (`GOAL_AUTO_RESUME=1`) re-enables auto-reconcile for the
  eventual launchd setup (Phase 8.3).
- Harden the fire-and-forget calls: wrap each `void this.trace.run(..., () => this.drive(...))`
  (goal-runner.service.ts:177,616,791,808-810) in a `.catch` that marks the run
  failed/parked and logs — so a dispatch-time PipelineNotFoundError/AgentNotFoundError can
  never become an unhandled rejection.

Files: apps/api/src/goals/goal-runner.service.ts (reconstruct split + flag, drive .catch);
contract/UI surface for the pending-resume decision can reuse the approvals queue pattern
(kind like "goal-resume") — defer the full UI to a follow-up if it widens scope; the
backend gate (no auto-redispatch) is the load-bearing part.

Tests: unit — boot with a `running` aggregate on disk rehydrates the registry but does NOT
call reconcileGoal/drive; with `GOAL_AUTO_RESUME=1` it does; a dispatch throw inside drive
marks the run failed and emits no unhandled rejection. e2e — restart with a live goal does
not spawn a maker.

12.5 Global e2e data-dir + runner-mode isolation

This is the highest-leverage contamination fix and also resolves the documented
pipelines.e2e flake (project_api_flaky_pipeline_e2e memory).

- Extend apps/api/vitest.setup.ts (today isolates only ACTIVITY_DIR, :16-26) into a true
  isolation barrier that runs before any AppModule boots, in the forked process:
  - `process.env.ZIBBY_DATA_DIR ??= mkdtempSync(...)` — repoints data-dir.ts and therefore
    GOALS_DIR/GOAL_RUNS_DIR and every other `*_DIR` fallback at once.
  - `process.env.AGENT_RUNNER_MODE ??= "demo"` — neutralizes the committed
    apps/api/.env AGENT_RUNNER_MODE=claude leak.
  - `process.env.CLAUDE_BIN ??= <fixtures/fake-claude.mjs>` — no real claude from tests.
  - Register `process.on('exit')` cleanup like the existing ACTIVITY_DIR block.
- Defense in depth: make `resolveGoalsDir`/`resolveGoalRunsDir` (goals.module.ts:15-22) —
  and ideally `resolveDataRoot` (shared/data-dir.ts:15-18) — refuse the real apps/api/data
  anchor under test (NODE_ENV/VITEST) when no override is set, so a future unisolated suite
  fails loudly instead of silently touching live data.
- Stop the committed runner mode from leaking: move `AGENT_RUNNER_MODE=claude` out of the
  tracked apps/api/.env into an untracked local override (or rely on the setup hard-override
  above). Update .env.example accordingly.

Files: apps/api/vitest.setup.ts; apps/api/src/goals/goals.module.ts;
apps/api/src/shared/data-dir.ts; apps/api/.env + apps/api/.env.example.

Tests: the suite itself is the test — a full `pnpm test` after this change must leave
apps/api/data untouched and never spawn real claude. Add an assertion-style unit that
data-dir resolution under VITEST without an override throws/returns a temp path.

12.6 Eliminate double verification

The delivery pipeline already verifies internally; the goal verifier then re-verifies
unconditionally. Skip the second pass when redundant.

- In `drive()` (goal-runner.service.ts:244-248): when `goal.maker.kind === "pipeline"`,
  the maker pipeline contains a `type:"verify"` phase, and the maker run finished `done`
  (its own verify passed), treat the iteration as verifier-satisfied without a second
  deterministic suite. The maker terminal status is already available at :244-245.
- To detect "already verified" reliably, surface a marker from the pipeline runner when a
  verify phase passes (pipeline-runner.service.ts:709-720) — e.g. `verified: true` (and
  the resolved verify commands) on the StageRun/aggregate — so the goal runner can compare
  and skip an identical pass. Optionally add a declarative `VerifierSpec` `kind:"maker"`
  (trust the maker's own verify) or make `verifier` optional for pipeline makers
  (goal.schema.ts:26-37) so the choice is explicit rather than inferred.

Files: apps/api/src/goals/goal-runner.service.ts (conditional verifier);
apps/api/src/pipelines/pipeline-runner.service.ts (verify marker); optionally
libs/contracts/src/goals/goal.schema.ts (declarative opt-out).

Tests: unit — pipeline-maker that passed its verify phase → goal verifier skipped;
pipeline-maker whose verify failed/absent → goal verifier still runs; non-pipeline maker →
unchanged. e2e — a delivery-pipeline goal runs one verification per iteration, not two.

12.7 Worktrees outside the repo

- Compute the worktree base from a dedicated root outside the working tree, not from
  GOAL_RUNS_DIR. Introduce `ZIBBY_WORKTREE_ROOT` (default `os.tmpdir()/zibby-worktrees`)
  and build the worktree dir there (goal-runner.service.ts:151); keep only forensic
  artifacts (logs/sidecars/handoffs) under data/goals/runs. The worktree-root provider
  must NOT derive from `resolveDataRoot` (shared/data-dir.ts:15-17). Mirror for pipeline
  RUNS_DIR / agent RUNS_DIR worktrees if/when they move (out of scope here unless trivial).
- Ensure cleanup removes the out-of-repo worktree on run delete (workspace.service.ts).

Files: apps/api/src/goals/goal-runner.service.ts; apps/api/src/workspace/workspace.service.ts;
goals.module.ts (worktree-root provider/env wiring).

Tests: unit — worktree path resolves under ZIBBY_WORKTREE_ROOT, outside the repo; cleanup
removes it; a git fixture confirms `git worktree add` works at the tmp location.

12.8 Durable self-development posture

Architecture and policy, not a single patch — the lasting shape that makes self-development
safe by construction:

- Builder ≠ subject. The orchestrator that drives self-development must run from a pinned/
  built artifact, NOT `ts-node-dev` on the very tree it edits (apps/api/package.json:6).
  Document a self-development runbook: build ZIBBY, run that build as the builder, point the
  goal at a fresh checkout/worktree of the repo as the subject.
- OS-level sandbox for the verifier. Beyond the in-process timeout (12.3), run the
  subject's checks under a real resource ceiling (container/cgroup memory + cpu cap) so a
  runaway suite is bounded by the OS, not just by ZIBBY's own bookkeeping.
- Resource governance as a contract dimension. The autonomy contract specifies autonomy of
  judgment (tiers, gates) but not autonomy of execution (how much compute one run may
  consume). Add a per-run / per-goal compute + token budget wired into the floor like
  approval-first — composes with Phase 8.1 BudgetService. Until then, the 12.3 timeout +
  12.1/12.2 scoping are the interim ceiling.
- Move `AGENT_RUNNER_MODE=claude` out of the committed .env (covered in 12.5).

Files: docs/ops/* runbook for self-development; ROADMAP/contract note on the resource-
governance dimension; ties into Phase 8.1 when it lands.

Tests: documented runbook; budget-cap e2e reuses Phase 8.1 once available; an integration
smoke that a goal targeting a sibling checkout never touches the builder's own tree.

---

Verification

After each sub-item: pnpm lint → npx tsc -p apps/web/tsconfig.json --noEmit (rtk typecheck
lies) → pnpm test → pnpm exec vitest run --project web-components. Run all e2e from the
repo root, not apps/api (the AGENT_RUNNER_MODE=demo pin must be in effect — local .env
forces claude). Compare any pre-existing e2e failures against a git worktree of a clean
tree, never stash/pop (per project_playwright_e2e_preexisting_failures memory).

Phase exit criterion

A goal targeting the ZIBBY repo itself runs to completion or parks without ever:
(a) running the full monorepo suite from inside the repo (12.1+12.2),
(b) leaving an orphaned child process after an API kill/respawn (12.3),
(c) re-dispatching itself on restart (12.4), or
(d) exhausting RAM;
and `pnpm test` from the repo root is fully isolated from live apps/api/data and never
spawns real claude (12.5). The blast-radius set 12.1–12.4 must be green before any loop is
pointed at this repo again.

Watch-outs

- The 12.5 isolation must land or be applied in the SAME change as any work that runs the
  full suite while a live goal could exist — otherwise the very act of running tests
  re-arms the bomb.
- 12.1 targets the GOAL verifier path only. Do NOT change the shared buildVerifyCommand
  default in a way that breaks the pipeline verify stage (Phase 2/3), which legitimately
  runs project checks in a worktree.
- 12.4's resume gate changes restart behavior: existing operator expectations of
  "it picks up where it left off" become "it offers to". Surface the pending-resume clearly
  so a paused goal is visible, not silently dropped.
- The agent runner has no demo mode (always real claude); only the pipeline runner does.
  Any test that boots AppModule and could reconstruct an agent-maker goal MUST have the
  12.5 fake CLAUDE_BIN in effect.
