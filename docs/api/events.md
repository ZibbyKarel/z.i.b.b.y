# Events (unified SSE channel)

The **EventsController** (`apps/api/src/events/events.controller.ts`) is the single
multiplexed status channel behind the `/api/events` SSE endpoint. It is the concrete
implementation of the architectural DNA rule "SSE for live streams, polling for
state" (root `CLAUDE.md`): logs, the activity feed, and run-events stream over SSE;
everything else the dashboard needs is fetched by ordinary polling/query, invalidated
by an event on this channel.

It is a raw NestJS `@Sse()` handler, deliberately **outside** the ts-rest contract
system — there is no `libs/contracts/src/events` — because it carries no request
body and its response shape is a push stream, not a request/response payload
ts-rest models.

## Pieces

| Piece      | File                                            | Role                                                                                  |
| ---------- | -------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Controller | `apps/api/src/events/events.controller.ts`         | the `@Sse("api/events")` handler; merges every scope's `Observable<MessageEvent>`      |
| Module     | `apps/api/src/events/events.module.ts`             | imports `AgentsModule`, `PipelinesModule`, `GoalsModule`, `ChannelsModule` for their exported runner/event services |
| SSE plumbing | `apps/api/src/shared/sse/sse.ts`                 | `fromRunStatus()` (run-status → SSE event), `heartbeats()` (keep-alive ping)          |

## Flow

`events()` returns one merged `Observable` combining:

- **`agent-runs`** — via `fromRunStatus` over `AgentRunnerService.onRunStatus`,
  projecting `{ runId, status }`.
- **`pipeline-runs`** — same shape, over `PipelineRunnerService.onRunStatus`.
- **`goal-runs`** — same shape, over `GoalRunnerService.onRunStatus` (added for the
  goal loop engine).
- **`channel-items`** — over `ChannelEventsService.stream()`, projecting
  `{ itemId, state }`.
- **`activity`** — over `ActivityEventsService.stream()`, projecting
  `{ kind, at, entry }` (the activity log is a global module, so `EventsModule`
  needs no explicit import for it).
- A merged **heartbeat** (`heartbeats()`) so the connection survives idle periods
  through intermediary proxies.

Every event is tagged with a `scope` field the client switches on. Per the
controller's own doc comment:

> "Events are a thin invalidation signal — the client refetches the matching query
> off them — so the list endpoints remain the single source of truth and the server
> only speaks on a real transition."

In practice this means the payload is minimal (ids and status/state, never a full
record); the frontend's `RunEventsProvider` reacts to a scope it recognizes by
invalidating the matching TanStack Query cache entry and letting the normal fetch
path re-read current state. Scopes the client doesn't yet know about are ignored
rather than erroring, which is what let `channel-items` and `activity` be added
without a client-side migration.

## Endpoints

- `GET /api/events` — one long-lived `EventSource` connection, replacing what used
  to be several independent polling loops (the running-list poll, the all-runs
  history poll, and the pipeline aggregate poll). Not part of the ts-rest contract
  — call it directly as an `EventSource`, not through the generated client.
