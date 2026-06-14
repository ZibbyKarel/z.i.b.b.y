# Phase 31 — Hold-to-confirm on the run-detail gate for high-risk approvals

> Priority axis (LOOP.md): **#1 FUNCTIONALITY / safety** on the gate. Second gap found
> by the Phase-30 gate audit.

## The gap

The approvals-queue card (`ApprovalCard`, right rail) gates **payment/deletion**
approvals behind a 0.9s `HoldButton` — the deliberate double-confirmation guardrail
(`highRisk = {payment, deletion}`). But `RunApprovalGate` (the run-detail decision panel,
the larger and more prominent surface) approved **every** risk with a plain one-click
Button. So the highest-consequence actions (buy / delete) were *easier* to confirm on the
bigger surface than in the rail — an inconsistent guardrail on the gate.

## Fix

- `features/approvals/approval.ts`: add the canonical
  `HIGH_RISK_TYPES: ReadonlySet<RiskType> = new Set(["platba", "mazani"])` — the taxonomy
  home, mirroring `ApprovalCard`'s `highRisk` payment/deletion set (reuse, don't fork).
- `RunApprovalGate.tsx`: compute
  `highRisk = approval.riskType !== undefined && HIGH_RISK_TYPES.has(approval.riskType)`.
  When high-risk, the **Confirm** control becomes a DS `HoldButton`
  (`label=holdToApprove`, `doneLabel=holdDone`, `tone="bad"` for `mazani` else `"warn"`,
  `onConfirm` → `approve.mutate(...)`, `disabled` while reject pending). Otherwise the
  single-click Confirm Button (unchanged). **Reject stays a single click** — the safe
  direction is never gated behind a hold. Unenriched approvals (no `riskType`) degrade to
  the plain button (same as before, same as `ApprovalCard`).
- i18n `approvals.holdToApprove` / `approvals.holdDone` (cs+en), mirroring the existing
  `approval.*` queue-card keys.

## Why riskType-only (not severity)
`ApprovalCard`'s `highRisk` is payment/deletion — the canonical `RiskType` values
`platba`/`mazani`. Matching on `riskType` gives exact parity. Including severity `high`
would over-trigger (a high-severity push/send is not destructive) and would also flip the
existing Phase-30 tests (their fixture is `risk: "high"` with no `riskType`).

## Tests
`RunApprovalGate.test.tsx`:
- a deletion approval (`riskType: "mazani"`) renders the `HoldButton` (`hold-button-root`)
  and **no** single-click Confirm; reject stays a single click;
- a payment approval (`riskType: "platba"`) also renders the `HoldButton`;
- a non-high-risk approval (no `riskType`) keeps the plain Confirm and no hold button.

## Definition of done
- `pnpm lint && pnpm typecheck && pnpm test` green (web/DS; api unchanged — under-load e2e
  flake verified by `vitest --project api` JSON run 691/691); `tsc -p apps/web` clean;
  `graphify update .`; checkpoint commit (no push — PR is the gate).
