# Inbox

One place that answers "what do I have to process?" — a read-only view over the
synced roadmap cache narrowed to the operator's scope, plus the operator's GitHub
PRs. Jira/GitHub stay the source of truth for the _task_; the Inbox never edits
titles or descriptions. Two PR actions exist, both operator-clicked (Phase 129): a
code review posted only after a Tier-3 approval, and squash-and-merge through the
projects merge route. UI spec: `docs/plans/inbox-ui-spec.md`.

## Pieces

| Piece      | File                                          | Role                                                |
| ---------- | --------------------------------------------- | --------------------------------------------------- |
| Contract   | `libs/contracts/src/inbox/inbox.schema.ts`    | Item/epic/PR/state schemas                          |
| Contract   | `libs/contracts/src/inbox/inbox.contract.ts`  | `inboxContract`, `/api`                             |
| Service    | `apps/api/src/inbox/inbox.service.ts`         | Cross-project item list, PR classification, state   |
| Service    | `apps/api/src/inbox/inbox-review.service.ts`  | "Do code review" task + `pr-review` approval runner |
| Service    | `apps/api/src/inbox/inbox-pr-diff.service.ts` | One PR's unified diff from GitHub (2 MB cap)        |
| Store      | `apps/api/src/inbox/inbox-state.store.ts`     | `InboxStateStore` — hidden items, one JSON file     |
| Controller | `apps/api/src/inbox/inbox.controller.ts`      | `@TsRestHandler(inboxContract)`                     |

## Endpoints

| Method | Path                                     | Body                                                                                                                  | Response                                                                   |
| ------ | ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| GET    | `/api/roadmap/items`                     | —                                                                                                                     | `InboxItemsResponse`                                                       |
| GET    | `/api/inbox/prs`                         | —                                                                                                                     | `InboxPrsResponse`                                                         |
| POST   | `/api/inbox/prs/review`                  | `{ projectId, repo, number, title?, level? }` (strict; `level` = `quick` \| `thorough` \| `tested`, absent = `quick`) | 201 `{ taskId }`; 404 project; 422 no GitHub link / repo not the project's |
| GET    | `/api/inbox/prs/:projectId/:number/diff` | —                                                                                                                     | 200 `{ diff, truncated }`; 404 project; 422 no GitHub link                 |
| GET    | `/api/inbox/state`                       | —                                                                                                                     | `InboxState`                                                               |
| PUT    | `/api/inbox/state`                       | `{ integrationId, externalId, hidden }` (strict)                                                                      | `InboxState`                                                               |

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

`section` (Phase 129 P1, `INBOX_PR_SECTIONS` order = display order): to-review →
`needs-your-review` (direct) / `needs-team-review` (team only); mine → `needs-action`
(draft, CI failing, changes requested or `mergeable === false`), else `ready-to-merge`
(approved + CI not pending — `unknown`, i.e. a repo without checks, counts; `mergeable: null` still counts), else `waiting`. `bucket` and
`blocker` stay for back-compat.

A failing repo lands in `errors` and never fails the request. The GitHub part is
cached in memory for 30 s; any successful merge (`ProjectPrService.onMerged`) clears
it. `codeReview` (the latest review task, of any level, per `repo#number`, from the tasks
store) is joined on every read, uncached. A `running` review whose task failed or
whose run errored reads `failed`.

## Code review (`POST /api/inbox/prs/review`)

Shown on PRs in the two review sections. The service resolves the project's GitHub
link (`resolveGithubToken`) and refuses a `repo` that isn't the project's (422); the
PR url is derived from repo + number, never taken from the client. It then:

