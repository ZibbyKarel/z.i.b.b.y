# Approval system

## What an Approval is

An `Approval` is a durable record of a decision where ZIBBY needs the
operator's explicit sign-off before continuing. It survives an API restart —
`ApprovalsStorageService` reads it from disk.

## Kinds of approval (ApprovalRunKind)

| Kind               | When it is created                                                                                                                                                                                                                                                                        |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `agent`            | A gate rule resolved to `ask` mid-run for an agent                                                                                                                                                                                                                                        |
| `pipeline-stage`   | A gate inside a pipeline stage resolved to `ask`                                                                                                                                                                                                                                          |
| `pipeline-output`  | A pipeline's `pr` output sink is waiting for sign-off before it opens the PR (runId = the pipelineRunId itself; no live child — a system-owned, agent-less gate)                                                                                                                          |
| `task-output`      | A directed task with a chosen `pr` output is waiting to open the PR from the finished agent/orchestrator run's branch (runId = the taskId; the durable `ScheduledTask` record holds the gate state, no live child)                                                                        |
| `channel`          | ZIBBY prepared a reply draft to a message (Tier 3)                                                                                                                                                                                                                                        |
| `task`             | A task exceeded its budget cap (`spend-past-cap`)                                                                                                                                                                                                                                         |
| `proposed-task`    | A discovery-proposed task is awaiting the operator's go-ahead (runId = the proposal id; approving dispatches it via `createTask` — _proposed ≠ dispatched_)                                                                                                                               |
| `jira-issue`       | An outbound Jira-issue create is parked for approval (runId = the create-request id; approving performs the gated POST via the Jira adapter)                                                                                                                                              |
| `machine`          | An N5a machine action (e.g. renaming files in a named folder) is parked with its dry-run preview (runId = the `MachineActionRecord` id; approving executes the preview exactly once)                                                                                                      |
| `routing-proposal` | NS2 F10 — the switchboard couldn't tell whose domain an autonomously-released roadmap item belongs to (runId = the parked `RoutingProposal` id; approving releases the item to the parked `pick` as an explicit target, rejecting returns it to the operator). See `docs/api/roadmap.md`. |

> This table predates several kinds (`agent-proposal`, `herald-graduation`,
> `handoff-proposal`, `review-rule`); `ApprovalRunKindSchema` in
> `libs/contracts/src/approvals/approval.schema.ts` is the complete list.

### Approvals are binary — there is no pick-one-of-N

Every kind resolves through `approve` / `reject`; `ApprovalsService` has no
multiple-choice primitive. (`gates/gate.schema.ts`'s `DecisionSchema` does contain an
`"ask"`, but that is a policy evaluator's verdict, not a decision surface.) A kind that
_wants_ to ask "which of these?" must therefore narrow itself to one yes/no and carry the
alternatives as information — `routing-proposal` names both candidate subsystems in its
`detail` string while approving only ever means "release to the winner". Rejecting is the
escape hatch back to the operator, whose own re-entry (an explicit target) is a hard
override.

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
  status: "pending" | "approved" | "rejected";
  requestedAt: string; // ISO datetime
  decidedAt?: string; // ISO datetime
  ownerSubsystem?: SubsystemId; // NS2 F3c — the acting unit's owning subsystem
}
```

There is no client-settable "how to resolve" field — routing a decision back to
the paused work is entirely the concern of the runner that registered for that
`kind` (see `ResumableRunner` below).

`ownerSubsystem` (NS2 F3c) is optional and additive: it is stamped at
`requestApproval` time by the RUN-PATH callers only — the pipeline runner from
`pipeline.ownerSubsystem`, the agent runner from `agent.ownerSubsystem` (absent
for the synthetic orchestrator). The other call sites (machine, jira-issue,
channel, budget-task, agent-proposal) omit it — a system-owned gate with no
acting unit never invents an owner. It is pure attribution for the queue's
per-subsystem filter and the activity lens; decisions still route by `kind`.

## ApprovalsService

**File:** `apps/api/src/approvals/approvals.service.ts`

### Runner registry

`ApprovalsService` keeps a runtime map of `ApprovalRunKind → ResumableRunner`.
Every module that can pause a run on the gate registers its own runner at
startup — there is one registration per kind, each pointing at the module that
knows how to resume or cancel that kind of paused work:

```typescript
interface ResumableRunner {
  resume(runId: string): Promise<void> | void; // spawn the approved, previously-paused run
  cancel(runId: string): void; // terminate a rejected run without performing its action
}
```

Registrations today: `agent` → `AgentRunnerService`, `pipeline-stage` /
`pipeline-output` → `PipelineRunnerService`, `task` → `TaskSchedulerService`,
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
`approval-requested` activity entry. When the caller supplied `ownerSubsystem`,
it is persisted on the approval and stamped best-effort into the activity
entry's `refs.ownerSubsystem` (F2c's field), so the activity log's subsystem
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

Deciding an already-decided approval returns `409`
(`ApprovalAlreadyDecidedError`).

## API

```
GET  /api/approvals              list (optional ?status=pending|approved|rejected)
GET  /api/approvals/:id          get one approval
POST /api/approvals/:id/approve  approve (resumes the gated run) — 404 | 409
POST /api/approvals/:id/reject   reject (terminates the gated run, no action taken) — 404 | 409
```

A client can never create an Approval directly — only the server (a runner or
triage flow) generates them. This prevents forging a decision (Law 4).

## Surfaced in the UI

There is no standalone `/approvals` queue page; a pending approval surfaces
wherever the thing it gates is already visible:

- **Run detail** — `RunApprovalGate` shows the exact action, its structured
  preview, and its consequence, with Confirm / Reject. High-risk actions
  (`HIGH_RISK_TYPES`, currently payment and deletion) require a deliberate
  ~0.9s hold-to-confirm (`HoldButton`) instead of a single click — or the
  timing-free equivalent: a short press arms the button and a second discrete
  press confirms (Escape/blur disarms, no expiry window; WCAG 2.5.1/2.2.1).
  Rejecting records the denial and terminates the run without erasing it, so it
  stays in the feed and answerable.
- **Overview** — an `ApprovalsPanel` lists pending approvals across the
  system, and the overview page shows a pending-count badge.
- **Agent detail** — `ApprovalCard` surfaces an approval tied to that agent.

## Activity records

| Event                | When                    |
| -------------------- | ----------------------- |
| `approval-requested` | An approval was created |
| `approval-approved`  | The operator approved   |
| `approval-rejected`  | The operator rejected   |
