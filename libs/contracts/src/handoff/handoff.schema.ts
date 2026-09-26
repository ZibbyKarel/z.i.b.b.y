import { z } from "zod";
import { IsoDateTimeSchema } from "../common.schema";
import { DepartmentIdSchema } from "../departments/department.schema";
import { DepartmentTaskTargetSchema, PipelineTaskTargetSchema } from "../tasks/task.schema";

/**
 * Cross-department handoff (design doc
 * `docs/superpowers/specs/2026-07-22-department-handoff-design.md`, Part A): one
 * declarative, auditable rule model replacing the three hard-coded producer→
 * consumer wires (Security critical-CVE dispatch, Release post-merge-red dispatch,
 * Arch's deliberate no-dispatch) and the legacy `chains` feature's one-off,
 * operator-run sequence. A producer department emits a normalized {@link HandoffSignal};
 * the engine matches it against standing {@link HandoffRule}s and either dispatches
 * silently (tier 1), dispatches and reports (tier 2), or parks a
 * {@link HandoffProposal} behind an approval gate (tier 3) — never a fourth path.
 */

/**
 * A small ordered severity ladder. Only severity-bearing producers (today: Security's
 * CVE findings) set {@link HandoffSignalSchema.severity}; Arch/Release/artifact
 * signals omit it, and a rule's `minSeverity` is then ignored for them (a
 * severity-less signal never fails a severity gate).
 */
export const HandoffSeveritySchema = z.enum(["low", "moderate", "high", "critical"]);
export type HandoffSeverity = z.infer<typeof HandoffSeveritySchema>;

/**
 * The severity ladder's rank order (index = ladder position, low → critical).
 * `HandoffRuleSchema.minSeverity` comparisons use this array's index, not enum
 * declaration order, so the comparison stays correct even if the enum's member
 * order ever changes.
 */
export const HANDOFF_SEVERITY_ORDER: readonly HandoffSeverity[] = [
  "low",
  "moderate",
  "high",
  "critical",
] as const;

/**
 * The normalized thing a producer department emits. Heterogeneous producers
 * (Security/Arch/Release findings, a pipeline's delivered artifact) all map into
 * this one shape before the engine ever sees them:
 *
 *  - `from`        — the producing department (`DepartmentIdSchema`).
 *  - `kind`         — a producer-defined signal kind (`"cve"`, `"secret"`,
 *                      `"post-merge-red"`, `"god-node"`, `"research-artifact"`, …);
 *                      matched against a rule's `signalKind` (exact, or the rule's
 *                      `"*"` wildcard).
 *  - `severity`     — only set by severity-bearing producers (Security CVEs today).
 *  - `projectId`    — attribution only (Law 4), threaded into the dispatched task.
 *  - `title`/`body` — human-readable; `body` becomes the dispatched task's text.
 *  - `fingerprint`  — the producer's own dedupe key. Handoff is idempotent per
 *                      `(rule.id, fingerprint)` — the same finding never dispatches twice.
 *  - `chain`        — ZB-05a / D-005: set ONLY by a chain-step completion emitter
 *                      (`TaskSchedulerService`'s `emitChainStep`, one call site per
 *                      run kind). Carries the chain's own id (a signal kind with
 *                      `chain: true`), the parent task, the NEXT 0-based step, and
 *                      the completed step's delivered artifact (a pipeline target's
 *                      input for the next hop). Absent for every ordinary signal
 *                      (Security/Release/Arch/Research) — ONLY a chain hop uses this.
 */
export const HandoffSignalChainContextSchema = z.object({
  chainId: z.string().min(1),
  parentTaskId: z.string().min(1),
  step: z.number().int().nonnegative(),
  artifactRef: z.string().optional(),
});
export type HandoffSignalChainContext = z.infer<typeof HandoffSignalChainContextSchema>;

export const HandoffSignalSchema = z.object({
  from: DepartmentIdSchema,
  kind: z.string().min(1),
  severity: HandoffSeveritySchema.optional(),
  projectId: z.string().optional(),
  title: z.string().min(1),
  body: z.string().min(1),
  fingerprint: z.string().min(1),
  chain: HandoffSignalChainContextSchema.optional(),
});
export type HandoffSignal = z.infer<typeof HandoffSignalSchema>;

