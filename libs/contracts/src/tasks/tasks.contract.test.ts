import { describe, expect, it } from "vitest"
import { ScheduledTaskSchema, ScheduledTaskStatusSchema, TaskRoutingSchema, tasksContract } from "../index"

describe("tasksContract", () => {
  it("exposes a POST /api/tasks/classify route returning 200 and 422", () => {
    expect(tasksContract.classifyTask.method).toBe("POST")
    expect(tasksContract.classifyTask.path).toBe("/api/tasks/classify")
    expect(tasksContract.classifyTask.responses).toHaveProperty("200")
    expect(tasksContract.classifyTask.responses).toHaveProperty("422")
  })
})

describe("TaskRoutingSchema", () => {
  const valid = {
    target: { kind: "agent", id: "curator", name: "Kurátor", glyph: "film", category: "Média" },
    confidence: 0.71,
    reason: "Matched: média, knihovna",
    matchedTerms: ["média", "knihovna"],
    candidates: [{ kind: "agent", id: "curator", name: "Kurátor" }],
  }

  it("accepts a well-formed routing verdict", () => {
    expect(TaskRoutingSchema.safeParse(valid).success).toBe(true)
  })

  it("rejects a confidence above 1", () => {
    expect(TaskRoutingSchema.safeParse({ ...valid, confidence: 1.4 }).success).toBe(false)
  })

  it("rejects a missing target", () => {
    const { confidence, reason, matchedTerms, candidates } = valid
    expect(
      TaskRoutingSchema.safeParse({ confidence, reason, matchedTerms, candidates }).success,
    ).toBe(false)
  })

  it("rejects an empty candidate list", () => {
    expect(TaskRoutingSchema.safeParse({ ...valid, candidates: [] }).success).toBe(false)
  })

  it("accepts the orchestrator fallback target (no id, synthetic display)", () => {
    const routing = {
      ...valid,
      target: { kind: "orchestrator", name: "Orchestrator", glyph: "compass" },
    }
    expect(TaskRoutingSchema.safeParse(routing).success).toBe(true)
  })

  it("rejects an agent target without an id", () => {
    const routing = { ...valid, target: { kind: "agent", name: "Kurátor" } }
    expect(TaskRoutingSchema.safeParse(routing).success).toBe(false)
  })
})

describe("ScheduledTask budget statuses (Phase 8)", () => {
  it("includes held + queued in the lifecycle enum", () => {
    expect(ScheduledTaskStatusSchema.options).toContain("held")
    expect(ScheduledTaskStatusSchema.options).toContain("queued")
  })

  const base = {
    id: "task_1",
    title: "",
    text: "fix the bug",
    paths: [],
    scheduledAt: 1_700_000_000_000,
    status: "queued" as const,
    createdAt: new Date().toISOString(),
  }

  it("accepts a queued task attributed to a project", () => {
    expect(ScheduledTaskSchema.safeParse({ ...base, projectId: "alpha" }).success).toBe(true)
  })

  it("accepts a held task carrying its approval + reason", () => {
    expect(
      ScheduledTaskSchema.safeParse({
        ...base,
        status: "held",
        projectId: "alpha",
        heldReason: "project-daily cap reached",
        approvalId: "task_1_ab",
      }).success,
    ).toBe(true)
  })
})
