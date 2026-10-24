# Project health — per-project health-check monitoring (TODO 11)

A project can name a health URL (`Project.healthCheck`). ZIBBY GETs it periodically.
The project is **up** on a 2xx and **down** on anything else: a non-2xx status, a
timeout, or a network error.

This is deliberately **not** an integration and not a `MonitorAdapter`. A health URL
needs no credentials and belongs to the project, while the monitor seam polls
credentialled integrations and auto-dispatches. A small dedicated watcher runs
alongside it instead.

## Data model

`ProjectSchema.healthCheck` (`libs/contracts/src/projects/project.schema.ts`) is
`ProjectHealthCheckSchema`, `.strict()`:

| Field         | Rule                                                                                                                                              |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `url`         | `z.string().url()`, refined to `http:`/`https:` only, and rejected if it carries a username or password (it is copied into the Analyze task text) |
| `intervalSec` | int, `30`–`3600`, default `300` (never faster than 30 s)                                                                                          |

`UpdateProjectSchema` re-widens it to accept `null`, which clears the health check
(the same absent-vs-null rule as `companyId`/`teamId`/`logo`; `ProjectsStorageService.update`
honours it).

`ProjectHealthStatusSchema` (`libs/contracts/src/project-health/`) is the last known
health of one project:

| Field            | Meaning                                                                                         |
| ---------------- | ----------------------------------------------------------------------------------------------- |
| `projectId`      | the project                                                                                     |
| `url`            | the URL that was checked                                                                        |
| `state`          | `"up"` or `"down"`                                                                              |
| `sinceAt`        | when the current state streak began                                                             |
| `checkedAt`      | when the last check ran                                                                         |
| `httpStatus`     | optional, the final response status                                                             |
| `latencyMs`      | optional, the request time                                                                      |
| `error`          | optional, max 500 chars: `"HTTP 503"`, `"timeout after 10000 ms"`, or the network error message |
| `analysisTaskId` | optional, the task the last Analyze click created; kept while down                              |

## Storage

`ProjectHealthStore` writes one JSON file per project at
`PROJECT_HEALTH_DIR ?? ZIBBY_DATA_DIR/project-health/<projectId>.json`. Each check
overwrites it (state, not history). Writes are atomic (tmp + rename). The project
id is checked against the project id pattern and a containment check before any path
join.

## Checker

`checkUrl(url, fetchImpl, timeoutMs = 10_000)` (`apps/api/src/project-health/check-url.ts`)
sends one `GET` with `redirect: "follow"` and an `AbortController` timeout. It never
throws: a non-2xx, a timeout, or a network error (including a synchronous throw from
`fetch`) all return `{ ok: false, error }`. The fetch is raced against the abort, so
the timeout holds even if an injected `fetch` ignores its signal. It never reads or
stores the response body.

## Watcher

`ProjectHealthWatcherService` extends `TickingWatcherBase`. Its watcher id is
`project-health`, and it self-registers in the `/api/health` `watchers[]` probe.
Its heartbeat is `systemConfig.projectHealthTickMs` (default `30_000`, `0` disables).
It re-arms live on a config change, and the test fixture pins it to `0`.

Each tick:

1. Lists projects (`ProjectsStorageService`). A project with a `healthCheck` is
   checked when it has no status yet, its url changed, or `intervalSec` has elapsed
   since `checkedAt`.
2. Writes the new status:
   - `sinceAt` is kept while the state is unchanged. On a change it becomes `checkedAt`.
   - `analysisTaskId` is kept while down and cleared on recovery.
   - A changed url discards the old status, so the check counts as a first check.
3. Records only **transitions** as activity (group `integrations`, `refs.projectId`):
   - up→down, or a **first** check that is down: `project-health-down`, with summary
     `"<project name>: health check failing — <error>"`;
   - down→up: `project-health-recovered`;
   - a first check that is up records nothing. A project that stays down records
     nothing more.
4. Deletes the status file of any project whose `healthCheck` was removed or that
   was deleted.

Due checks run with bounded concurrency (4 at a time, a simple worker pool), so a
few hanging hosts can't make one tick outlive its interval. Each project runs in its
own try/catch, so one failure never stops the others. A per-project lock serializes
the tick's check, `check` and `analyze`'s `analysisTaskId` write, so a slow check
can't clobber an `analysisTaskId` written while it ran.

**A down result never dispatches a task.** Otherwise a server outage would spawn a
task on every tick. The notification is the down state itself (the header bell, the
project detail page), and it clears on recovery.

## Endpoints (`projectHealthContract`, `/api/project-health`)

| Route                                         | Behaviour                                                                                                                                                                                                                                                                                                        |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/project-health?projectId=`          | `200 ProjectHealthStatus[]`: one per project that has a health check and has been checked at least once. Filtered against the live projects: a status whose project is gone, has no `healthCheck`, or has a different url is hidden, even before the next tick deletes its file (and while the tick is disabled) |
| `POST /api/project-health/:projectId/check`   | Runs one check now (ignores the interval) → `200 ProjectHealthStatus`; `404` when the project has no `healthCheck`                                                                                                                                                                                               |
| `POST /api/project-health/:projectId/analyze` | The operator's Analyze click → `200 { taskId }`; `404` with no status, when the project is gone, or when its current `healthCheck.url` differs from the status url; `409` when the state is `up`; `503 { message }` when the task could not be created (empty catalog, Claude unavailable, …)                    |

`analyze` creates one ordinary investigation task through
`TaskSchedulerService.createTask`, with the project as `trustedProjectId`. The
classifier, the budget/limit guards and the PR gate all apply, as for the monitor
watcher's dispatch.

- The title is `"Health check failing: <project name>"`.
- The text frames the check result (url, state, since, last checked, HTTP status,
  error) as **data**, not instructions (Law 4). It ends with: "Investigate why the
  project's health check is failing, find the root cause, and prepare a fix on its
  own branch. Do not push or merge — the PR is the gate."
- `createTask` runs outside the per-project lock, so a slow classifier never stalls
  that project's checks. The lock is taken afterwards only to write `analysisTaskId`,
  after re-reading the status. It is written only if the status still has the same
  url and is still down.
- Each click creates a new task, even when `analysisTaskId` is already set, because
  it is an explicit operator action. The web disables the button while that task
  runs.

## Module

`ProjectHealthModule` (`apps/api/src/project-health/project-health.module.ts`)
imports `ProjectsModule` and `TasksModule`, provides the store and the watcher,
and exposes the controller. It is registered in `AppModule` next to `MonitorsModule`.
The `fetch` the watcher uses can be overridden through the `PROJECT_HEALTH_FETCH`
token, which is optional and defaults to the global `fetch`. The per-check timeout can
be overridden through `PROJECT_HEALTH_TIMEOUT_MS` (default `10_000`).
