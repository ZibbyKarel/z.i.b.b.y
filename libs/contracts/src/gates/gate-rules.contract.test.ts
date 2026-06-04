import { describe, expect, it } from "vitest"
import { GlobalGateRuleInputSchema, GlobalGateRuleSchema, gateRulesContract } from "../index"

describe("gateRulesContract", () => {
  it("exposes the catalog CRUD + reorder routes", () => {
    expect(gateRulesContract.listGateRules.path).toBe("/api/gate-rules")
    expect(gateRulesContract.createGateRule.method).toBe("POST")
    expect(gateRulesContract.reorderGateRules.path).toBe("/api/gate-rules/reorder")
    expect(gateRulesContract.updateGateRule.path).toBe("/api/gate-rules/:id")
    expect(gateRulesContract.deleteGateRule.method).toBe("DELETE")
    expect(gateRulesContract.updateGateRule.responses).toHaveProperty("404")
  })
})

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
    ).toBe(true)
    // ask without resolve → invalid (shared refinement)
    expect(
      GlobalGateRuleInputSchema.safeParse({
        match: [{ type: "action", action: "merge" }],
        decision: "ask",
      }).success,
    ).toBe(false)
  })

  it("requires a non-empty match list", () => {
    expect(
      GlobalGateRuleInputSchema.safeParse({ match: [], decision: "allow" }).success,
    ).toBe(false)
  })
})
