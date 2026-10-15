# Inbox — UI spec (hand-off to Claude Design)

Status: implemented (2026-10-15) — API in `docs/api/inbox.md`, UI in `apps/web/features/inbox/`. Language of the UI: cs (default) + en via next-intl.

## Problem

Roadmap items and PRs are copies of what lives in Jira / GitHub. The operator needs one place that
answers "what do I have to process?" without a second backlog. **Jira/GitHub stay the source of
truth for the _task_; ZIBBY is the source of truth for _execution_.** The Inbox is a view over the
synced cache, filtered to the operator's scope. It never edits titles or descriptions.

## Settled decisions

| #   | Decision                                                                                                                                                                                                                |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Standalone top-level screen `/inbox`. The per-project roadmap tab stays unchanged.                                                                                                                                      |
| 2   | Items are roadmap items only. A PR linked to an item is shown on the item. PRs also get their own sub-page.                                                                                                             |
| 3   | Top menu **Inbox**; when selected, submenu **Overview · Issues · Pull requests** (DS `SubNav`), each with an actionable counter.                                                                                        |
| 4   | Default Issues view: items in the operator's scope (assigned / reported / watched / @-mentioned), excluding `done` and `archived`, sorted by who is on the move: new in source → waiting for you → running.           |
| 5   | Optional grouping by epic (toggle, off by default) as an **accordion**; children indented under the epic.                                                                                                               |
| 6   | "Hide" is permanent, with "Show hidden" to restore. No snooze.                                                                                                                                                          |
| 7   | PR source: GitHub only. The list is built so another source can be added later.                                                                                                                                         |
| 8   | "My PRs": only repos of projects known to ZIBBY. Drafts shown with a `draft` tag.                                                                                                                                       |
| 9   | "Review requested": a review request directly on me, or on a team I belong to. The row states the reason (`directly` / `via team X`). A PR disappears once I submit a review and returns on a new review request.       |
| 10  | Comment `@org/team` mentions are NOT included — only review requests.                                                                                                                                                   |
| 11  | PR rows are read-only plus "Open on GitHub". Merging stays in the existing merge queue (Tier-3).                                                                                                                        |
| 12  | Filters: company / team / project. Multi-select per dimension, AND across dimensions, an option "No team / company". Shared by Issues and Pull requests; kept in the URL query and the last choice in `localStorage`. |
| 13  | Data: new `GET /roadmap/items` (all projects) and `GET /inbox/prs`. Filtering and full-text search run on the client; "my scope" is computed on the server from the integration identity.                               |
| 14  | `/inbox` is an overview with two cards (counters + a few top rows each), click navigates to the sub-page.                                                                                                               |
| 15  | Overview is the first submenu entry.                                                                                                                                                                                    |
| 16  | Linked PR is a badge on the item row: `#482 · CI ✓ · awaiting review`. Click opens the PR on GitHub; a small link jumps to Pull requests pre-filtered to that PR.                                                       |
| 17  | Pull requests page has two sections: **To review** and **Mine — push to merged**, each sorted by blocker.                                                                                                               |
| 18  | Epic accordion rules below.                                                                                                                                                                                             |
| 19  | Issue row anatomy and actions below. Row click navigates to an item detail page (not a dialog).                                                                                                                         |
| 20  | Badges are global (ignore the active filter) and count only actionable items.                                                                                                                                           |
| 21  | States below. PR list uses TanStack Query refetch on focus + every 60 s (state is polled; SSE only for live streams).                                                                                                   |
| 22  | Hidden-state lives in `.zibby/data/inbox-state.json`, keyed `(integrationId, externalId)`, gitignored (operator-personal). Hidden items never come back automatically.                                                  |
| 24  | Desktop first. Narrow screens: one column, filters in a `Sheet`. `/` focuses search. No `j`/`k` navigation yet.                                                                                                         |

## Information architecture

```
Top menu:  … Inbox …
Submenu:   Overview (·) | Issues (5) | Pull requests (3 · 2)

/inbox                      Overview
/inbox/issues               Issues (flat list or epic accordion)
/inbox/issues/[projectId]/[itemId]   Item detail (navigation, not dialog)
/inbox/pull-requests        Pull requests
```

A shared page header on all sub-pages: title, "Synced 4 min ago" + `Sync` button, filter bar.

## Overview — `/inbox`

```
┌ Inbox ─────────────────────────────  Synced 4 min ago  [Sync] ┐
│ [Company ▾] [Team ▾] [Project ▾]                [Clear]       │
│                                                                │
│ ┌ Issues ────────────────────┐  ┌ Pull requests ────────────┐ │
│ │ 5 need you                 │  │ 3 to review · 2 blocked   │ │
│ │ ● New in source        3   │  │ ▸ #482 repo  CI failing   │ │
│ │ ● Waiting for you      2   │  │ ▸ #479 repo  via team X   │ │
│ │ top 3 rows …               │  │ top 3 rows …              │ │
│ │                  Open →    │  │                  Open →   │ │
│ └────────────────────────────┘  └───────────────────────────┘ │
└────────────────────────────────────────────────────────────────┘
```

