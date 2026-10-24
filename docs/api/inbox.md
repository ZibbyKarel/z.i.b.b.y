# Inbox

One place that answers "what do I have to process?" — a read-only view over the
synced roadmap cache narrowed to the operator's scope, plus the operator's GitHub
PRs. Jira/GitHub stay the source of truth for the _task_; the Inbox never edits
titles or descriptions. Three PR actions exist, all operator-clicked: a code review
posted only after a Tier-3 approval (Phase 129), a rebase onto the base branch
(todo-11; force-push with lease, Tier-3 when conflicts were resolved), and
squash-and-merge through the projects merge route. UI spec: `docs/plans/inbox-ui-spec.md`.

## Pieces

| Piece      | File                                                   | Role                                                          |
| ---------- | ------------------------------------------------------ | ------------------------------------------------------------- |
| Contract   | `libs/contracts/src/inbox/inbox.schema.ts`             | Item/epic/PR/state schemas                                    |
| Contract   | `libs/contracts/src/inbox/inbox.contract.ts`           | `inboxContract`, `/api`                                       |
| Service    | `apps/api/src/inbox/inbox.service.ts`                  | Cross-project item list, PR classification, state             |
| Service    | `apps/api/src/inbox/inbox-review.service.ts`           | "Do code review" task + `pr-review` approval runner           |
| Service    | `apps/api/src/inbox/inbox-rebase.service.ts`           | "Rebase" task + `pr-rebase` approval runner                   |
| Service    | `apps/api/src/inbox/inbox-address-comments.service.ts` | "Address review comments" task + `pr-address-comments` runner |
| Service    | `apps/api/src/inbox/inbox-fix-ci.service.ts`           | "Fix CI" task + `pr-fix-ci` runner                            |
| Service    | `apps/api/src/inbox/inbox-pr-diff.service.ts`          | One PR's unified diff from GitHub (500 KB cap)                |
| Store      | `apps/api/src/inbox/inbox-state.store.ts`              | `InboxStateStore` — hidden items, one JSON file               |
| Controller | `apps/api/src/inbox/inbox.controller.ts`               | `@TsRestHandler(inboxContract)`                               |

## Endpoints

