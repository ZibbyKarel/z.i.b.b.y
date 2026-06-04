import { describe, expect, it } from "vitest"
import { GateRuleInputSchema, ResolveSchema, gatesContract } from "../index"

describe("gatesContract", () => {
  it("exposes policy, evaluate, and agent gate routes", () => {
    expect(gatesContract.getSystemPolicy.path).toBe("/api/gates/policy")
    expect(gatesContract.evaluate.path).toBe("/api/gates/evaluate")
    expect(gatesContract.getAgentGates.path).toBe("/api/agents/:id/gates")
    expect(gatesContract.replaceAgentGates.method).toBe("PUT")
    expect(gatesContract.replaceAgentGates.responses).toHaveProperty("422")
  })
})

describe("GateRule schema", () => {
  it("requires resolve on ask and forbids it otherwise", () => {
    expect(
      GateRuleInputSchema.safeParse({
        match: [{ type: "action", action: "merge" }],
        decision: "ask",
        resolve: { type: "human" },
      }).success,
    ).toBe(true)
    // ask without resolve → invalid
    expect(
      GateRuleInputSchema.safeParse({ match: [{ type: "action", action: "merge" }], decision: "ask" })
        .success,
    ).toBe(false)
    // allow with resolve → invalid
    expect(
      GateRuleInputSchema.safeParse({
        match: [{ type: "action", action: "merge" }],
        decision: "allow",
        resolve: { type: "human" },
      }).success,
    ).toBe(false)
  })

  it("rejects an empty match list", () => {
    expect(GateRuleInputSchema.safeParse({ match: [], decision: "allow" }).success).toBe(false)
  })
})

describe("Resolve schema (recursive)", () => {
  it("parses a nested all/any tree of human/check/agent leaves", () => {
    const tree = {
      type: "all",
      all: [
        { type: "check", check: "ci_green" },
        { type: "any", any: [{ type: "human" }, { type: "agent", agent: "reviewer" }] },
      ],
    }
    expect(ResolveSchema.safeParse(tree).success).toBe(true)
  })
})
