# Approval system

## What an Approval is

An `Approval` is a durable record of a decision where ZIBBY needs the
operator's explicit sign-off before continuing. It survives an API restart —
`ApprovalsStorageService` reads it from disk.

## Kinds of approval (ApprovalRunKind)

| Kind                  | When it is created                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `agent`               | A gate rule resolved to `ask` mid-run for an agent                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `workflow-stage`      | A gate inside a workflow stage resolved to `ask`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `workflow-output`     | A workflow's `pr` output sink is waiting for sign-off before it opens the PR (runId = the workflowRunId itself; no live child — a system-owned, agent-less gate)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `task-output`         | A directed task with a chosen `pr` output is waiting to open the PR from the finished agent/orchestrator run's branch (runId = the taskId; the durable `ScheduledTask` record holds the gate state, no live child)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `channel`             | ZIBBY prepared a reply draft to a message (Tier 3)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `task`                | A task exceeded its budget cap (`spend-past-cap`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `proposed-task`       | A discovery-proposed task is awaiting the operator's go-ahead (runId = the proposal id; approving dispatches it via `createTask` — _proposed ≠ dispatched_)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `jira-issue`          | An outbound Jira-issue create is parked for approval (runId = the create-request id; approving performs the gated POST via the Jira adapter)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `machine`             | An N5a machine action (e.g. renaming files in a named folder) is parked with its dry-run preview (runId = the `MachineActionRecord` id; approving executes the preview exactly once)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `routing-proposal`    | NS2 F10 — the switchboard couldn't tell whose domain an autonomously-released roadmap item belongs to (runId = the parked `RoutingProposal` id; approving releases the item to the parked `pick` as an explicit target, rejecting returns it to the operator). See `docs/api/roadmap.md`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `pr-review`           | Phase 129 P2 — a code review the `code-reviewer` agent prepared for a PR from the inbox (runId = the taskId; `ScheduledTask.prReview` holds repo/number/body; `detail` is the full review as preview). Approving posts it as a GitHub review with the event the operator picked (`reviewEvent` on approve: APPROVE / REQUEST_CHANGES / COMMENT, preselected from `suggestedReviewEvent`; none → COMMENT — ZIBBY never picks one itself); rejecting discards it. See `docs/api/inbox.md`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `pr-rebase`           | todo-11 — force-push of a PR head the `rebase-resolver` agent rebased (runId = the taskId; `ScheduledTask.prRebase` holds repo/head/base/headSha/worktree; `detail` = title line + the agent's report). Approved on the spot when conflict-free (the Rebase click was the decision); pending Tier-3 when conflicts were resolved or GitHub saw a conflict at the click. Approving pushes with `--force-with-lease`; rejecting discards. See `docs/api/inbox.md`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `pr-address-comments` | PR inbox redesign — fast-forward push of the commits the `fullstack-developer` agent made to address a PR's unresolved review comments (runId = the taskId; `ScheduledTask.prAddressComments` holds repo/head/headSha/worktree/`fixedSha`; `detail` = title line + the agent's report + "Verified by ZIBBY" HEAD and `git diff --stat`). Approved on the spot when the report's first line is exactly `Addressed: all` (the click decided — Tier-2, reported in the task outcome) — never for a run the PR automation started (`prAddressComments.auto`, todo-16: nobody clicked); otherwise pending Tier-3, risk high. No new commits but non-empty reply drafts → a replies-only approval (no push); no new commits and all drafts empty → the run ends failed. The runner (`InboxAddressCommentsService`) pushes with `WorkspaceService.pushFastForward` — never a force-push, `fixedSha` only; after a successful push it posts the `github-commenter` thread replies listed in `detail`, only to this PR's currently unresolved threads, never resolving one (same tier as the push). Rejecting discards both. See `docs/api/inbox.md`. |
| `pr-fix-ci`           | "Fix CI" — fast-forward push of the commits the `fullstack-developer` agent made to fix a PR's failing CI checks (runId = the taskId; `ScheduledTask.prFixCi` holds repo/head/headSha/worktree/`fixedSha`/`ownPr`; `detail` = title line + the agent's report + "Verified by ZIBBY" HEAD and `git diff --stat`). Approved on the spot only when the report's first line is exactly `Fixed: all` AND the PR is the operator's own (the click decided — Tier-2, risk medium); every other first line (incl. `Fixed: not code`) and any colleague's PR is pending Tier-3, risk high. No new commits → the run ends failed. The runner (`InboxFixCiService`) pushes `fixedSha` with `WorkspaceService.pushFastForward` — never a force-push. Rejecting discards. See `docs/api/inbox.md`.                                                                                                                                                                                                                                                                                                                                                        |

> This table predates several kinds (`agent-proposal`, `comms-graduation`,
> `automation-dispatch`, `review-rule`; the legacy `handoff-proposal` still parses read-only); `ApprovalRunKindSchema` in
> `libs/contracts/src/approvals/approval.schema.ts` is the complete list.

### Approvals are binary — there is no pick-one-of-N

Every kind resolves through `approve` / `reject`; `ApprovalsService` has no
multiple-choice primitive. (`gates/gate.schema.ts`'s `DecisionSchema` does contain an
`"ask"`, but that is a policy evaluator's verdict, not a decision surface.) A kind that
_wants_ to ask "which of these?" must therefore narrow itself to one yes/no and carry the
alternatives as information — `routing-proposal` names both candidate departments in its
`detail` string while approving only ever means "release to the winner". Rejecting is the
escape hatch back to the operator, whose own re-entry (an explicit target) is a hard
override. (`answer` is not a third outcome: it is an approve that also stores the
operator's free-text answer, and only for an `operator.question` — see _Agent
questions_ below.)

## Lifecycle

```
pending → approved
        → rejected
```

Once decided, an Approval never changes.

## Approval schema

**File:** `libs/contracts/src/approvals/approval.schema.ts`

```typescript
interface Approval {
  id: string;
  runId: string; // correlates back to the paused run/record
  kind: ApprovalRunKind;
  skill: string; // the acting agent/skill name
  action: string; // the intent (e.g. "git.push", "spend-past-cap")
  detail: string; // human-readable description
  risk: "low" | "medium" | "high";
  status: "pending" | "approved" | "rejected" | "revised";
  requestedAt: string; // ISO datetime
  decidedAt?: string; // ISO datetime
  department?: DepartmentId; // NS2 F3c — the acting unit's owning department
  sourceUrl?: string; // Phase 127 — link to the item's origin (Jira/GitHub/Slack)
  reason?: string; // ZB-08/O-12 — operator note on a rejection; the change request on `revised`
  suggestedReviewEvent?: "APPROVE" | "REQUEST_CHANGES" | "COMMENT"; // todo-10 — PR-review sign-off only: findings → REQUEST_CHANGES, none → APPROVE
  reviewEvent?: "APPROVE" | "REQUEST_CHANGES" | "COMMENT"; // todo-10 — the operator's pick on approve; absent → COMMENT
  replies?: { threadId: string; body: string; resolve: boolean }[]; // pr-address-comments only — the operator's edited thread replies, sent in the approve body and handed to the runner
}
```

There is no client-settable "how to resolve" field — routing a decision back to
the paused work is entirely the concern of the runner that registered for that
`kind` (see `ResumableRunner` below).

`department` (NS2 F3c) is optional and additive: it is stamped at
`requestApproval` time by the RUN-PATH callers only — the workflow runner from
`workflow.department`, the agent runner from `agent.department` (absent
for the synthetic orchestrator). The other call sites (machine, jira-issue,
channel, budget-task, agent-proposal) omit it — a system-owned gate with no
acting unit never invents an owner. It is pure attribution for the queue's
per-department filter and the activity lens; decisions still route by `kind`.

`sourceUrl` (Phase 127) is optional and additive the same way: only the
`channel` run-path caller (`ChannelTriageFlowService.parkForApproval`, the
Tier-3 draft-reply gate) supplies it, copied straight from the originating
`ChannelItem.url` when the item's adapter (Jira/GitHub/Slack) was able to
produce one. Every other kind omits it, and a pre-existing approval re-parses
untouched.

`ApprovalsService.patchSourceUrl(id, sourceUrl)` (Phase 127 follow-up) is a
narrow, lock-guarded exception to "only set at request time": it patches
`sourceUrl` onto an already-pending approval without touching `status` /
`decidedAt`, and is a no-op if the approval was already decided or already has
a `sourceUrl`. It exists solely for `SourceLinkBackfillService` (see
`docs/api/channels.md`) to retroactively link approvals parked before Phase
127 shipped — no other caller should use it.

## ApprovalsService

**File:** `apps/api/src/approvals/approvals.service.ts`

### Runner registry

`ApprovalsService` keeps a runtime map of `ApprovalRunKind → ResumableRunner`.
Every module that can pause a run on the gate registers its own runner at
startup — there is one registration per kind, each pointing at the module that
knows how to resume or cancel that kind of paused work:

```typescript
interface ResumableRunner {
  resume(runId: string, approval?: Approval): Promise<void> | void; // spawn the approved run; `approval` = the decided record (todo-10: PR-review runners read `reviewEvent`)
  cancel(runId: string): void; // terminate a rejected run without performing its action
  revise?(runId: string, note: string): Promise<void> | void; // only `workflow-gate`: re-run the gated step
}
```

Registrations today: `agent` → `AgentRunnerService`, `workflow-stage` /
`workflow-output` → `WorkflowRunnerService`, `task` → `TaskSchedulerService`,
`task-output` → `TaskOutputService`, `proposed-task` → `ProposedTaskFlowService`,
`channel` → `ChannelTriageFlowService`, `jira-issue` → `JiraIssueFlowService`,
`machine` → `MachineService`.

### Creating an approval (server-side)

Called by whichever runner is pausing on the gate:

```typescript
approvalsService.requestApproval({
  runId: "...",
  kind: "agent",
  skill: "coder",
  action: "git.push",
  detail: "Push feature/xyz → main",
  risk: "medium",
});
```

Stores JSON at `.zibby/data/approvals/<id>.json` and records an
`approval-requested` activity entry. When the caller supplied `department`,
it is persisted on the approval and stamped best-effort into the activity
entry's `refs.department` (F2c's field), so the activity log's department
lens catches the request line too.

### Runner integration

When a gate rule resolves to `ask`:

1. The owning runner calls `ApprovalsService.requestApproval(...)` → creates a
   pending `Approval`
2. The run/record pauses (e.g. `RunnerCore` moves to status
   `awaiting-approval` — no process is killed)
3. The client polls for the decision
4. The operator calls `POST /api/approvals/:id/approve` or `.../reject`
5. `ApprovalsService` records the decision (`approval-approved` /
   `approval-rejected`) and looks up the registered runner for that `kind`
6. The runner's `resume(runId)` (approve) or `cancel(runId)` (reject) is called

Rejecting a `workflow-stage` approval stops the whole workflow run: the stage is
killed and the run lands `interrupted` (its finished `stageRuns` are kept). It is not
treated as a failed stage, so no loop retry or escalation re-runs the rejected action.

Deciding an already-decided approval returns `409`
(`ApprovalAlreadyDecidedError`).

## API

```
GET  /api/approvals              list (optional ?status=pending|approved|rejected)
GET  /api/approvals/:id          get one approval
POST /api/approvals/:id/approve  approve (resumes the gated run) — 404 | 409
                                  body: { reviewEvent?: "APPROVE" | "REQUEST_CHANGES" | "COMMENT", replies?: OperatorThreadReply[] }
                                    reviewEvent — todo-10, PR-review sign-off only; absent → COMMENT
                                    replies ({ threadId, body, resolve }) — pr-address-comments only; replace the parked drafts
POST /api/approvals/:id/reject   reject (terminates the gated run, no action taken) — 404 | 409
                                  body: { reason?: string } — ZB-08/O-12, an optional operator note
                                  shown in the Policy → Approvals history table
POST /api/approvals/:id/revise   request changes on a `stage-approval` workflow checkpoint — 404 | 409
                                  body: { note: string } (required); status → `revised`, the gated
                                  phase re-runs with the note and parks at the same gate again.
                                  Any other approval (incl. `spend-past-cap`) → 409, stays pending
POST /api/approvals/:id/answer   answer an agent's `operator.question` — 404 | 409
                                  body: { answer: string } (1-4000 chars, trimmed); status → `approved`
                                  with `reason` = the answer, then the run resumes like approve.
                                  Any other action or an already-decided approval → 409, stays as is
```

## Operator token

Every decision route (`approve` / `reject` / `revise` / `answer`) requires the header
`x-zibby-operator-token` (`OPERATOR_TOKEN_HEADER` in `@zibby/contracts`); missing or wrong
→ `401 { message }`. So does every mutating inbox route (`POST /api/inbox/prs/review`,
`/rebase`, `/address-comments`, `PUT /api/inbox/state`) — rebase and address-comments
auto-approve their push "authorised by the click", so the click must be the operator's
(`OperatorTokenGuard` on `InboxController`, exported from `ApprovalsModule`).
`GET` / `HEAD` / `OPTIONS` pass unguarded.

The expected token resolves from `ZIBBY_OPERATOR_TOKEN`, else the 0600 file
`ZIBBY_OPERATOR_TOKEN_FILE ?? ~/.config/zibby/operator-token` (an absolute path — dotenv does
not expand `~`). It is resolved at boot (the file is created then, and its path — never the
value — is logged once: _"Operator token at … — paste it into Settings → General"_). If none
resolves the routes stay `401` (fail closed) and resolution is retried on the next request.
The web app sends the token pasted in Settings → General (`localStorage["zibby.operatorToken"]`)
on every request.

**Guarantee:** an agent cannot decide approvals unless it obtains the token. Every `claude`
child and every git/gh child (`shared/git-exec.ts` — git runs hooks from agent worktrees)
gets its env from `agentBaseEnv()` (both variables stripped), and the PreToolUse hook denies
Bash commands hitting the decision URLs or `.config/zibby` (`//` and `/./` collapsed), and
Read/Grep/Glob/Write/Edit whose path — resolved against the call's cwd and through symlinks —
lands in that directory.

**Known ceiling.** Agents run as the same OS user as the operator, so this is not a hard
boundary. The same user can still reach the token through a Bash path the hook can't see
statically (`cd ~/.config && cat zibby/*`, a glob, a `node -e` one-liner), the browser's
profile storage (`localStorage`), `ps eww` of the API process when the token is provided via
env, or a `.env` file in the repo. Prefer the default file over `ZIBBY_OPERATOR_TOKEN` /
`.env`. Upgrade path: a Claude Code sandbox read-deny on `~/.config/zibby`, or running agents
as a separate OS user.

## Agent questions (`ask_operator`)

An agent that is blocked on a fact only the operator knows calls the
`mcp__zibby-run__ask_operator({ question })` tool (the `OPERATING_CONTRACT` tells it
to, once, with one concrete question — never for a permission or a confirmation).

1. The PreToolUse approval hook classifies the call as `operator.question` (context
   `{ riskType: "question", summary: <question>, consequence }`; an empty question
   is still gated as `(empty question)`).
2. `operator.question` is a locked `ask:human` floor entry, so no agent, department
   or catalog rule can weaken it. The run holds on a normal `agent` /
   `workflow-stage` approval whose `detail` is that context.
3. `POST /approvals/:id/answer` stores the answer as `reason` and resumes the run.
   Rejecting stops the run, as for any other approval.
4. The held tool call proceeds to `RunMcpController` (`POST /api/runs/mcp`, the
   `zibby-run` server seeded by `McpServersStorageService` with the run bearer token,
   behind `KbMcpAuthGuard`). It returns the newest approved answer to that question
   for the calling run (`X-Zibby-Run-Id`; a stage's approval run id is
   `<workflowRunId>.<stage>`, so the prefix matches too; an agent's header carries
   `<agentId>_<startedMs>` and its approval the core id `<agentId>_<startedMs>_<pid>`,
   so an `agent`-kind approval also matches when only a numeric pid follows). No run id, or the chat
   token → an `isError` result. No recorded answer (e.g. a plain approve) →
   "No answer was recorded. Decide yourself or stop." It never waits and never
   answers on its own.

A client can never create an Approval directly — only the server (a runner or
triage flow) generates them. This prevents forging a decision (Law 4).

## Surfaced in the UI

There is no standalone `/approvals` queue page; a pending approval surfaces
wherever the thing it gates is already visible:

- **Run detail** — the LIVE feed's NEEDS YOU banner (`RunApprovalBanner`) shows
  the action, its consequence and, at a PR gate, the would-publish diffstat, with
  hold-to-approve (`HoldButton`), REVISE (stage approvals) and REJECT. An agent's
  `operator.question` shows as a question banner and is answered from the composer.
  Rejecting records the denial and stops the run as interrupted, keeping its partial
  output, so it stays in the feed and answerable.
- **Overview** — an `ApprovalsPanel` lists pending approvals across the
  system, and the overview page shows a pending-count badge.
- **Agent detail** — `ApprovalCard` surfaces an approval tied to that agent.

## Activity records

| Event                | When                    |
| -------------------- | ----------------------- |
| `approval-requested` | An approval was created |
| `approval-approved`  | The operator approved   |
| `approval-rejected`  | The operator rejected   |

<!-- ZibbyCorp ZB-08 (2026-09-25): deny gains an optional operator reason (O-12). -->