| Method | Path                                                        | Body                                                                                                                               | Response                                                                                                                                                              |
| ------ | ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/api/roadmap/items`                                        | —                                                                                                                                  | `InboxItemsResponse`                                                                                                                                                  |
| GET    | `/api/inbox/prs`                                            | —                                                                                                                                  | `InboxPrsResponse`                                                                                                                                                    |
| POST   | `/api/inbox/prs/review`                                     | `{ projectId, repo, number, title?, level? }` (strict; `level` = `quick` \| `thorough` \| `tested` \| `browser`, absent = `quick`) | 201 `{ taskId }`; 404 project; 422 no GitHub link / repo not the project's                                                                                            |
| POST   | `/api/inbox/prs/rebase`                                     | `{ projectId, repo, number, title? }` (strict)                                                                                     | 201 `{ taskId }`; 404 project; 422 no GitHub link / not the project's repo / fork / closed / head is base or default                                                  |
| POST   | `/api/inbox/prs/address-comments`                           | `{ projectId, repo, number, title? }` (strict; same body as rebase)                                                                | 201 `{ taskId }`; 404 project; 422 no GitHub link / foreign repo / fork / closed / head is base or default / run in flight                                            |
| POST   | `/api/inbox/prs/fix-ci`                                     | `{ projectId, repo, number, title? }` (strict; same body as rebase)                                                                | 201 `{ taskId }`; 404 project; 422 no GitHub link / foreign repo / fork / closed / head is base or default / run in flight                                            |
| GET    | `/api/inbox/prs/:projectId/:number/diff`                    | —                                                                                                                                  | 200 `{ diff, truncated }`; 404 project/PR; 422 no GitHub link/token rejected; 502 GitHub error                                                                        |
| GET    | `/api/inbox/prs/:projectId/:number/threads`                 | —                                                                                                                                  | 200 `InboxPrThread[]`; 404 project/PR; 422 no GitHub link/token rejected; 502 GitHub error                                                                            |
| POST   | `/api/inbox/prs/:projectId/:number/threads/:threadId/reply` | `{ body?, resolve? }` (at least one; `body` 1–65536 chars trimmed)                                                                 | 200 the updated `InboxPrThread`; 404 unknown project or PR/thread GitHub does not know; 422 no GitHub link / token rejected / thread not on this PR; 502 GitHub error |
| GET    | `/api/inbox/state`                                          | —                                                                                                                                  | `InboxState`                                                                                                                                                          |
| PUT    | `/api/inbox/state`                                          | `{ integrationId, externalId, hidden }` (strict)                                                                                   | `InboxState`                                                                                                                                                          |

`/api/roadmap/items` has no `:projectId` segment, so it can't collide with the
per-project `/api/projects/:projectId/roadmap/...` routes.

Every non-GET inbox route requires the operator token header (`x-zibby-operator-token`,
missing or wrong → 401) — see _Operator token_ in `docs/api/approvals.md`.

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

Each row carries `updatedAt` (GitHub's `updated_at`: any comment, review, push or
re-request bumps it). `codeReview.finishedAt` / `addressComments.finishedAt` are stamped
when the run succeeded (`posted` / `pushed` + follow-up). The UI hides "Review" / "Address
review comments" while `updatedAt <= finishedAt + 60 s` (the slack absorbs ZIBBY's own
writes and clock skew): the PR's GitHub state alone (team review request, changes
requested, unresolved threads) doesn't re-offer an action already handled.

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
2. Stamps `ScheduledTask.prReview = { repo, number, url, state: "running", headSha? }`. `headSha`
   is the PR head read from `GET /repos/{repo}/pulls/{n}` right before the task is created; the
   brief tells every phase to review exactly that commit (`git checkout --detach <sha>`) and the
   comment phase's summary names it. A failed read starts the review without it (unpinned).

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
`POST /repos/{repo}/pulls/{n}/reviews` with `{ body, event, comments? }` (see Inline comments below) — `event` is the operator's pick on approve (`reviewEvent`; APPROVE / REQUEST_CHANGES / COMMENT, preselected from `suggestedReviewEvent` = REQUEST_CHANGES when the review has a `Critical:`/`Important:`/`Minor:` finding, else APPROVE; no pick → COMMENT, ZIBBY never picks one itself) — using the
project's resolved token, `state: "posted"`;
a GitHub error sets `failed` + `note` and throws. **Reject** → `discarded`, nothing
is sent. The PR row links to the task while the review is running or parked.

**Inline comments (todo-22).** `zibby-pr-review.md` is one readable document the operator
approves as is: a short summary on top, then one `### <path>:<line> (Critical|Important|Minor)`
block (or `<path>:<start>-<end>`) per finding. `parsePrReviewDoc` (`pr-review-doc.ts`) splits
it: the summary becomes the review `body`, each block one entry of `comments`
(`{ path, line, side: "RIGHT", start_line?, start_side?, body }`) without its severity label —
the label only drives `suggestedReviewEvent` (a severity heading counts as a finding). A heading
that doesn't parse (e.g. `path:line:col`) stays in the summary, `### ` lines inside ``` / ~~~ fences
are code, and the severity is case-insensitive; more than 100 blocks fold into it. A doc without blocks
posts `{ body, event }` as before. With `prReview.headSha` set, both the inline post and the fold
retry carry `commit_id: headSha`, so the comments land on the reviewed commit even if the PR moved. When GitHub rejects the inline comments (422 — a line outside
the diff), the review is retried once with every comment folded into the body
(`` `path:line` text ``) and `note`says the inline comments were rejected; a second failure is`failed` as above.

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

## Review threads (`GET /api/inbox/prs/:projectId/:number/threads`)

Read-only (Tier 1). One GitHub GraphQL query (`InboxPrThreadsService.list`):
`reviewThreads(first:100)` with `comments(first:30)` each — more are not returned.
Each thread is `{ id, isResolved, isOutdated, path, line, startLine, diffHunk, comments }`;
`diffHunk` is the first comment's hunk (it ends at the commented line), a comment is
`{ id, author: { login, avatarUrl } | null, createdAt, body }`. Comment bodies are
inbound data, rendered escaped.

`POST …/threads/:threadId/reply` is the operator's own reply typed in the PR detail
(operator token required, no approval — like clicking "Comment" on GitHub; ZIBBY never
calls it by itself). The thread id is checked against this PR's threads first (not
one of them → 422, nothing posted); then `resolveReviewThread` when `resolve` is true
and, after it, `addPullRequestReviewThreadReply` when `body` is set (resolve first: it is
idempotent, so a failed resolve posts nothing and a retry cannot duplicate the reply). Returns the thread re-read
from GitHub. GraphQL errors (HTTP 200 with `errors`) and other GitHub failures → 502,
GitHub 401/403 → 422, GitHub 404 (unknown PR/thread) → 404.

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

