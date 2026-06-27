# RightRail → live server-activity log (SSE-streamed, infinite history)

## Goal

Refactor the RightRail into a single purpose: a **live log of what the server is
doing right now** —

```
> 10:00  Task "build web app" added to a queue
> 10:03  Integration "gmail" checked for changes
> 10:30  Automation "morning digest" run
```

Everything that needs the operator's attention (approvals, parked runs) moves
**out of the rail and into the Overview page content**. The `/runs` nav badge stays
exactly as it is today.

## What already exists (no rebuild needed)

- **SSE is already the primary transport.** `RunEventsProvider`
  (`apps/web/features/runs/runEvents.tsx`) holds one `EventSource` to
  `GET /api/events` (`apps/api/src/events/events.controller.ts`), which already
  merges an `"activity"` scope. Polling intervals are fallbacks only.
- **An append-only activity log exists**: `GET /api/activity`
  (`libs/contracts/src/activity/activity.contract.ts`), backed by one
  `<YYYY-MM-DD>.jsonl` file per day (`activity-log.service.ts`). Durable across
  restarts, effectively unbounded — *more* than "since backend started".
- **Approvals already render via `ApprovalCard`** and already live partly on
  Overview (`BriefingCard`, `NeedsAttentionPanel`).
- **The `/runs` badge already works** — `navBadgeCount(useNotifications())` in
  `AppShell.tsx`. **Unchanged by this work.**
- `MainLayout` already documents the rail as "a fixed-width aside that stays
  visible on every page" — making the log global is aligned with that intent.

## Decisions

1. **Retention**: keep the full on-disk day-file history (unbounded, cheap). Only
   a bounded in-memory tail is needed for SSE; older pages are read from disk.
2. **Transport for the log**: keep SSE, but make the `activity` event **fat** —
   carry the full `ActivityEntry` so the client **prepends** it to the infinite
   query cache (no refetch round-trip). Invalidation stays as the fallback for the
   small Overview feed + briefing.
3. **History access**: a new **cursor-paginated** endpoint feeding a TanStack
   `useInfiniteQuery` (the first such hook in the app). "Load older" pulls the next
   page; the live tail is prepended on top of page 0. Dedup by `id`.
4. **Visibility / grouping is operator config**, server-backed (mandate pattern):
   each activity **group** is `visible | grouped | hidden`. Configured in a new
   **Settings → Activity** section. Filtering/grouping is applied **client-side**
   (small data, instant config changes, stable cache).
5. **Rail becomes global** (shown on every dashboard page), since "what the server
   is doing right now" is ambient and Overview now owns approvals.

## Activity groups (closed vocabulary, every kind mapped)

`tasks · runs · pipelines · goals · approvals · channels · integrations · research · briefing`

Default view: most groups `visible`; `channels`, `research`, `briefing` default to
`grouped` (noisier / digest-like).

## Changes

### Backend (`apps/api`, `libs/contracts`)

1. `libs/contracts/src/activity/activity.schema.ts`
   - `ActivityPageQuerySchema { before?, limit? (1..200), kinds? }`
   - `ActivityPageSchema { entries: ActivityEntry[], nextCursor: string | null }`
2. `libs/contracts/src/activity/activity.contract.ts`
   - add `pageActivity: GET /activity/page`.
3. `libs/contracts/src/activity/activity-view.schema.ts` (new)
   - `ActivityGroupSchema`, `ACTIVITY_GROUP_OF: Record<ActivityKind, ActivityGroup>`,
     `ActivityViewModeSchema`, `ActivityViewSchema` (strict), `DEFAULT_ACTIVITY_VIEW`.
4. `libs/contracts/src/activity/activity-view.contract.ts` (new)
   - `getActivityView: GET /activity/view`, `setActivityView: PUT /activity/view`.
5. `libs/contracts/src/app.contract.ts` + `index.ts` — register both new exports +
   `activityView` router key.
6. `apps/api/src/activity/activity-log.service.ts`
   - `page({ before?, limit?, kinds? })` — keyset pagination across day files
     (cursor = `at|id`, strictly-older), `nextCursor` when more remain.
   - `private listDayFilesDesc()` via `fs.readdir` (bounded to files that exist).
7. `apps/api/src/activity/activity-events.service.ts` + `activity.controller.ts` +
   `activity-log.service.ts` (`record`) — `ActivityEvent` carries the full `entry`;
   controller emits `{ scope:"activity", kind, at, entry }`; controller adds the
   `pageActivity` handler.
8. `apps/api/src/activity-view/` (new module: storage + controller + module, mandate
   twin) — `activity-view.json` at the data root; register in `app.module.ts`.

### Frontend (`apps/web`)

1. `features/overview/queries/useActivityFeedInfiniteQuery.ts` (new) —
   `pageActivity.useInfiniteQuery`, `getActivityFeedQueryKey()`, flattening `select`,
   and `prependActivityEntry(qc, entry)` (dedup by id).
2. `features/runs/runEvents.tsx` — on `activity` scope, prepend `parsed.entry` into
   the infinite feed (keep existing invalidations).
3. `features/settings/queries/useActivityViewQuery.ts` +
   `features/settings/mutations/useSetActivityViewMutation.ts` (new).
4. `features/overview/activityLog.ts` (new) — pure `buildActivityLog(entries, view)`
   → rows (`entry` | coalesced `group` with count); hides `hidden` groups, coalesces
   consecutive `grouped` runs. Unit-tested.
5. `components/layout/RightRail/RightRail.tsx` — rewrite as the log (infinite feed +
   view config + "Load older"). Remove approvals/parked/running panels from it.
6. `features/overview/components/ApprovalsPanel.tsx` (new) — the approvals
   `HudPanel` + `ApprovalCard`s moved from the rail, capped to the few newest.
7. `features/overview/Screen.tsx` — mount `ApprovalsPanel` + `ParkedRunsPanel`; keep
   the small `ActivityFeed` (few newest).
8. `components/layout/AppShell/AppShell.tsx` — rail is global (drop the
   overview-only gate).
9. `features/settings/components/ActivitySection.tsx` (new) + a tab in
   `features/settings/Screen.tsx`.
10. i18n: `apps/web/i18n/messages/{cs,en}.json` — rail title/empty/load-older,
    grouped-count label, and the `settings.activity` section (modes + group labels).

### Tests

- api: extend `activity-log.service.test.ts` with `page()` cursor cases; add
  `activity-view/*.storage.service.test.ts`.
- web: `activityLog.test.ts` (grouping/visibility), update `RightRail.test.tsx`
  (asserts the log title now, not approvals), `ActivitySection.test.tsx`.
- Run `pnpm lint && pnpm typecheck && pnpm test`.

## Out of scope / dropped

- `RunningAgentsPanel` is removed from the rail and not remounted — "running now"
  is conveyed by the live log and the `/runs` page. Component kept for reuse.
- `/runs` waiting-for-approval view and the nav badge are untouched.
