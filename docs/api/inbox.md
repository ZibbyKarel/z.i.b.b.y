# Inbox

One place that answers "what do I have to process?" — a read-only view over the
synced roadmap cache narrowed to the operator's scope, plus the operator's GitHub
PRs. Jira/GitHub stay the source of truth for the _task_; the Inbox never edits
titles or descriptions. Three PR actions exist, all operator-clicked: a code review
posted only after a Tier-3 approval (Phase 129), a rebase onto the base branch
(todo-11; force-push with lease, Tier-3 when conflicts were resolved), and
squash-and-merge through the projects merge route. UI spec: `docs/plans/inbox-ui-spec.md`.

## Pieces

| Piece      | File                                          | Role                                                |
| ---------- | --------------------------------------------- | --------------------------------------------------- |
| Contract   | `libs/contracts/src/inbox/inbox.schema.ts`    | Item/epic/PR/state schemas                          |
| Contract   | `libs/contracts/src/inbox/inbox.contract.ts`  | `inboxContract`, `/api`                             |
| Service    | `apps/api/src/inbox/inbox.service.ts`         | Cross-project item list, PR classification, state   |
| Service    | `apps/api/src/inbox/inbox-review.service.ts`  | "Do code review" task + `pr-review` approval runner |
| Service    | `apps/api/src/inbox/inbox-rebase.service.ts`  | "Rebase" task + `pr-rebase` approval runner         |
| Service    | `apps/api/src/inbox/inbox-pr-diff.service.ts` | One PR's unified diff from GitHub (500 KB cap)      |
| Store      | `apps/api/src/inbox/inbox-state.store.ts`     | `InboxStateStore` — hidden items, one JSON file     |
| Controller | `apps/api/src/inbox/inbox.controller.ts`      | `@TsRestHandler(inboxContract)`                     |

## Endpoints

| Method | Path                                     | Body                                                                                                                               | Response                                                                                                                                                                          |
| ------ | ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/api/roadmap/items`                     | —                                                                                                                                  | `InboxItemsResponse`                                                                                                                                                              |
| GET    | `/api/inbox/prs`                         | —                                                                                                                                  | `InboxPrsResponse`                                                                                                                                                                |
| POST   | `/api/inbox/prs/review`                  | `{ projectId, repo, number, title?, level? }` (strict; `level` = `quick` \| `thorough` \| `tested` \| `browser`, absent = `quick`) | 201 `{ taskId }`; 404 project; 422 no GitHub link / repo not the project's                                                                                                        |
| POST   | `/api/inbox/prs/rebase`                  | `{ projectId, repo, number, title? }` (strict)                                                                                     | 201 `{ taskId }`; 404 project; 422 no GitHub link / not the project's repo / fork / closed / head is base or default                                                              |
| POST   | `/api/inbox/prs/address-comments`        | `{ projectId, repo, number, title? }` (strict; same body as rebase)                                                                | 201 `{ taskId }`; 404 project; 422 no GitHub link / foreign repo / fork / closed / head is base or default / run in flight (currently a stub: always 422 until the service lands) |
| GET    | `/api/inbox/prs/:projectId/:number/diff` | —                                                                                                                                  | 200 `{ diff, truncated }`; 404 project/PR; 422 no GitHub link/token rejected; 502 GitHub error                                                                                    |
| GET    | `/api/inbox/state`                       | —                                                                                                                                  | `InboxState`                                                                                                                                                                      |
| PUT    | `/api/inbox/state`                       | `{ integrationId, externalId, hidden }` (strict)                                                                                   | `InboxState`                                                                                                                                                                      |

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
   architect-reviewer → code-reviewer → github-commenter); `browser` →
   `pr-review-browser` (`tested` + a `browser` phase before `aggregate`: ui-ux-tester runs
   the PR head locally — no `web.url`, that serves `main` — clicks through the changed
   journeys and saves screenshots to `$ZIBBY_RUN_DIR/screenshots/`; they are not uploaded to
   GitHub). The `aggregate` phase
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
"github.pr.review", detail: "Post review to GitHub — <repo>#<n>\n\n<body>", suggestedReviewEvent,
sourceUrl })` — the approvals UI shows `detail` in full as the preview. No artifact →
no approval (a reply is concrete or it is not drafted), `state: "failed"`.

A workflow-level review has no `handleTerminal` call (that hook is agent-only).
The run parks at the `comment` phase's gate (a `workflow-gate` `stage-approval`; the
sheet renders `zibby-pr-review.md`). **Notes** ("request changes") re-run `comment`
with the operator's note and park at the same gate again; **reject** fails the run
and nothing is posted. **Approve** finishes the run and stamps
`WorkflowRun.approvedFinalGate` (plus `approvedReviewEvent` — the review type the operator picked on that gate; the gate approval carries `suggestedReviewEvent` from `zibby-pr-review.md`). `TaskSchedulerService.writeWorkflowOutcome` then, on a
`done` run whose task has `prReview.state === "running"`, reads `zibby-pr-review.md`
via `WorkflowRunnerService.readArtifact` and calls `TaskOutputService.parkPrReview`
with that gate id and pick: the `pr-review` approval is recorded and approved in one go, so the
operator decides once. A run that ended without the final gate parks the approval as
pending. A `failed` run parks nothing, and the row reads `failed` from the task outcome.

