# ZIBBY — Loop Progress

> Phased self-development on the current branch. One loop iteration = one phase
> slice, design → implement → verify → checkpoint → record. Full roadmap:
> [ROADMAP.md](ROADMAP.md); per-phase plans in [docs/plans/](docs/plans/).

## Phase 12: self-development safety — ✅ COMPLETE (2026-06-14)

Make ZIBBY a safe target for its own loop engine (the "MEMORY BOMB" RCA).
**All items 12.1–12.9 done; full suite 672/672 green.** ZIBBY may now be pointed at
its own repo under the [self-development runbook](docs/ops/self-development.md).
Detailed plan + verified RCA: [docs/plans/phase-12.md](docs/plans/phase-12.md).

## Phase 13: self-development payoff — ✅ COMPLETE (2026-06-14)

The payoff of Phase 12: enforce the last governance piece + prove it end-to-end.
**All of 13.1–13.4 done; full api suite reliably 684/684.**
Plan: [docs/plans/phase-13.md](docs/plans/phase-13.md).

## Phase 14: operator UX for the new goal/loop states — in progress

Closes the UX gap Phases 12/13 opened (raw enum park reasons, unshown goal budget).
Plan: [docs/plans/phase-14.md](docs/plans/phase-14.md).

| Item | Status | Notes |
| ---- | ------ | ----- |
| 14.1 Surface goal park reasons + budget (web) | ✅ done (2026-06-14) | friendly cs/en labels for `verifier-scope`/`awaiting-resume`/`budget`/… + next-step hints + a goal-budget bar (windowed runs vs `goal.budget`); raw enum no longer shown. web-components 211/211 |
| 14.2 Roadmap ground-truth refresh + Playwright audit | ⬜ next | "Where we are today" is a month stale; run/repair `pnpm e2e` for goal/loop/self-dev surfaces |

| Item | Status | Notes |
| ---- | ------ | ----- |
| 13.1 Enforce the per-goal budget | ✅ done (2026-06-14) | `GoalSchema.budget` was dead schema; now `goalBudgetExceeded()` (windowed run-count from `iterations[].startedAt`) parks `budget` at the iteration boundary. Composes with the 8.1 project cap. 679/679 green |
| 13.2 Self-development exit demonstration | ✅ done (2026-06-14) | e2e in `goal-loop.e2e`: a goal on a sibling fixture checkout finishes `done` with the worktree under `ZIBBY_WORKTREE_ROOT` (not in the repo/data), the subject's HEAD unmoved + tree clean + a `zibby/*` branch present, scoped `["true"]` verifier (no full-repo suite). Also hardened `briefing.e2e` ENOTEMPTY (12.9 idiom). 680/680 green |
| 13.4 Test stability under concurrent load | ✅ done (2026-06-14) | `vitest.config.ts` cap forks `max(2,cpus/2)` + `testTimeout/hookTimeout 30s` + `pipelines.e2e until` 25s. **5/5 consecutive full runs green (680/680)** |
| 13.3 launchd daemon + `GOAL_AUTO_RESUME` | ✅ done (2026-06-14) | plist gains `GOAL_AUTO_RESUME=1` + `ZIBBY_WORKTREE_ROOT`; deployment.md resume-semantics + self-dev cross-ref; guard test. **CLOSES PHASE 13** |

