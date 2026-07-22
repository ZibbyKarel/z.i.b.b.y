# Cross-subsystem handoff — design

> Brainstorming session 2026-07-22. Operator directive: replace the legacy
> **chains** feature with a declarative, standing **handoff** mechanism so a
> subsystem can pass work to another subsystem when it produces a finding or an
> artifact — Scout research → Forge build; Puls/Maestro red CI → Forge fix;
> Sentinel CVE → Forge fix; Loom architecture finding → Forge.

## Status

Approved conversationally by the operator during brainstorming. Two independent
bodies of work, sequenced: **A. Handoff (additive)** lands first; **B. Chains
retirement (subtractive)** lands last, once a handoff rule covers the one live
chain (`audit-develop.json`). Every "today" claim below was verified against the
live code on 2026-07-22 — file:line references are load-bearing.

---

## The problem

Cross-subsystem handoff already exists in the codebase, but three ways, all
hard-coded and inconsistent:

- **Sentinel** auto-dispatches a fix task, but only for `kind === "cve" &&
severity === "critical"` (`sentinel.service.ts:203-231`); a leaked secret is
  deliberately operator-manual.
- **Maestro** (post-merge red CI) auto-dispatches a fix task
  (`post-merge-watch.service.ts:166-197`).
- **Loom** deliberately opts out — "No task dispatch in v1 — Loom's findings are
  proposals to Forge; turning one into work is an operator decision"
  (`loom.service.ts:82-84`).

All three call `createTask(input, now, projectId)` with **no explicit target**
(`task-scheduler.service.ts:298-303`, 4th param `explicitTarget?: TaskTarget`) —
they trust the classifier to route fix-shaped text. None targets Forge by name,
even though `TaskTarget` already has a `{ kind: "subsystem", id }` case that
resolves 0/1/N owned pipelines itself (`resolveSubsystemTargetOrNull`,
`task-scheduler.service.ts:399-423`). The routing machinery is built and unused.

The legacy **chains** feature (`libs/contracts/src/chains/*`,
`apps/api/src/chains/*`, `apps/web/features/chains/*`, `/chains` route) is the
one-off, operator-authored version of the same idea: `ChainRunnerService.advance`
waits for step N's pipeline to land `done`, reads its delivered `ArtifactRecord`,
and starts step N+1 with that content
(`chain-runner.service.ts:194-256`). One real instance exists —
`.zibby/data/chains/audit-develop.json` = Loom's `code-audit` → Forge's
`delivery`, i.e. exactly the Loom→Forge handoff, but as a manually-run sequence.

**Goal:** one declarative, auditable, operator-editable rule model that unifies
all of this and makes standing "when X produces Y, hand to Z" behavior data, not
code. Retire chains.

---

## Part A — Handoff (additive)

### A.1 Data model (contract-first)

Two new schemas in `libs/contracts/src/handoff/handoff.schema.ts`.

**`HandoffSignal`** — the normalized thing a producer emits. Heterogeneous
producers (Sentinel/Loom/Maestro findings, pipeline artifacts) map into it:

```ts
export const HandoffSignalSchema = z.object({
  from: SubsystemIdSchema, // producing subsystem
  kind: z.string().min(1), // "cve" | "secret" | "post-merge-red" |
  // "god-node" | "community" | "cycle" |
  // "research-artifact" | "quality-artifact" | …
  severity: HandoffSeveritySchema.optional(), // only severity-bearing signals
  projectId: z.string().optional(),
  title: z.string().min(1),
  body: z.string().min(1), // becomes the dispatched task's text
  fingerprint: z.string().min(1), // producer's dedupe key — handoff is idempotent per fingerprint
});
```

`HandoffSeveritySchema = z.enum(["low","moderate","high","critical"])` — a small
ordered ladder. Signals without a native severity (Loom, post-merge, artifacts)
omit it; a rule's `minSeverity` is then ignored for them.

**`HandoffRule`** — the standing rule (data, like automations / gate rules):

```ts
export const HandoffRuleSchema = z.object({
  id: z.string().min(1),
  from: SubsystemIdSchema, // match producer
  signalKind: z.string().min(1), // exact match, or "*" wildcard
  minSeverity: HandoffSeveritySchema.optional(), // only applied to severity-bearing signals
  to: HandoffTargetSchema, // { kind: "subsystem", id } | { kind: "pipeline", id }
  tier: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  enabled: z.boolean(),
  system: z.boolean().optional(), // seeded system rule vs operator-created
});
```