PR inbox redesign. Body `{ projectId, repo, number, title? }` (strict, same as rebase) → 201
`{ taskId }`; 404 unknown project; 422 no GitHub link / repo not the project's / fork head /
closed PR / head is the base or default branch / an address-comments run of the same PR already
`running` or `awaiting-approval` (latest such task, not dead). The PR checks are shared with the
rebase flow (`readPushablePr` in `inbox-rebase.service.ts`, refusals are `PrRefusedError`).

The web offers the button on my PRs with `unresolvedThreads > 0`, whatever the review state:
colleagues may review with comments only (no CHANGES_REQUESTED). When the count is unknown
(omitted, the GraphQL read failed) it is offered only for a changes-requested PR. A review whose
feedback lives only in the review summary (no inline threads) reads 0 and hides the button.

`InboxAddressCommentsService.start` (`apps/api/src/inbox/inbox-address-comments.service.ts`)
creates a task with the explicit `pr-address-comments` workflow target and `trustedProjectId`,
and stamps `prAddressComments { repo, number, url, head, base, headSha, state: "running" }`.
The workflow (`.zibby/data/workflows/pr-address-comments.workflow.md`, dept `dev`) has two
ungated phases:

1. `address` (`fullstack-developer`): checks out the clicked head, reads the unresolved review
   threads (`gh api graphql … reviewThreads`), commits a focused fix per comment it accepts,
   runs quick checks, writes `zibby-pr-address-comments.md` whose first line is
   `Addressed: all` / `partial` / `checks failed` / `aborted`, then one `thread: <PRRT_…>` entry
   per thread (`done in <sha>` or `skipped: <reason>`). It never pushes.