| Item | Status | Notes |
| ---- | ------ | ----- |
| 12.5 Global e2e data-dir + runner-mode isolation | ✅ done (2026-06-14) | temp `ZIBBY_DATA_DIR` (seeded, volatile filtered) + `AGENT_RUNNER_MODE=demo` + fake `CLAUDE_BIN` in `vitest.setup.ts`; `data-dir.ts` VITEST tripwire. Full `pnpm test` no longer touches `apps/api/data` or spawns real claude. 643/643 api tests green. |
| 12.1 Scope/forbid heavy default verifier | ✅ done (2026-06-14) | goal `checks` verifier with no commands + no project checks parks `verifier-scope`, never runs full-repo `DEFAULT_VERIFY_CHECKS` |
| 12.2 Never run checks from inside the repo | ✅ done (2026-06-14) | verifier `spawnCwd` never falls back to `run.cwd`; no worktree/project → park `verifier-scope`. Pure `checksVerifierBlocker` + `drive()` pre-flight park + `runVerifier` floor |
| 12.3 Resource governance in `runShell` + shutdown hook | ✅ done (2026-06-14) | detached pgid spawn + wall-clock timeout (SIGTERM→SIGKILL) + `liveShells` tracking + `onModuleDestroy` reaping + output cap; `main.ts` now `enableShutdownHooks()` so reapers fire on SIGTERM |
| 12.4 Gate `reconstruct()` re-dispatch (Law 3) | ✅ done (2026-06-14) | rehydrate always; boot parks live goals `awaiting-resume` (no auto-dispatch) unless `GOAL_AUTO_RESUME=1`; all `drive()` sites `.catch(onDriveError)` |
| 12.6 Eliminate double verification | ✅ done (2026-06-14) | `PipelineRun.verifyCommands` marker (runner-set from real execution); goal `makerAlreadyVerified()` skips `runVerifier` only when resolved commands provably equal. 669/669 api green |
| 12.7 Worktrees outside the repo | ✅ done (2026-06-14) | shared `worktree-root.ts` (not from data root); all 3 runners cut worktrees in `ZIBBY_WORKTREE_ROOT`/`os.tmpdir()`. Does NOT fix the `ENOTEMPTY` flake (that's the RunnerCore shutdown-await race → 12.9) |
| 12.9 Synchronous reaping on shutdown | ✅ done (2026-06-14) | `RunnerCore.shutdown()` async, awaits child exit + log flush (SIGTERM→SIGKILL); e2e cleanups use `fs.rm` `maxRetries/retryDelay` (the real flake fix). `ENOTEMPTY` gone across 6 runs; suite hit 660/660 |
| 12.8 Durable self-development posture | ✅ done (2026-06-14) | `docs/ops/self-development.md` runbook (builder ≠ subject, OS sandbox, defense-in-depth, resource-gov-as-contract) + env knobs doc + guard test (subject worktree never under builder tree). **CLOSES PHASE 12** |

**Blast-radius prerequisite** (must be green before pointing the loop at this repo):
12.1–12.4 — ✅ **COMPLETE** (2026-06-14). 12.5 landed first as the safety foundation
(it protects every subsequent `pnpm test` from re-arming the bomb). Remaining 12.6–12.8
are waste/blast-radius reduction + durable posture, not prerequisites.

### Parked / known flakes

- ~~`pipelines.e2e`/`agent-runs.e2e` `ENOTEMPTY`~~ — **FIXED in 12.9** (e2e cleanups now
  use `fs.rm` `maxRetries/retryDelay` + shutdown awaits reaping). Gone across 6 runs.
- `pipelines.e2e` "seeded delivery pipeline > red verify loops back to koder, then
  finishes green" — intermittent demo-timeout assertion flake (the documented
  `project_api_flaky_pipeline_e2e`); passed 6/7 recent runs. Demo-runner timing, NOT a
  cleanup race. Separate from the ENOTEMPTY work.
- ~~Under-load assertion flakiness~~ — **FIXED in 13.4** (`vitest.config.ts`: fork cap +
  wider timeouts + pipelines `until` 25s). 5/5 consecutive full runs green. The full
  `pnpm test` (api) is now reliably 680/680.

## Next iteration

**Phase 14.2 — roadmap ground-truth refresh + Playwright `pnpm e2e` audit.** The roadmap's
"Where we are today (verified 2026-06-11)" block + North-Star gap table are a month stale —
Phases 1–13 closed nearly every listed gap. Re-verify against current reality and rewrite
that section so the roadmap reflects what's shipped (delivery loop, PR gate, second brain,
channels, briefing, voice, budgets, goal loop, self-development safety — all done). THEN
run `pnpm e2e` (Playwright): the loop has exercised api unit/e2e + web-components throughout
but never the browser operator-throughline. Characterize the 3 existing specs' state on the
current tree (they may have drifted), repair any breakage, and add a thin goal/park-state
spec if cheap (the 14.1 GoalDetailPanel surfaces). Heavier (browser + web app boot), so
budget for setup; demo-mode keeps it deterministic. Exit: `pnpm e2e` green + an accurate
roadmap header.

Note: the api `agent-runs.e2e` git-fixture test still flakes ~rarely under full-suite load
(passes isolated) — a residual git-timing transient, candidate to fold into a future test-
hardening pass if it recurs. If the operator wants to self-develop now, the
[runbook](docs/ops/self-development.md) is ready (operator action, not a loop iteration).
- Document the resume semantics: with `GOAL_AUTO_RESUME=1` a restart re-drives
  `running`/`paused-limit` goals (12.4 `reconstruct`); without it they park
  `awaiting-resume`. Cross-reference Phase 8.3 (ops hardening) — this is its goal-loop
  slice. Tie into the existing `docs/ops/deployment.md`.
- Tests: the restart→auto-resume path is already e2e-covered (`goal-loop.e2e` "restart
  with GOAL_AUTO_RESUME=1"); 13.3 adds the plist + a doc-lint/shellcheck of the script,
  not new runtime logic. Mostly ops glue.

This closes Phase 13. After it, the roadmap's North-Star gaps are essentially delivered —
a good moment to re-survey the gap table (Phase 0 "Where we are today") and propose a
Phase 14 from whatever remains (or declare the roadmap done and shift to operator-driven
work). If the operator wants to self-develop now, the
[runbook](docs/ops/self-development.md) is ready.