`InboxReviewService` registers as the `pr-review` runner: **approve** →
`POST /repos/{repo}/pulls/{n}/reviews` with `{ body, event }` — `event` is the operator's pick on approve (`reviewEvent`; APPROVE / REQUEST_CHANGES / COMMENT, preselected from `suggestedReviewEvent` = REQUEST_CHANGES when the review has a `Critical:`/`Important:`/`Minor:` finding, else APPROVE; no pick → COMMENT, ZIBBY never picks one itself) — using the
project's resolved token, `state: "posted"`;
a GitHub error sets `failed` + `note` and throws. **Reject** → `discarded`, nothing
is sent. The PR row links to the task while the review is running or parked.

## PR diff (`GET /api/inbox/prs/:projectId/:number/diff`)

Read-only (Tier 1). `number` is a positive integer; the repo is derived from the
project's GitHub link, never taken from the client. Fetches
`GET /repos/{repo}/pulls/{n}` with `Accept: application/vnd.github.diff` using the
project's resolved token and returns `{ diff, truncated }`. GitHub `406` (diff too
large for GitHub) → `{ diff: "", truncated: true }`. A diff over 500,000 chars
(`MAX_DIFF_BYTES`) is cut before the last line-start `diff --git` boundary under
the cap and returned with `truncated: true`. The request times out after 15 s. Errors (non-406 GitHub failures throw
`GithubDiffError` carrying the upstream status): 404 unknown project or GitHub 404, 422 project has no
GitHub link or GitHub 401/403, 502 any other GitHub failure.

## Squash and merge

Only in `ready-to-merge`, behind the hold-to-confirm `HoldButton`. It calls the
existing `POST /api/projects/:id/prs/:number/merge` with `{ method: "squash",
deleteBranch: true }` (see `docs/api/projects.md`); the web invalidates the inbox PR
query. Agents still can't merge (`floor-pr.merge: deny`).

## State (`/api/inbox/state`)

`.zibby/data/inbox-state.json` (override `INBOX_STATE_FILE`), gitignored —
operator-personal. Keyed `(integrationId, externalId)`; hide/unhide is idempotent.
Hidden is permanent until unhidden. A missing/garbage file reads as `{ hidden: [] }`.

## Address review comments (`POST /api/inbox/prs/address-comments`)

Contract only so far (PR inbox redesign): the route, `ScheduledTask.prAddressComments`
(`repo, number, url, head, base, headSha, state, report?, worktree?, fixedSha?, approvalId?,
note?, replies?, replied?, repliesNote?`), `PrThreadReply` (`{ threadId: "PRRT_…", body <= 500 }`),
`InboxPr.addressComments { taskId, state }` (same states as `rebase`) and the
`pr-address-comments` approval kind (fast-forward push + thread replies; approved on the spot
for `Addressed: all`, otherwise Tier-3). The handler is a stub returning 422 until the service lands.
The push primitive exists: `WorkspaceService.pushFastForward` (fast-forward only, never force,
see `./workspace.md`).

## Rebase (`POST /api/inbox/prs/rebase`)

todo-11. Body `{ projectId, repo, number, title? }` (strict) → 201 `{ taskId }`; 404 unknown
project; 422 no GitHub link / repo not the project's / fork head / closed PR / head is the
base or default branch / a rebase of the same PR already `running` or `awaiting-approval`
(latest such task, not dead — same check as the list). Shown on `bucket === "mine"` PRs with `mergeable === false || behind`
(`behind` = GitHub's `mergeable_state === "behind"`, reported only under an up-to-date branch
protection).

`InboxRebaseService.start` (`apps/api/src/inbox/inbox-rebase.service.ts`) reads head/base/sha
from `GET /pulls/<n>`, creates a task with the explicit `pr-rebase` workflow target and
`trustedProjectId`, and stamps `prRebase { repo, number, url, head, base, headSha,
conflictAtStart, state: "running" }`. The `rebase-resolver` agent rebases in the run's
worktree and never pushes. On a `done` run, `TaskOutputService.parkPrRebase` records a
`pr-rebase` approval: approved on the spot (the operator's click was the decision) when the
report's first line is `Conflicts: none` or — todo-17 — `Conflicts: <n> files` (conflicts resolved,
quick checks green); otherwise pending (Tier-3). Risk is `medium` only for a clean rebase
(`conflictAtStart === false` + `Conflicts: none`), else `high`. The approval `detail` is the agent's report followed by a
"Verified by ZIBBY" section read from the worktree itself (`WorkspaceService.rebaseFacts`:
HEAD sha, `git log --oneline origin/<base>..HEAD`, `git diff --stat <headSha> HEAD`; an
unreadable worktree is noted there instead), and that HEAD is stored as
`prRebase.rebasedSha` — the push refuses if the worktree HEAD moved since and pushes
exactly that sha. The agent runs no checks on a conflict-free rebase and only quick checks
(typecheck of the affected package, lint of conflicted files — no test suites, CI runs them) after
resolving conflicts, on `sonnet`/`medium`. First line: `Conflicts: none`, `Conflicts: <n> files`,
`Conflicts: <n> files, checks failed`, or `Conflicts: aborted` + reason. The approval runner pushes only while the rebase is
`awaiting-approval`, via `WorkspaceService.pushRebased` (`--force-with-lease`, see
`./workspace.md`) → `pushed` or `failed` with git's reason. Reject → `discarded`; an
interrupted run → `failed`.

`GET /api/inbox/prs` rows carry `behind: true` (only when GitHub says so) and `rebase { taskId, state }` (latest rebase task per PR; a `running` one whose task/run died reads `failed`).
They also carry `headRef` / `baseRef` (todo-13, from the same `GET /pulls/<n>`; `headRef` is omitted for a fork head) — the web joins them to show stacked PRs (B's `baseRef` = A's `headRef`, same repo).
