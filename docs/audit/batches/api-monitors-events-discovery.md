BATCH: api-monitors-events-discovery

[SEVERITY: High] [FILE: apps/api/src/monitors/monitor-watcher.service.ts:61] [CATEGORY: Re-entrancy / concurrency]
`arm()` registers `setInterval(() => void this.tick(), tickMs)` with no in-flight guard; if one `tick()` outlives `tickMs`, the next timer fires a second overlapping `tick()` over the same integrations. Same gap as `channel-watcher` and `automations/scheduler` — systemic across all setInterval-based watchers.
Doporučení: add an `isTicking` flag (skip-if-busy) or serialize via a promise chain, ideally in a shared watcher base.

[SEVERITY: High] [FILE: apps/api/src/monitors/monitor-event.store.ts:77] [CATEGORY: Dedup race / TOCTOU]
`putNew` does `fileExists(file)` then `writeEntity(event)` as two separate steps, not atomic create — under the concurrent-tick scenario, two overlapping polls of the same adapter can both pass the existence check for the same alert id before either write lands, producing a duplicate `createTask` dispatch for one CI failure. (Stejný vzor jako channel-watcher put dedup.)
Doporučení: make `putNew` atomic (`fs.open` with `wx` flag), or serialize per-(integration,adapter) writes.

[SEVERITY: Medium] [FILE: apps/api/src/monitors/github-ci.monitor.ts:63] [CATEGORY: Missed alert handling]
`poll` fetches a single fixed page (`per_page=50`, no pagination loop). If more than 50 workflow runs occur between ticks (backlog after downtime, retry burst), red runs beyond the first page are silently skipped — the cursor advances to the newest run, so those failures are never retried or surfaced. (Stejný vzor jako channel adapters pagination.)
Doporučení: page through `workflow_runs` until the cursor boundary, or document/alert the truncation risk.

[SEVERITY: Medium] [FILE: apps/api/src/monitors/monitor-watcher.service.ts:164] [CATEGORY: Tier/escalation path]
`dispatch()` always routes a CI alert through the same `createTask` with no severity/urgency derived from the alert (repeated failures, protected branch); every red run gets identical tier treatment.
Doporučení: pass repeat-count/streak context (already computed for MonitorStatusSnapshot) into the dispatched task for downstream tiering.

[SEVERITY: Medium] [FILE: apps/api/src/monitors/*, channels/channel-watcher, tasks/task-scheduler, limits-resume/limit-resume, automations/scheduler] [CATEGORY: Duplicitní logika / cross-cutting]
Five separate services independently hand-roll the same `setInterval` + arm()/onModuleInit/onModuleDestroy + `SystemConfigStore.onChange` re-arm pattern, each with its own (missing) re-entrancy handling — no shared base class. (KLÍČOVÝ cross-cutting nález — re-entrancy fix by měl přistát jednou.)
Doporučení: extract a shared `TickingWatcherBase` (timer lifecycle + busy-guard).

[SEVERITY: Medium] [FILE: apps/api/src/discovery/] [CATEGORY: Chybějící testy]
No test file exists for any of the 4 discovery-module files — the park→approve→dispatch and park→reject→ignore flows (including the `toTaskTarget` fallback-to-classification branch) are entirely unverified.
Doporučení: add unit tests for `ProposedTaskFlowService.park/resume/cancel` (mocked ApprovalsService/TaskSchedulerService).

[SEVERITY: Low] [FILE: apps/api/src/monitors/monitor-watcher.service.ts:188] [CATEGORY: Retry logic]
`retryUnhandled()` re-dispatches every `state:"new"` event on every tick without backoff or attempt counter; a persistently-failing scheduler causes the full backlog to be re-attempted every tick.
Doporučení: add a lightweight backoff/attempt cap or last-attempted timestamp.

[SEVERITY: Low] [FILE: apps/api/src/discovery/proposed-task-flow.service.ts:84] [CATEGORY: Silent failure]
`cancel()` is fire-and-forget with `.catch(() => {})` — any failure updating the proposal to `ignored` on rejection is swallowed with no log, unlike the rest of the module.
Doporučení: log the caught error (mirror the `log.warn` pattern used elsewhere).

[SEVERITY: Low] [FILE: apps/api/src/events/events.controller.test.ts] [CATEGORY: Chybějící testy]
Only 2 tests cover the merged `/api/events` stream; the `channel-items` and `activity` scopes merged in the controller and the heartbeat merge are untested.
Doporučení: assert ChannelEventsService/ActivityEventsService emissions surface on the merged observable with correct `scope`.

[SEVERITY: Low] [FILE: apps/api/src/monitors/github-ci.monitor.ts:66] [CATEGORY: Error handling]
Rate-limit/HTTP-error branches throw generic Error with only the HTTP status; no `Retry-After`/`x-ratelimit-reset` header is read, so `withRetry`'s fixed exponential backoff may retry before GitHub's reset window. (Stejný nález jako github.adapter 403.)
Doporučení: read `retry-after`/`x-ratelimit-reset` and pass a hint to the backoff.

STATS: files=16, total_lines=1546, top3=[monitor-watcher.service.test.ts (202), monitor-watcher.service.ts (199), github-ci.monitor.test.ts (173)]
