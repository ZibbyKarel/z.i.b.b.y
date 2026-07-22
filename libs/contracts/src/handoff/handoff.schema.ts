import { z } from "zod";
import { IsoDateTimeSchema } from "../common.schema";
import { SubsystemIdSchema } from "../subsystems/subsystem.schema";
import { PipelineTaskTargetSchema, SubsystemTaskTargetSchema } from "../tasks/task.schema";

/**
 * Cross-subsystem handoff (design doc
 * `docs/superpowers/specs/2026-07-22-subsystem-handoff-design.md`, Part A): one
 * declarative, auditable rule model replacing the three hard-coded producer→
 * consumer wires (Sentinel critical-CVE dispatch, Maestro post-merge-red dispatch,
 * Loom's deliberate no-dispatch) and the legacy `chains` feature's one-off,
 * operator-run sequence. A producer subsystem emits a normalized {@link HandoffSignal};
 * the engine matches it against standing {@link HandoffRule}s and either dispatches
 * silently (tier 1), dispatches and reports (tier 2), or parks a
 * {@link HandoffProposal} behind an approval gate (tier 3) — never a fourth path.
 */

/**
 * A small ordered severity ladder. Only severity-bearing producers (today: Sentinel's
 * CVE findings) set {@link HandoffSignalSchema.severity}; Loom/Maestro/artifact
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
 * The normalized thing a producer subsystem emits. Heterogeneous producers
 * (Sentinel/Loom/Maestro findings, a pipeline's delivered artifact) all map into
 * this one shape before the engine ever sees them:
 *
 *  - `from`        — the producing subsystem (`SubsystemIdSchema`).
 *  - `kind`         — a producer-defined signal kind (`"cve"`, `"secret"`,
 *                      `"post-merge-red"`, `"god-node"`, `"research-artifact"`, …);
 *                      matched against a rule's `signalKind` (exact, or the rule's
 *                      `"*"` wildcard).
 *  - `severity`     — only set by severity-bearing producers (Sentinel CVEs today).
 *  - `projectId`    — attribution only (Law 4), threaded into the dispatched task.
 *  - `title`/`body` — human-readable; `body` becomes the dispatched task's text.
 *  - `fingerprint`  — the producer's own dedupe key. Handoff is idempotent per
 *                      `(rule.id, fingerprint)` — the same finding never dispatches twice.
 */
export const HandoffSignalSchema = z.object({
  from: SubsystemIdSchema,
  kind: z.string().min(1),
  severity: HandoffSeveritySchema.optional(),
  projectId: z.string().optional(),
  title: z.string().min(1),
  body: z.string().min(1),
  fingerprint: z.string().min(1),
});
export type HandoffSignal = z.infer<typeof HandoffSignalSchema>;

/**
 * A handoff rule's dispatch destination — REUSES the `subsystem` and `pipeline`
 * members of `TaskTargetSchema` (`../tasks/task.schema.ts`) rather than inventing a
 * parallel target concept, restricted to their routing identity (`kind` + `id`).
 * The full `TaskTarget` members also carry display metadata (`name`, `glyph`,
 * `avatar`, `category`) that a stored rule has no use for — a rule only ever names
 * *which* subsystem/pipeline to route to (`{subsystem: "forge"}` in the seed
 * table), never how to render it; the dispatch path (`TaskSchedulerService`,
 * A2/A3) resolves the id against the live subsystem/pipeline registry to build the
 * fully-decorated `TaskTarget` it actually schedules with. Picking `kind`/`id`
 * off the same member schemas (not redeclaring them) keeps the two field types
 * identical by construction, so a resolved `HandoffTarget` id always round-trips
 * through the same `SubsystemIdSchema/AgentIdSchema` validation `TaskTarget` uses.
 */
export const HandoffTargetSchema = z.discriminatedUnion("kind", [
  SubsystemTaskTargetSchema.pick({ kind: true, id: true }),
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
 *    exactly OR via the `"*"` wildcard (any kind from that subsystem).
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
  from: SubsystemIdSchema,
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
 * A parked tier-3 handoff, gated behind a `"handoff-proposal"` approval
 * (`../approvals/approval.schema.ts`). The full payload the engine needs to
 * dispatch on approval: which rule fired, the signal that triggered it, and the
 * resolved target — mirrors the agent-factory candidate / herald-graduation
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
