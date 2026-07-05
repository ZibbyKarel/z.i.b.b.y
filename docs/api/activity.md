# Activity log & briefing

## Activity log

Append-only accountability record — ZIBBY can explain what it is doing and has
done, from the log, at any time.

### Format

One file per day: `apps/api/data/activity/YYYY-MM-DD.jsonl`
Each line is `JSON.stringify(ActivityEntry) + "\n"` — a single `fs.appendFile`
syscall.

```typescript
interface ActivityEntry {
  id: string; // collision-resistant UUID
  at: string; // ISO datetime
  kind: ActivityKind; // closed enum (see below)
  summary: string; // one human-readable sentence
  traceId?: string; // from AsyncLocalStorage (stamped automatically)
  runId?: string; // from AsyncLocalStorage (stamped automatically)
  refs: ActivityRefs; // structured links (strict object)
}
```

### ActivityKind — closed enum

The vocabulary has grown a lot since Phase 6.1's original list, as new phases
added their own recordable events. It stays a WHOLE alphabet by design — a new
kind is added here explicitly, never smuggled through a free-form field
(`libs/contracts/src/activity/activity.schema.ts`):

```typescript
type ActivityKind =
  | "task-created"
  | "task-dispatched"
  | "task-outcome"
  | "task-held"
  | "task-queued"
  | "run-started"
  | "run-finished"
  | "pipeline-started"
  | "pipeline-finished"
  | "pipeline-parked"
  | "stage-verdict" // a qualify-gate phase verdict (pass/gap/drift)
  | "run-paused-limit" // a run halted on the subscription usage limit
  | "run-resumed-limit" // ...and auto-resumed when the window reset
  | "task-deferred-limit" // a task was re-deferred at dispatch (window exhausted)
  | "goal-dispatched" // a goal's maker/verifier loop dispatched an iteration
  | "goal-verdict"
  | "goal-parked" // bounded effort exhausted
  | "approval-requested"
  | "approval-approved"
  | "approval-rejected"
  | "gate-decision"
  | "channel-item"
  | "channel-triage"
  | "channel-reply"
  | "channel-approval"
  | "channel-ignored"
  | "channel-noted" // a read-only integration's item (no reply surface)
  | "channel-needs-attention" // a notify-only channel item surfaced (email)
  | "briefing-generated"
  | "research-digest" // a research pass mirrored its result to the vault
  | "integration-retry-exhausted" // a channel poll exhausted its retry budget
  | "monitor-alert" // a CI/CD monitor ingested a red status
  | "machine-action" // an approved machine action executed (or failed)
  | "task-dead-lettered" // a task's dispatch exhausted its retry budget
  | "app-ideas-generated" // a weekly pass proposed app ideas to the vault
  | "chain-started" // an operator-authored chain started
  | "chain-advanced" // ...handed an artifact to its next step
  | "chain-parked" // ...parked on a broken/gated handoff
  | "chain-finished" // ...reached a terminal state (done/failed)
  | "orchestrator-fallback"; // Fáze 4a: the classifier itself chose the orchestrator (no explicit override)
```

No free text — a new kind is added explicitly to the schema.

### ActivityRefs — strict structured links

```typescript
interface ActivityRefs {
  taskId?: string;
  runRef?: string;
  pipelineId?: string;
  agentId?: string;
  goalRunId?: string;
  goalId?: string;
  chainRunId?: string;
  chainId?: string;
  projectId?: string; // project attribution (Phase 8)
  approvalId?: string;
  integrationId?: string;
  itemId?: string;
  action?: string;
  decision?: string;
  status?: string;
  noteId?: string;
  normalizedSummary?: string; // Fáze 4a: normalizovaný text pro seskupení Agent Factory detekcí
  terms?: string; // Fáze 4a: comma-joined klasifikátorem shodnuté termy
}
```

`.strict()` — no extra fields. If a new kind needs a new ref, the schema grows
on purpose.

### ActivityLogService

**File:** `apps/api/src/activity/activity-log.service.ts`

- `record({ kind, summary, refs })` — **never throws** (accountability must not
  interrupt the actual action)
