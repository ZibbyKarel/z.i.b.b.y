# Handoff (cross-department work passing)

Design doc: `docs/superpowers/specs/2026-07-22-department-handoff-design.md`
(Part A). Implementation plan: `docs/plans/handoff-implementation-plan.md`.

A **handoff** turns "when department A produces finding/artifact X, pass work to
department B" into declarative data instead of code hard-wired into each producer.
It unifies the three inconsistent hard-coded dispatches that existed before
(Security critical-CVE → fix task, Release post-merge-red → fix task, Arch's
deliberate no-dispatch) and replaces the legacy one-off `chains` feature.

## Flow

1. A producer (Security/Arch/Release scan, or a pipeline's delivered artifact —
   wired in phase A3) emits a normalized `HandoffSignal`
   (`{ from, kind, severity?, projectId?, title, body, fingerprint }`).
2. `HandoffService.evaluate(signal)` matches it against the standing
   `HandoffRule` set: `rule.from === signal.from`, `signalKind` exact or `"*"`,
   and a severity gate (only when both the signal carries a severity and the rule
   sets `minSeverity`). First enabled match wins; no match → `{ action: "none" }`.
3. The matched rule's **tier** decides the action:
   - **Tier 1** — dispatch a task to `rule.to` silently (`createTask`, gated by
     the normal approval floor downstream; logged at debug only).
   - **Tier 2** — same dispatch, plus a `handoff` activity entry so the briefing
     surfaces it (act-then-report).
   - **Tier 3** — do NOT dispatch. Park a `HandoffProposal` behind a
     `handoff-proposal` approval; the operator approves (→ dispatch) or rejects
     (→ drop). Autonomy widens only on an explicit decision.
4. Evaluation is **idempotent** per `(rule.id, signal.fingerprint)` and
   **fail-open** — a thrown error resolves to `{ action: "none" }`, never
   propagating out of a producer's scan tick.

## Pieces