Cards use the same filter as the sub-pages; the counters in the submenu do not (decision 20).

## Issues — `/inbox/issues`

Toolbar: `SearchInput` (title + description, case- and diacritics-insensitive), `FilterBar`
(company / team / project), toggles **Group by epic**, **Show done**, **Show hidden**.

### Flat list row

```
KEY-123  Title of the issue                                   [Process] [⋯]
[Jira] source: In Progress · ZIBBY: waiting for you   [project] [team]   updated 2d
#482 · CI ✓ · awaiting review ↗
```

- Left: key + title. Source badge (Jira / GitHub), source status, ZIBBY status.
- Tags: project, team. Linked-PR badge (decision 16). Age of the last change.
- Primary action **Process** (in the row). `⋯` menu top-right: **Open in source**, **Hide**.
- Row click → detail page. A card click navigates; dialogs are only for creating and confirming.
- When ZIBBY state and source state disagree (e.g. ZIBBY merged, Jira still "In Progress"): a
  "differs from source" tag. This makes the drift visible without writing back to Jira.

### Epic accordion (Group by epic)

- DS `Accordion`; one panel per epic, collapsed by default; expansion is remembered for the session.
- Header: title, key, source, progress `7/12`, count of new, link to the source.
- Children are indented rows (same anatomy as the flat row).
- Search: an epic with a matching child expands and shows only the matching children; an epic with
  no match is hidden.
- An epic with no visible children (all done / hidden / out of scope) is not shown.
- One level only: epic → issue. Deeper hierarchy is flattened under the nearest epic.
- Items without an epic go to a final section **No epic**.

## Pull requests — `/inbox/pull-requests`

Two sections, same filter bar as Issues (company / team / project).

**To review** — PRs where a review is requested from me or my team (reason shown).
**Mine — push to merged** — my open PRs in ZIBBY projects' repos.

```
#482  Title                                     repo · author · 3 d       [Open on GitHub ↗]
[CI failing]   review: changes requested   [draft]   via team X
```

- Each row has ONE prominent blocker tag, not a pile of badges.
- Sort order: CI failing → changes requested → merge conflict → awaiting review → ready to merge.
- Additional detail badges: CI state, review state, draft, age.
- Read-only. Merging happens in the merge queue; the Inbox never merges.

## States (all pages)

| State                 | Behaviour                                                                                                                 |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Loading               | `QueryLoading` skeleton                                                                                                   |
| Error (whole request) | `QueryError` with retry                                                                                                   |
| One integration fails | Non-blocking banner "Jira sync failed: …" above the list; the rest keeps rendering                                        |
| Empty                 | "Nothing to process" + link to "Show done"                                                                                |
| No integrations       | Prompt to connect on the project detail page                                                                              |
| Freshness             | "Synced N min ago" + `Sync` button (calls the existing per-project sync); the sync tick runs every 15 min                 |

## Data contract (contract-first, `libs/contracts`)

```
GET /roadmap/items            → InboxRoadmapItem[]       // all projects, already scoped to "mine"
GET /inbox/prs                → InboxPr[]
GET /inbox/state              → { hidden: { integrationId, externalId }[] }
PUT /inbox/state              → hide / unhide
```

`InboxRoadmapItem` = `RoadmapItem` + `project{id,name}`, `teamId?`, `companyId?`, `linkedPr?`
(`number`, `url`, `title`, `ci`, `review`), `sourceStatus`, `scopeReasons[]`
(`assigned | reported | watched | mentioned`).

`InboxPr`: `number`, `title`, `url`, `repo`, `author`, `createdAt`, `draft`, `ci`
(`passing|failing|pending|unknown`), `review` (`approved|changes-requested|none`), `mergeable`,
`bucket` (`to-review|mine`), `reviewReason` (`direct|team`), `reviewTeam?`, `blocker`,
`projectId`, `teamId?`, `companyId?`.

New server work (not present today): reading `requested_reviewers` / `requested_teams` and the
operator's team membership for PRs (`GET /user/teams` is already used by the channel adapter);
a cross-project item list; a GitHub-issue → PR link (`Closes #N`) — the last one is a later
extension (decision 16).

## Existing building blocks (libs/design-system)

`SubNav`, `Tabs`, `FilterBar`, `SearchInput`, `SegmentedControl`, `Accordion`, `Tag`, `StatePill`,
`Progress`, `EmptyState`, `Alert`, `Sheet`, `Kbd`, `EntityCard`, `DataTable`, `List`.
From roadmap: `epicProgress` and the grouping helpers in `roadmap-board.ts`.

Missing / to decide (add to DS or keep local as a domain composite): the issue row and the PR row
(domain composites in `apps/web/features/inbox/components/`), a multi-select filter chip, if
`FilterBar` has no such control.

## Out of scope

Writing back to Jira / GitHub, GitLab, comment `@team` mentions, approvals and channel items in the
Inbox, snooze, merging from the Inbox, keyboard list navigation.

## Mock data

See `inbox-ui-spec.mock.json` next to this file.
