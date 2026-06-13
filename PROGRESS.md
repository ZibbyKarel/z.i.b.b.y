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
| 12.3 Resource governance in `runShell` + shutdown hook | ⬜ next | timeout + detached group-kill + child tracking + `onModuleDestroy` (also kills the pipelines/agent-runs `ENOTEMPTY` flake) |
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

**Phase 12.3 — resource governance in `runShell` + shutdown hook.** Mirror
`RunnerCore`: `detached:true` spawn capturing a pgid, per-call timeout
(`AbortSignal.timeout` or a `setTimeout` that `killGroup`s, SIGTERM→SIGKILL
escalation after a grace window), a `liveShells` registry added on spawn / removed
on close, an `onModuleDestroy` that reaps tracked children (GoalRunnerService is the
only background service lacking one), and an output-accumulator cap. This also
resolves the standing `pipelines.e2e` / `agent-runs.e2e` `ENOTEMPTY` cleanup flake
(unreaped child holding the temp run dir). Then 12.4 (gate `reconstruct()`
re-dispatch — Law 3) closes the blast-radius set.