/**
 * A handoff rule's dispatch destination — REUSES the `department` and `pipeline`
 * members of `TaskTargetSchema` (`../tasks/task.schema.ts`) rather than inventing a
 * parallel target concept, restricted to their routing identity (`kind` + `id`).
 * The full `TaskTarget` members also carry display metadata (`name`, `glyph`,
 * `avatar`, `category`) that a stored rule has no use for — a rule only ever names
 * *which* department/pipeline to route to (`{department: "dev"}` in the seed
 * table), never how to render it; the dispatch path (`TaskSchedulerService`,
 * A2/A3) resolves the id against the live department/pipeline registry to build the
 * fully-decorated `TaskTarget` it actually schedules with. Picking `kind`/`id`
 * off the same member schemas (not redeclaring them) keeps the two field types
 * identical by construction, so a resolved `HandoffTarget` id always round-trips
 * through the same `DepartmentIdSchema/AgentIdSchema` validation `TaskTarget` uses.
 */
export const HandoffTargetSchema = z.discriminatedUnion("kind", [
  DepartmentTaskTargetSchema.pick({ kind: true, id: true }),
  PipelineTaskTargetSchema.pick({ kind: true, id: true }),
]);
export type HandoffTarget = z.infer<typeof HandoffTargetSchema>;

/**
 * A standing handoff rule — data, like an automation or a gate rule, not code.
 * Seeded system rules (`system: true`) migrate today's hard-coded producer
 * behavior (A.3 of the design doc); the operator can add/retune more once the
 * Part-2 rule-editor UI ships (v1 here is seeded + read-only list).
 *
 *  - `from`/`signalKind` — match a `HandoffSignal`'s `from` exactly and its `kind`
 *    exactly OR via the `"*"` wildcard (any kind from that department).
 *  - `minSeverity`       — only applied when the matched signal itself carries a
 *                           severity; ignored for severity-less signals.
 *  - `to`                 — the resolved destination once the rule fires.
 *  - `tier`               — 1 (silent dispatch), 2 (dispatch + activity report), or
 *                           3 (park a `HandoffProposal` behind an approval instead
 *                           of dispatching) — the autonomy tier this rule dispatches at.
 *  - `enabled`            — a disabled rule is skipped by `evaluate` entirely.
 *  - `system`             — true for a seeded rule (A.3); absent/false for an
 *                           operator-authored one.
 */
export const HandoffRuleSchema = z.object({
  id: z.string().min(1),
  from: DepartmentIdSchema,
  signalKind: z.string().min(1),
  minSeverity: HandoffSeveritySchema.optional(),
  to: HandoffTargetSchema,
  tier: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  enabled: z.boolean(),
  system: z.boolean().optional(),
});
export type HandoffRule = z.infer<typeof HandoffRuleSchema>;

/** A handoff rule as authored by the operator — the server mints the `id`. Mirrors
 *  `GlobalGateRuleInputSchema` vs `GlobalGateRuleSchema`. `system` stays in the shape
 *  but is server-governed (see the store): a create forces it false, an update can
 *  never flip it. */
export const HandoffRuleInputSchema = HandoffRuleSchema.omit({ id: true });
export type HandoffRuleInput = z.infer<typeof HandoffRuleInputSchema>;

/**
 * A signal-kind's lifecycle (design doc
 * `docs/superpowers/specs/2026-07-22-handoff-signal-registry-and-receiver-filter-design.md`,
 * Slot B): `"builtin"` — one of the 7 seeded kinds a producer service already
 * emits; `"pending"` — operator-registered, no producer emits it yet (a Dev
 * build task exists to implement the emit); `"active"` — a `pending` kind that
 * has been seen at least once by `HandoffService.evaluate` (B4, auto-activation
 * — not part of this slice).
 */
export const HandoffSignalKindStatusSchema = z.enum(["builtin", "pending", "active"]);
export type HandoffSignalKindStatus = z.infer<typeof HandoffSignalKindStatusSchema>;

/**
 * A registered handoff signal kind — the server-side source of truth for what a
 * `HandoffSignal.kind` string means, who produces it, and whether it carries a
 * severity (drives whether a rule editor's severity pill is meaningful for it).
 * Built-in kinds (`system: true`) are the 7 kinds the 4 existing producers
 * (Security/Release/Arch/Research) already emit — seeded, view-only, non-deletable.
 * Operator-registered kinds start `status: "pending"` and carry a `buildTaskId`
 * linking to the Dev build task that will implement the emit.
 */
