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

## Phase 14: operator UX for the new goal/loop states — ✅ COMPLETE (2026-06-14)

Closes the UX gap Phases 12/13 opened (raw enum park reasons, unshown goal budget) and
hardens the Playwright e2e suite. **14.1–14.3 done; `pnpm e2e` 10/10 across 3 runs.**
Plan: [docs/plans/phase-14.md](docs/plans/phase-14.md).

| Item | Status | Notes |
| ---- | ------ | ----- |
| 14.1 Surface goal park reasons + budget (web) | ✅ done (2026-06-14) | friendly cs/en labels for `verifier-scope`/`awaiting-resume`/`budget`/… + next-step hints + a goal-budget bar (windowed runs vs `goal.budget`); raw enum no longer shown. web-components 211/211 |
| 14.2 Roadmap ground-truth refresh + Playwright audit | ✅ done (2026-06-14) | rewrote stale "Where we are today" (all gaps closed); ran `pnpm e2e` → fixed real `pipeline-run.spec` label drift (verified green); parked approval/channels cross-spec contamination → 14.3 |
| 14.3 Playwright cross-spec isolation | ✅ done (2026-06-14) | three compounding defects: text-soup selection (greedy `.first()` "Approve" approved the wrong card → approval/channels seesaw), `.e2e-data` approvals never drained (piled up across runs), and real `claude` for the gated run (non-deterministic). Fixed: kind-scoped `data-testid=approval-card-{kind}`, global-setup drains+gates the queue, `CLAUDE_BIN`→`fake-claude.mjs`+benign intent (token-free, `requires_approval`→catch-all `ask`), durable-outcome asserts. **`pnpm e2e` 10/10 across 3 runs (~48s); web-components 211/211. CLOSES PHASE 14.** |

## Phase 15: re-enable the Playwright e2e job in CI — ✅ COMPLETE (2026-06-14)

14.3 made the e2e suite token-free + cold-start-deterministic, removing the two reasons
the ubuntu `playwright` job in `e2e.yml` was DISABLED (`workflow_dispatch`-only). Phase 15
flipped that gate back on for PRs — thin CI glue, no runtime code. Plan:
[docs/plans/phase-15.md](docs/plans/phase-15.md).

| Item | Status | Notes |
| ---- | ------ | ----- |
| 15.1 Prove cold path + re-enable ubuntu e2e job + guard test | ✅ done (2026-06-14) | proved the CI path locally first — `CI=true pnpm e2e` (forces `reuseExistingServer:false` → fresh boot, GHA's path) **3/3 green ~50s** (also closes the 14.3 "reused-server only" caveat); flipped the ubuntu `playwright` job gate `workflow_dispatch`-only → `if: github.event_name != 'push'` (PR + dispatch; self-hosted macOS keeps push-to-main, no double-run); refreshed the DISABLED note; guard test `apps/api/test/e2e-workflow.test.ts` pins the job shape + the fake-claude `CLAUDE_BIN`. api 688/688, lint+typecheck clean. **CLOSES PHASE 15.** |

## Phase 16: CI e2e flake safety net — ✅ COMPLETE (2026-06-14)

Phase 15's CI e2e job ran with `retries: 0`, so its `trace: "on-first-retry"` was dead
config — a single browser hiccup reds a PR with no diagnostic. Phase 16 adds the bounded
retry-in-CI safety net + on-retry artifacts. Plan: [docs/plans/phase-16.md](docs/plans/phase-16.md).

| Item | Status | Notes |
| ---- | ------ | ----- |
| 16.1 Retry-in-CI + diagnostic artifacts + guard | ✅ done (2026-06-14) | `playwright.config`: `retries: process.env.CI ? 2 : 0` (CI-only; local stays loud) + `trace:"on-first-retry"` / `screenshot:"only-on-failure"` / `video:"retain-on-failure"`; `e2e.yml` both jobs also upload `test-results/`. **Proved the retry path** with a throwaway spec (`expect(testInfo.retry).toBeGreaterThan(0)`) under `CI=true` → Playwright reported "1 flaky" (failed attempt 0, passed retry); deleted, not committed. Real suite `CI=true pnpm e2e` 10/10 (no spurious flaky); guard test extended (api 691/691); lint+typecheck clean. **CLOSES PHASE 16.** |

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

## Phase 14: operator UX for the new goal/loop states — ✅ COMPLETE (2026-06-14)

14.1–14.3 done. Goal park reasons + budget are operator-legible (14.1); the roadmap's
ground truth is current (14.2); and `pnpm e2e` is reliably green (14.3 — 10/10 across 3
repeated local runs, and ~2× faster now that the gated agent run is a token-free stub).

## Next iteration

**Proposed Phase 17 — accessibility smoke (`@axe-core/playwright`).** The CI e2e infra
(15/16) is now the place to add a continuous a11y gate, and the DS already takes a11y
seriously (testid + role/ARIA assertions per CLAUDE.md) — but nothing scans the *composed*
pages for WCAG violations. Add Deque's official `@axe-core/playwright`, write one smoke spec
that loads the key dashboard routes (`/overview`, `/runs`, `/memory`, `/integrations`, …) in
the existing seeded state and asserts **no critical/serious** WCAG 2.2 AA violations. Runs in
the same job 15 enabled, deterministic, locally verifiable. **Key watch-out (scope control):**
axe will likely surface pre-existing violations — keep the phase completable by gating only on
`critical`+`serious` impact (or baseline the current set to a JSON snapshot and assert "no new"),
and fix the few real ones found rather than chasing all ~30% machine-testable WCAG rows at once.
Automated axe covers ~30% of WCAG; this is a regression fence, not a substitute for manual a11y.

Also still open from earlier (fold into a hardening pass if it recurs): the api
`agent-runs.e2e` git-fixture transient under full-suite load (rare; passes isolated — seen
once last iteration in a 688-test run, green on clean re-run). The
[self-development runbook](docs/ops/self-development.md) is ready for a real operator-driven
engagement.