- `list({ date?, kinds?, limit?, projectId?, integrationId?, days? })` — reads
  the JSONL line by line; a bad line after a crash is skipped (doesn't take
  down the whole day). When `projectId` or `integrationId` is given, the server
  reads a multi-day window (`days`, default 14, clamped to `[1, 90]`) instead of
  just today, so a sparse per-project/integration history is still visible.
- `page({ before?, limit?, kinds? })` — **keyset (cursor) pagination across the
  entire history**, newest-first, spanning day-file boundaries. The cursor is
  the opaque `<at>|<id>` of the previous page's oldest entry; returns
  `{ entries, nextCursor }` (`nextCursor === null` = end of history). Only reads
  existing day files (`fs.readdir`) and stops after `limit + 1` matches, so deep
  history costs at most one extra day file. Powers the RightRail live log
  (infinite query).
- `traceId` / `runId` are stamped automatically from `TraceContextService`
  (AsyncLocalStorage)

### API

```
GET /api/activity?date=YYYY-MM-DD&kinds=run-started,run-finished&limit=50&projectId=<id>&integrationId=<id>&days=14
GET /api/activity/page?before=<cursor>&limit=50          # newest-first, cursor pagination
```

`GET /api/activity` — defaults to today, limit 50, max 500; a malformed `date`
returns `422`. `kinds` is a comma-separated allow-list.
`GET /api/activity/page` — the whole history, paged (limit 1–200, default 50);
`before` is the `nextCursor` from the previous response.

### SSE — `activity` scope (fat event)

`ActivityEventsService.emit` carries the **whole `ActivityEntry`**; the events
controller publishes `{ scope: "activity", kind, at, entry }` on `/api/events`.
The web RightRail **prepends** the entry into its infinite-query cache (no
refetch); the small overview feed and briefing card invalidate as before.

## ActivityRecorderModule

**File:** `apps/api/src/activity/activity-recorder.module.ts`

A mapping layer — consumes internal business events (`EventsService`) and
writes them as activity entries. Keeps business logic separate from the log
format.

## Activity view — RightRail live-log config

An operator-owned document (twin of `mandate.json`) controls how the activity
log is rendered in the right rail (the live log). Every **group** of kinds
(`tasks · runs · pipelines · goals · approvals · channels · integrations ·
research · briefing`) has a mode: `visible` (each entry shown individually),
`grouped` (merged into one row with a count), or `hidden` (left out of the log
entirely). The kind → group map and defaults live in
`libs/contracts/src/activity/activity-view.schema.ts` (`ACTIVITY_GROUP_OF`,
`DEFAULT_ACTIVITY_VIEW`).

**Files:** `apps/api/src/activity-view/` (storage + controller + module),
persisted to `apps/api/data/activity-view.json` (atomic write, tolerant read →
default). Filtering/grouping happens **client-side** (small data set, config
changes apply instantly).

```
GET /api/activity/view          # current config (seeded default when absent)
PUT /api/activity/view          # replace — strict, 422 on an unknown group key (Law 4)
```

Edited in the UI under **Settings → Activity**.

## Briefing system

### What a briefing is

A deterministic synthesis of the activity log and vault notes into a butler's
briefing, not a firehose:

> "Two bugs came in overnight — both fixed, PRs up for review. Company X asked
> about feature Y; I answered. Nothing else needs you."

`BriefingService` (`apps/api/src/briefing/briefing.service.ts`) assembles it
from pending approvals, parked runs/goals, in-flight channel items, and
activity since the last briefing; `briefing-assembly.ts` is the pure function
that groups and filters that into `BriefingItem[]` sections; `claude-cli-briefer.ts`
is an optional richer-prose pass over CLI. A cron-triggered `briefing` automation
target (`0 8 * * *` by default) generates it daily and records
`briefing-generated`.

```
GET /api/briefing/{date}   the briefing for a date (YYYY-MM-DD)
```

See `docs/api/briefing.md` for the full module writeup (run lifecycle, section
assembly, and the `ClaudeCliBriefer` seam).
