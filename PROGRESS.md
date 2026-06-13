# ZIBBY — Loop Progress

> Phased self-development on the current branch. One loop iteration = one phase
> slice, design → implement → verify → checkpoint → record. Full roadmap:
> [ROADMAP.md](ROADMAP.md); per-phase plans in [docs/plans/](docs/plans/).

## Current focus — Phase 12: self-development safety

Make ZIBBY a safe target for its own loop engine (the "MEMORY BOMB" RCA).
Detailed plan + verified RCA: [docs/plans/phase-12.md](docs/plans/phase-12.md).

| Item | Status | Notes |
| ---- | ------ | ----- |
| 12.5 Global e2e data-dir + runner-mode isolation | ✅ done (2026-06-14) | temp `ZIBBY_DATA_DIR` (seeded, volatile filtered) + `AGENT_RUNNER_MODE=demo` + fake `CLAUDE_BIN` in `vitest.setup.ts`; `data-dir.ts` VITEST tripwire. Full `pnpm test` no longer touches `apps/api/data` or spawns real claude. 643/643 api tests green. |
| 12.1 Scope/forbid heavy default verifier | ✅ done (2026-06-14) | goal `checks` verifier with no commands + no project checks parks `verifier-scope`, never runs full-repo `DEFAULT_VERIFY_CHECKS` |
| 12.2 Never run checks from inside the repo | ✅ done (2026-06-14) | verifier `spawnCwd` never falls back to `run.cwd`; no worktree/project → park `verifier-scope`. Pure `checksVerifierBlocker` + `drive()` pre-flight park + `runVerifier` floor |
| 12.3 Resource governance in `runShell` + shutdown hook | ✅ done (2026-06-14) | detached pgid spawn + wall-clock timeout (SIGTERM→SIGKILL) + `liveShells` tracking + `onModuleDestroy` reaping + output cap; `main.ts` now `enableShutdownHooks()` so reapers fire on SIGTERM |
| 12.4 Gate `reconstruct()` re-dispatch (Law 3) | ✅ done (2026-06-14) | rehydrate always; boot parks live goals `awaiting-resume` (no auto-dispatch) unless `GOAL_AUTO_RESUME=1`; all `drive()` sites `.catch(onDriveError)` |
| 12.6 Eliminate double verification | ⬜ | skip goal verifier when maker pipeline already verified |
| 12.7 Worktrees outside the repo | ⬜ next | relocate to `ZIBBY_WORKTREE_ROOT`/`os.tmpdir()` — also kills the `ENOTEMPTY` flake |
| 12.8 Durable self-development posture | ⬜ | builder ≠ subject, OS sandbox, budget-as-contract |

**Blast-radius prerequisite** (must be green before pointing the loop at this repo):
12.1–12.4 — ✅ **COMPLETE** (2026-06-14). 12.5 landed first as the safety foundation
(it protects every subsequent `pnpm test` from re-arming the bomb). Remaining 12.6–12.8
are waste/blast-radius reduction + durable posture, not prerequisites.

### Parked / known flakes

- `pipelines.e2e` (PR-gate) and `agent-runs.e2e` flake at `afterAll` cleanup with
  `ENOTEMPTY` on their own temp run dirs — an unreaped-child / in-tree-worktree
  race. Pre-existing (present at baseline), **not** a 12.5 regression; all
  individual tests pass. Resolved by 12.3 (reaping) + 12.7 (worktree location),
  not by masking the cleanup.

## Next iteration

**Phase 12.7 — worktrees outside the repo** (pulled ahead of 12.6 because it also
kills the standing `pipelines.e2e`/`agent-runs.e2e` `ENOTEMPTY` flake). Goal worktrees
are cut at `path.join(root, "worktree")` under `GOAL_RUNS_DIR` — inside the
watched/tested tree (`goal-runner.service.ts` ~:175). Relocate to a dedicated
`ZIBBY_WORKTREE_ROOT` (default `os.tmpdir()/zibby-worktrees`), keep only forensic
artifacts (logs/sidecars/handoffs) under `data/goals/runs`; the worktree-root provider
must NOT derive from `resolveDataRoot` (`shared/data-dir.ts`). Ensure cleanup removes
the out-of-repo worktree on run delete (`workspace.service.ts`). **Investigate** whether
the pipeline/agent RunnerCore worktrees (the actual ENOTEMPTY source) move too, or
whether the flake needs a kill-then-await in the test cleanup — confirm the root cause
before claiming the flake fixed. Then 12.6 (double-verify skip) and 12.8 (durable
posture: builder ≠ subject, OS sandbox, budget-as-contract).
