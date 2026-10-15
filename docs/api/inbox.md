# Inbox

One place that answers "what do I have to process?" — a read-only view over the
synced roadmap cache narrowed to the operator's scope, plus the operator's GitHub
PRs. Jira/GitHub stay the source of truth for the _task_; the Inbox never writes
back. UI spec: `docs/plans/inbox-ui-spec.md`.

## Pieces

| Piece      | File                                         | Role                                              |
| ---------- | -------------------------------------------- | ------------------------------------------------- |
| Contract   | `libs/contracts/src/inbox/inbox.schema.ts`   | Item/epic/PR/state schemas                        |
| Contract   | `libs/contracts/src/inbox/inbox.contract.ts` | `inboxContract`, `/api`                           |
| Service    | `apps/api/src/inbox/inbox.service.ts`        | Cross-project item list, PR classification, state |
| Store      | `apps/api/src/inbox/inbox-state.store.ts`    | `InboxStateStore` — hidden items, one JSON file   |
| Controller | `apps/api/src/inbox/inbox.controller.ts`     | `@TsRestHandler(inboxContract)`                   |

## Endpoints

| Method | Path                 | Body                                             | Response             |
| ------ | -------------------- | ------------------------------------------------ | -------------------- |
| GET    | `/api/roadmap/items` | —                                                | `InboxItemsResponse` |
| GET    | `/api/inbox/prs`     | —                                                | `InboxPrsResponse`   |
| GET    | `/api/inbox/state`   | —                                                | `InboxState`         |
| PUT    | `/api/inbox/state`   | `{ integrationId, externalId, hidden }` (strict) | `InboxState`         |

`/api/roadmap/items` has no `:projectId` segment, so it can't collide with the
per-project `/api/projects/:projectId/roadmap/...` routes.

## Items (`GET /api/roadmap/items`)

Every project's roadmap tasks where `level === "task"`, `lifecycle !== "archived"`,
`source.kind` is jira/github and `scopeReasons` (sync-owned, see
`docs/api/roadmap.md`) is non-empty. `done` items are kept — the client hides
them unless "Show done". Each item is joined with `project {id, name}`,
`companyId`/`teamId` from the project, and `hidden` from the state file. `parentId`
is flattened to the nearest epic.

- `epics` — the epics the returned items belong to; `done/total` counts **every**
  non-archived child task (same rule as the web's `epicProgress`), not only the
  scoped ones.
- `syncProjectIds` — projects whose resolved integrations include Jira or GitHub
  (empty = "no integrations" state).
- `syncedAt` — the oldest per-project last sync (max `item.syncedAt`) across
  `syncProjectIds`.
- `errors` — each source's last sync failure (`RoadmapSourceService.lastFailures()`),
  cleared by that source's next clean sync. In memory only: lost on restart.

## PRs (`GET /api/inbox/prs`)

For every distinct repo of a project with a GitHub integration (token via
`resolveGithubToken`), using GitHub Search:

- **mine** — `is:pr is:open repo:<repo> author:@me`
- **to review, direct** — `user-review-requested:@me`
- **to review, team** — `team-review-requested:<org>/<slug>` for each of the user's
  teams (`GET /user/teams`) in the repo owner's org. 401/403/404 → no teams plus a
  non-blocking `errors` note (token needs `read:org`).

Direct beats team; mine is never in to-review. GitHub drops a review request once the
user reviews and re-adds it on a re-request, so a PR leaves/returns to "to review"
on its own. Comment `@org/team` mentions are not included.

Per PR: `GET /pulls/<n>` (draft, mergeable, author, created), `/reviews` (latest
non-COMMENTED review per reviewer: any CHANGES_REQUESTED → `changes-requested`, else
any APPROVED → `approved`, else `none`) and `/commits/<sha>/check-runs` (any
failure/cancelled/timed_out → `failing`, any not completed → `pending`, ≥1 and all
success/neutral/skipped → `passing`, else `unknown`; combined commit status is not
read). `blocker`: ci failing → changes requested → `mergeable === false` → approved
and passing = `ready-to-merge` → `awaiting-review`.

A failing repo lands in `errors` and never fails the request. The whole result is
cached in memory for 30 s.

## State (`/api/inbox/state`)

`.zibby/data/inbox-state.json` (override `INBOX_STATE_FILE`), gitignored —
operator-personal. Keyed `(integrationId, externalId)`; hide/unhide is idempotent.
Hidden is permanent until unhidden. A missing/garbage file reads as `{ hidden: [] }`.