`HandoffTargetSchema` is the `subsystem`/`pipeline` subset of `TaskTarget` (reuse
those two members — no new target concept). A rule targeting `{subsystem: "forge"}`
lets Forge's own resolver pick the pipeline (recursive classification the design
doc already specced); a rule may also target a specific pipeline directly.

### A.2 Evaluation engine

New `HandoffModule` with:

- **`HandoffRuleStore`** — file-backed, seeded like `AutomationsStorageService`
  (`.zibby/data/handoff/rules.json`; seeds the system rules below; missing file =
  seed defaults; atomic writes). Read/list for v1; CRUD deferred to Part-2 UI spec.
- **`HandoffProposalStore`** — `.zibby/data/handoff/proposals/<id>.json`, the
  parked payload for a Tier-3 proposal: `{ id, ruleId, signal, target, createdAt }`.
  Mirrors the agent-factory candidate / herald-graduation store pattern.
- **`HandoffService.evaluate(signal: HandoffSignal): Promise<HandoffOutcome>`** —
  the synchronous hook. For each enabled rule matching `from` + `signalKind`
  (wildcard aware) + `minSeverity` (severity ladder, skipped for severity-less
  signals):
  - **Idempotency**: skip if this `(rule.id, signal.fingerprint)` already fired —
    a small fired-set snapshot in the store (same fingerprint discipline the
    producers already keep for their vault notes).
  - **Tier 1** → `taskScheduler.createTask(taskInput, now, signal.projectId, rule.to)`
    silently (debug log only).
  - **Tier 2** → same dispatch **plus** an `activity.record({ kind: "handoff", … })`
    entry so the briefing surfaces it ("Sentinel → Forge: kritická CVE, oprava
    zadána").
  - **Tier 3** → do **not** dispatch. Write a `HandoffProposal`, then
    `approvals.requestApproval({ runId: proposalId, kind: "handoff-proposal",
skill: from, action: "handoff", detail, risk: "medium", ownerSubsystem: from })`.
- **`HandoffService` implements `ResumableRunner`** and registers for
  `"handoff-proposal"` at startup (`approvals.register`). `resume(proposalId)`
  reads the parked payload and dispatches `createTask(input, now, projectId, target)`;
  `cancel(proposalId)` drops the payload and records a rejection trace. Exactly the
  `agent-proposal` / `herald-graduation` shape (`approvals.service.ts:15-20,62`).

New approval kind `"handoff-proposal"` added to `ApprovalRunKindSchema`
(`approval.schema.ts:12`) with a doc comment following the existing convention.

### A.3 Seed rules (migrate today's hard-coded behavior + the operator's new asks)

| id                       | from     | signalKind          | minSeverity | to                   | tier | replaces / new                                                               |
| ------------------------ | -------- | ------------------- | ----------- | -------------------- | ---- | ---------------------------------------------------------------------------- |
| `sentinel-cve-critical`  | sentinel | `cve`               | critical    | `{subsystem: forge}` | 2    | migrates `sentinel.service.ts:204` hard-coded dispatch                       |
| `maestro-post-merge-red` | maestro  | `post-merge-red`    | —           | `{subsystem: forge}` | 2    | migrates `post-merge-watch.service.ts:166` dispatch                          |
| `loom-architecture`      | loom     | `*`                 | —           | `{subsystem: forge}` | 3    | **new** — the operator's Loom→Forge ask; propose, don't act                  |
| `scout-research`         | scout    | `research-artifact` | —           | `{subsystem: forge}` | 3    | **new** — Scout research → Forge build; replaces `audit-develop.json` intent |

Tiers chosen to preserve today's autonomy posture: Sentinel/Maestro already
auto-dispatch (Tier 2), Loom explicitly wanted operator-in-the-loop (Tier 3).
All are `system: true` seeds; the operator retunes them once the Part-2 UI ships.

### A.4 Wire the producers (thin — one call each at the existing write point)

- **Sentinel** (`sentinel.service.ts:203-231`): replace the hard-coded CVE-dispatch
  loop with `for (const finding of newFindings) await handoff.evaluate(toSignal(finding))`.
  `toSignal` maps `SentinelFinding` → `HandoffSignal` (`from: "sentinel"`, `kind`,
  `severity`, `projectId`, `fingerprint`, title/body from the same strings it builds
  today). Behavior identical for critical CVEs (now via the seed rule); a secret is
  a signal with no matching rule → no dispatch, exactly as today.
- **Maestro** (`post-merge-watch.service.ts:166-197`): `dispatchFix` becomes
  `handoff.evaluate({ from: "maestro", kind: "post-merge-red", projectId, … })`.
  The watch's `state`/`taskId` bookkeeping stays; the dispatched task id is read
  back from the outcome so `store.patch(watch.id, { state:"red", taskId })` still works.
- **Loom** (`loom.service.ts:143`, after findings written): add
  `for (const f of newFindings) await handoff.evaluate(toSignal(f))`. New behavior,
  Tier 3 → a `handoff-proposal` per architecture finding. Fail-open like the rest.
- **Scout / pipeline artifacts** (`pipeline-runner.service.ts`, where a terminal
  `produces` phase writes the `ArtifactRecord`): after the artifact is recorded,
  if the owning pipeline's `ownerSubsystem === "scout"`, emit a `research-artifact`
  signal. This is the generic artifact→handoff seam that replaces the chain's
  "step N artifact feeds step N+1".

Every producer wiring is fail-open: a handoff error is logged and never thrown
out of a scan/audit/pipeline tick.

### A.5 Minimal web touch

Tier-3 handoff proposals render in the **existing** approvals queue (generic
surface keyed by `kind`). Only additions: an i18n label + action string for
`handoff-proposal` (cs + en, parity test). No new page — the drawer/rule-editor
UI is the separate Part-2 spec the operator explicitly deferred.

---

## Part B — Chains retirement (subtractive, sequenced last)

Chains are **not** an isolated feature — `ChainRun` is woven into the unified
run feed, SSE events, entity-MCP, and subsystem status. Verified dependency
inventory (all must be unwound, not just the `/chains` folder deleted):

**Backend**

- `libs/contracts/src/app.contract.ts:10,70-71` — remove `chains`/`chainRuns` routers.
- `libs/contracts/src/chains/*` — delete schema + contract.
- `apps/api/src/chains/*` — delete module, storage, runner, controller.
- `apps/api/src/app.module.ts` — drop `ChainsModule`.
- `apps/api/src/tasks/{task-scheduler,task-runs}.service.ts`, `tasks.module.ts` —
  remove chain-run production from the unified `TaskRuns` feed and the
  `run.kind === "chain"` branches.
- `apps/api/src/events/{events.module,events.controller}.ts` — drop chain runs
  from SSE run-events.
- `apps/api/src/memory/{entity-mcp.controller,memory.module}.ts` — remove chain
  entity-MCP tools.
- `apps/api/src/subsystems/{subsystems.service,owner-backfill.service,subsystems.module}.ts`
  — remove chains from status aggregation (`subsystems.service.ts:149-231`, the
  `run.kind === "chain"` owner map) and from the unowned-entity backfill. The
  `"chain"` member of `OwnableEntityKindSchema` (`subsystem.schema.ts`) is removed.

**Web**

- `apps/web/app/(dashboard)/chains/*` — delete routes.
- `apps/web/features/chains/*` — delete feature (queries, mutations, Screen, dialog).
- `apps/web/features/{tasks/task.ts, chat/components/ChatToolDock.tsx,
subsystems/useOwnerSubsystem.ts, subsystems/components/SubsystemDrawer/*Tab.tsx,
runs/runEvents.tsx}`, `apps/web/state/config.ts` — remove chain references
  (nav item, run-kind handling, owner-kind handling).

**Data**

- `.zibby/data/chains/audit-develop.json` — remove once `scout-research` /
  `loom-*` handoff rules cover its intent. `.zibby/data/chains/` directory retired.

`ArtifactRecord` + `ArtifactsStorageService` **stay** — a subsystem-agnostic
substrate that handoff (A.4) now consumes instead of chains.

---

## Non-negotiables carried forward

- Handoff never merges/pushes/deploys. A dispatched fix task still hits the
  existing PR gate; Tier-3 handoff adds a gate _before_ dispatch, never removes one.
- Inbound channel content is never a handoff signal that can raise privileges —
  signals are emitted only by trusted internal producers (Sentinel/Loom/Maestro/
  pipeline sinks), never by parsing external text.
- Files remain the source of truth: rules, proposals, and the fired-set are all
  file-backed data.

---

## Out of scope (explicitly deferred)

- **Part-2 UI spec** — per-subsystem-type detail dialogs + a handoff-rule editor
  in the subsystem drawer's Nastavení & Gates tab (the operator's note 1).
- Handoff-rule CRUD endpoints (v1 is seeded + read-only list).
- Severity ladders for non-Sentinel signals.
- Multi-hop handoff (A→B→C); a dispatched task can itself produce a signal, so
  chaining emerges without a dedicated multi-step entity.
