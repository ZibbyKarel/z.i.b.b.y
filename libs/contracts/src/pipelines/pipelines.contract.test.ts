import { describe, expect, it } from "vitest"
import { PipelineRunSchema, PipelineSchema, pipelineRunsContract, pipelinesContract } from "../index"

const phase = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  agent: "writer",
  consumes: "in.md",
  produces: "out.md",
  model: "sonnet",
  thinking: "medium",
  ...extra,
})

describe("pipelinesContract", () => {
  it("exposes CRUD and keeps run routes in the /api/pipelines/* space", () => {
    expect(pipelinesContract.createPipeline.path).toBe("/api/pipelines")
    expect(pipelinesContract.getPipeline.path).toBe("/api/pipelines/:id")
    expect(pipelineRunsContract.startPipelineRun.path).toBe("/api/pipelines/:id/run")
    expect(pipelineRunsContract.listPipelineRuns.path).toBe("/api/pipelines/runs")
    expect(pipelineRunsContract.getStageRunLogs.path).toBe(
      "/api/pipelines/runs/:pipelineRunId/stages/:phaseId/logs",
    )
  })
})

describe("pipeline schema", () => {
  it("accepts a valid linear pipeline", () => {
    const result = PipelineSchema.safeParse({
      id: "release",
      phases: [phase("a"), phase("b")],
      instructions: "ship it",
    })
    expect(result.success).toBe(true)
  })

  it("accepts a tester loop whose targets exist", () => {
    const result = PipelineSchema.safeParse({
      id: "release",
      phases: [phase("build"), phase("test", { loop: { to: "build", maxRetries: 2, escalate: true, then: "fail" } })],
      instructions: "x",
    })
    expect(result.success).toBe(true)
  })

  it("rejects a dangling loop target (superRefine)", () => {
    const result = PipelineSchema.safeParse({
      id: "release",
      phases: [phase("build", { loop: { to: "nope", maxRetries: 1, escalate: false, then: "fail" } })],
      instructions: "x",
    })
    expect(result.success).toBe(false)
  })

  it("rejects duplicate phase ids", () => {
    const result = PipelineSchema.safeParse({
      id: "release",
      phases: [phase("dup"), phase("dup")],
      instructions: "x",
    })
    expect(result.success).toBe(false)
  })

  it("requires at least one phase", () => {
    expect(PipelineSchema.safeParse({ id: "x", phases: [], instructions: "y" }).success).toBe(false)
  })
})

describe("pipeline run schema", () => {
  it("aggregates stage runs with a pipeline state", () => {
    const parsed = PipelineRunSchema.safeParse({
      pipelineRunId: "release_1",
      pipelineId: "release",
      status: "running",
      currentStage: "build",
      stageRuns: [{ phaseId: "build", runId: "release_1.build_1_2", attempt: 1, status: "running" }],
      startedAt: new Date().toISOString(),
      cwd: "/tmp/release_1",
    })
    expect(parsed.success).toBe(true)
  })
})
