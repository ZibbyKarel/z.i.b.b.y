import { Injectable, Optional } from "@nestjs/common";
import type {
  GateEvaluation,
  GateRule,
  GateRuleInput,
  IntendedAction,
  MatchCondition,
  PolicyViolation,
} from "@zibby/contracts";
import { ActivityLogService } from "../activity/activity-log.service";
import { LoggerService, type ScopedLogger } from "../shared/logging/logger.service";
import { DECISION_RANK } from "./decision-rank";
import { PolicyStorageService } from "./policy.storage.service";

/** What a runner/controller passes to assemble an agent's effective rule list. */
export interface AgentPolicyInput {
  gates?: GateRuleInput[];
  requires_approval?: boolean;
}

/**
 * The gate policy engine. Pure with respect to entities — it reads only the locked
 * floor (via {@link PolicyStorageService}) and whatever rules a caller hands it, so
 * it has no dependency on the agents store (avoiding a module cycle: the runner and
 * the gates controller both depend on this, and the controller loads agents).
 *
 * Precedence: an agent's own rules and the locked floor rules are evaluated
 * INDEPENDENTLY (bucketed by {@link GateRule.locked} in {@link matchOnce}, not by
 * array order), and the STRICTER of the two matching decisions wins — never the
 * floor's alone, never the agent's alone. This is what makes the floor
 * *structurally* un-bypassable: it holds even for an own rule that matches on an
 * axis (`tool`, `scope`, …) the floor rule doesn't share, and even if
 * {@link validateHardenOnly} never ran (e.g. `agent.gates` written outside
 * `replaceAgentGates`). {@link validateHardenOnly} additionally rejects an
 * obviously-weakening own rule at write time (a UX nicety on top of the runtime
 * guarantee, not the security boundary itself).
 */
@Injectable()
export class GateEvaluatorService {
  private readonly log?: ScopedLogger;

  constructor(
    private readonly policy: PolicyStorageService,
    // Optional so the unit test can `new GateEvaluatorService(policy)`.
    @Optional() logger?: LoggerService,
    // Optional for the same reason; the global ActivityLogModule supplies it live.
    @Optional() private readonly activity?: ActivityLogService,
  ) {
    this.log = logger?.child(GateEvaluatorService.name);
  }

  floor(): Promise<GateRule[]> {
    return this.policy.floor();
  }

  /** The effective rule list for an agent: own rules then the floor. {@link matchOnce}
   * no longer relies on this order for own-vs-floor precedence (it buckets by
   * `rule.locked`) — the concatenation order only matters for first-match-wins
   * WITHIN a bucket. */
  async rulesForAgent(input: AgentPolicyInput): Promise<GateRule[]> {
    const floor = await this.floor();
    const own = this.ownRules(input);
    return [...own, ...floor];
  }

