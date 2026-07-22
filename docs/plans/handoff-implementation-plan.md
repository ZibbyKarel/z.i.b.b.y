# Handoff — implementation plan

Executes `docs/superpowers/specs/2026-07-22-subsystem-handoff-design.md`.
Contract-first, tests = DoD, no `any`, per-package `tsc -p` (never
`rtk pnpm typecheck`), i18n cs+en parity for every new string. Each phase is
independently committable and reviewed by Opus before the next starts.

Branch: `feat/subsystem-handoff`.

---

## Part A — Handoff (additive). Ships first.

### A1 — Contracts

**Files**
- NEW `libs/contracts/src/handoff/handoff.schema.ts`:
  - `HandoffSeveritySchema = z.enum(["low","moderate","high","critical"])` + a
    `HANDOFF_SEVERITY_ORDER` const array for ladder comparison.
  - `HandoffSignalSchema` (from, kind, severity?, projectId?, title, body, fingerprint).
  - `HandoffTargetSchema` — the `subsystem` + `pipeline` members of `TaskTarget`
    (import & reuse, do NOT redefine target shapes). Confirm exact shape in
    `libs/contracts/src/tasks/task.schema.ts` (`TaskTargetSchema`) first.
  - `HandoffRuleSchema` (id, from, signalKind, minSeverity?, to, tier, enabled, system?).
  - `HandoffProposalSchema` (id, ruleId, signal, target, createdAt).
  - `HandoffOutcomeSchema` — discriminated result: `{ action: "dispatched", runRef, target } | { action: "proposed", approvalId } | { action: "none" }`.
  - Types via `z.infer` for each.
- NEW `libs/contracts/src/handoff/handoff.contract.ts`:
  - `handoffContract` with `getHandoffRules` (`GET /api/handoff-rules`) → `HandoffRuleSchema.array()`.
  - Follow the `health` contract as the reference for a new resource.
- `libs/contracts/src/app.contract.ts` — add `handoff: handoffContract`.
- `libs/contracts/src/approvals/approval.schema.ts:12` — append `"handoff-proposal"`
  to `ApprovalRunKindSchema` with a doc comment matching the existing convention.
