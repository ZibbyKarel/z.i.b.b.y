import { promises as fs } from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import type { GateRule, GateRuleInput, IntendedAction } from "@zibby/contracts"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { GateEvaluatorService } from "./gate-evaluator.service"
import { PolicyStorageService } from "./policy.storage.service"

describe("GateEvaluatorService", () => {
  let dir: string
  let evaluator: GateEvaluatorService

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "policy-"))
    const policy = new PolicyStorageService(dir)
    await policy.onModuleInit() // seeds the default floor
    evaluator = new GateEvaluatorService(policy)
  })
  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true })
  })

  const rule = (r: Partial<GateRule> & Pick<GateRule, "match" | "decision">): GateRule => ({
    id: "r",
    source: "agent",
    locked: false,
    ...r,
  })

  describe("matching + precedence", () => {
    it("first matching rule wins", () => {
      const rules: GateRule[] = [
        rule({ id: "a", match: [{ type: "action", action: "git.push", branch: "feature/x" }], decision: "allow" }),
        rule({ id: "b", match: [{ type: "action", action: "git.push" }], decision: "ask", resolve: { type: "human" } }),
      ]
      expect(evaluator.evaluate(rules, { action: "git.push", branch: "feature/x" }).decision).toBe("allow")
      expect(evaluator.evaluate(rules, { action: "git.push", branch: "main" }).ruleId).toBe("b")
    })

    it("AND-s all conditions in a rule", () => {
      const rules = [
        rule({
          match: [
            { type: "action", action: "deploy" },
            { type: "context", context: "prod" },
          ],
          decision: "deny",
        }),
      ]
      expect(evaluator.evaluate(rules, { action: "deploy", context: "prod" }).decision).toBe("deny")
      expect(evaluator.evaluate(rules, { action: "deploy", context: "dev" }).decision).toBe("allow")
    })

    it("evaluates threshold operators against metrics", () => {
      const rules = [
        rule({
          match: [{ type: "threshold", metric: "purchase.amount", op: "gt", value: 500 }],
          decision: "ask",
          resolve: { type: "human" },
        }),
      ]
      const big: IntendedAction = { action: "purchase", metrics: { "purchase.amount": 540 } }
      const small: IntendedAction = { action: "purchase", metrics: { "purchase.amount": 120 } }
      expect(evaluator.evaluate(rules, big).decision).toBe("ask")
      expect(evaluator.evaluate(rules, small).decision).toBe("allow")
    })

    it("defaults to allow when nothing matches", () => {
      expect(evaluator.evaluate([], { action: "anything" }).decision).toBe("allow")
    })

    it("an action rule with no branch (or `*`) matches any branch; a per-branch rule is exact", () => {
      const anyBranch = rule({ id: "any", match: [{ type: "action", action: "git.push" }], decision: "ask", resolve: { type: "human" } })
      const starBranch = rule({ id: "star", match: [{ type: "action", action: "git.push", branch: "*" }], decision: "ask", resolve: { type: "human" } })
      const mainOnly = rule({ id: "main", match: [{ type: "action", action: "git.push", branch: "main" }], decision: "deny" })

      // No-branch / `*` rules fire regardless of the action's branch.
      expect(evaluator.evaluate([anyBranch], { action: "git.push", branch: "feature/x" }).ruleId).toBe("any")
      expect(evaluator.evaluate([starBranch], { action: "git.push" }).ruleId).toBe("star")
      // A per-branch rule matches only its branch (operators can harden one branch).
      expect(evaluator.evaluate([mainOnly], { action: "git.push", branch: "main" }).decision).toBe("deny")
      expect(evaluator.evaluate([mainOnly], { action: "git.push", branch: "dev" }).decision).toBe("allow")
    })
  })

  describe("agent rules + legacy desugar", () => {
    it("desugars requires_approval to a catch-all ask:human when no gates", () => {
      const own = evaluator.ownRules({ requires_approval: true })
      expect(own).toHaveLength(1)
      expect(own[0]?.decision).toBe("ask")
      expect(evaluator.evaluate(own, { action: "run" }).decision).toBe("ask")
    })

    it("places agent rules before the floor so a stricter agent rule wins", async () => {
      const gates: GateRuleInput[] = [
        { match: [{ type: "action", action: "purchase" }], decision: "deny" },
      ]
      const rules = await evaluator.rulesForAgent({ gates })
      // Floor has purchase → ask; the agent's stricter deny is first → wins.
      expect(evaluator.evaluate(rules, { action: "purchase" }).decision).toBe("deny")
    })
  })

  describe("harden-only validation", () => {
    it("rejects an agent rule that weakens a floor action", async () => {
      const floor = await evaluator.floor()
      const violation = evaluator.validateHardenOnly(floor, [
        { match: [{ type: "action", action: "purchase" }], decision: "allow" },
      ])
      expect(violation).not.toBeNull()
      expect(violation?.ruleIndex).toBe(0)
    })

    it("allows an agent rule that hardens (ask → deny) the same action", async () => {
      const floor = await evaluator.floor()
      const violation = evaluator.validateHardenOnly(floor, [
        { match: [{ type: "action", action: "purchase" }], decision: "deny" },
      ])
      expect(violation).toBeNull()
    })

    it("allows agent rules on actions the floor doesn't cover", async () => {
      const floor = await evaluator.floor()
      const violation = evaluator.validateHardenOnly(floor, [
        { match: [{ type: "action", action: "tweet" }], decision: "allow" },
      ])
      expect(violation).toBeNull()
    })
  })
})
