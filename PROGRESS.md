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
| 12.1 Scope/forbid heavy default verifier | ⬜ next | refuse unscoped full-repo `pnpm test` default for goal `checks` verifiers |
| 12.2 Never run checks from inside the repo | ⬜ | guard verifier cwd fallback to `run.cwd` (inside repo) |
| 12.3 Resource governance in `runShell` + shutdown hook | ⬜ | timeout + detached group-kill + child tracking + `onModuleDestroy` |
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

**Phase 12.1 + 12.2** (the verifier-scope blast-radius pair — both live in
`goal-runner.service.ts` `runVerifier`): refuse the unscoped full-monorepo
`DEFAULT_VERIFY_CHECKS` default for goal `checks` verifiers, and never fall back
to a verifier cwd inside the repo. Land together; they share one code site and one
e2e ("no-scope goal parks, never spawns the suite").
