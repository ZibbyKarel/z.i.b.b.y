BATCH: api-budget-limits

[SEVERITY: Critical] [FILE: apps/api/src/budget/budget.service.ts:85-226] [CATEGORY: race-condition/cap-enforcement]
`check()` and `recordDispatch()` are two separate awaited calls with no lock between them; the immediate-create dispatch path (task-scheduler.service.ts:563 → attemptCreate) calls `budget.check` and later appends to the ledger without the `withPathLock("scheduler:drain", …)` protection used on the queue-drain path. Two concurrent task creations for the same project can both read the ledger as under-cap before either records its dispatch, exceeding daily/weekly/monthly run caps (proti zákonu "no auto-spend past budget"). (Přímo souvisí s scheduler atCapacity TOCTOU nálezem.)
Doporučení: wrap the check-then-record sequence in the same per-project/global lock used for the drain path.

[SEVERITY: High] [FILE: apps/api/src/goals/goal-runner.service.ts:513] [CATEGORY: enforcement-data-integrity]
The goal-runner's call to `budget.recordDispatch(...)` is wrapped in `.catch(() => {})`, silently swallowing ledger-write failures — directly contradicting `BudgetService.recordDispatch`'s own doc comment that it is "awaited, NOT best-effort." A failed append permanently undercounts that project's usage, so later `check()` calls pass when they shouldn't.
Doporučení: propagate/log the failure as fail-closed (hold/park), matching task-scheduler's `recordLedger` which does not catch.

[SEVERITY: High] [FILE: apps/api/src/limits/limits.service.ts:77-117] [CATEGORY: missing-tests]
`resolveResumeAt`, `windowExhausted`, and `resumeReadiness` — the exact functions deciding paused-vs-fail and resume timing (the "5h/weekly limits, paused≠fail" contract) — have zero unit tests. `limit-resume.service.test.ts` only exercises `LimitResumeService` against a fully mocked `resumeReadiness`, so the real freshness/headroom logic is untested anywhere.
Doporučení: add direct tests for these three methods covering stale snapshot, both-windows-under-100%, one-window-at-100%, and detected-vs-live reset priority.

[SEVERITY: Medium] [FILE: apps/api/src/budget/budget.service.ts:88-105] [CATEGORY: fail-closed-inconsistency]
The class doc says budget is fail-closed on an "unreadable limits snapshot," but the global-ceiling threshold check only runs `if (!limits.stale)` — a successfully-read-but-stale snapshot (common, since limits go stale after 10 min of Claude Code being closed) silently skips the pause-threshold check instead of holding.
Doporučení: treat `stale` the same as "unreadable" for the global gate, or make the fail-open behavior explicit in the doc.

[SEVERITY: Medium] [FILE: apps/api/src/budget/budget.service.ts:176-207] [CATEGORY: cap-enforcement-accuracy]
Dollar-cap enforcement is a soft, average-based estimate (`spent + avg-of-past-cost-lines`), not a hard per-run cap; a run's true cost is written after the fact by task-scheduler's reconcileOutcome (best-effort). A single unusually expensive run can push actual spend well past the cost caps with no mid-flight stop.
Doporučení: document explicitly as a soft/advisory cap, or add a hard per-run cost ceiling where an estimate exists.

[SEVERITY: Medium] [FILE: apps/api/src/budget/budget.service.ts:130-131,178] [CATEGORY: boundary-inconsistency]
Run-count caps block at the boundary (`used >= dailyRuns`) while cost caps only block strictly above it (`estimate > dailyCostCapUsd`) — asymmetric off-by-one for the same "over-cap" concept.
Doporučení: pick one boundary convention and apply to both axes.

[SEVERITY: Medium] [FILE: apps/api/src/budget/ledger.store.ts:122-146] [CATEGORY: performance/unbounded-io]
No caching on ledger reads (unlike LimitsService's 5-min cache): every `check()` and every row of `status()` re-reads and re-parses the relevant day-files. `status()` issues up to 6 window queries per project, the monthly ones re-reading up to 31 day-files each.
Doporučení: add a short-TTL in-memory cache per (projectId, window, day-set), mirroring LimitsService.

[SEVERITY: Low] [FILE: apps/api/src/budget/budget.service.ts:224-226] [CATEGORY: missing-tests]
`recordDispatch` (and `BudgetLedgerStore.record`) is only exercised indirectly; no test calls it directly or asserts the ledger write on the enforcement path.
Doporučení: add a direct test asserting the exact `LedgerEntry` shape written on dispatch.

[SEVERITY: Low] [FILE: apps/api/src/limits/limits.service.ts:80-85,113-116,133-136] [CATEGORY: duplication]
The "earliest future window reset" computation is repeated near-identically three times across `resolveResumeAt`, `refresh`, and `windowExhausted`.
Doporučení: extract an `earliestFutureReset(snapshot, now)` helper.

[SEVERITY: Low] [FILE: apps/api/src/limits/rate-limits.reader.ts:84] [CATEGORY: robustness]
`stale = ... || now - capturedAt > STALE_AFTER_MS` doesn't guard against `capturedAt` being in the future (clock skew/corrupted capture); `now - capturedAt` goes negative and reads as fresh instead of triggering the fail-closed stale path.
Doporučení: also treat `capturedAt > now` (beyond a small skew tolerance) as stale.

[SEVERITY: Low] [FILE: apps/api/src/limits/usage-fetcher.ts:119] [CATEGORY: test-boundary-leak]
Production code branches on `process.env.VITEST` to avoid the Keychain/network under tests — couples runtime behavior to a specific test runner's env var; any harness not setting `VITEST` would attempt the real call.
Doporučení: inject a `liveFetchEnabled` flag via DI/config instead of sniffing the test-runner env var.

STATS: 18 souborů, 2397 řádků. Top 3: budget/budget.service.test.ts (390), budget/budget.service.ts (364), budget/ledger.store.test.ts (250).