- Barrel exports (`libs/contracts/src/index.ts` or the package's export map) — export
  the new schemas/types the way the other resources are exported.

**Tests**
- `handoff.schema.test.ts` — parse round-trips; severity ladder order; a rule with
  `signalKind: "*"`; reject an unknown `from`.
- Extend the approvals-kind test if one enumerates the kinds.

**DoD**: `pnpm exec tsc -p libs/contracts` clean; `pnpm exec vitest run libs/contracts/src/handoff libs/contracts/src/approvals --project ...` green.

**Commit**: `feat(contracts): handoff rules, signals, proposals + handoff-proposal approval kind`

---

### A2 — Handoff module (engine)

**Files** (`apps/api/src/handoff/`)
- `handoff-rule.store.ts` — `HandoffRuleStore`, file-backed `.zibby/data/handoff/rules.json`,
  seeds the A.3 system rules, missing/corrupt = seed defaults, atomic writes.
  Model on `AutomationsStorageService` (seed + read).
- `handoff-proposal.store.ts` — `HandoffProposalStore`, `.zibby/data/handoff/proposals/<id>.json`,
  `create` / `read` / `delete`. Model on the agent-factory candidate store.
- `handoff-fired.store.ts` — idempotency snapshot keyed by `ruleId`, holding fired
  `signal.fingerprint`s. Reuse the `SubsystemFindingsStore` fingerprint-set pattern
  (fail-open, atomic).
- `handoff.service.ts` — `HandoffService`:
  - `evaluate(signal): Promise<HandoffOutcome>` — match enabled rules
    (`from` == signal.from, `signalKind` == signal.kind or `"*"`, `minSeverity`
    ladder only when signal has severity), skip already-fired, then tier 1/2/3
    behavior per spec A.2. First matching rule wins (log if multiple match).
  - implements `ResumableRunner`; `resume(proposalId)` / `cancel(proposalId)`.
  - `onModuleInit` → `approvals.register("handoff-proposal", this)`.
  - Fail-open: never throw out of `evaluate` (producers call it in a scan tick).
  - Builds the task input from the signal (title, text = body, paths: []).
    Dispatch via `taskScheduler.createTask(input, now, signal.projectId, rule.to)`.
    NOTE: `createTask`'s current signature takes `now: number` (`Date.now()`) —
    match the existing Sentinel/Maestro call convention exactly.
- `handoff.controller.ts` — implements `handoffContract` (GET list).
- `handoff.module.ts` — provides the stores + service + controller; imports
  `ApprovalsModule`, `TasksModule` (for `TaskSchedulerService`), `ActivityLogModule`.
  Register in `app.module.ts`.
- DI tokens for the two dirs (mirror `SUBSYSTEM_FINDINGS_DIR`).

**Tests** (`handoff.service.test.ts`, plus store tests)
- Tier 1 dispatches silently (createTask called with target, no activity record).
- Tier 2 dispatches + records a `handoff` activity entry.
- Tier 3 does NOT dispatch; writes a proposal; requests a `handoff-proposal` approval.
- `resume` dispatches the parked payload; `cancel` deletes it, no dispatch.
- Severity ladder: `minSeverity: "critical"` rejects a `high` signal, accepts `critical`.
- Wildcard `signalKind: "*"` matches any kind from that subsystem.
- Idempotency: same `(ruleId, fingerprint)` twice → one dispatch.
- No matching rule → `{ action: "none" }`, no dispatch (the secret-finding case).
- Use a fake `TaskSchedulerService` + fake `ApprovalsService` (unit), temp dirs for stores.

**DoD**: `pnpm exec tsc -p apps/api` clean; `pnpm exec vitest run apps/api/src/handoff` green.

**Commit**: `feat(api): handoff evaluation engine + seeded system rules + tier-3 proposal gate`

---

### A3 — Wire the producers

**Files**
- `apps/api/src/sentinel/sentinel.service.ts:203-231` — replace the hard-coded
  CVE-dispatch loop with `await this.handoff.evaluate(toSignal(finding))` per new
  finding. Add a private `toSignal(f: SentinelFinding): HandoffSignal`. Inject
  `HandoffService`. Behavior for critical CVE stays identical (now rule-driven);
  a secret produces a signal with no matching rule → no dispatch (as today).
  Drop the now-unused `taskScheduler` injection if nothing else uses it.
- `apps/api/src/maestro/post-merge-watch.service.ts:166-197` — `dispatchFix` calls
  `handoff.evaluate({ from:"maestro", kind:"post-merge-red", projectId, title, body, fingerprint })`.
  Read the dispatched task id from the `HandoffOutcome` (`action:"dispatched"` →
  `runRef`/taskId) so `store.patch(watch.id, { state:"red", taskId })` still works.
  If outcome is `none`/`proposed`, patch `state:"red"` without a taskId.
- `apps/api/src/loom/loom.service.ts:143` — after findings are written, loop
  `newFindings` → `handoff.evaluate(toSignal(f))`. Inject `HandoffService`. Update the
  class doc comment (`:82-84`) — Loom now emits handoff signals; the Tier-3 rule
  (not the code) keeps "proposes ≠ acts". Fail-open.
- `apps/api/src/pipelines/pipeline-runner.service.ts` — at the point a terminal
  `produces` phase records an `ArtifactRecord`, if the pipeline's
  `ownerSubsystem === "scout"`, emit a `research-artifact` signal
  (`fingerprint` = artifact id). Inject `HandoffService`; keep it fail-open and
  behind the ownerSubsystem check so non-Scout pipelines are unaffected.
- Update each module (`SentinelModule`, `MaestroModule`/merge-watch module,
  `LoomModule`, `PipelinesModule`) to import `HandoffModule`. Watch for DI cycles
  (`HandoffModule` imports `TasksModule`; `PipelinesModule` is imported by
  `TasksModule` — if a cycle appears, use `forwardRef` as the codebase already does
  elsewhere, or thread `HandoffService` in via the module that already sits above).

**Tests**
- `sentinel.service.test.ts` — critical CVE still results in a dispatched task
  (now assert via a fake `HandoffService.evaluate` receiving the mapped signal, and
  a seed-rule integration test that a critical CVE signal dispatches). Secret → no dispatch.
- `post-merge-watch.service.test.ts` — red verdict calls `handoff.evaluate` and the
  watch is patched to `red` with the returned taskId.
- `loom.service.test.ts` — new findings call `handoff.evaluate` (new assertion).
- A pipeline-runner test that a Scout-owned pipeline's delivered artifact emits a
  `research-artifact` signal; a non-Scout one does not.

**DoD**: `pnpm exec tsc -p apps/api` clean; `pnpm exec vitest run apps/api/src/sentinel apps/api/src/maestro apps/api/src/loom apps/api/src/pipelines apps/api/src/handoff` green.

**Commit**: `feat(api): route Sentinel/Maestro/Loom/Scout handoffs through the rule engine`

---

### A4 — Web i18n label

**Files**
- `apps/web/i18n/messages/{cs,en}.json` — label + action string for the
  `handoff-proposal` approval kind, wherever the approvals queue maps kind → label
  (find the existing `agent-proposal` / `herald-graduation` label keys and mirror them).
- Any approvals-queue component switch on `kind` that needs a `handoff-proposal` arm.

**Tests**: `apps/web/i18n/messages/parity.test.ts` stays green (both locales carry the key).

**DoD**: `pnpm exec vitest run apps/web/i18n` green; `pnpm exec tsc -p apps/web` clean.

**Commit**: `feat(web): surface handoff-proposal approvals in the queue`

---

## Part B — Chains retirement (subtractive). Ships after A is green.

Sequenced last: the `scout-research` + `loom-*` seed rules must exist before
`audit-develop.json` is removed, so no capability is lost. This is a surgical
removal — `ChainRun` is woven into the unified run feed, SSE, entity-MCP, and
subsystem status (full inventory in the spec, Part B). Phased:

- **B1 — Sever chains from the unified surfaces (API)**: remove chain-run
  production + `run.kind === "chain"` branches from `tasks/*`, `events/*`,
  `subsystems/*` (status aggregation + owner-backfill), `memory/*` (entity-MCP).
  Remove `"chain"` from `OwnableEntityKindSchema`. Keep the chains module compiling
  until B2 (or do B1+B2 atomically if the coupling makes a partial state impossible).
- **B2 — Delete the chains feature (API + contracts)**: `apps/api/src/chains/*`,
  `libs/contracts/src/chains/*`, `app.contract.ts` routers, `app.module.ts` import.
- **B3 — Delete the chains feature (web)**: `app/(dashboard)/chains/*`,
  `features/chains/*`, and the references in `task.ts`, `ChatToolDock.tsx`,
  `useOwnerSubsystem.ts`, `SubsystemDrawer/*Tab.tsx`, `runEvents.tsx`, `state/config.ts`.
- **B4 — Data cleanup**: remove `.zibby/data/chains/`.

**DoD (per B phase)**: package `tsc -p` clean + the touched packages' vitest green;
after B3, `pnpm exec vitest run apps/web` for the affected features. Full
`pnpm check:types` + `pnpm test` only at the end of Part B before handoff.

`ArtifactRecord` + `ArtifactsStorageService` are NOT touched — they stay as the
handoff substrate.

---

## Review protocol (Opus)

After each phase's subagent reports, Opus reviews the diff against: (1) spec
fidelity, (2) contract-first ordering, (3) no `any` / no `forwardRef` unless
forced, (4) tests actually assert the behavior (not just "green"), (5) fail-open
in producer hooks, (6) the autonomy floor (handoff never merges/pushes; Tier-3
gate present). Rework notes go back to a fresh sonnet subagent; only a clean
phase advances.
