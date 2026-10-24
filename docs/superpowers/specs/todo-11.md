# TODO 11 — Monitoring per projekt

**Raw TODO item:** Monitoring per projekt: health endpoint se periodicky volá, při chybě notifikace a tlačítko Analyzovat

## Interpretation (night-run rulings, operator asleep)

- **What is monitored.** Each project can optionally name a health URL. ZIBBY GETs it periodically.
  The project is **up** on a 2xx response and **down** on anything else: a non-2xx status, a
  timeout, or a network error.
- **Health is STATE, not an event.** This follows the N4b CI-status precedent. One status file per
  project is overwritten on every check.
  - Only **transitions** are recorded as activity: up→down and down→up. A server that stays down
    produces no repeated alerts.
  - The "notification" is the down state itself, shown in the header bell (and on the project
    detail page). It disappears on its own when the project recovers.
- **No autonomous dispatch.** Unlike CI/Sentry alerts, a down health check does **not** create a
  task automatically. A down server would otherwise spawn a task on every outage. The operator
  clicks **Analyzovat**, which creates one ordinary investigation task through the scheduler
  (classifier, budget/limit guards, PR gate all apply).
  - The task text frames the check result as data (Law 4).
  - The instruction is: investigate, prepare a fix on its own branch, no push/merge.
- **Not an integration.** A health URL needs no credentials and belongs to the project. The
  integration-based `MonitorAdapter` seam polls only credentialled integrations and auto-dispatches,
  so it is the wrong fit. This uses a small dedicated watcher alongside it.
- **Polling cadence.** One watcher tick runs every 30 s (`systemConfig.projectHealthTickMs`,
  default `30_000`, `0` disables). Each project is checked when its own `intervalSec` has elapsed
  since its last check.

## Requirements

1. **Contracts (contract-first).**
   - `ProjectSchema` gains an optional `healthCheck`. It is
     `z.object({ url, intervalSec }).strict()`:

     | Field         | Type                                                         | Notes                                              |
     | ------------- | ------------------------------------------------------------ | -------------------------------------------------- |
     | `url`         | string, `z.string().url()`, refined to `http:`/`https:` only | `file:`, `javascript:`, etc. are rejected          |
     | `intervalSec` | int `.min(30).max(3600).default(300)`                        | Every 5 minutes by default; never faster than 30 s |

   - `UpdateProjectSchema` re-widens `healthCheck` to also accept `null`. `null` clears it, the
     same pattern as `companyId`/`logo`.
   - New resource `projectHealth`, in `libs/contracts/src/project-health/`:
     - `ProjectHealthStatusSchema` has these fields:

       | Field            | Type / meaning                                                                                    |
       | ---------------- | ------------------------------------------------------------------------------------------------- |
       | `projectId`      | the project                                                                                       |
       | `url`            | the URL that was checked                                                                          |
       | `state`          | `"up" \| "down"`                                                                                  |
       | `sinceAt`        | ISO datetime when the current state streak began                                                  |
       | `checkedAt`      | ISO datetime of the last check                                                                    |
       | `httpStatus`     | optional int                                                                                      |
       | `latencyMs`      | optional int                                                                                      |
       | `error`          | optional string, max 500 chars; "HTTP 503", "timeout after 10000 ms" or the network error message |
       | `analysisTaskId` | optional string, the task the last Analyzovat click created, kept while down                      |

     - Routes:
       - `listProjectHealth`: `GET /api/project-health`, optional query `projectId`.
         Returns `200 ProjectHealthStatus[]`, one per project that has a health check and has
         been checked at least once.
       - `analyzeProjectHealth`: `POST /api/project-health/:projectId/analyze`, body
         `EmptyBodySchema`.
         - Returns `200 { taskId: string }` (the created task id).
         - Returns `404` when there is no status, and `409 ErrorSchema` when the state is `up`
           ("nothing to analyze").
       - `checkProjectHealth`: `POST /api/project-health/:projectId/check`, body
         `EmptyBodySchema`.
         - Runs one check immediately and returns `200 ProjectHealthStatus`.
         - Returns `404` when the project has no `healthCheck`.

   - Two new activity kinds: `project-health-down` and `project-health-recovered`. They are added
     to the closed activity enum and to `ACTIVITY_GROUP_OF` under the group `integrations`, next to
     `monitor-alert`. They carry `refs.projectId`.
   - `systemConfig` gains `projectHealthTickMs: z.number().int().min(0).default(30_000)`, and the
     system-config fixture sets it to `0`.
   - `WatcherId` gains `"project-health"`.

