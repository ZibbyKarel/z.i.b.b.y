# Phase 30 — The gate's "no" rejects, it doesn't delete the run

> Priority axis (LOOP.md): **#4 BUG** on the **#1-critical** surface — the gate.
> Laws touched: "the PR is the gate", "always answerable", "files are the source of
> truth". Found by the Phase-30 gate/approvals audit.

## The bug

A run paused on `awaiting-approval` shows `RunApprovalGate` in the run detail — the
decision panel with a Confirm / Delete footer. The negative button was wired to
`onDelete`, which `Screen.tsx` implements as **deleting the whole run** (`deleteAgent` /
`deletePipeline`) — and the comment there says it "erases its on-disk artifacts".

So saying **no** to a gated action (PR-open, git-push, destructive delete, spend-past-cap)
from the run detail:
- **erased the run record + artifacts** (violates "files are the source of truth" /
  "always answerable"), and
- **never went through the gate's reject endpoint**, so no `approval-rejected` activity
  event was recorded (the gate decision left no trace).

Meanwhile the approvals-queue card in the right rail (`ApprovalCard`) already does the
right thing — `useRejectMutation` → `POST /api/approvals/:id/reject`, which marks the
approval `rejected`, records the activity event, and **terminates the run without erasing
it**. The two surfaces disagreed on what "no" means, on the one surface that must be
auditable.

## Fix

`apps/web/features/runs/components/RunApprovalGate.tsx`:
- Add `const reject = useRejectMutation()`. The negative button calls
  `reject.mutate({ params: { id: approval.id }, body: {} })` (mirrors `ApprovalCard`).
- Relabel the button `approvals.discard` → `approvals.reject` ("Zamítnout"/"Reject"),
  keep `intent="danger"` / `icon="x"`.
- Remove the `onDelete` and `deleting` props — the gate's job is approve/reject, not
  delete. Disable both buttons while either mutation is pending
  (`disabled={reject.isPending}` on approve, `disabled={approve.isPending}` on reject,
  each with its own `loading`).

`apps/web/features/runs/components/RunDetail.tsx`: the approval branch renders
`<RunApprovalGate approval={approval} />` (drops `onDelete`/`deleting`). The run-header
delete button is unchanged — once a run is no longer gated (after reject it terminates and
the approval is gone), the operator can still delete it from history there.

`apps/web/i18n/messages/{cs,en}.json`: drop `approvals.discard`, add `approvals.reject`.

## Why reject is correct (verified against the backend)
`approvals.service.ts` `reject(id)`: `decide(id, "rejected")` → approval status `rejected`,
emits an `approval-rejected` activity event (`refs: { approvalId, runRef, decision }`), and
cancels the gated run "without performing its action". The run stays on disk → answerable.
Delete is the opposite: it removes the run's artifacts and records nothing.

## Tests
New `apps/web/features/runs/components/RunApprovalGate.test.tsx` (mock
`../../approvals/mutations` approve + reject):
- the negative button calls **reject** with `{ params: { id }, body: {} }` and **no delete**;
- the positive button calls **approve** with the same shape;
- the action + skill render in the panel header.

## Definition of done
- `pnpm lint && pnpm typecheck && pnpm test` green; `tsc -p apps/web` clean;
  `graphify update .`; checkpoint commit (no push — PR is the gate).

## Follow-up noted (not this phase)
`RunApprovalGate`'s approve is a plain Button even for payment/deletion, while
`ApprovalCard` gates those behind a 0.9s `HoldButton`. Candidate Phase 31: bring the
hold-to-confirm guardrail to the run-detail gate for high-risk approvals.
