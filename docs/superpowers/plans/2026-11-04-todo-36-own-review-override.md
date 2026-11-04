# Own-review override at the PR-review sign-off — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The operator can discard ZIBBY's generated PR review and post their own event + optional body (empty = approve without comment).

**Architecture:** A new `ownReview: true` flag rides the existing approve path: approve body → `Approval.ownReview` → (gate) `resumeGate` writes `reviewDocument ?? ""` over the artifact and stamps `WorkflowRun.approvedOwnReview` → `parkPrReview` accepts a blank body when own → `InboxReviewService.post` posts it (no `body` key when blank). A pending `pr-review` approval with `ownReview` posts `approval.reviewDocument` instead of the parked body. No new GitHub call site.

**Tech Stack:** Zod/ts-rest contracts, NestJS, Next.js + next-intl, vitest.

**Spec:** `docs/superpowers/specs/todo-36.md`

## Global Constraints

- Contract first (`libs/contracts`), then API, then web.
- UI strings in both `apps/web/i18n/messages/cs.json` and `en.json`; DS components only; no inline `style`.
- Tests never hit GitHub — `fetchImpl` is a `vi.fn` stub.
- Blank `reviewDocument` WITHOUT `ownReview` keeps meaning "no edit".

## Review Focus

- `ownReview` + blank body + REQUEST_CHANGES/COMMENT → contract 400 (GitHub would 422). Test in Task 1.
- `ownReview` on an approval without `suggestedReviewEvent` (not a PR-review) → ignored. Test in Task 2.
- Blank own review must not be treated as "agent left no artifact" by `parkPrReview`. Test in Task 2.
- Own review must post no inline comments even if the agent doc had blocks. Test in Task 2 (post with override).
- Switching approvals in the open sheet resets own mode (keyed by approval id). Covered by the same keyed-state pattern as `picked`.

---

### Task 1: Contracts

**Files:**

- Modify: `libs/contracts/src/approvals/approvals.contract.ts` (approve body)
- Modify: `libs/contracts/src/approvals/approval.schema.ts` (`ownReview: z.literal(true).optional()` next to `reviewDocument`)
- Modify: `libs/contracts/src/workflows/workflow-run.schema.ts` (`approvedOwnReview: z.literal(true).optional()` next to `approvedReviewEvent`)
- Test: `libs/contracts/src/approvals/approvals.contract.test.ts`

**Produces:** approve body `{ reviewEvent?, reviewDocument?, ownReview?: boolean, replies? }`, refined: `ownReview && !reviewDocument?.trim()` requires `reviewEvent === "APPROVE"`.

- [ ] Test `ownReview approve body: blank needs APPROVE` — `{ownReview:true, reviewEvent:"APPROVE"}` parses; `{ownReview:true, reviewEvent:"COMMENT"}` and `{ownReview:true}` fail; `{ownReview:true, reviewEvent:"COMMENT", reviewDocument:"nope"}` parses.
- [ ] Run, see fail; implement; run, pass; commit.

### Task 2: API plumbing

**Files:**

- `apps/api/src/approvals/approvals.controller.ts`, `approvals.service.ts` (`approve(id, { ownReview? })`, `decide` records `ownReview: true` and `reviewDocument: reviewDocument ?? ""` when `ownReview && suggestedReviewEvent`)
- `apps/api/src/workflows/workflow-runner.service.ts` (`resumeGate(..., ownReview?)`: when own, write `reviewDocument ?? ""` over the artifact unconditionally, set `run.approvedOwnReview = true`)
- `apps/api/src/tasks/task-scheduler.service.ts` (pass `run.approvedOwnReview` as 5th arg)
- `apps/api/src/tasks/task-output.service.ts` (`parkPrReview(task, raw, signedOffAtGate?, reviewEvent?, ownReview?: boolean)`: blank allowed when `ownReview && signedOffAtGate`)
- `apps/api/src/inbox/inbox-review.service.ts` (`post(taskId, event, override?: string)`: guard `review.body == null`; `override ?? review.body`; blank summary → omit `body` key; runner passes `approval.ownReview ? approval.reviewDocument ?? "" : undefined`)
- Tests: `approvals.service.test.ts`, `task-output.service.test.ts`, `task-scheduler.service.test.ts` (update 4-arg expectations to 5), `inbox-review.service.test.ts`, `apps/api/test/workflows.e2e.test.ts`
- Docs: `docs/api/approvals.md`, `docs/api/inbox.md`, `docs/api/workflows.md` one line each.

- [ ] Tests: approve with `{ownReview:true}` on a PR-review gate records `ownReview:true, reviewDocument:""` and hands them to the runner; on a non-review approval ignores it. `parkPrReview(task, "", "comment", "APPROVE", true)` parks + approves (no `failed`). `post("task_r1","APPROVE","")` sends `{"event":"APPROVE"}`; override `"Mine"` replaces a body with blocks and sends no `comments`. e2e: gate approve `{ownReview:true, reviewEvent:"APPROVE"}` → run `approvedOwnReview: true`, artifact empty.
- [ ] Run, fail; implement; run, pass; commit.

### Task 3: Web — "Write my own review"

**Files:**

- `apps/web/features/approvals/components/AddressCommentsReview.tsx` (`approveRequestBody(replies, reviewEvent, reviewDocument?, ownReview?: boolean)`: own → `{ reviewEvent, reviewDocument, ownReview: true }`, reviewDocument sent even blank-trimmed omitted)
- `apps/web/features/approvals/components/ApprovalSheet.tsx`: state `own: { id, text } | null`; a ghost button `ownReview.start` / `ownReview.cancel` in the decision row when `reviewEvent`; when own, the body replaces the findings/checkpoint with a `TextAreaField` (`data-testid="own-review-body"`, label `ownReview.label`, hint `ownReview.hint`); approve label `ownReview.submit`, disabled when text blank and event ≠ APPROVE.
- i18n `policy.approvals.sheet.ownReview.{start,cancel,label,hint,submit}` in cs + en.
- Tests: `AddressCommentsReview.test.tsx` (approveRequestBody own), `ApprovalSheet.test.tsx` (own mode → approve sends `{reviewEvent:"APPROVE", ownReview:true}`; blank + COMMENT disables submit).

- [ ] Tests, fail, implement, pass, commit.
