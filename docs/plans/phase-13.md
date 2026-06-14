Phase 13 — Self-development payoff: enforced goal budget + the exit demonstration

Context

Phase 12 made ZIBBY a SAFE target for its own loop engine (12.1–12.9 all green). Phase 13
is the payoff: enforce the last resource-governance piece 12.8 only documented, then
prove the whole posture end-to-end. Thin glue over delivered machinery — no new subsystem.

Progress (loop tracking)

- [x] 13.1 — Enforce the per-goal budget (DONE 2026-06-14)
- [ ] 13.2 — Self-development exit demonstration (sibling-checkout smoke)
- [ ] 13.3 — launchd daemon + GOAL_AUTO_RESUME (Phase 8.3 territory)

---

13.1 Enforce the per-goal budget

Verified ground truth: `GoalSchema.budget` is `ProjectBudgetSchema.optional()`
(`libs/contracts/src/goals/goal.schema.ts:52`) = `{ dailyRuns?, weeklyRuns?,
maxConcurrent? }`. But `drive()` only enforces the PROJECT cap via `budgetOk(project)`
(`goal-runner.service.ts:294` → `this.budget.check(project?.id)`). `goal.budget` is read
NOWHERE — dead schema. `maxIterations` is a TOTAL fuse (`decideStop` park-iterations); the
goal budget is a complementary WINDOWED cap.

Implementation (all in `goal-runner.service.ts`):
- New pure `goalBudgetExceeded(budget, iterations, now)`: count `iterations[]` whose
  `startedAt` falls within a rolling 24h (dailyRuns) / 7d (weeklyRuns) window; return true
  if the count has reached the cap. No budget / no caps → false. Self-contained — counts
  from the GoalRun's own iteration records, no external ledger (a goal iteration == one
  maker run, so iteration count IS run count).
- In the `drive()` for-loop, right after the existing project `budgetOk` guard: if the
  goal's own budget is exceeded → `parkGoal(run, "budget", index)` and return. Checked at
  the iteration boundary BEFORE dispatching the maker, so the cap is never overspent.
- Counted at the start of an iteration: at index N, `iterations[]` holds the N prior
  records (the current one is created later by `iterationAt`), so `dailyRuns: K` runs
  exactly K iterations then parks.

Tests:
- unit `goal-budget.test.ts`: windowed counter — no budget → ok; under/at/over dailyRuns;
  weekly window; old iterations outside the window don't count.
- e2e in `goal-loop.e2e.test.ts`: a goal with `budget.dailyRuns: 1` (checks verifier that
  always fails so it would otherwise loop) parks `budget` after exactly one iteration.

Watch-out: `budget` is an existing `GoalParkedReason` (no contract change). The project
cap and goal cap are independent — both checked each iteration, either parks.
