import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { GateRule, GateRuleInput, IntendedAction } from "@zibby/contracts";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type AgentPolicyInput, GateEvaluatorService } from "./gate-evaluator.service";
import { PolicyStorageService } from "./policy.storage.service";

describe("GateEvaluatorService", () => {
  let dir: string;
  let evaluator: GateEvaluatorService;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "policy-"));
    const policy = new PolicyStorageService(dir);
    await policy.onModuleInit(); // seeds the default floor
    evaluator = new GateEvaluatorService(policy);
  });
  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  const rule = (r: Partial<GateRule> & Pick<GateRule, "match" | "decision">): GateRule => ({
    id: "r",
    source: "agent",
    locked: false,
    ...r,
  });

  describe("matching + precedence", () => {
    it("first matching rule wins", () => {
      const rules: GateRule[] = [
        rule({
          id: "a",
          match: [{ type: "action", action: "git.push", branch: "feature/x" }],
          decision: "allow",
        }),
        rule({
          id: "b",
          match: [{ type: "action", action: "git.push" }],
          decision: "ask",
          resolve: { type: "human" },
        }),
      ];
      expect(evaluator.evaluate(rules, { action: "git.push", branch: "feature/x" }).decision).toBe(
        "allow",
      );
      expect(evaluator.evaluate(rules, { action: "git.push", branch: "main" }).ruleId).toBe("b");
    });

    it("AND-s all conditions in a rule", () => {
      const rules = [
        rule({
          match: [
            { type: "action", action: "deploy" },
            { type: "context", context: "prod" },
          ],
          decision: "deny",
        }),
      ];
      expect(evaluator.evaluate(rules, { action: "deploy", context: "prod" }).decision).toBe(
        "deny",
      );
      expect(evaluator.evaluate(rules, { action: "deploy", context: "dev" }).decision).toBe(
        "allow",
      );
    });

    it("evaluates threshold operators against metrics", () => {
      const rules = [
        rule({
          match: [{ type: "threshold", metric: "purchase.amount", op: "gt", value: 500 }],
          decision: "ask",
          resolve: { type: "human" },
        }),
      ];
      const big: IntendedAction = { action: "purchase", metrics: { "purchase.amount": 540 } };
      const small: IntendedAction = { action: "purchase", metrics: { "purchase.amount": 120 } };
      expect(evaluator.evaluate(rules, big).decision).toBe("ask");
      expect(evaluator.evaluate(rules, small).decision).toBe("allow");
    });

    it("defaults to allow when nothing matches", () => {
      expect(evaluator.evaluate([], { action: "anything" }).decision).toBe("allow");
    });

    it("an action rule with no branch (or `*`) matches any branch; a per-branch rule is exact", () => {
      const anyBranch = rule({
        id: "any",
        match: [{ type: "action", action: "git.push" }],
        decision: "ask",
        resolve: { type: "human" },
      });
      const starBranch = rule({
        id: "star",
        match: [{ type: "action", action: "git.push", branch: "*" }],
        decision: "ask",
        resolve: { type: "human" },
      });
      const mainOnly = rule({
        id: "main",
        match: [{ type: "action", action: "git.push", branch: "main" }],
        decision: "deny",
      });

      // No-branch / `*` rules fire regardless of the action's branch.
      expect(
        evaluator.evaluate([anyBranch], { action: "git.push", branch: "feature/x" }).ruleId,
      ).toBe("any");
      expect(evaluator.evaluate([starBranch], { action: "git.push" }).ruleId).toBe("star");
      // A per-branch rule matches only its branch (operators can harden one branch).
      expect(evaluator.evaluate([mainOnly], { action: "git.push", branch: "main" }).decision).toBe(
        "deny",
      );
      expect(evaluator.evaluate([mainOnly], { action: "git.push", branch: "dev" }).decision).toBe(
        "allow",
      );
    });
  });

  describe("agent rules + legacy desugar", () => {
    it("desugars requires_approval to a catch-all ask:human when no gates", () => {
      const own = evaluator.ownRules({ requires_approval: true });
      expect(own).toHaveLength(1);
      expect(own[0]?.decision).toBe("ask");
      expect(evaluator.evaluate(own, { action: "run" }).decision).toBe("ask");
    });

    it("places agent rules before the floor so a stricter agent rule wins", async () => {
      const gates: GateRuleInput[] = [
        { match: [{ type: "action", action: "purchase" }], decision: "deny" },
      ];
      const rules = await evaluator.rulesForAgent({ gates });
      // Floor has purchase → ask; the agent's stricter deny is first → wins.
      expect(evaluator.evaluate(rules, { action: "purchase" }).decision).toBe("deny");
    });
  });

  describe("harden-only validation", () => {
    it("rejects an agent rule that weakens a floor action", async () => {
      const floor = await evaluator.floor();
      const violation = evaluator.validateHardenOnly(floor, [
        { match: [{ type: "action", action: "purchase" }], decision: "allow" },
      ]);
      expect(violation).not.toBeNull();
      expect(violation?.ruleIndex).toBe(0);
    });

    it("allows an agent rule that hardens (ask → deny) the same action", async () => {
      const floor = await evaluator.floor();
      const violation = evaluator.validateHardenOnly(floor, [
        { match: [{ type: "action", action: "purchase" }], decision: "deny" },
      ]);
      expect(violation).toBeNull();
    });

    it("allows agent rules on actions the floor doesn't cover", async () => {
      const floor = await evaluator.floor();
      const violation = evaluator.validateHardenOnly(floor, [
        { match: [{ type: "action", action: "tweet" }], decision: "allow" },
      ]);
      expect(violation).toBeNull();
    });
  });

  describe("evaluateForOrchestrator (Fáze 2b — strictest union)", () => {
    it("defaults to allow when neither the orchestrator nor any catalog agent has a rule", async () => {
      const result = await evaluator.evaluateForOrchestrator({}, [{}, {}], {
        action: "agent.delegate",
        scope: "cleaner",
      });
      expect(result.decision).toBe("allow");
    });

    it("picks up a catalog subagent's OWN rule even though the orchestrator has none (mitigates Zjištění 3a)", async () => {
      const cleaner: AgentPolicyInput = {
        gates: [{ match: [{ type: "action", action: "agent.delegate" }], decision: "deny" }],
      };
      const result = await evaluator.evaluateForOrchestrator({}, [cleaner], {
        action: "agent.delegate",
      });
      expect(result.decision).toBe("deny");
    });

    it("the strictest decision across orchestrator + catalog wins (deny > ask > allow)", async () => {
      const orchestrator: AgentPolicyInput = {
        gates: [{ match: [{ type: "action", action: "agent.delegate" }], decision: "allow" }],
      };
      const askAgent: AgentPolicyInput = { requires_approval: true };
      const denyAgent: AgentPolicyInput = {
        gates: [{ match: [{ type: "action", action: "agent.delegate" }], decision: "deny" }],
      };
      // allow (orchestrator) + ask (one catalog agent) → ask wins.
      expect(
        (await evaluator.evaluateForOrchestrator(orchestrator, [askAgent], { action: "agent.delegate" }))
          .decision,
      ).toBe("ask");
      // allow + ask + deny → deny wins (the strictest of all three).
      expect(
        (
          await evaluator.evaluateForOrchestrator(orchestrator, [askAgent, denyAgent], {
            action: "agent.delegate",
          })
        ).decision,
      ).toBe("deny");
    });

    it("still applies the locked floor per agent (a floor action can't be missed just because one agent has no rule)", async () => {
      const result = await evaluator.evaluateForOrchestrator({}, [{}], { action: "purchase" });
      // No agent has its own rule for `purchase`, but the floor (ask:human) applies
      // to every probed rule set, so the union still surfaces it.
      expect(result.decision).toBe("ask");
    });

    it("records only ONE activity entry for the whole union (no per-agent log spam)", async () => {
      const recorded: unknown[] = [];
      const activity = { record: (entry: unknown) => void recorded.push(entry) };
      const scoped = new GateEvaluatorService(
        new PolicyStorageService(dir),
        undefined,
        activity as never,
      );
      const denyAgent: AgentPolicyInput = {
        gates: [{ match: [{ type: "action", action: "agent.delegate" }], decision: "deny" }],
      };
      await scoped.evaluateForOrchestrator({}, [{}, {}, denyAgent], { action: "agent.delegate" });
      expect(recorded).toHaveLength(1);
    });
  });
});
