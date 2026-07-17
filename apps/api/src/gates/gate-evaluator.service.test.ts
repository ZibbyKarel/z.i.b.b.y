import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { GateRule, GateRuleInput, IntendedAction } from "@zibby/contracts";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GateRulesStorageService } from "../gate-rules/gate-rules.storage.service";
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
      // context: "dev" doesn't satisfy the AND-ed rule, so it doesn't fire — the
      // bare rule list (no floor) then falls through to the claim-3 default (ask).
      expect(evaluator.evaluate(rules, { action: "deploy", context: "dev" }).decision).toBe("ask");
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
      // Below the threshold, the rule doesn't fire — the bare rule list (no floor)
      // then falls through to the claim-3 default (ask), not allow.
      expect(evaluator.evaluate(rules, small).decision).toBe("ask");
    });

    it("defaults to ask when nothing matches (claim 3 — fail-open regression)", () => {
      const result = evaluator.evaluate([], { action: "anything" });
      expect(result.decision).toBe("ask");
      expect(result.resolve).toEqual({ type: "human" });
    });

    it("an own rule matching only on tool (no action condition) cannot weaken the locked floor at eval time (claim 1 — runtime bypass regression)", async () => {
      const floor = await evaluator.floor();
      const toolOnlyAllow = rule({
        id: "own-tool-only",
        match: [{ type: "tool", tool: "gh" }],
        decision: "allow",
      });
      const rules = [toolOnlyAllow, ...floor];
      // pr.merge is a locked `deny` on the floor; the own rule matches the same
      // IntendedAction (tool: "gh") on an independent axis but must never win.
      expect(evaluator.evaluate(rules, { action: "pr.merge", tool: "gh" }).decision).toBe("deny");
      // purchase is `ask` on the floor.
      expect(evaluator.evaluate(rules, { action: "purchase", tool: "gh" }).decision).toBe("ask");
      // An action the floor doesn't cover at all still lets the own rule win.
      expect(evaluator.evaluate(rules, { action: "tweet", tool: "gh" }).decision).toBe("allow");
    });

    it("a more specific own rule still wins over a less specific own rule (first-match-wins survives bucketing)", () => {
      const rules: GateRule[] = [
        rule({
          id: "specific",
          match: [{ type: "action", action: "git.push", branch: "feature/x" }],
          decision: "allow",
        }),
        rule({
          id: "general",
          match: [{ type: "action", action: "git.push" }],
          decision: "deny",
        }),
      ];
      expect(evaluator.evaluate(rules, { action: "git.push", branch: "feature/x" }).ruleId).toBe(
        "specific",
      );
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
      // mainOnly doesn't match branch: "dev" at all — the bare rule list (no
      // floor) then falls through to the claim-3 default (ask), not allow.
      expect(evaluator.evaluate([mainOnly], { action: "git.push", branch: "dev" }).decision).toBe(
        "ask",
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

    it("rejects an agent rule that matches only on tool with no action condition (claim 1 — write-time bypass regression)", async () => {
      const floor = await evaluator.floor();
      const violation = evaluator.validateHardenOnly(floor, [
        { match: [{ type: "tool", tool: "gh" }], decision: "allow" },
      ]);
      // A tool-only rule is never provably disjoint from an action-only floor rule
      // (they constrain independent axes of the same IntendedAction) — it must be
      // rejected at write time instead of silently accepted and only neutralized at
      // eval time.
      expect(violation).not.toBeNull();
    });

    it("rejects an agent rule that weakens the floor's deploy decision (claim 4)", async () => {
      const floor = await evaluator.floor();
      const violation = evaluator.validateHardenOnly(floor, [
        { match: [{ type: "action", action: "deploy" }], decision: "allow" },
      ]);
      expect(violation).not.toBeNull();
    });

    it("allows an agent rule that hardens deploy (ask → deny)", async () => {
      const floor = await evaluator.floor();
      const violation = evaluator.validateHardenOnly(floor, [
        { match: [{ type: "action", action: "deploy" }], decision: "deny" },
      ]);
      expect(violation).toBeNull();
    });
  });

  describe("evaluateForOrchestrator (Fáze 2b — strictest union)", () => {
    it("falls through to the locked agent.delegate floor (notify) when neither the orchestrator nor any catalog agent has a rule (claim 3 — agent.delegate keeps its Tier-1 logged-not-asked default via an explicit floor rule, not implicit fail-open)", async () => {
      const result = await evaluator.evaluateForOrchestrator({}, [{}, {}], {
        action: "agent.delegate",
        scope: "cleaner",
      });
      expect(result.decision).toBe("notify");
    });

    it("defaults to ask (not allow) when nothing — not even the floor — matches at all (claim 3 — true fail-open regression)", async () => {
      const result = await evaluator.evaluateForOrchestrator({}, [{}, {}], {
        action: "some-future-unlisted-action",
      });
      expect(result.decision).toBe("ask");
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
        (
          await evaluator.evaluateForOrchestrator(orchestrator, [askAgent], {
            action: "agent.delegate",
          })
        ).decision,
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

  describe("subsystem bucket (NS2 F3a — three-bucket evaluation)", () => {
    let catalogDir: string;
    let catalog: GateRulesStorageService;
    let scoped: GateEvaluatorService;

    beforeEach(async () => {
      catalogDir = await fs.mkdtemp(path.join(os.tmpdir(), "gate-catalog-"));
      catalog = new GateRulesStorageService(catalogDir);
      await catalog.onModuleInit();
      scoped = new GateEvaluatorService(
        new PolicyStorageService(dir),
        undefined,
        undefined,
        catalog,
      );
    });
    afterEach(async () => {
      await fs.rm(catalogDir, { recursive: true, force: true });
    });

    it("subsystem ask + floor notify → ask (subsystem hardens the floor)", async () => {
      await catalog.create({
        match: [{ type: "action", action: "channel-reply" }],
        decision: "ask",
        resolve: { type: "human" },
        ownerSubsystem: "herald",
      });
      const rules = await scoped.rulesForAgentInSubsystem({}, "herald");
      // floor-channel-reply is notify; the herald-tagged ask must win (strictest).
      expect(scoped.evaluate(rules, { action: "channel-reply" }).decision).toBe("ask");
    });

    it("subsystem notify + floor ask → ask (a subsystem rule can never weaken the floor)", async () => {
      await catalog.create({
        match: [{ type: "action", action: "purchase" }],
        decision: "notify",
        ownerSubsystem: "forge",
      });
      const rules = await scoped.rulesForAgentInSubsystem({}, "forge");
      // floor-purchase is ask; the weaker forge-tagged notify must NOT win.
      expect(scoped.evaluate(rules, { action: "purchase" }).decision).toBe("ask");
    });

    it("no subsystem id → identical to the two-bucket result (regression lock)", async () => {
      const input: AgentPolicyInput = {
        gates: [{ match: [{ type: "action", action: "tweet" }], decision: "notify" }],
      };
      const twoBucket = await scoped.rulesForAgent(input);
      const viaSubsystemPath = await scoped.rulesForAgentInSubsystem(input);
      expect(viaSubsystemPath).toEqual(twoBucket);
      for (const action of [
        { action: "tweet" },
        { action: "purchase" },
        { action: "pr.merge" },
        { action: "unknown-action" },
      ]) {
        expect(scoped.evaluate(viaSubsystemPath, action)).toEqual(
          scoped.evaluate(twoBucket, action),
        );
      }
    });

    it("beacon's tier-default catch-all hardens pr.open (floor notify) to ask", async () => {
      const rules = await scoped.rulesForAgentInSubsystem({}, "beacon");
      const result = scoped.evaluate(rules, { action: "pr.open" });
      expect(result.decision).toBe("ask");
      expect(result.ruleId).toBe("subsystem-default-beacon");
    });

    it('subsystemRules("forge") returns only forge-tagged rules (and no tier default — forge is null)', async () => {
      await catalog.create({
        match: [{ type: "action", action: "deploy" }],
        decision: "deny",
        ownerSubsystem: "forge",
      });
      await catalog.create({
        match: [{ type: "action", action: "deploy" }],
        decision: "deny",
        ownerSubsystem: "puls",
      });
      const rules = await scoped.subsystemRules("forge");
      expect(rules).toHaveLength(1);
      expect(rules[0]?.source).toBe("subsystem");
      expect(rules[0]?.locked).toBe(false);
      expect(rules[0]?.decision).toBe("deny");
    });

    it("a forge-tagged rule fires on a forge-owned run and NOT on a puls-owned run (scope proof)", async () => {
      await catalog.create({
        match: [{ type: "action", action: "tweet" }],
        decision: "deny",
        ownerSubsystem: "forge",
      });
      const own: AgentPolicyInput = {
        gates: [{ match: [{ type: "action", action: "tweet" }], decision: "notify" }],
      };
      const forgeRules = await scoped.rulesForAgentInSubsystem(own, "forge");
      expect(scoped.evaluate(forgeRules, { action: "tweet" }).decision).toBe("deny");
      const pulsRules = await scoped.rulesForAgentInSubsystem(own, "puls");
      // puls doesn't load the forge rule; the agent's own notify wins (floor has
      // no tweet entry, puls has no tier default).
      expect(scoped.evaluate(pulsRules, { action: "tweet" }).decision).toBe("notify");
    });

    it("no catalog service injected → empty subsystem bucket, tier default still applies", async () => {
      const bare = new GateEvaluatorService(new PolicyStorageService(dir));
      const forgeRules = await bare.subsystemRules("forge");
      expect(forgeRules).toEqual([]);
      const beaconRules = await bare.subsystemRules("beacon");
      expect(beaconRules).toHaveLength(1);
      expect(beaconRules[0]?.id).toBe("subsystem-default-beacon");
    });

    it("validateSubsystemRuleHardenOnly rejects a tagged rule weakening the floor, allows hardening", async () => {
      const floor = await scoped.floor();
      expect(
        scoped.validateSubsystemRuleHardenOnly(floor, {
          match: [{ type: "action", action: "purchase" }],
          decision: "allow",
          ownerSubsystem: "forge",
        }),
      ).not.toBeNull();
      expect(
        scoped.validateSubsystemRuleHardenOnly(floor, {
          match: [{ type: "action", action: "purchase" }],
          decision: "deny",
          ownerSubsystem: "forge",
        }),
      ).toBeNull();
    });
  });
});
