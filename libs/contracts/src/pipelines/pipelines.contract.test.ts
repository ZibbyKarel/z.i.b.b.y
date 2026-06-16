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
  it("exposes CRUD and keeps only the catalog-liveness run list", () => {
    expect(pipelinesContract.createPipeline.path).toBe("/api/pipelines")
    expect(pipelinesContract.getPipeline.path).toBe("/api/pipelines/:id")
    expect(pipelineRunsContract.listPipelineRuns.path).toBe("/api/pipelines/runs")
    // The per-kind run lifecycle routes moved to the unified `taskRuns` contract.
    expect(pipelineRunsContract).not.toHaveProperty("startPipelineRun")
    expect(pipelineRunsContract).not.toHaveProperty("listAllPipelineRuns")
    expect(pipelineRunsContract).not.toHaveProperty("getPipelineRun")
    expect(pipelineRunsContract).not.toHaveProperty("resumePipelineRun")
    expect(pipelineRunsContract).not.toHaveProperty("getStageRunLogs")
    expect(pipelineRunsContract).not.toHaveProperty("getPipelineRunArtifact")
    expect(pipelineRunsContract).not.toHaveProperty("deletePipelineRun")
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

  it("defaults outputs to an empty array (older pipelines parse unchanged)", () => {
    const result = PipelineSchema.safeParse({
      id: "release",
      phases: [phase("a")],
      instructions: "x",
    })
    expect(result.success && result.data.outputs).toEqual([])
  })

  it("accepts pr + file output sinks drawing from a produced artifact", () => {
    const result = PipelineSchema.safeParse({
      id: "release",
      phases: [phase("a")],
      outputs: [
        { type: "pr", from: "out.md" },
        { type: "file", from: "out.md", dest: "vault", to: "note-1" },
      ],
      instructions: "x",
    })
    expect(result.success).toBe(true)
  })

  it("rejects an output.from that no phase produces (superRefine)", () => {
    const result = PipelineSchema.safeParse({
      id: "release",
      phases: [phase("a")],
      outputs: [{ type: "pr", from: "nonexistent.md" }],
      instructions: "x",
    })
    expect(result.success).toBe(false)
  })

  it("rejects a file output missing its dest discriminator", () => {
    const result = PipelineSchema.safeParse({
      id: "release",
      phases: [phase("a")],
      outputs: [{ type: "file", from: "out.md", to: "x" }],
      instructions: "x",
    })
    expect(result.success).toBe(false)
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
