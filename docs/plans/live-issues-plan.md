# Live issues: Jira/GitHub fetched live, no disk sync

Operator decision (2026-10-29): the Issues widget is a live view of issues **assigned to the
operator** in Jira and GitHub, like PRs. No Jira/GitHub issue is copied to disk anymore. "Sync"
means a cache bypass and refetch, triggered by a manual button on each widget.

## Shape (kept, so the web barely changes)

`GET /api/roadmap/items` (`listInboxItems`) keeps `InboxItemsResponse`. It gains an optional
query `refresh=true` that bypasses the server cache. `listInboxPrs` gets the same query.

- **Item id:** `roadmapItemIdForSource(integrationId, issueKey)`, the id the old sync used.
  Routes, `chainKey`, `IssueSheet` lookups and `inbox-state.json` hidden entries keep working.
- **Remote fields** come from the live fetch: `name`, `description` (ADF → markdown), `source`
  (`kind`, `integrationId`, `externalId` = key, `externalKey`, `url`), `sourceStatus`,
  `updatedAt`, `level: "task"`, and `lifecycle` from the status category (`new` → `todo`,
  `indeterminate` → `external`). Done issues are not fetched.
- **Local overlay:** a roadmap-store item with the same id is ZIBBY's own work record. Its
  `runs`, `lastFailureReason`, `dependsOn`, and a ZIBBY lifecycle (`enqueued`, `running`,
  `awaiting-merge`, `failed`) override the remote values. On-disk items missing from the live
  list are ignored, so there are no duplicates.
- **Epics:** grouped by the Jira `parent` when its issue type is Epic. `done/total` come from one
  extra `parent in (...)` JQL per integration. GitHub issues have no epic.
- **linkedPr:** matched from the cached PR list by issue key in the PR title or branch.
- **Project:** each Jira integration is queried once (deduped across projects). An issue belongs
  to the project whose integration `projectKey` matches the key prefix, else to the first
  project resolving that integration. GitHub uses `assignee:@me repo:<repo>` per project repo.
- **Cache:** in-memory TTL (60 s) like `cachedPrs`. It is dropped on
  `INBOX_REFRESH_ACTIVITY_KINDS` and bypassed by `refresh=true`. `syncedAt` is the fetch time.
  `errors` lists failures per project and source.

## Process

`POST /api/inbox/items/process` with `{projectId, itemId}` finds the item in the live list,
writes a minimal local roadmap item (a snapshot of name and description: ZIBBY's work record,
not a mirror) if none exists, then calls `RoadmapGateService.play`.

## Deleted

The disk sync: `RoadmapSourceService` sync paths, the tick's `syncAll`, the `syncRoadmapItems`
route, `autoSync`, level mapping, sync-only routing JQL, the `roadmap-sync` activity kind, and
the web sync mutations and UI. The tick keeps `autoPickup` and `reconcile*`. Old synced items
on disk remain until cleaned up by hand.

## Web

Issues and PRs widgets get a refresh button (refetch with `refresh=true`). The Inbox header Sync
button does the same.
