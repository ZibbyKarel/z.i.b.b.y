import { describe, expect, it } from "vitest";
import {
  DEPARTMENTS,
  DEPARTMENT_TIER_DEFAULT,
  GateRuleInputSchema,
  GateRuleSchema,
  ResolveSchema,
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

  it('parses a stored rule with source: "department" (NS2 F3a — the third evaluation bucket)', () => {
    const parsed = GateRuleSchema.safeParse({
      id: "gr-dev-1",
      source: "department",
      locked: false,
      match: [{ type: "action", action: "deploy" }],
      decision: "deny",
    });
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.source).toBe("department");
  });
});

describe("DEPARTMENT_TIER_DEFAULT (NS2 F3a)", () => {
  it("covers all 10 departments", () => {
    expect(Object.keys(DEPARTMENT_TIER_DEFAULT).sort()).toEqual(
      DEPARTMENTS.map((s) => s.id).sort(),
    );
  });

  it("only incident carries a non-null default, and it is ask (Tier-3 escalation mandate)", () => {
    for (const [id, decision] of Object.entries(DEPARTMENT_TIER_DEFAULT)) {
      if (id === "inc") expect(decision).toBe("ask");
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
