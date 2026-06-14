# ZIBBY — Loop Progress

> Phased self-development on the current branch. One loop iteration = one phase
> slice, design → implement → verify → checkpoint → record. Full roadmap:
> [ROADMAP.md](ROADMAP.md); per-phase plans in [docs/plans/](docs/plans/).

## Phase 12: self-development safety — ✅ COMPLETE (2026-06-14)

Make ZIBBY a safe target for its own loop engine (the "MEMORY BOMB" RCA).
**All items 12.1–12.9 done; full suite 672/672 green.** ZIBBY may now be pointed at
its own repo under the [self-development runbook](docs/ops/self-development.md).
Detailed plan + verified RCA: [docs/plans/phase-12.md](docs/plans/phase-12.md).

## Phase 13: self-development payoff — in progress

The payoff of Phase 12: enforce the last governance piece + prove it end-to-end.
Plan: [docs/plans/phase-13.md](docs/plans/phase-13.md).

| Item | Status | Notes |
| ---- | ------ | ----- |
| 13.1 Enforce the per-goal budget | ✅ done (2026-06-14) | `GoalSchema.budget` was dead schema; now `goalBudgetExceeded()` (windowed run-count from `iterations[].startedAt`) parks `budget` at the iteration boundary. Composes with the 8.1 project cap. 679/679 green |
| 13.2 Self-development exit demonstration | ✅ done (2026-06-14) | e2e in `goal-loop.e2e`: a goal on a sibling fixture checkout finishes `done` with the worktree under `ZIBBY_WORKTREE_ROOT` (not in the repo/data), the subject's HEAD unmoved + tree clean + a `zibby/*` branch present, scoped `["true"]` verifier (no full-repo suite). Also hardened `briefing.e2e` ENOTEMPTY (12.9 idiom). 680/680 green |
| 13.3 launchd daemon + `GOAL_AUTO_RESUME` | ⬜ | unattended builder resumes across reboots |
| 13.4 Test stability under concurrent load (NEW) | ⬜ next | full-suite intermittently reds ~1 assertion/run (categories/projects/memory — each passes 10/10 isolated); concurrency-timing flake, not a cleanup race |

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
- **Under-load assertion flakiness (→ proposed 13.4):** the full 90-file concurrent
  suite intermittently reds ~1 assertion per run, a DIFFERENT suite each time
  (`categories.e2e` "rejects a duplicate", `projects.e2e` "category 409", `memory.e2e`
  "patches a note" all observed) — each passes 10/10 in isolation. Concurrency/timing
  contention, NOT a cleanup race (no ENOTEMPTY). A full run CAN be fully green
  (680/680 seen). Candidate fixes: lower vitest concurrency for e2e, or find the shared
  contention (the 12.5 per-file data seeding copy?).

## Next iteration

**Phase 13.4 — test stability under concurrent load.** The full 90-file e2e suite is
intermittently red (~1 assertion/run, a different suite each time: categories/projects/
memory, all green in isolation). It's NOT a cleanup race (the ENOTEMPTY ones are fixed in
12.9 + briefing) — it's concurrency/timing contention. Investigate + fix so a full
`pnpm test` is reliably green:
- First, characterize: run the full suite ~5× capturing which assertion fails each time;
  look for a shared-resource pattern (the 12.5 per-file `cpSync` data seeding under load?
  a shared temp? CPU-bound timing assertions with tight polls?).
- Likely fixes (cheapest first): bump tight `until()`/poll timeouts in the flaky
  assertions; OR cap vitest e2e concurrency (`poolOptions`/`maxConcurrency`) so 90 forked
  AppModule boots don't thrash the box; OR make the 12.5 seeding lazy/cached so each forked
  file isn't copying ~177 files under contention.
- Exit: full `pnpm test` green across 5 consecutive runs.

Alternatively, **13.3 (launchd + `GOAL_AUTO_RESUME`)** closes the unattended-builder story.
Pick 13.4 first — a reliably-green suite is the foundation the loop's own `pnpm test` gate
depends on. If the operator wants to *actually* self-develop now, the
[runbook](docs/ops/self-development.md) is ready — an operator action, not a loop iteration.