export const HandoffSignalKindSchema = z.object({
  id: z.string().min(1),
  from: DepartmentIdSchema,
  label: z.string().min(1),
  description: z.string().min(1),
  severityBearing: z.boolean(),
  status: HandoffSignalKindStatusSchema,
  system: z.boolean().optional(),
  buildTaskId: z.string().optional(),
  /**
   * ZB-05a / D-005 — this kind IS a chain: its route is DERIVED by walking the
   * enabled rules `{signalKind: this.id, from: X}` starting at {@link entry}
   * (see `chain-view.ts`'s `deriveChain`). No separate `Chain` store — the rule
   * rows themselves are the route, so there is no second copy to drift.
   */
  chain: z.literal(true).optional(),
  /** The chain's first department (only set when {@link chain} is `true`). */
  entry: DepartmentIdSchema.optional(),
});
export type HandoffSignalKind = z.infer<typeof HandoffSignalKindSchema>;

/** A signal kind as authored by the operator — the server mints `id`, forces
 *  `status: "pending"`, `system: false`, and sets `buildTaskId` once the build
 *  task it spawns has an id. */
export const HandoffSignalKindInputSchema = HandoffSignalKindSchema.omit({
  id: true,
  status: true,
  system: true,
  buildTaskId: true,
});
export type HandoffSignalKindInput = z.infer<typeof HandoffSignalKindInputSchema>;

/**
 * A parked tier-3 handoff, gated behind a `"handoff-proposal"` approval
 * (`../approvals/approval.schema.ts`). The full payload the engine needs to
 * dispatch on approval: which rule fired, the signal that triggered it, and the
 * resolved target — mirrors the agent-factory candidate / comms-graduation
 * store's "durable payload, no live child" pattern.
 */
export const HandoffProposalSchema = z.object({
  id: z.string().min(1),
  ruleId: z.string().min(1),
  signal: HandoffSignalSchema,
  target: HandoffTargetSchema,
  createdAt: IsoDateTimeSchema,
});
export type HandoffProposal = z.infer<typeof HandoffProposalSchema>;

/**
 * The result of evaluating a signal against the rule set — exactly one of three
 * shapes, discriminated on `action`:
 *
 *  - `"dispatched"` — a matching tier-1/2 rule fired; `runRef` is the started
 *                      run/task ref, `target` the resolved destination.
 *  - `"proposed"`   — a matching tier-3 rule fired; nothing dispatched yet, an
 *                      `approvalId` gates it.
 *  - `"none"`       — no enabled rule matched (or the fingerprint already fired) —
 *                      the secret-finding case: a real signal, deliberately no
 *                      dispatch.
 */
export const HandoffOutcomeSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("dispatched"),
    runRef: z.string().min(1),
    target: HandoffTargetSchema,
  }),
  z.object({
    action: z.literal("proposed"),
    approvalId: z.string().min(1),
  }),
  z.object({
    action: z.literal("none"),
  }),
]);
export type HandoffOutcome = z.infer<typeof HandoffOutcomeSchema>;

/**
 * ZB-05a / D-005 — a chain's route, as WRITTEN by the operator (`PUT
 * /api/handoff/chains/:id`). Each step names the department that runs it and its
 * gate (`"auto"` = tier 2 — act, then report; `"ask"` = tier 3 — a
 * `handoff-proposal` approval, O-05). `entry` is the FIRST department — not one of
 * `steps` — so a chain of N hops has N `steps` entries, not N+1.
 */
export const ChainStepInputSchema = z.object({
  department: DepartmentIdSchema,
  gate: z.enum(["auto", "ask"]),
});
export type ChainStepInput = z.infer<typeof ChainStepInputSchema>;

export const ChainInputSchema = z.object({
  label: z.string().min(1),
  description: z.string().min(1),
  entry: DepartmentIdSchema,
  /** D-005: 1–11 steps, linear, acyclic, department targets only (`validateChainInput`). */
  steps: z.array(ChainStepInputSchema).min(1).max(11),
  enabled: z.boolean(),
});
export type ChainInput = z.infer<typeof ChainInputSchema>;

/** One resolved hop on a chain's route — the step, plus the rule that carries it. */
export const ChainStepSchema = ChainStepInputSchema.extend({
  ruleId: z.string().min(1),
});
export type ChainStep = z.infer<typeof ChainStepSchema>;

/**
 * A chain — the VIEW `deriveChain` builds by walking the enabled rules for a
 * `chain: true` signal kind, starting at `entry` (see `chain-view.ts`). Not a
 * separate store: `id` is the signal kind's own id, `steps` are read straight off
 * the rule set. `enabled` is true only when the route resolved to ≥1 step AND
 * every rule on it is enabled (a PUT always writes them uniformly — see
 * `chainToRules`).
 */
export const ChainSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  description: z.string().min(1),
  entry: DepartmentIdSchema,
  steps: z.array(ChainStepSchema),
  enabled: z.boolean(),
});
export type Chain = z.infer<typeof ChainSchema>;
