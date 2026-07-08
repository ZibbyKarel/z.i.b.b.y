import { z } from "zod";
import { SubsystemIdSchema } from "../subsystems/subsystem.schema";

/**
 * Risk is a property of (action, arguments/target, context), not of an entity —
 * `git push` to `feature/*` is harmless, `git push --force main` is not. A gate
 * rule is the unit of decision: a set of AND-ed match conditions → a decision
 * (→ a resolve tree, only for `ask`). The system floor (`POLICY.md`) is locked and
 * may only be *hardened* by an agent's own rules.
 */

/** One match condition. A rule's `match` array is AND-ed (all must hold). */
export const MatchConditionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("tool"), tool: z.string().min(1) }),
  z.object({
    type: z.literal("action"),
    action: z.string().min(1),
    /** Optional target qualifier, e.g. a branch for `git.push`. `*` / omitted = any. */
    branch: z.string().optional(),
  }),
  z.object({
    type: z.literal("threshold"),
    metric: z.string().min(1),
    op: z.enum(["gt", "gte", "lt", "lte", "eq"]),
    value: z.number(),
  }),
  z.object({ type: z.literal("scope"), scope: z.string().min(1) }),
  z.object({ type: z.literal("context"), context: z.string().min(1) }),
]);
export type MatchCondition = z.infer<typeof MatchConditionSchema>;

/** What a matched rule does. `ask` pauses for resolution; the rest are immediate. */
export const DecisionSchema = z.enum(["allow", "notify", "ask", "deny"]);
export type Decision = z.infer<typeof DecisionSchema>;

/**
 * How an `ask` is resolved. Leaves are a human, an automated check (e.g. CI), or a
 * reviewing agent; `all`/`any` combine them. Recursive — defined with `z.lazy`.
 */
export type Resolve =
  | { type: "human" }
  | { type: "check"; check: string }
  | { type: "agent"; agent: string }
  | { type: "all"; all: Resolve[] }
  | { type: "any"; any: Resolve[] };

export const ResolveSchema: z.ZodType<Resolve> = z.lazy(() =>
  z.union([
    z.object({ type: z.literal("human") }),
    z.object({ type: z.literal("check"), check: z.string().min(1) }),
    z.object({ type: z.literal("agent"), agent: z.string().min(1) }),
    z.object({ type: z.literal("all"), all: z.array(ResolveSchema).min(1) }),
    z.object({ type: z.literal("any"), any: z.array(ResolveSchema).min(1) }),
  ]),
);

/** Refinement shared by rule shapes: `resolve` exists iff the decision is `ask`. */
function refineResolve(
  rule: { decision: Decision; resolve?: Resolve },
  ctx: z.RefinementCtx,
): void {
  if (rule.decision === "ask" && !rule.resolve) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "an 'ask' rule needs a resolve",
      path: ["resolve"],
    });
  }
  if (rule.decision !== "ask" && rule.resolve) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "resolve is only valid on 'ask'",
      path: ["resolve"],
    });
  }
}

/** What a caller supplies — the server fills in `id`/`source`/`locked`. */
export const GateRuleInputSchema = z
  .object({
    match: z.array(MatchConditionSchema).min(1),
    decision: DecisionSchema,
    resolve: ResolveSchema.optional(),
  })
  .superRefine(refineResolve);
export type GateRuleInput = z.infer<typeof GateRuleInputSchema>;

/** A stored rule: the input plus provenance. `locked` system rules are the floor. */
export const GateRuleSchema = z
  .object({
    id: z.string().min(1),
    source: z.enum(["system", "agent"]),
    locked: z.boolean(),
    match: z.array(MatchConditionSchema).min(1),
    decision: DecisionSchema,
    resolve: ResolveSchema.optional(),
  })
  .superRefine(refineResolve);
export type GateRule = z.infer<typeof GateRuleSchema>;

