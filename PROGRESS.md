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
| 12.7 Worktrees outside the repo | ✅ done (2026-06-14) | shared `worktree-root.ts` (not from data root); all 3 runners cut worktrees in `ZIBBY_WORKTREE_ROOT`/`os.tmpdir()`. Does NOT fix the `ENOTEMPTY` flake (that's the RunnerCore shutdown-await race → 12.9) |
| 12.9 Synchronous reaping on shutdown (NEW) | ⬜ next | make `RunnerCore.shutdown()` await killed children's exit → clears the `ENOTEMPTY` flake |
| 12.8 Durable self-development posture | ⬜ | builder ≠ subject, OS sandbox, budget-as-contract |

**Blast-radius prerequisite** (must be green before pointing the loop at this repo):
12.1–12.4 — ✅ **COMPLETE** (2026-06-14). 12.5 landed first as the safety foundation
(it protects every subsequent `pnpm test` from re-arming the bomb). Remaining 12.6–12.8
are waste/blast-radius reduction + durable posture, not prerequisites.

### Parked / known flakes

- `pipelines.e2e` (PR-gate) + `agent-runs.e2e` `ENOTEMPTY` at `afterAll`. ROOT CAUSE
  (characterized 2026-06-14): the RunnerCore detached child's `.log` write into the
  RUNS dir races `afterAll`'s `fs.rm` because `app.close()`'s SIGTERM (`RunnerCore.
  shutdown()`) is fire-and-forget — it returns before the child stops writing. NOT the
  worktree location (12.7 relocated those and it still flakes) and NOT a 12.x regression.
  All individual tests pass. Fix = **12.9** (await reaping on shutdown).
- `categories.e2e` "rejects a duplicate" — flakes only under full-suite load; passes
  6/6 in isolation. Pre-existing under-load timing flake, unrelated to worktrees.

## Next iteration

**Phase 12.9 — synchronous reaping on shutdown** (the real `ENOTEMPTY` fix, now
root-caused). `RunnerCore.shutdown()` (runner-core.ts ~:298) is `void` and only
`killGroup`s children without awaiting their exit, so `app.close()` returns while a
child is still flushing its `.log` into the RUNS dir → the e2e `afterAll`'s `fs.rm`
races it (`ENOTEMPTY`), and on a real SIGTERM the node process can exit before reaping
finishes. Make `shutdown()` async: after `killGroup`, await each tracked child's
`close` event with a bounded timeout (then `SIGKILL` escalation, mirroring 12.3's
`runShell`); thread the `await` through `AgentRunnerService` + `PipelineRunnerService`
`onModuleDestroy` (already async). This is the principled fix the 12.3 note promised —
NOT a retry-rm in the test. Verify the `pipelines.e2e`/`agent-runs.e2e` ENOTEMPTY is
gone across repeated runs. Then 12.6 (double-verify skip) and 12.8 (durable posture).