| Piece           | File                                                | Role                                                                                                                                                                                                                                                                                                |
| --------------- | --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Schema          | `libs/contracts/src/handoff/handoff.schema.ts`      | `HandoffSignal`, `HandoffRule`, `HandoffTarget` (kind+id subset of `TaskTarget`'s department/pipeline members), `HandoffProposal`, `HandoffOutcome`, `HandoffSeverity` + `HANDOFF_SEVERITY_ORDER`                                                                                                   |
| Contract        | `libs/contracts/src/handoff/handoff.contract.ts`    | `handoffContract` — `getHandoffRules` (`GET`), `createHandoffRule` (`POST`, 201), `updateHandoffRule` (`PUT /:id`, 200/404), `deleteHandoffRule` (`DELETE /:id`, 200/404/**403**) over `/api/handoff-rules`; `HandoffRuleInputSchema` = `HandoffRuleSchema` minus `id` (the server mints it)        |
| Rule store      | `apps/api/src/handoff/handoff-rule.store.ts`        | `HandoffRuleStore` + `SYSTEM_HANDOFF_RULES` seed table; single JSON list (`.zibby/data/handoff/rules.json`), reseeds from code on a missing/corrupt file — **code is the source of truth** (the file is gitignored/regenerable). `create`/`update`/`delete` carry the system-rule guard (see below) |
| Proposal store  | `apps/api/src/handoff/handoff-proposal.store.ts`    | `HandoffProposalStore` — one `<id>.json` per parked tier-3 payload                                                                                                                                                                                                                                  |
| Fired store     | `apps/api/src/handoff/handoff-fired.store.ts`       | `HandoffFiredStore` — per-rule fingerprint set for idempotency                                                                                                                                                                                                                                      |
| Service         | `apps/api/src/handoff/handoff.service.ts`           | `HandoffService.evaluate` + `ResumableRunner` for `handoff-proposal` (resume → dispatch, cancel → drop)                                                                                                                                                                                             |
| Signal registry | `apps/api/src/handoff/handoff-signal-kind.store.ts` | `HandoffSignalKindStore` + `SYSTEM_SIGNAL_KINDS` seed (the 7 built-in kinds the producers emit); single JSON list (`.zibby/data/handoff/signal-kinds.json`), same reseed-from-code + system-guard pattern as the rule store (see _Signal-kind registry_ below)                                      |
| Signal service  | `apps/api/src/handoff/signal-kind.service.ts`       | `SignalKindService` — wraps the registry store; `create` also spawns a Dev build task (via the same `TaskSchedulerService.createTask` the dispatch path uses) and links its id back onto the new kind                                                                                               |
| Controller      | `apps/api/src/handoff/handoff.controller.ts`        | implements `handoffContract` (rule CRUD **and** signal-kind CRUD)                                                                                                                                                                                                                                   |
| Module          | `apps/api/src/handoff/handoff.module.ts`            | imports `ApprovalsModule`, `TasksModule`, `PipelinesModule`; exports `HandoffService` (A3 producers) + `SignalKindService` (B4 auto-activation)                                                                                                                                                     |

## Seed rules (A.3)

| id                       | from     | signalKind          | minSeverity | to  | tier |
| ------------------------ | -------- | ------------------- | ----------- | --- | ---- |
| `security-cve-critical`  | security | `cve`               | critical    | dev | 2    |
| `release-post-merge-red` | release  | `post-merge-red`    | —           | dev | 2    |
| `arch-architecture`      | arch     | `*`                 | —           | dev | 3    |
| `research`               | research | `research-artifact` | —           | dev | 3    |

All are `system: true`. Tiers preserve today's autonomy posture: Security/Release
already auto-dispatched (Tier 2); Arch deliberately wanted operator-in-the-loop
(Tier 3). The operator retunes them from the department drawer's "Předávání" tab
(Part-2 rule-editor UI).

## Rule CRUD + the system-rule guard

The operator authors and retunes rules through `createHandoffRule` /
`updateHandoffRule` / `deleteHandoffRule`. The `system` flag is **server-governed**,
never client-set — it is the autonomy floor (Law 1), not an editable field:

- **create** always forces `system: false` — an operator-authored rule is never a
  system rule regardless of the request body.
- **update** preserves the stored `system` flag verbatim; the input can retune
  `enabled` / `tier` / `minSeverity` / `to` / `signalKind` but can neither promote a
  user rule to system nor clear a system rule's flag.
- **delete** of a `system: true` rule is a `403` — seeded rules can be retuned but
  never removed (they reseed from code anyway, so deletion is refused loudly rather
  than silently undone). A missing id is a `404`.

The engine (`HandoffService.evaluate`) reads the store's `list()` live, so a
freshly created enabled rule takes effect on the next signal.

## Signal-kind registry (B1)

A rule's `signalKind` is a free-form string — the engine only string-matches it
against emitted signals. The **signal-kind registry** makes the known kinds
first-class data so the operator can see what each department emits and register
new ones, without changing the free-string contract.

- `HandoffSignalKindSchema` = `{ id, from, label, description, severityBearing,
status: "builtin" | "pending" | "active", system?, buildTaskId? }`.
  `HandoffSignalKindInputSchema` omits `id`/`status`/`system`/`buildTaskId` (the
  server mints the id by slugifying the label and forces `status: "pending"`,
  `system: false`).
- CRUD lives on `handoffContract` at `/api/handoff-signal-kinds`
  (`listSignalKinds` GET, `createSignalKind` POST → `{ signalKind, buildTaskId }`,
  `updateSignalKind` PATCH, `deleteSignalKind` DELETE). Same system-guard as
  rules: a built-in (`system: true`) refuses update/delete with a `403`.
- **Guided create is ZIBBY-native**: `SignalKindService.create` registers the
  kind, then spawns a **Dev build task** (via the same
  `TaskSchedulerService.createTask` the dispatch path uses — no new module edge,
  no DI cycle) describing the emit to implement, and links the returned task id
  onto the kind as `buildTaskId`. The kind stays `pending` until the producer
  code lands.
- **Auto-activation (B4)**: `HandoffService.evaluate` calls
  `HandoffSignalKindStore.markSeen(signal.kind)` on every emission (before
  rule-matching — a signal being emitted means its kind is alive regardless of
  whether any rule routes it). A `pending` operator kind flips to `active` on
  its first real emission; a no-op for built-in/already-active/unknown kinds.
  Fail-open — `markSeen` never throws out of a producer's scan tick.
- `severityBearing` reflects whether the producer actually attaches a severity —
  verified per emit site, only `cve` carries one today.

## Autonomy floor

A handoff never merges, pushes, or deploys — a dispatched fix task still hits the
existing PR gate, and a Tier-3 handoff adds a gate _before_ dispatch, never
removes one. Signals are emitted only by trusted internal producers, never by
parsing external channel content (which can never raise privileges).

## Task provenance (ZB-04a / O-18)

Every task `dispatchTask` creates (Tier-1 silent dispatch, Tier-2 act-then-report, and a
Tier-3 proposal's `resume()`) is stamped `source: "handoff"`, UNLESS the signal carries a
chain context (`signal.chain` set) — then it is stamped `source: "chain"` instead. See
[tasks.md](./tasks.md) → _Parent/subtask read model_ for the full `source` taxonomy.

## Chains (ZB-05a / D-005)

A **chain** is a multi-department route the operator authors once and dispatches
by name — `rnd → dev → rel`, with each hop either `"auto"` (Tier 2, act-then-report)
or `"ask"` (Tier 3, a `handoff-proposal` approval). A chain is a **view**, not a
separate store: its metadata lives on a `chain: true` signal kind
(`HandoffSignalKindStore`), and its route is the enabled `HandoffRule` rows whose
`signalKind` is that kind's own id — `chain-view.ts`'s `deriveChain` walks them
from the kind's `entry` department, one hop per rule (`{from: X} -> {to: department
Y}`), stopping at the first missing hop, a non-department target, or a repeated
department (cycle guard). There is no separate `Chain` store to drift out of sync
with the rules that actually drive dispatch.

- **Contract** — `GET /api/handoff/chains`, `GET /api/handoff/chains/:id` (404 for
  an unknown/non-chain id), `PUT /api/handoff/chains/:id` (create-or-replace, 400
  on an invalid input), `DELETE /api/handoff/chains/:id` (404 unknown, 409 while a
  non-terminal parent task still walks it). `ChainInputSchema` = `{ label,
description, entry, steps: { department, gate: "auto" | "ask" }[1..11],
enabled }`; `ChainSchema` adds the derived `id` and each step's `ruleId`.
- **`chain-view.ts`** (`apps/api/src/handoff/chain-view.ts`) — pure helpers, no
  I/O: `deriveChain` (kind + rules → `Chain | null`), `validateChainInput` (1–11
  steps, linear/acyclic, department-only targets), `chainToRules` (input → the
  rule rows a `PUT` writes, deterministic ids `${chainId}:${index}`, gate `"auto"`
  → tier 2 / `"ask"` → tier 3 per O-05).
- **`ChainsService`** (`apps/api/src/handoff/chains.service.ts`) — the CRUD
  service behind the controller. `put`/`delete` both touch the signal-kind AND
  the rule set, serialized under one `withPathLock` keyed on the chain id: a
  `put` that fails writing the rules half rolls the kind back to what it was
  before (or deletes it, for a brand-new chain), so nothing durable half-applies.
- **Dispatch** (`TaskSchedulerService.dispatchChain`) — a task created with
  `target: { kind: "chain", id }` persists the **parent** immediately (`status:
"dispatched"`, no `runRef` of its own — its displayed state is entirely
  derived from its subtasks) and dispatches step 0 straight to the chain's
  `entry` department, no gate (the operator created the task directly, this
  isn't a rule-routed hop). A missing/disabled chain is never a silent no-op:
  the parent is persisted `status: "failed"` with a human-readable `error`,
  and an activity entry is recorded.
- **Advancing a hop** — a chain subtask's completion (an agent run's `done`
  outcome, or a pipeline's delivered artifact) calls
  `TaskSchedulerService.emitChainStep`, which re-evaluates the signal through
  the normal `HandoffService.evaluate` path with `signal.chain` set
  (`{chainId, parentTaskId, step, artifactRef?}`) — same tier-1/2/3 machinery
  as any other handoff, just carrying parent linkage forward. No further hop
  (`evaluate` finds no matching rule) stamps `chainEndedAt` on the parent,
  which is what flips a fully-done chain's derived state from `"thinking"` to
  `"done"` (see [tasks.md](./tasks.md) → _Parent/subtask read model_). An
  errored/interrupted subtask never emits — the chain halts there, surfaced as
  the parent's `"error"` state, never pushed through.
- **Idempotency** — `HandoffFiredStore` dedups per `(rule.id, fingerprint)`,
  fingerprint `${parentTaskId}:${step}` (the completing step's own index), so a
  duplicate completion signal for the same step never re-dispatches or
  re-proposes the next hop.
- **Law 1** — an `"ask"` hop is a `handoff-proposal` approval like any other
  Tier-3 handoff and never auto-advances; approving it dispatches the next step
  with the chain context intact.

D-019 (the earlier "a chain target rejects with 400" behavior) is superseded by
this section — see `docs/plans/zibbycorp/DECISIONS.md`.

## Chains UI (ZB-05b)

`apps/web/features/chains/` (queries/mutations over the contract above) +
`/work/chains` (library `DataTable`: name, a chip `ChainRouteStrip`, enabled,
in-flight — the last is always "—": `GET /api/tasks/parents` has no chain
filter and a `TaskParent` carries no `target`/chain field to derive it from
client-side, only a subtask does — no API was invented for this), `/work/chains/[id]`
(read view; an Edit action toggles the shared `ChainEditor` in place — step
cards, `GateToggle` per hop, label/description, `ConfirmDeleteButton`
surfacing a 409's message inline), and `/work/chains/new` (same editor,
prefilled with an empty two-step chain, id slugified from the label). The New
Task chain picker (`NewTaskScreen`) offers none / an explicit chain / the
target project's `defaultChainId` (O-23's v1 order — explicit pick, then the
project default, then none) and submits `target: { kind: "chain", id, name }`.
