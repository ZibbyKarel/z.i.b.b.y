import { Injectable, Optional } from "@nestjs/common"
import type {
  Decision,
  GateEvaluation,
  GateRule,
  GateRuleInput,
  IntendedAction,
  MatchCondition,
  PolicyViolation,
} from "@zibby/contracts"
import { ActivityLogService } from "../activity/activity-log.service"
import { LoggerService, type ScopedLogger } from "../shared/logging/logger.service"
import { PolicyStorageService } from "./policy.storage.service"

/** Strength ordering: a higher rank is a stricter decision. */
const DECISION_RANK: Record<Decision, number> = { allow: 0, notify: 1, ask: 2, deny: 3 }

/** What a runner/controller passes to assemble an agent's effective rule list. */
export interface AgentPolicyInput {
  gates?: GateRuleInput[]
  requires_approval?: boolean
}

/**
 * The gate policy engine. Pure with respect to entities — it reads only the locked
 * floor (via {@link PolicyStorageService}) and whatever rules a caller hands it, so
 * it has no dependency on the agents store (avoiding a module cycle: the runner and
 * the gates controller both depend on this, and the controller loads agents).
 *
 * Precedence: an agent's own rules are evaluated BEFORE the floor, so a *stricter*
 * agent rule wins; {@link validateHardenOnly} guarantees an agent rule can never be
 * *weaker* than a floor rule on the same action — the agent can harden the floor,
 * never unlock it.
 */
@Injectable()
export class GateEvaluatorService {
  private readonly log?: ScopedLogger

  constructor(
    private readonly policy: PolicyStorageService,
    // Optional so the unit test can `new GateEvaluatorService(policy)`.
    @Optional() logger?: LoggerService,
    // Optional for the same reason; the global ActivityLogModule supplies it live.
    @Optional() private readonly activity?: ActivityLogService,
  ) {
    this.log = logger?.child(GateEvaluatorService.name)
  }

  floor(): Promise<GateRule[]> {
    return this.policy.floor()
  }

  /** The effective, ordered rule list for an agent: own rules first, then the floor. */
  async rulesForAgent(input: AgentPolicyInput): Promise<GateRule[]> {
    const floor = await this.floor()
    const own = this.ownRules(input)
    return [...own, ...floor]
  }

  /** An agent's own rules as stored `GateRule`s (with legacy desugar). */
  ownRules(input: AgentPolicyInput): GateRule[] {
    const gates = input.gates ?? []
    const own: GateRule[] = gates.map((g, i) => ({
      ...g,
      id: `agent-${i}`,
      source: "agent",
      locked: false,
    }))
    // Legacy sugar: `requires_approval: true` with no explicit gates desugars to a
    // single catch-all `ask:human` rule (backwards compatible with Phase 3).
    if (gates.length === 0 && input.requires_approval) {
      own.push({
        id: "legacy-requires-approval",
        source: "agent",
        locked: false,
        match: [{ type: "context", context: "*" }],
        decision: "ask",
        resolve: { type: "human" },
      })
    }
    return own
  }

  /** Evaluate an action against an ordered rule list — first match wins. */
  evaluate(rules: GateRule[], action: IntendedAction): GateEvaluation {
    let evaluation: GateEvaluation = { decision: "allow" }
    for (const rule of rules) {
      if (rule.match.every((cond) => this.matches(cond, action))) {
        evaluation = { decision: rule.decision, ruleId: rule.id, resolve: rule.resolve }
        break
      }
    }
    this.log?.debug("gate evaluated", {
      action: action.action,
      tool: action.tool,
      decision: evaluation.decision,
      ruleId: evaluation.ruleId,
    })
    // Record only when a rule actually FIRED (a real decision) — a no-match
    // default-allow is silent, so the feed stays free of gate-check noise. The
    // run scope is inherited from the active ALS store (the runner re-enters it
    // before evaluating), so the entry links back to its run for free.
    if (evaluation.ruleId !== undefined) {
      void this.activity?.record({
        kind: "gate-decision",
        summary: `gate ${evaluation.decision} on ${action.action}`,
        refs: { action: action.action, decision: evaluation.decision, status: evaluation.ruleId },
      })
    }
    return evaluation
  }

  /**
   * Harden-only check: an agent rule may not be weaker than a floor rule on the
   * same action. Returns the first violation, or null if the rules only harden.
   */
  validateHardenOnly(floor: GateRule[], own: GateRuleInput[]): PolicyViolation | null {
    for (let i = 0; i < own.length; i++) {
      const rule = own[i]
      if (!rule) continue
      for (const floorRule of floor) {
        if (!this.sameAction(rule.match, floorRule.match)) continue
        if (DECISION_RANK[rule.decision] < DECISION_RANK[floorRule.decision]) {
          this.log?.warn("policy violation: agent rule weakens the floor", {
            ruleIndex: i,
            ruleDecision: rule.decision,
            floorDecision: floorRule.decision,
          })
          return {
            message: `rule ${i} weakens the locked system floor`,
            ruleIndex: i,
            reason: `floor requires "${floorRule.decision}" for this action; rule uses the weaker "${rule.decision}"`,
          }
        }
      }
    }
    return null
  }

  private matches(cond: MatchCondition, action: IntendedAction): boolean {
    switch (cond.type) {
      case "tool":
        return action.tool === cond.tool
      case "action":
        if (action.action !== cond.action) return false
        if (cond.branch === undefined || cond.branch === "*") return true
        return action.branch === cond.branch
      case "scope":
        if (cond.scope.endsWith("*")) return (action.scope ?? "").startsWith(cond.scope.slice(0, -1))
        return action.scope === cond.scope
      case "context":
        return cond.context === "*" || action.context === cond.context
      case "threshold": {
        const value = action.metrics?.[cond.metric]
        if (value === undefined) return false
        switch (cond.op) {
          case "gt":
            return value > cond.value
          case "gte":
            return value >= cond.value
          case "lt":
            return value < cond.value
          case "lte":
            return value <= cond.value
          case "eq":
            return value === cond.value
        }
      }
    }
  }

  /** Two match lists target the "same action" if they share an equal action condition. */
  private sameAction(a: MatchCondition[], b: MatchCondition[]): boolean {
    const actionsA = a.filter((c): c is Extract<MatchCondition, { type: "action" }> => c.type === "action")
    const actionsB = b.filter((c): c is Extract<MatchCondition, { type: "action" }> => c.type === "action")
    return actionsA.some((ca) =>
      actionsB.some(
        (cb) => ca.action === cb.action && (ca.branch ?? "*") === (cb.branch ?? "*"),
      ),
    )
  }
}
