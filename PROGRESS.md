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
| 12.4 Gate `reconstruct()` re-dispatch (Law 3) | ⬜ | rehydrate always, re-drive only on explicit opt-in |
| 12.6 Eliminate double verification | ⬜ | skip goal verifier when maker pipeline already verified |
| 12.7 Worktrees outside the repo | ⬜ | relocate to `ZIBBY_WORKTREE_ROOT`/`os.tmpdir()` |
| 12.8 Durable self-development posture | ⬜ | builder ≠ subject, OS sandbox, budget-as-contract |

**Blast-radius prerequisite** (must be green before pointing the loop at this repo):
12.1–12.4. 12.5 ✅ landed first as the safety foundation (it protects every
subsequent `pnpm test` from re-arming the bomb).

### Parked / known flakes

- `pipelines.e2e` (PR-gate) and `agent-runs.e2e` flake at `afterAll` cleanup with
  `ENOTEMPTY` on their own temp run dirs — an unreaped-child / in-tree-worktree
  race. Pre-existing (present at baseline), **not** a 12.5 regression; all
  individual tests pass. Resolved by 12.3 (reaping) + 12.7 (worktree location),
  not by masking the cleanup.

## Next iteration

**Phase 12.4 — gate `reconstruct()` re-dispatch (Law 3) — the last blast-radius
item.** `onModuleInit → reconstruct()` auto-re-drives every `running`/`paused-limit`
goal on each boot (`goal-runner.service.ts` ~:780-820); under `ts-node-dev --respawn`
+ `.env AGENT_RUNNER_MODE=claude` a restart alone spawns real claude — an autonomous
action without approval (Law 3 / Tier 3 violation). Split `reconstruct()` into
**(a) registry rehydration (always)** and **(b) re-driving (gated)**: by default
rehydrate but do NOT `reconcileGoal`/`drive` live runs; surface them as a pending
resume decision. `GOAL_AUTO_RESUME=1` env escape hatch for the eventual launchd
daemon (Phase 8.3). Also wrap the fire-and-forget `void this.trace.run(...drive...)`
calls in `.catch` so a dispatch throw can't become an unhandled rejection. **Watch-out:**
the goal-loop restart e2e currently ASSERTS auto-resume (`survives an API restart
mid-loop`) — it must be updated to drive the resume explicitly (or set
`GOAL_AUTO_RESUME=1`). After 12.4 the blast-radius set (12.1–12.4) is complete; then
12.6 (double-verify), 12.7 (worktrees out of repo — also kills the `ENOTEMPTY` flake),
12.8 (durable posture).
