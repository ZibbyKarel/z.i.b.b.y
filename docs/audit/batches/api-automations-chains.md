BATCH: api-automations-chains

[SEVERITY: High] [FILE: apps/api/src/automations/scheduler.service.ts:52-110] [CATEGORY: Concurrent execution / dedup]
`tick()` is invoked from a plain `setInterval` with no re-entrancy guard; if a tick's async work outlives `tickMs`, the next firing starts a second overlapping `tick()`. Both read `storage.list()` before either has called `markFired`, so the same automation can dispatch twice for one due minute — the in-memory "same wall minute" dedup does not protect against overlapping ticks. (Stejný re-entrancy vzor jako channel-watcher tick.)
Doporučení: Guard `tick()` with an `isTicking` flag or serialize via a promise chain.

[SEVERITY: High] [FILE: apps/api/src/automations/scheduler.service.ts:96-107] [CATEGORY: Error handling / cron correctness]
The `for (const automation of ...)` loop in `tick()` has no try/catch around `fire()`; if dispatching one automation throws, the exception propagates out of `tick()` and the loop stops — every automation later in iteration order silently does not fire that minute, no retry.
Doporučení: Wrap each automation's fire in try/catch, log, and continue.

[SEVERITY: High] [FILE: apps/api/src/automations/automations.storage.service.ts:144-177] [CATEGORY: Concurrent execution / data race]
`update()` and `markFired()` are both unsynchronized read-modify-write cycles against the same JSON file. `withPathLock` exists for exactly this class of race (used in task-scheduler and vault) but isn't used here — an operator PATCHing an automation as the scheduler calls `markFired` (or two overlapping markFired calls) can lose one write. (Potvrzuje systémový lost-update vzor.)
Doporučení: Wrap `update()` and `markFired()` in `withPathLock(id, …)`.

[SEVERITY: Medium] [FILE: apps/api/src/automations/cron.ts:15-27] [CATEGORY: Cron correctness]
`matchesCron` ANDs all 5 fields including day-of-month and day-of-week. Standard cron ORs those two when both are restricted — "run on the 1st or every Monday" would under standard cron fire on both; here it fires only when a day is simultaneously the 1st AND a Monday. Undocumented and untested deviation.
Doporučení: Document the AND-only semantics in the operator UI, or implement standard OR-when-both-restricted.

[SEVERITY: Medium] [FILE: apps/api/src/automations/cron.ts:15] [CATEGORY: Timezone]
`matchesCron` defaults `timeZone` to `"Europe/Prague"` and every call site omits the argument — no per-automation timezone field on the trigger schema, so all cron automations are permanently pinned to one hardcoded timezone.
Doporučení: Add a `timeZone` field to the cron trigger schema if multi-tz is needed; otherwise document the hardcoded assumption.

[SEVERITY: Medium] [FILE: apps/api/src/chains/chains.controller.ts:25-71, chain-runs.controller.ts:20-43] [CATEGORY: Duplicate logic]
Both controllers hand-roll the not-found/invalid-id try/catch three separate times, duplicating what `makeErrorMapper` (used in automations.controller.ts) centralizes.
Doporučení: Route chains/chain-runs error handling through `makeErrorMapper`.

[SEVERITY: Medium] [FILE: apps/api/src/chains/chain-runner.service.ts:308-313] [CATEGORY: Security / path handling]
`readArtifactContent` for a `project-file` artifact does `fs.readFile(path.join(project.path, record.locator))` with no containment check on `record.locator`. If a delivery sink or future producer writes a locator with `../`, this reads arbitrary files outside the project checkout (entity-file-store has `resolveSafeFile` for exactly this risk, not reused here).
Doporučení: Validate `record.locator` stays within `project.path` (reuse `resolveSafeFile`'s containment check).

[SEVERITY: Low] [FILE: apps/api/src/chains/chain-runner.service.ts:297-299] [CATEGORY: Performance]
`consumableArtifact` calls `artifacts.list()` (full unbounded read) on every step transition and boot reconcile, then linear `.find()`. Scales with total artifact history. (Stejný list()-then-find vzor jako task-runs/pipeline-runs.)
Doporučení: Add a lookup by `runRef` to `ArtifactsStorageService`.

[SEVERITY: Low] [FILE: apps/api/src/automations/scheduler.service.ts:113-118] [CATEGORY: Correctness]
`trigger()` (manual/API fire) dispatches regardless of `automation.enabled` — a disabled automation can still be triggered via API. May be intentional but undocumented and inconsistent with `tick()`'s enabled check.
Doporučení: Document the bypass or gate it like `tick()`.

[SEVERITY: Low] [FILE: apps/api/src/automations/scheduler.service.test.ts] [CATEGORY: Missing tests]
The test file only exercises `trigger()`. `tick()` itself — cron matching, same-minute idempotence, multi-automation iteration, health/arm lifecycle — has zero coverage.
Doporučení: Add tick()-level tests: due filtering, same-minute dedup, failing automation not blocking siblings.

[SEVERITY: Low] [FILE: apps/api/src/chains/chain-runner.service.ts] [CATEGORY: File size]
349 lines, largest in batch — lifecycle wiring, transition logic, artifact plumbing, persistence in one class.
Doporučení: extract `readArtifactContent`/`consumableArtifact` if artifact kinds grow.

STATS: 17 souborů (10 automations + 7 chains), 2065 řádků. Top 3: chains/chain-runner.service.ts (349), chain-runner.service.test.ts (322), automations/scheduler.service.ts (210).