/** The concrete action a runner is about to take, evaluated against the rules. */
export const IntendedActionSchema = z.object({
  action: z.string().min(1),
  tool: z.string().optional(),
  scope: z.string().optional(),
  branch: z.string().optional(),
  context: z.string().optional(),
  /** Numeric facts a `threshold` matcher reads, e.g. `{ "purchase.amount": 540 }`. */
  metrics: z.record(z.string(), z.number()).optional(),
});
export type IntendedAction = z.infer<typeof IntendedActionSchema>;

/** The result of evaluating an action: the decision and (for `ask`) the resolve. */
export const GateEvaluationSchema = z.object({
  decision: DecisionSchema,
  /** Id of the rule that matched, or undefined for the default `allow`. */
  ruleId: z.string().optional(),
  resolve: ResolveSchema.optional(),
});
export type GateEvaluation = z.infer<typeof GateEvaluationSchema>;

/** The inherited (locked) floor + an agent's own rules, for the editor. */
export const AgentGatesSchema = z.object({
  inherited: z.array(GateRuleSchema),
  own: z.array(GateRuleSchema),
});
export type AgentGates = z.infer<typeof AgentGatesSchema>;

/** Why a `replaceAgentGates` was rejected — an agent rule tried to weaken the floor. */
export const PolicyViolationSchema = z.object({
  message: z.string(),
  ruleIndex: z.number().int(),
  reason: z.string(),
});
export type PolicyViolation = z.infer<typeof PolicyViolationSchema>;

/**
 * The global gate-rule catalog (the "Pravidla schvalování" page) — the middle
 * layer between the locked system floor (`POLICY.md`) and an agent's/skill's own
 * rules. A catalog rule is the same decision core as a gate rule plus display
 * metadata (`name`/`desc`); agents and skills reference it by `id` (`gateRuleIds`)
 * to share one rule across many entities. The list is ordered (first match wins).
 */

/** Allowed shape of a catalog rule `id` — filename-safe, no path separators/traversal. */
export const GATE_RULE_ID_REGEX = /^[a-zA-Z0-9._-]+$/;
export const GateRuleIdSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(GATE_RULE_ID_REGEX, "id may only contain letters, numbers, '.', '_' and '-'");

/** The editable core of a catalog rule (no provenance id) — what a caller supplies. */
const GlobalGateRuleBaseSchema = z.object({
  /** Optional human label shown in the catalog (e.g. "Push do main"). */
  name: z.string().min(1).optional(),
  /** Optional one-line description under the matcher. */
  desc: z.string().optional(),
  match: z.array(MatchConditionSchema).min(1),
  decision: DecisionSchema,
  resolve: ResolveSchema.optional(),
  /**
   * Optional attribution to a subsystem of the federation (Phase 87, mirrors
   * `Pipeline.ownerSubsystem` / `Chain.ownerSubsystem` from Phase 81) — the Gates
   * tab's filter/auto-tag lens over this same global catalog. Attribution ONLY:
   * the gate evaluation engine (`gate.contract.ts` `evaluate`) never reads this
   * field, so tagging or untagging a rule can never change what it matches or
   * decides. Absent is legitimate — untagged rules stay global/unowned.
   */
  ownerSubsystem: SubsystemIdSchema.optional(),
});

/** Body accepted by `createGateRule` / `updateGateRule` — the server assigns the `id`. */
export const GlobalGateRuleInputSchema = GlobalGateRuleBaseSchema.superRefine(refineResolve);
export type GlobalGateRuleInput = z.infer<typeof GlobalGateRuleInputSchema>;

/** A stored catalog rule: the input plus its stable `id` (referenced by `gateRuleIds`). */
export const GlobalGateRuleSchema = GlobalGateRuleBaseSchema.extend({
  id: GateRuleIdSchema,
}).superRefine(refineResolve);
export type GlobalGateRule = z.infer<typeof GlobalGateRuleSchema>;