2. `reply` (`github-commenter`, the existing operator-voice agent, reused — no new prompt; it
   also holds a `dev` seat because the runner staffs phases from the workflow's department):
   writes `zibby-pr-replies.json` = `[{ threadId, body, resolve? }]` (`resolve: true` only on
   fixed threads). It never posts.

The PR title, description, diff and the review comments are quoted as untrusted data.
ZIBBY pushes **fast-forward only, never force** (`WorkspaceService.pushFastForward`,
`./workspace.md`) and posts replies only after a successful push, only to threads GitHub still
reports as unresolved on this PR; it then resolves the fixed ones and re-requests review
(below). `Addressed: all` → push + replies (Tier-2, reported in the task outcome); anything else with new commits → one Tier-3
`pr-address-comments` approval covering push, replies, resolves and the review re-request; no
new commits → `failed`.
On a `done` run `TaskOutputService.parkPrAddressComments` reads the worktree
(`WorkspaceService.rebaseFacts`): HEAD equal to the clicked `headSha` → `failed` ("no new
commits"); otherwise it records the `pr-address-comments` approval with the report plus a
"Verified by ZIBBY" HEAD / `git diff --stat <headSha> HEAD` and stores that HEAD as `fixedSha`.
The runner (`InboxAddressCommentsService.push`) claims `awaiting-approval` atomically, pushes
exactly `fixedSha` → `pushed` (note = sha) or `failed` with git's reason (a remote head that
moved since the click is rejected as non-fast-forward). Reject → `discarded`. Only after a successful push,
`InboxAddressCommentsService.postFollowUp` posts the parked `github-commenter` replies
(`zibby-pr-replies.json`, parsed leniently by `parseThreadReplies`: malformed, non-`PRRT_`,
empty, over-500-char and duplicate entries are dropped, max 50, listed in the approval
`detail` under "Replies ZIBBY will post after the push") via GraphQL
`addPullRequestReviewThreadReply` — only to threads a fresh `reviewThreads` read of this PR
reports as unresolved; empty bodies are never posted. Then each open thread whose reply is
flagged `resolve: true` and was just posted (or has an empty body) gets GraphQL
`resolveReviewThread` — the operator's tick wins over the report's `done in`, which is only
required when the operator sent no replies (a thread whose reply failed stays open), and review is re-requested via
`POST /repos/{repo}/pulls/{n}/requested_reviewers` from every user whose latest review
(`latestOpinionatedReviews`) is `CHANGES_REQUESTED`, excluding the PR author and bots.
`replied` / `repliesNote` record what was posted and why the rest was skipped; `resolved`,
`reviewersRequested` and `followUpNote` record the rest. A follow-up failure leaves the push
`pushed`, a push failure does nothing. A missing reply file never blocks the push. The Tier-2
task outcome says how many replies reached GitHub, how many threads were resolved, who was
asked to re-review, and any follow-up failure.

Approving with `POST /api/approvals/:id/approve` may carry `{ replies: [{ threadId, body, resolve }] }`
(`OperatorThreadReply`, body may be empty): they replace the parked drafts in the same claim
(`push(taskId, replies)`), so the operator's edited text and resolve ticks are what is posted. The
`Addressed: all` auto-approve (or a quick-approve with an empty body) passes none: it posts the agent's
non-empty drafts and resolves only threads the report marks `done in` — the agent's `resolve` flag
alone never resolves a thread unless the operator edited the replies.
A run that made no new commits but drafted replies parks a **replies-only** approval (no
`fixedSha`): approving it skips `pushFastForward`, settles `pushed` with note `replies only`
and runs the same follow-up.

A reply typed in the PR detail (`POST …/threads/:threadId/reply`) records a `channel-reply`
activity entry.

`GET /api/inbox/prs` rows carry `addressComments { taskId, state, finishedAt?, auto? }` (latest such task per PR; a
`running` one whose task/run died reads `failed`; `auto: true` = started by the PR automation, below).

The HTTP route never starts an auto run: the body schema is strict, so `{ …, auto: true }` is a
400, and the controller calls `start(body)` with no options.

## Automatic review & comment handling (todo-16)

`PrAutomationService` (`apps/api/src/inbox/pr-automation.service.ts`) is a heartbeat that starts
the two actions above on its own, per the project's roadmap automation toggles `autoReview` and
`autoAddressComments` (`../api/roadmap.md` — tri-state, own value → the company's
`roadmapDefaults` → global `false`, via `resolveRoadmapConfig`). It shares the roadmap heartbeat
knob `systemConfig.roadmapTickMs` (read live, `0` disables; no separate knob) and reports on
`/api/health` as watcher `pr-automation`.

Each tick first resolves every project's effective config; when no project has `autoReview` or
`autoAddressComments` on, it ends there and never queries GitHub. Otherwise it reads
`InboxService.listPrs()` and the tasks store, then walks the PRs in inbox order:

- **Auto review** — effective `autoReview`, `bucket === "to-review"`, not a draft, a known
  `headSha`, no review task of the PR whose `prReview.headSha` is that head (any state — a failed
  or discarded review of the same head is not retried), and no review task of the PR `running` or
  `awaiting-approval`. It calls `InboxReviewService.start({ projectId, repo, number, title, level }, { auto: true, headSha })`,
  which stamps `prReview.auto: true` (and uses the inbox's head as the pin if its own head read
  fails, so the dedupe always has a head). Posting stays behind the workflow's `comment` gate and
  the `pr-review` approval, unchanged.
- **Auto address comments** — effective `autoAddressComments`, `bucket === "mine"`,
  `review === "changes-requested"`, `unresolvedThreads > 0`, a known head, the same head dedupe
  against `prAddressComments.headSha` — and against `prAddressComments.fixedSha`, so the head
  ZIBBY's own approved push created is never treated as new work (the reviewer's
  CHANGES_REQUESTED and any skipped threads outlive the push) — nothing in flight. It calls
  `InboxAddressCommentsService.start({ projectId, repo, number, title }, { auto: true })`, which
  stamps `prAddressComments.auto: true`. **Such a run never auto-pushes:**
  `TaskOutputService.parkPrAddressComments` parks the push approval (Tier 3, risk high) even on
  `Addressed: all`, and the run's brief tells the agent every report waits for the operator.
  Everything after the operator approves is unchanged. On a public repo anyone can leave a
  CHANGES_REQUESTED review, so a stranger can trigger such a run; it costs a run, and its push
  still waits for the operator.

A dead task's `running` state counts as `failed`: it no longer blocks a new head, but the same
head is still not retried. At most
`PR_AUTOMATION_MAX_STARTS_PER_TICK` = 3 starts per tick across all projects; the rest wait for the
next tick. Fail open per PR (logged and skipped); a `listPrs` failure, or an unreadable tasks
store (no dedupe possible), ends the tick with nothing started.

