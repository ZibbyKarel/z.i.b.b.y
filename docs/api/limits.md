# Limits & limit-resume (usage-limit resilience)

One user-facing concern, two modules: `limits/` reads the current Claude
interactive-window utilization (the number the dashboard panel shows and
polls), and `limits-resume/` is the daemon that auto-resumes runs a `claude`
run had paused because a window was exhausted. They're documented together
because a reader only cares about one thing — "will my paused work come
back on its own, and how close is the window to tripping again."

## Section 1 — `limits/` (reading utilization)

### Pieces

| Piece         | File                                         | Role                                                                                     |
| ------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Contract      | `libs/contracts/src/limits/limits.contract.ts` | `limitsContract` — the `/api/limits` router                                              |
| Schema        | `libs/contracts/src/limits/limits.schema.ts`   | `LimitWindow` (`usedPct`, `resetsAt`), `Limits` (`rolling`, `weekly`, `capturedAt`, `stale`) |
| Service       | `apps/api/src/limits/limits.service.ts`        | `LimitsService` — cache + fallback orchestration, `buildLimits` (pure)                   |
| Live fetch    | `apps/api/src/limits/usage-fetcher.ts`         | `UsageFetcher` — reads the authoritative headers off a live, minimal `/v1/messages` call |
| Status-line   | `apps/api/src/limits/rate-limits.reader.ts`    | `RateLimitsReader` — fallback: parses the status-line's captured `rate-limits.json`      |
| Controller    | `apps/api/src/limits/limits.controller.ts`     | Implements the contract                                                                  |

### Flow

1. **Layer 1 (live, preferred): `UsageFetcher.fetch()`.** Reads the OAuth
   token Claude Code itself uses from the macOS Keychain
   (`Claude Code-credentials`, bounded by `KEYCHAIN_TIMEOUT_MS` — a
   headless/non-interactive session with no UI to click an access prompt can
   otherwise block instead of erroring), then fires a deliberately tiny
   `POST /v1/messages` (`max_tokens: 1`, bounded by `FETCH_TIMEOUT_MS` via
   `AbortSignal.timeout`) and parses the response's
   `anthropic-ratelimit-unified-5h-utilization` / `-7d-utilization` /
   `-*-reset` headers — the same server-computed percentages Claude Code's own
   status line renders, fresh whenever asked. Returns `null` (falls through to
   layer 2) when there's no token, the network call fails or times out, or
   neither header is present — including on a 429, whose headers are still
   parsed. Under `VITEST` this never touches the Keychain or network at all,
   so the test suite never burns real quota.
2. **Layer 2 (fallback): `RateLimitsReader.read()`.** Parses
   `<claudeConfigDir>/rate-limits.json` — the file the user's status-line hook
   captures the same `rate_limits` block into. `stale` is `true` when the
   capture is missing, unparsable, or more than `STALE_AFTER_MS` (10 minutes)
   old — the status line only writes while Claude Code is rendering, so a gap
   means the user stepped away, not that the numbers are wrong, but the panel
   must still say "stale" rather than imply a live reading.
3. **`LimitsService.current()`** tries layer 1 first, falls back to layer 2,
   then caches the result for `CACHE_TTL_MS` (5 minutes) — capped to the
   earliest window reset, so a request right after a reset always gets a
   fresh read. Concurrent requests share one in-flight fetch, so the
   dashboard's poll never turns into one Anthropic call per poll.
4. **`noteLimitHit()`** busts the cache — called when a `claude` run's own
   output is scraped for a usage-limit signal, so the next `/limits` read is
   forced fresh rather than serving a stale cached percentage.
5. Three derived reads other modules use directly (not exposed as their own
   endpoints): `resolveResumeAt(detected, now)` (priority: the run output's own
   detected reset → the earliest live window reset → a conservative
   `now + 30min` fallback), `resumeReadiness()` (fail-**closed** on a stale
   snapshot: `{ stale: true, hasHeadroom: false }`), and `windowExhausted()`
   (is either window at ≥ 100 % right now, on a fresh reading only).

### Endpoints (`/api/limits`)

- `GET /limits` — the current snapshot: `{ rolling, weekly, capturedAt, stale }`,
  each window as `{ usedPct, resetsAt }`. Polled by the frontend (not SSE —
  this is state, per the "SSE for live streams, polling for state" DNA rule).

## Section 2 — `limits-resume/` (the auto-resume daemon)

### Pieces

| Piece   | File                                                | Role                                                                                   |
| ------- | ------------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| Service | `apps/api/src/limits-resume/limit-resume.service.ts`   | `LimitResumeService` — ticks, scans both runners' `paused-limit` registries, resumes/parks |
| Module  | `apps/api/src/limits-resume/limit-resume.module.ts`    | Sits above the agent/pipeline runners (imports both), so it can't close a DI cycle       |

No controller, no contract — purely a background daemon (Phase 9.2).

### Flow

1. **Heartbeat.** `onModuleInit` arms a `setInterval` from the operator-owned
   `systemConfig.limitResumeTickMs` (default 60 s; `0` disables it, which is
   what tests do to drive `tick()` directly with a fake clock). It re-arms
   live on `systemConfig.onChange`.
2. **`tick(now)`** collects every `paused-limit` run from
   `AgentRunnerService.listLimitPaused()` and
   `PipelineRunnerService.listLimitPaused()`, keeps the ones whose `resumeAt`
   has passed, and processes them **oldest `resumeAt` first**.
3. For each due run: if it has already hit `systemConfig.limitResumeMax`
   resume cycles, it is parked/failed outright (no headroom check needed —
   see below). Otherwise the tick calls `LimitsService.resumeReadiness()`:
   - **Fail-closed on freshness** — a `stale` reading skips the **entire
     remaining tick**, not just this run: never resume anything on a lagging
     capture.
   - **Thundering-herd guard** — once one run has been resumed this tick, a
     sibling with no headroom is left for the *next* tick rather than
     attempted (and burns no cycle). A due run with no headroom when nothing
     else has resumed yet this tick IS attempted — a genuine flap re-pauses
     immediately at the runner's own boundary check, which is what advances
     its cycle count toward the cap.
4. **Resume:** `AgentRunnerService.resumeLimitPaused` /
   `PipelineRunnerService.resumeLimitPaused`.
5. **Cap reached → park/fail:** a pipeline run is parked (operator-resumable);
   an agent run has no parked state, so it fails with a readable
   `"usage limit flapped N time(s) — failed for review"` message.
6. Every step runs under an in-flight guard (`this.inflight`) so a restart
   racing a tick can never double-resume the same run, and a single run's
   failure never blocks the rest of the scan.

### Configuration

`limitResumeTickMs` and `limitResumeMax` are runtime `system-config.json`
keys — see `../ops/environment.md` for the full key table and defaults rather
than duplicating it here. The per-project `dailyRuns` / `weeklyRuns` /
`maxConcurrent` budget caps this daemon interacts with (a resumed run still
has to clear the budget guard) are documented in `./budget.md`.

## Endpoints

None for `limits-resume/` — it is a pure background daemon. `limits/` exposes
only `GET /api/limits`, documented above.
