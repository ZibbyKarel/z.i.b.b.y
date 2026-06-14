# Phase 36 — A budget-held task can be released from its own detail

> Priority axis (LOOP.md): **#1 FUNCTIONALITY / accountability** — connects the
> `/projects` budget surface, the runs detail, and the gate.

## Audit result

`/projects` is solid: real projects + categories (`useProjectsQuery` /
`useProjectCategoriesQuery`), per-project **budget bars** (`ProjectCard` `BudgetBar`:
used vs daily/weekly cap, tinted by `getUsageTone`) fed by `useBudgetQuery`, plus
running/queued/**held** stats, and full CRUD. The runs feed (`TaskCard`) already captions
a `held` task with its `heldReason` in warn tone.

The gap is the **connection**. A Phase-8 budget-`held` dispatch carries `approvalId` — its
spend-past-cap override, which is already a pending approval in the queue (the right-rail
`ApprovalCard` can approve/reject it). But `approvalForRun` only matched runs whose status
is `awaiting-approval`. A held task's status is `held`, so clicking it in `/runs` showed a
detail with **no decision panel** — the operator had to leave and find the override in the
queue to release the dispatch.

## Fix

`apps/web/features/runs/run.ts` `approvalForRun`:
- When `run.status === "held"`, resolve the override by id:
  `run.approvalId ? queue.find(a => a.id === run.approvalId) : undefined`.
- Keep the existing `awaiting-approval` matching (exact runId / pipeline-stage prefix) for
  everything else.
- Widen the generic bound to `Pick<Approval, "id" | "runId">` and the run param to include
  `approvalId`.

No `RunDetail` change: its existing `approval ? (…RunApprovalGate…)` branch now fires for
held tasks. The PR-gate sub-panel is gated on `run.kind === "pipeline"`, so a held
(scheduled-kind) task renders just the clean approve/reject decision. **No new server
semantics** — it's the same approval the queue already decides; approving releases the
dispatch past the cap, rejecting denies the override (Phase-30 reject path).

## Tests
`apps/web/features/runs/run.test.ts` (`approvalForRun` describe):
- a `held` run with an `approvalId` resolves the matching queue approval by id;
- a `held` run with no `approvalId` → undefined;
- the existing agent-exact / pipeline-prefix / not-awaiting cases stay green.

## Definition of done
- `pnpm lint && pnpm typecheck && pnpm test` green; `tsc -p apps/web` clean;
  `graphify update .`; checkpoint commit (no push — PR is the gate).