**Review level by content** — `selectReviewLevel(files)` (`select-review-level.ts`) over
`InboxReviewService.listPrFiles` (`GET /repos/{repo}/pulls/{n}/files?per_page=100` with the
project's token; throws on failure → `quick`). First match wins:

1. `browser` — any file matching `/\.(tsx|jsx|vue|svelte|css|scss|html)$/i`;
2. `thorough` — any path matching
   `/(auth|security|secret|token|crypto|permission|migration|contract|schema)/i` or ending in
   `.sql`, more than 500 changed lines (additions + deletions, summed over the PR), or more than 20
   files;
3. `tested` — any file that is not docs/config (`/\.(md|mdx|txt|rst|ya?ml|json|toml|ini|lock)$/i`
   or a path under `docs/`);
4. `quick` — otherwise, including an empty list.

**Fork cap (security floor).** `tested` and `browser` install and run the PR's code (with the
project's secrets in the run's environment). Nobody looked at an auto-started PR, so when its
head is not in the project's own repo (a fork — `headRef` absent, since `InboxService` sets it
only for same-repo heads) an auto review is capped at `thorough`, which reads the code without
running it. Docs-only (`quick`) and `thorough` are unaffected; an operator-clicked review runs at
whatever level the operator picks.

Each start records activity `pr-automation-started` (group `integrations`, also an
`INBOX_REFRESH_ACTIVITY_KINDS` member) with summary `auto review (<level>) <repo>#<n>` or
`auto address comments <repo>#<n>` and refs `{ projectId, taskId, itemId: "<repo>#<n>" }`.

`GET /api/inbox/prs` rows carry `headSha` (40-hex, from the pull fetch; absent when GitHub did not
report a valid one) and `codeReview.auto` / `addressComments.auto` (`true` when the latest task was
auto-started).

## Fix CI (`POST /api/inbox/prs/fix-ci`)

Body `{ projectId, repo, number, title? }` (strict, same as rebase) → 201 `{ taskId }`; 404
unknown project; 422 no GitHub link / repo not the project's / fork head / closed PR / head is
the base or default branch / a fix-ci run of the same PR already `running` or `awaiting-approval`
(latest such task, not dead). Same PR guards as rebase (`readPushablePr`, `PrRefusedError`).

`InboxFixCiService.start` (`apps/api/src/inbox/inbox-fix-ci.service.ts`) creates a task with the
explicit `pr-fix-ci` workflow target (`.zibby/data/workflows/pr-fix-ci.workflow.md`, agent
`fullstack-developer`) and stamps `prFixCi { repo, number, url, head, base, headSha, ownPr,
state: "running" }`; `ownPr` is true when the PR author is the operator's GitHub user. The agent
checks out the clicked head, reads the failing checks' logs, commits focused `fix(ci): …` fixes,
re-runs the failed commands locally and writes `zibby-pr-fix-ci.md` whose first line is
`Fixed: all` / `partial` / `checks failed` / `not code` / `aborted`. It never pushes. CI logs,
check output, the PR title, description, diff and commit messages are untrusted data.

On a `done` run `TaskOutputService.parkPrFixCi` reads the worktree (`rebaseFacts`): no report /
no worktree / unreadable worktree → `failed`; HEAD equal to the clicked `headSha` → `failed`
("no new commits — <report's first line>"); otherwise it records one `pr-fix-ci` approval with
the report plus "Verified by ZIBBY" HEAD / `git diff --stat` and stores that HEAD as `fixedSha`.
`Fixed: all` on the operator's own PR (`ownPr`) is approved on the spot (Tier-2, authorised by
the click); every other first line, including `not code`, and any colleague's PR stays a pending
Tier-3 approval (risk `high`) — pushing onto someone else's branch commits the operator. The
runner (`InboxFixCiService`) pushes exactly `fixedSha` fast-forward only, never force
(`WorkspaceService.pushFastForward`, `expectedSha` = `headSha`) → `pushed`, or `failed` with
git's reason; reject → `discarded`.

The server does not verify CI is failing: the agent aborts with `Fixed: aborted — no failing checks`, which ends as failed / "no new commits".

`GET /api/inbox/prs` rows carry `fixCi { taskId, state, finishedAt? }` (latest such task per PR;
a `running` one whose task/run died reads `failed`).

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
Rows of my own PRs (`mine`) also carry `unresolvedThreads` (todo-21; GraphQL `reviewThreads.isResolved`, first 100 threads, omitted when the read fails or the PR isn't `mine`). The web offers the address-comments button when it is `> 0`.

## Removed: `GET /api/roadmap/todo`

The Bridge TODO widget no longer reads manual roadmap items. `inboxContract.listTodoItems`
(`GET /api/roadmap/todo`) and `InboxService.listTodoItems()` were removed; the widget's notes are
their own file-backed list (`docs/api/todo.md`). Manual roadmap items are untouched and stay on
their project's roadmap page.
