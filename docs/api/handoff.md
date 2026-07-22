# Handoff (cross-subsystem work passing)

Design doc: `docs/superpowers/specs/2026-07-22-subsystem-handoff-design.md`
(Part A). Implementation plan: `docs/plans/handoff-implementation-plan.md`.

A **handoff** turns "when subsystem A produces finding/artifact X, pass work to
subsystem B" into declarative data instead of code hard-wired into each producer.
It unifies the three inconsistent hard-coded dispatches that existed before
(Sentinel critical-CVE → fix task, Maestro post-merge-red → fix task, Loom's
deliberate no-dispatch) and replaces the legacy one-off `chains` feature.

## Flow

1. A producer (Sentinel/Loom/Maestro scan, or a pipeline's delivered artifact —
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
| Schema          | `libs/contracts/src/handoff/handoff.schema.ts`      | `HandoffSignal`, `HandoffRule`, `HandoffTarget` (kind+id subset of `TaskTarget`'s subsystem/pipeline members), `HandoffProposal`, `HandoffOutcome`, `HandoffSeverity` + `HANDOFF_SEVERITY_ORDER`                                                                                                    |
| Contract        | `libs/contracts/src/handoff/handoff.contract.ts`    | `handoffContract` — `getHandoffRules` (`GET`), `createHandoffRule` (`POST`, 201), `updateHandoffRule` (`PUT /:id`, 200/404), `deleteHandoffRule` (`DELETE /:id`, 200/404/**403**) over `/api/handoff-rules`; `HandoffRuleInputSchema` = `HandoffRuleSchema` minus `id` (the server mints it)        |
| Rule store      | `apps/api/src/handoff/handoff-rule.store.ts`        | `HandoffRuleStore` + `SYSTEM_HANDOFF_RULES` seed table; single JSON list (`.zibby/data/handoff/rules.json`), reseeds from code on a missing/corrupt file — **code is the source of truth** (the file is gitignored/regenerable). `create`/`update`/`delete` carry the system-rule guard (see below) |
| Proposal store  | `apps/api/src/handoff/handoff-proposal.store.ts`    | `HandoffProposalStore` — one `<id>.json` per parked tier-3 payload                                                                                                                                                                                                                                  |
| Fired store     | `apps/api/src/handoff/handoff-fired.store.ts`       | `HandoffFiredStore` — per-rule fingerprint set for idempotency                                                                                                                                                                                                                                      |
| Service         | `apps/api/src/handoff/handoff.service.ts`           | `HandoffService.evaluate` + `ResumableRunner` for `handoff-proposal` (resume → dispatch, cancel → drop)                                                                                                                                                                                             |
| Signal registry | `apps/api/src/handoff/handoff-signal-kind.store.ts` | `HandoffSignalKindStore` + `SYSTEM_SIGNAL_KINDS` seed (the 7 built-in kinds the producers emit); single JSON list (`.zibby/data/handoff/signal-kinds.json`), same reseed-from-code + system-guard pattern as the rule store (see _Signal-kind registry_ below)                                      |
| Signal service  | `apps/api/src/handoff/signal-kind.service.ts`       | `SignalKindService` — wraps the registry store; `create` also spawns a Forge build task (via the same `TaskSchedulerService.createTask` the dispatch path uses) and links its id back onto the new kind                                                                                             |
| Controller      | `apps/api/src/handoff/handoff.controller.ts`        | implements `handoffContract` (rule CRUD **and** signal-kind CRUD)                                                                                                                                                                                                                                   |
| Module          | `apps/api/src/handoff/handoff.module.ts`            | imports `ApprovalsModule`, `TasksModule`, `PipelinesModule`; exports `HandoffService` (A3 producers) + `SignalKindService` (B4 auto-activation)                                                                                                                                                     |

## Seed rules (A.3)

| id                       | from     | signalKind          | minSeverity | to    | tier |
| ------------------------ | -------- | ------------------- | ----------- | ----- | ---- |
| `sentinel-cve-critical`  | sentinel | `cve`               | critical    | forge | 2    |
| `maestro-post-merge-red` | maestro  | `post-merge-red`    | —           | forge | 2    |
| `loom-architecture`      | loom     | `*`                 | —           | forge | 3    |
| `scout-research`         | scout    | `research-artifact` | —           | forge | 3    |

All are `system: true`. Tiers preserve today's autonomy posture: Sentinel/Maestro
already auto-dispatched (Tier 2); Loom deliberately wanted operator-in-the-loop
(Tier 3). The operator retunes them from the subsystem drawer's "Předávání" tab
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
first-class data so the operator can see what each subsystem emits and register
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
  kind, then spawns a **Forge build task** (via the same
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
