import { describe, expect, it } from "vitest"
import {
  GoalRunSchema,
  GoalSchema,
  TaskTargetSchema,
  VerifierSpecSchema,
  goalRunsContract,
  goalsContract,
} from "../index"

const baseGoal = {
  id: "ship-feature",
  objective: "Ship feature Y green",
  maker: { kind: "pipeline" as const, id: "delivery" },
  verifier: { kind: "checks" as const },
  maxIterations: 5,
  instructions: "Keep iterating until the checks pass.",
}

describe("goalsContract", () => {
  it("exposes CRUD and keeps run routes in the /api/goals/* space", () => {
    expect(goalsContract.createGoal.path).toBe("/api/goals")
    expect(goalsContract.getGoal.path).toBe("/api/goals/:id")
    expect(goalRunsContract.startGoalRun.path).toBe("/api/goals/:id/run")
    expect(goalRunsContract.listGoalRuns.path).toBe("/api/goals/runs")
    expect(goalRunsContract.resumeGoalRun.path).toBe("/api/goals/runs/:goalRunId/resume")
  })

  it("gives resumeGoalRun a 409 for a non-parked run", () => {
    expect(goalRunsContract.resumeGoalRun.responses).toHaveProperty("409")
  })
})

describe("GoalSchema", () => {
  it("accepts a well-formed goal with a checks verifier", () => {
    expect(GoalSchema.safeParse(baseGoal).success).toBe(true)
  })

  it("accepts a claude verifier with model + thinking", () => {
    const goal = {
      ...baseGoal,
      verifier: { kind: "claude" as const, agent: "reviewer", model: "haiku", thinking: "low" },
    }
    expect(GoalSchema.safeParse(goal).success).toBe(true)
  })

  it("rejects maxIterations of zero", () => {
    expect(GoalSchema.safeParse({ ...baseGoal, maxIterations: 0 }).success).toBe(false)
  })

  it("rejects a maker kind that is not agent or pipeline", () => {
    expect(GoalSchema.safeParse({ ...baseGoal, maker: { kind: "goal", id: "x" } }).success).toBe(false)
  })
})

describe("VerifierSpecSchema", () => {
  it("discriminates checks vs claude", () => {
    expect(VerifierSpecSchema.safeParse({ kind: "checks", commands: ["pnpm test"] }).success).toBe(true)
    expect(VerifierSpecSchema.safeParse({ kind: "claude", agent: "judge" }).success).toBe(true)
  })

  it("rejects a claude verifier without an agent", () => {
    expect(VerifierSpecSchema.safeParse({ kind: "claude" }).success).toBe(false)
  })
})

describe("GoalRunSchema", () => {
  it("round-trips an aggregate with an iteration record", () => {
    const parsed = GoalRunSchema.safeParse({
      goalRunId: "ship-feature_1",
      goalId: "ship-feature",
      status: "running",
      currentIteration: 0,
      iterations: [
        {
          index: 0,
          makerKind: "pipeline",
          makerRunRef: "delivery_1",
          verifier: { kind: "checks", satisfied: false, output: "1 failing" },
          startedAt: new Date().toISOString(),
          status: "running",
        },
      ],
      startedAt: new Date().toISOString(),
      cwd: "/tmp/ship-feature_1",
    })
    expect(parsed.success).toBe(true)
  })

  it("accepts a parked goal with reason iterations", () => {
    const parsed = GoalRunSchema.safeParse({
      goalRunId: "g_1",
      goalId: "g",
      status: "parked",
      currentIteration: 2,
      iterations: [],
      startedAt: new Date().toISOString(),
      cwd: "/tmp/g_1",
      parkedReason: "iterations",
      parked: { iteration: 2, attempts: 3, verdictFile: "/tmp/g_1/iteration-2.verdict.txt" },
    })
    expect(parsed.success).toBe(true)
  })
})

describe("TaskTargetSchema with goal arm", () => {
  it("round-trips a goal task target", () => {
    const target = { kind: "goal", id: "ship-feature", name: "Ship feature Y", glyph: "target" }
    expect(TaskTargetSchema.safeParse(target).success).toBe(true)
  })

  it("still round-trips the agent / pipeline / orchestrator arms", () => {
    expect(TaskTargetSchema.safeParse({ kind: "agent", id: "a", name: "A" }).success).toBe(true)
    expect(TaskTargetSchema.safeParse({ kind: "pipeline", id: "p", name: "P" }).success).toBe(true)
    expect(TaskTargetSchema.safeParse({ kind: "orchestrator", name: "Orchestrator" }).success).toBe(true)
  })

  it("rejects an unknown target kind", () => {
    expect(TaskTargetSchema.safeParse({ kind: "wizard", id: "x", name: "X" }).success).toBe(false)
  })
})
