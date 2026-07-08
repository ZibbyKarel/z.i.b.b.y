import { describe, expect, it } from "vitest";
import { GlobalGateRuleInputSchema, GlobalGateRuleSchema, gateRulesContract } from "../index";

describe("gateRulesContract", () => {
  it("exposes the catalog CRUD + reorder routes", () => {
    expect(gateRulesContract.listGateRules.path).toBe("/api/gate-rules");
    expect(gateRulesContract.createGateRule.method).toBe("POST");
    expect(gateRulesContract.reorderGateRules.path).toBe("/api/gate-rules/reorder");
    expect(gateRulesContract.updateGateRule.path).toBe("/api/gate-rules/:id");
    expect(gateRulesContract.deleteGateRule.method).toBe("DELETE");
    expect(gateRulesContract.updateGateRule.responses).toHaveProperty("404");
  });
});

describe("GlobalGateRule schema", () => {
  it("carries catalog metadata and keeps the ask/resolve refinement", () => {
    expect(
      GlobalGateRuleSchema.safeParse({
        id: "gr-merge",
        name: "Merge PR",
        match: [{ type: "action", action: "merge" }],
        decision: "ask",
        resolve: { type: "human" },
      }).success,
    ).toBe(true);
    // ask without resolve → invalid (shared refinement)
    expect(
      GlobalGateRuleInputSchema.safeParse({
        match: [{ type: "action", action: "merge" }],
        decision: "ask",
      }).success,
    ).toBe(false);
  });

  it("requires a non-empty match list", () => {
    expect(GlobalGateRuleInputSchema.safeParse({ match: [], decision: "allow" }).success).toBe(
      false,
    );
  });
});

// Phase 87: subsystem attribution is optional and additive — existing untagged
// fixtures above (and every rule on disk today) must keep parsing unchanged.
describe("GlobalGateRule ownerSubsystem (Phase 87)", () => {
  const base = {
    id: "gr-merge",
    match: [{ type: "action" as const, action: "merge" }],
    decision: "allow" as const,
  };

  it("round-trips a tagged rule", () => {
    const parsed = GlobalGateRuleSchema.safeParse({ ...base, ownerSubsystem: "forge" });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.ownerSubsystem).toBe("forge");
  });

  it("leaves an untagged rule valid, with ownerSubsystem undefined", () => {
    const parsed = GlobalGateRuleSchema.safeParse(base);
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.ownerSubsystem).toBeUndefined();
  });

  it("rejects an unknown subsystem id", () => {
    expect(
      GlobalGateRuleInputSchema.safeParse({ ...base, ownerSubsystem: "not-a-subsystem" }).success,
    ).toBe(false);
  });
});