2. **API (`apps/api/src/project-health/`).**
   - **Store.** One JSON file per project, at
     `PROJECT_HEALTH_DIR ?? dataDir("project-health")/<projectId>.json`. Writes are atomic
     (tmp + rename, like the other stores). The project id is validated against the project id
     pattern before any path join.
   - **Checker.** A function `checkUrl(url, fetchImpl, timeoutMs = 10_000)` returning
     `{ ok, httpStatus?, latencyMs, error? }`.
     - It uses `GET` with `redirect: "follow"` and an `AbortController` timeout.
     - It never throws, and never reads or stores the response body.
   - **Watcher.** `ProjectHealthWatcherService extends TickingWatcherBase`, `watcherId`
     `"project-health"`.
     - A tick lists projects. For each project with a `healthCheck` whose
       `now - checkedAt >= intervalSec`, or with no status yet, it runs `checkUrl` and writes the
       status.
     - `sinceAt` is kept while the state is unchanged. On a change it is set to `checkedAt`.
     - On up→down it records `project-health-down` with summary
       `"<project name>: health check failing — <error>"`.
     - On down→up it records `project-health-recovered`, and `analysisTaskId` is cleared.
     - On the **first** check, a down result counts as a transition (it records down); an up
       result records nothing.
     - If the url changed since the last status, the old status is discarded and the check counts
       as a first check.
     - When a project's `healthCheck` is removed, or the project is deleted, its status file is
       deleted on the next tick.
     - A failure for one project never stops the others (per-project try/catch).
   - **Analyze.** `analyze(projectId)` creates a task through `TaskSchedulerService.createTask`,
     the same call shape as `MonitorWatcherService.dispatch`, with `projectId`:
     - title `"Health check failing: <project name>"`;
     - text: the url, state, since, httpStatus/error, then the instruction "Investigate why the
       project's health check is failing, find the root cause, and prepare a fix on its own
       branch. Do not push or merge — the PR is the gate."
     - It stores `analysisTaskId` and returns `{ taskId }`.
     - A second click while `analysisTaskId` is already set still creates a new task. This is an
       explicit operator action. The web disables the button while that task is running.
3. **Web.**
   - **Project detail page.** A new panel, `ProjectHealthPanel` (cs "Monitoring", en "Monitoring"),
     in `features/projects/components/`. It shows:
     - when no `healthCheck` is set: an explanatory line, cs "Nastav health URL a ZIBBY ji bude
       pravidelně kontrolovat." / en "Set a health URL and ZIBBY will check it periodically.";
     - otherwise: the url, the state (`StatusDot` green/red with cs "V pořádku"/"Nedostupné",
       en "Up"/"Down"), since, last checked, httpStatus/latency/error, and a "Zkontrolovat
       teď"/"Check now" button (`checkProjectHealth`);
     - when down: **"Analyzovat"/"Analyze"**, which calls `analyzeProjectHealth`. On success it
       links to the created task (cs "Analýza spuštěna" / en "Analysis started", linking to
       `/runs?task=<taskId>` or the existing task-detail route; use what the codebase uses).
       It is disabled while pending.
   - **Editing the URL and interval.** This happens in the project's existing basics edit form
     (`ProjectBasicsPanel`): a URL field "Health URL" and an interval field (seconds,
     30–3600).
   - **Header bell.** `NotificationBell` also lists down projects from `useProjectHealthQuery`,
     above the failed runs:
     - each row reads cs "<name> — nedostupné od <since>" / en "<name> — down since <since>";
     - each row has a link to the project and an inline "Analyzovat" button.
     - The trigger count and danger intent include down projects.
     - The health rows have no "mark read". They clear on recovery (state, not event).
   - **Freshness.** `runEvents` invalidates the project-health query key on the activity kinds
     `project-health-down` and `project-health-recovered`. The query also polls every 60 s, as
     state polling (the "health/limits poll" family).
4. Every visible string goes through next-intl, in cs and en.
5. Docs: `docs/api/project-health.md`. Add the watcher to whatever doc lists watchers or system
   config knobs.