  /** An agent's own rules as stored `GateRule`s (with legacy desugar). */
  ownRules(input: AgentPolicyInput): GateRule[] {
    const gates = input.gates ?? [];
    const own: GateRule[] = gates.map((g, i) => ({
      ...g,
      id: `agent-${i}`,
      source: "agent",
      locked: false,
    }));
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
      });
    }
    return own;
  }

  /** Evaluate an action against an ordered rule list — first match wins. */
  evaluate(rules: GateRule[], action: IntendedAction): GateEvaluation {
    const evaluation = this.matchOnce(rules, action);
    this.recordEvaluation(action, evaluation);
    return evaluation;
  }

  /**
   * Fáze 2b — orchestrator strictest-union. Delegation (the `Task` tool) runs
   * inside a single spawned `claude -p` process, so the backend only ever sees the
   * orchestrator's own identity — a subagent's own `gates`/`requires_approval`
   * would otherwise be silently dropped for a delegated action (Zjištění 3a). This
   * evaluates `action` once per agent in `[orchestrator, ...catalogAgents]` — each
   * agent's OWN rules plus the (shared) floor — and returns the STRICTEST decision
   * across the set (deny > ask > notify > allow). Only the winning evaluation is
   * logged/recorded (the per-agent probes stay silent), so a run with a large
   * catalog doesn't spam the activity feed with one entry per candidate.
   */
  async evaluateForOrchestrator(
    orchestrator: AgentPolicyInput,
    catalogAgents: readonly AgentPolicyInput[],
    action: IntendedAction,
  ): Promise<GateEvaluation> {
    const floor = await this.floor();
    let best: GateEvaluation = { decision: "allow" };
    for (const input of [orchestrator, ...catalogAgents]) {
      const rules = [...this.ownRules(input), ...floor];
      const evaluation = this.matchOnce(rules, action);
      if (DECISION_RANK[evaluation.decision] > DECISION_RANK[best.decision]) best = evaluation;
    }
    this.recordEvaluation(action, best);
    return best;
  }

  /**
   * Pure rule matching, no logging/activity side effects (so
   * {@link evaluateForOrchestrator} can probe several agents' rule sets and log
   * only the final, strictest result).
   *
   * Buckets matches by `rule.locked` — own (agent, unlocked) vs floor (system,
   * locked) — first-match-wins WITHIN each bucket (so a more specific rule still
   * beats a less specific one on the same side), then returns the STRICTER of the
   * two bucket winners across own/floor. This is the structural floor guarantee:
   * it holds independent of array order, independent of match-condition type, and
   * independent of whether {@link validateHardenOnly} ever ran on this rule set.
   *
   * When NEITHER bucket has a match at all (own AND floor both null), the action
   * is genuinely unknown to every rule set — fail closed to `ask`, not `allow`
   * (claim 3): an unrecognized action must surface for a human, not silently
   * proceed. `agent.delegate` (and any other action that should stay Tier-1
   * logged-not-asked) gets there via an explicit `notify` floor rule, not via this
   * fallback — see `DEFAULT_FLOOR` in `policy.storage.service.ts`.
   */
  private matchOnce(rules: GateRule[], action: IntendedAction): GateEvaluation {
    let own: GateEvaluation | null = null;
    let floor: GateEvaluation | null = null;
    for (const rule of rules) {
      if (!rule.match.every((cond) => this.matches(cond, action))) continue;
      const hit: GateEvaluation = { decision: rule.decision, ruleId: rule.id, resolve: rule.resolve };
      if (rule.locked) {
        if (!floor) floor = hit;
      } else {
        if (!own) own = hit;
      }
      if (own && floor) break;
    }
    if (!own) return floor ?? { decision: "ask", resolve: { type: "human" } };
    if (!floor) return own;
    return DECISION_RANK[floor.decision] >= DECISION_RANK[own.decision] ? floor : own;
  }

  /** Debug-log + activity-record one evaluation result (shared by {@link evaluate}
   * and {@link evaluateForOrchestrator}, which must only record once per intent). */
  private recordEvaluation(action: IntendedAction, evaluation: GateEvaluation): void {
    this.log?.debug("gate evaluated", {
      action: action.action,
      tool: action.tool,
      decision: evaluation.decision,
      ruleId: evaluation.ruleId,
    });
    // Record only when a rule actually FIRED (a real decision) — a no-match
    // default-allow is silent, so the feed stays free of gate-check noise. The
    // run scope is inherited from the active ALS store (the runner re-enters it
    // before evaluating), so the entry links back to its run for free.
    if (evaluation.ruleId !== undefined) {
      void this.activity?.record({
        kind: "gate-decision",
        summary: `gate ${evaluation.decision} on ${action.action}`,
        refs: { action: action.action, decision: evaluation.decision, status: evaluation.ruleId },
      });
    }
  }

  /**
   * Harden-only check: an agent rule may not be weaker than a floor rule on the
   * same action. Returns the first violation, or null if the rules only harden.
   */
  validateHardenOnly(floor: GateRule[], own: GateRuleInput[]): PolicyViolation | null {
    for (let i = 0; i < own.length; i++) {
      const rule = own[i];
      if (!rule) continue;
      for (const floorRule of floor) {
        if (this.provablyDisjoint(rule.match, floorRule.match)) continue;
        if (DECISION_RANK[rule.decision] < DECISION_RANK[floorRule.decision]) {
          this.log?.warn("policy violation: agent rule weakens the floor", {
            ruleIndex: i,
            ruleDecision: rule.decision,
            floorDecision: floorRule.decision,
          });
          return {
            message: `rule ${i} weakens the locked system floor`,
            ruleIndex: i,
            reason: `floor requires "${floorRule.decision}" for this action; rule uses the weaker "${rule.decision}"`,
          };
        }
      }
    }
    return null;
  }

  private matches(cond: MatchCondition, action: IntendedAction): boolean {
    switch (cond.type) {
      case "tool":
        return action.tool === cond.tool;
      case "action":
        if (action.action !== cond.action) return false;
        if (cond.branch === undefined || cond.branch === "*") return true;
        return action.branch === cond.branch;
      case "scope":
        if (cond.scope.endsWith("*"))
          return (action.scope ?? "").startsWith(cond.scope.slice(0, -1));
        return action.scope === cond.scope;
      case "context":
        return cond.context === "*" || action.context === cond.context;
      case "threshold": {
        const value = action.metrics?.[cond.metric];
        if (value === undefined) return false;
        switch (cond.op) {
          case "gt":
            return value > cond.value;
          case "gte":
            return value >= cond.value;
          case "lt":
            return value < cond.value;
          case "lte":
            return value <= cond.value;
          case "eq":
            return value === cond.value;
        }
      }
    }
  }

  /**
   * Two match-condition lists CONFLICT (may co-fire on the same `IntendedAction`)
   * unless they are PROVABLY disjoint on at least one axis both sides constrain.
   * `IntendedAction`'s fields (`action`/`tool`/`scope`/`context`/`branch`/`metrics`)
   * are independent of each other, so a rule that only constrains one axis (e.g.
   * `type: "tool"`) says nothing about another (e.g. `action`) — it is never
   * disjoint from a rule that only constrains that other axis, and the two CAN
   * co-fire on the same real action. Only when both sides constrain the SAME axis
   * with non-overlapping values (e.g. `action: "purchase"` vs `action: "tweet"`)
   * can we prove no `IntendedAction` satisfies both. Deliberately conservative:
   * when unprovable, we assume conflict (this only makes write-time validation
   * stricter, never weaker — the eval-time floor in {@link matchOnce} is the actual
   * security boundary regardless of this function's answer).
   *
   * Exception: a rule that carries NO identifying axis at all — only `threshold`
   * conditions — never counts toward a conflict. A threshold-only rule (e.g. "ask
   * above purchase.amount > 500") is a legitimate, pre-existing, cross-cutting
   * pattern (this codebase's own e2e coverage relies on it) that says nothing
   * about WHICH action it targets; it only actually fires when the real
   * `IntendedAction` happens to carry that metric, which most floor actions
   * don't. Treating it as "not disjoint" from every floor rule would 422 a rule
   * that was never a targeted bypass of a specific floor action — the original
   * `sameAction` never flagged it either. This does not weaken the runtime
   * guarantee: `matchOnce` still takes the stricter of own/floor if a threshold
   * rule and a floor rule both happen to match the same real action.
   */
  private provablyDisjoint(a: MatchCondition[], b: MatchCondition[]): boolean {
    if (!this.hasIdentifyingAxis(a) || !this.hasIdentifyingAxis(b)) return true;

    const actionsA = a.filter(
      (c): c is Extract<MatchCondition, { type: "action" }> => c.type === "action",
    );
    const actionsB = b.filter(
      (c): c is Extract<MatchCondition, { type: "action" }> => c.type === "action",
    );
    if (actionsA.length > 0 && actionsB.length > 0) {
      const overlap = actionsA.some((ca) =>
        actionsB.some(
          (cb) => ca.action === cb.action && this.branchesOverlap(ca.branch, cb.branch),
        ),
      );
      if (!overlap) return true;
    }

    const toolsA = a.filter((c): c is Extract<MatchCondition, { type: "tool" }> => c.type === "tool");
    const toolsB = b.filter((c): c is Extract<MatchCondition, { type: "tool" }> => c.type === "tool");
    if (toolsA.length > 0 && toolsB.length > 0) {
      const overlap = toolsA.some((ca) => toolsB.some((cb) => ca.tool === cb.tool));
      if (!overlap) return true;
    }

    const scopesA = a.filter(
      (c): c is Extract<MatchCondition, { type: "scope" }> => c.type === "scope",
    );
    const scopesB = b.filter(
      (c): c is Extract<MatchCondition, { type: "scope" }> => c.type === "scope",
    );
    if (scopesA.length > 0 && scopesB.length > 0) {
      const overlap = scopesA.some((ca) =>
        scopesB.some((cb) => this.scopesOverlap(ca.scope, cb.scope)),
      );
      if (!overlap) return true;
    }

    const contextsA = a.filter(
      (c): c is Extract<MatchCondition, { type: "context" }> => c.type === "context",
    );
    const contextsB = b.filter(
      (c): c is Extract<MatchCondition, { type: "context" }> => c.type === "context",
    );
    if (contextsA.length > 0 && contextsB.length > 0) {
      const overlap = contextsA.some((ca) =>
        contextsB.some((cb) => ca.context === "*" || cb.context === "*" || ca.context === cb.context),
      );
      if (!overlap) return true;
    }

    // `threshold` axes are never provably disjoint here (numeric ranges aren't
    // modeled) — conservative: treat as potentially overlapping.
    return false;
  }

  /** Does this match set have at least one axis (`action`/`tool`/`scope`/`context`)
   * that could identify WHICH action it targets? `threshold` doesn't count — see
   * {@link provablyDisjoint}'s doc comment. */
  private hasIdentifyingAxis(match: MatchCondition[]): boolean {
    return match.some((c) => c.type !== "threshold");
  }

  private branchesOverlap(a: string | undefined, b: string | undefined): boolean {
    const ab = a ?? "*";
    const bb = b ?? "*";
    return ab === "*" || bb === "*" || ab === bb;
  }

  /** `scope` conditions may be an exact string or a `prefix*` wildcard. */
  private scopesOverlap(a: string, b: string): boolean {
    const aPrefix = a.endsWith("*") ? a.slice(0, -1) : null;
    const bPrefix = b.endsWith("*") ? b.slice(0, -1) : null;
    if (aPrefix !== null && bPrefix !== null) {
      return aPrefix.startsWith(bPrefix) || bPrefix.startsWith(aPrefix);
    }
    if (aPrefix !== null) return b.startsWith(aPrefix);
    if (bPrefix !== null) return a.startsWith(bPrefix);
    return a === b;
  }
}