1. `TaskSchedulerService.createTask` with the explicit workflow target for `level`:
   `quick` → `pr-review-quick` (code-reviewer → github-commenter); `thorough` →
   `pr-review-thorough` (architect-reviewer → code-reviewer → github-commenter);
   `tested` → `pr-review-tested` (test-automator checks out the PR head with
   `gh pr checkout --detach` in the run's own worktree and runs the repo's tests →
   architect-reviewer → code-reviewer → github-commenter). The `aggregate` phase
   (code-reviewer) merges the reviewers' findings into `review.md`; the last phase,
   `comment` (`github-commenter`, whose agent prompt holds the posting style), turns
   it into `zibby-pr-review.md` and has `approval: ask`. `trustedProjectId = projectId`, title
   `Code review[ (<level>)]: <repo>#<n> <title>`. The text tells the agents to read the PR (`gh pr view` /
   `gh pr diff --repo`) and **not** post to GitHub, commit or push. The PR title is
   quoted as untrusted data.
2. Stamps `ScheduledTask.prReview = { repo, number, url, state: "running" }`.

**Run → approval mechanism:** the existing terminal-output hook,
`TaskOutputService.handleTerminal`, which the scheduler already calls exactly once
(under the per-task lock) when an agent task's run ends `done`. When the task has
`prReview`, it reads the artifact from `run.cwd` and calls
`ApprovalsService.requestApproval({ kind: "pr-review", runId: taskId, action:
"github.pr.review", detail: "Post review to GitHub — <repo>#<n> (COMMENT)\n\n<body>",
sourceUrl })` — the approvals UI shows `detail` in full as the preview. No artifact →
no approval (a reply is concrete or it is not drafted), `state: "failed"`.

A workflow-level review has no `handleTerminal` call (that hook is agent-only).
The run parks at the `comment` phase's gate (a `workflow-gate` `stage-approval`; the
sheet renders `zibby-pr-review.md`). **Notes** ("request changes") re-run `comment`
with the operator's note and park at the same gate again; **reject** fails the run
and nothing is posted. **Approve** finishes the run and stamps
`WorkflowRun.approvedFinalGate`. `TaskSchedulerService.writeWorkflowOutcome` then, on a
`done` run whose task has `prReview.state === "running"`, reads `zibby-pr-review.md`
via `WorkflowRunnerService.readArtifact` and calls `TaskOutputService.parkPrReview`
with that gate id: the `pr-review` approval is recorded and approved in one go, so the
operator decides once. A run that ended without the final gate parks the approval as
pending. A `failed` run parks nothing, and the row reads `failed` from the task outcome.

`InboxReviewService` registers as the `pr-review` runner: **approve** →
`POST /repos/{repo}/pulls/{n}/reviews` with `{ body, event: "COMMENT" }` using the
project's resolved token (never `APPROVE` / `REQUEST_CHANGES`), `state: "posted"`;
a GitHub error sets `failed` + `note` and throws. **Reject** → `discarded`, nothing
is sent. The PR row links to the task while the review is running or parked.

## PR diff (`GET /api/inbox/prs/:projectId/:number/diff`)

Read-only (Tier 1). `number` is a positive integer; the repo is derived from the
project's GitHub link, never taken from the client. Fetches
`GET /repos/{repo}/pulls/{n}` with `Accept: application/vnd.github.diff` using the
project's resolved token and returns `{ diff, truncated }`. GitHub `406` (diff too
large for GitHub) → `{ diff: "", truncated: true }`. A diff over 2 MB
(`MAX_DIFF_BYTES`) is cut before the last line-start `diff --git` boundary under
the cap and returned with `truncated: true`. Any other GitHub error → 500. Errors:
404 unknown project, 422 project has no GitHub link.

## Squash and merge

Only in `ready-to-merge`, behind the hold-to-confirm `HoldButton`. It calls the
existing `POST /api/projects/:id/prs/:number/merge` with `{ method: "squash",
deleteBranch: true }` (see `docs/api/projects.md`); the web invalidates the inbox PR
query. Agents still can't merge (`floor-pr.merge: deny`).

## State (`/api/inbox/state`)

`.zibby/data/inbox-state.json` (override `INBOX_STATE_FILE`), gitignored —
operator-personal. Keyed `(integrationId, externalId)`; hide/unhide is idempotent.
Hidden is permanent until unhidden. A missing/garbage file reads as `{ hidden: [] }`.
