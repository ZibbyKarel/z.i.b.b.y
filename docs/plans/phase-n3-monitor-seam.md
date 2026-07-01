# Phase N3 — CI/CD monitoring + pluggable MonitorAdapter seam

> ROADMAP N3. A red CI run is invisible today (the GitHub channel adapter polls only
> issues/PRs). This phase adds a **monitor seam** — status/alert events, NOT
> conversational messages — with GitHub Actions as the first monitor and a clean
> drop-in point for Sentry later.

## Design

- **`MonitorAdapter` seam** (`apps/api/src/monitors/monitor-adapter.ts`): like
  `ChannelAdapter` but emits `MonitorEvent`s and has no `send()` (a monitor never
  replies). Registry keyed by adapter kind; a second adapter registers without any
  runtime change (the Sentry test).
- **Config rides the existing integration**: `GitHubConfigSchema.streams` gains
  `"ci"` — the channel adapter naturally ignores it (it filters issues/pulls), the
  monitor watcher polls exactly the integrations that opted in. Same PAT, same
  credentials store, no new entity.
- **First monitor — GitHub Actions**: poll `/repos/{repo}/actions/runs`, dedupe by
  `ci-<repo>-<run.id>-<run_attempt>` (deterministic id → replay-safe), cursor =
  newest `created_at`. A completed run with conclusion `failure`/`timed_out`/
  `startup_failure` becomes an event; green runs are a no-op.
- **Failure → task (the tier path)**: a new event dispatches an investigation task
  via `TaskSchedulerService.createTask` with `trustedProjectId` from the owning
  integration — the classifier routes it (pure intent), budget/limit guards apply,
  and a resulting fix ends at the structural PR gate (Tier-3) like any other run.
  Task creation failure leaves the event `new` (retried next tick, dedup-safe).
- **Heartbeat**: `systemConfig.monitorTickMs` (default 60s; `0` disables; test
  fixture pins 0). Per-integration try/catch + retry/backoff, mirroring the
  channel watcher (one failing monitor never blocks the rest).
- **Accountability**: activity kind `monitor-alert` (group `integrations`), refs
  `itemId` (event id) + `integrationId` + `taskId`. The fix-run itself surfaces in
  the runs feed and — when parked at the PR gate — in the briefing's needs-you.
- **Deferred to N4** (recorded, not forgotten): a first-class "main is red since
  08:12" briefing line + per-project HUD CI chip. The event data is queryable now
  (`GET /api/monitors/events`).

## Build

1. Contracts: `monitors/monitor.schema.ts` (MonitorEvent, closed kind enum
   starting with `ci-run-failed`, state new|handled|ignored) + read-only
   `monitorsContract` (list + get); `streams` enum + `monitorTickMs` +
   `monitor-alert` activity kind.
2. API `apps/api/src/monitors/`: adapter seam + registry, `GithubCiMonitor`,
   `MonitorEventStore` (file-per-event + cursor sidecar), `MonitorWatcherService`,
   controller, module.

## Tests (definition of done)

- [ ] contracts: event schema round-trip, closed kind/state, read-only contract.
- [ ] `github-ci.monitor.test.ts` (fixture fetch): failed run → event; green run →
      none; cursor advances; dedupe id stable per attempt; rate-limit throws.
- [ ] `monitor-event.store.test.ts`: put dedups by id; cursor round-trip;
      corrupt file tolerated.
- [ ] `monitor-watcher.service.test.ts`: tick polls only ci-opted github
      integrations; a new event records activity + dispatches a task
      (trustedProjectId threaded) and lands `handled`; dispatch failure leaves it
      `new`; a second (fake) adapter plugs into the registry without touching the
      watcher — the Sentry seam proof; one failing integration doesn't block others.
