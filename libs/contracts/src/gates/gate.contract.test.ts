import { describe, expect, it } from "vitest";
import {
  GateRuleInputSchema,
  GateRuleSchema,
  ResolveSchema,
  SUBSYSTEMS,
  SUBSYSTEM_TIER_DEFAULT,
  gatesContract,
} from "../index";

describe("gatesContract", () => {
  it("exposes policy, evaluate, and agent gate routes", () => {
    expect(gatesContract.getSystemPolicy.path).toBe("/api/gates/policy");
    expect(gatesContract.evaluate.path).toBe("/api/gates/evaluate");
    expect(gatesContract.getAgentGates.path).toBe("/api/agents/:id/gates");
    expect(gatesContract.replaceAgentGates.method).toBe("PUT");
    expect(gatesContract.replaceAgentGates.responses).toHaveProperty("422");
  });
});

describe("GateRule schema", () => {
  it("requires resolve on ask and forbids it otherwise", () => {
    expect(
      GateRuleInputSchema.safeParse({
        match: [{ type: "action", action: "merge" }],
        decision: "ask",
        resolve: { type: "human" },
      }).success,
    ).toBe(true);
    // ask without resolve → invalid
    expect(
      GateRuleInputSchema.safeParse({
        match: [{ type: "action", action: "merge" }],
        decision: "ask",
      }).success,
    ).toBe(false);
    // allow with resolve → invalid
    expect(
      GateRuleInputSchema.safeParse({
        match: [{ type: "action", action: "merge" }],
        decision: "allow",
        resolve: { type: "human" },
      }).success,
    ).toBe(false);
  });

  it("rejects an empty match list", () => {
    expect(GateRuleInputSchema.safeParse({ match: [], decision: "allow" }).success).toBe(false);
  });

  it('parses a stored rule with source: "subsystem" (NS2 F3a — the third evaluation bucket)', () => {
    const parsed = GateRuleSchema.safeParse({
      id: "gr-forge-1",
      source: "subsystem",
      locked: false,
      match: [{ type: "action", action: "deploy" }],
      decision: "deny",
    });
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.source).toBe("subsystem");
  });
});

describe("SUBSYSTEM_TIER_DEFAULT (NS2 F3a)", () => {
  it("covers all 10 subsystems", () => {
    expect(Object.keys(SUBSYSTEM_TIER_DEFAULT).sort()).toEqual(SUBSYSTEMS.map((s) => s.id).sort());
  });

  it("only beacon carries a non-null default, and it is ask (Tier-3 escalation mandate)", () => {
    for (const [id, decision] of Object.entries(SUBSYSTEM_TIER_DEFAULT)) {
      if (id === "beacon") expect(decision).toBe("ask");
      else expect(decision).toBeNull();
    }
  });
});

describe("Resolve schema (recursive)", () => {
  it("parses a nested all/any tree of human/check/agent leaves", () => {
    const tree = {
      type: "all",
      all: [
        { type: "check", check: "ci_green" },
        { type: "any", any: [{ type: "human" }, { type: "agent", agent: "reviewer" }] },
      ],
    };
    expect(ResolveSchema.safeParse(tree).success).toBe(true);
  });
});
