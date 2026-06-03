import { describe, expect, it } from "vitest"
import { AgentRunSchema, RunLogChunkSchema, agentRunsContract } from "./index"

describe("agentRunsContract", () => {
  it("exposes the run lifecycle routes under /api/agents", () => {
    expect(agentRunsContract.startRun.method).toBe("POST")
    expect(agentRunsContract.startRun.path).toBe("/api/agents/:id/run")
    expect(agentRunsContract.listRunning.method).toBe("GET")
    expect(agentRunsContract.listRunning.path).toBe("/api/agents/running")
    expect(agentRunsContract.getRunLogs.path).toBe("/api/agents/runs/:runId/logs")
    expect(agentRunsContract.stopRun.path).toBe("/api/agents/runs/:runId/stop")
  })

  it("declares 404 on every run-or-agent-scoped route", () => {
    expect(agentRunsContract.startRun.responses).toHaveProperty("404")
    expect(agentRunsContract.getRun.responses).toHaveProperty("404")
    expect(agentRunsContract.getRunLogs.responses).toHaveProperty("404")
    expect(agentRunsContract.stopRun.responses).toHaveProperty("404")
  })
})

describe("agent-run schema", () => {
  it("accepts a well-formed run", () => {
    const parsed = AgentRunSchema.safeParse({
      runId: "agent-007_1717400000000_4242",
      agentId: "agent-007",
      status: "running",
      pct: 40,
      prompt: "do the thing",
      project: "zibby-core",
      cwd: "/tmp/runs/agent-007_1717400000000",
      startedAt: new Date().toISOString(),
      pid: 4242,
      logFile: "/tmp/runs/agent-007_1717400000000_4242.log",
    })
    expect(parsed.success).toBe(true)
  })

  it("rejects an out-of-range pct or an unknown status", () => {
    const base = {
      runId: "r",
      agentId: "a",
      prompt: "",
      project: "",
      cwd: "/tmp",
      startedAt: new Date().toISOString(),
      pid: 1,
      logFile: "/tmp/r.log",
    }
    expect(AgentRunSchema.safeParse({ ...base, status: "running", pct: 140 }).success).toBe(false)
    expect(AgentRunSchema.safeParse({ ...base, status: "paused", pct: 10 }).success).toBe(false)
  })
})

describe("run-log chunk schema", () => {
  it("requires a non-negative nextOffset", () => {
    expect(RunLogChunkSchema.safeParse({ content: "x", nextOffset: 0, done: false }).success).toBe(
      true,
    )
    expect(RunLogChunkSchema.safeParse({ content: "x", nextOffset: -1, done: false }).success).toBe(
      false,
    )
  })
})
