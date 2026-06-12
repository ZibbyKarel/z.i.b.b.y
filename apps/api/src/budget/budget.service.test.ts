import type { AgentRun, Limits, PipelineRun, Project } from "@zibby/contracts"
import { describe, expect, it, vi } from "vitest"
import { BudgetService } from "./budget.service"

const fakeLogger = { child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }) }

const limits = (over: Partial<Limits> = {}): Limits => ({
  rolling: { usedPct: 10, resetsAt: null },
  weekly: { usedPct: 10, resetsAt: null },
  capturedAt: null,
  stale: false,
  ...over,
})

interface Deps {
  ledger?: Partial<{ countDaily: () => Promise<number>; countWeekly: () => Promise<number>; record: () => Promise<void> }>
  config?: { read: () => Promise<Record<string, number>> }
  project?: Project | null
  limitsSnapshot?: () => Promise<Limits>
  agentRuns?: AgentRun[]
  pipelineRuns?: PipelineRun[]
}

function build(deps: Deps = {}): BudgetService {
  const ledger = {
    countDaily: deps.ledger?.countDaily ?? (async () => 0),
    countWeekly: deps.ledger?.countWeekly ?? (async () => 0),
    record: deps.ledger?.record ?? (async () => {}),
  }
  const config = deps.config ?? { read: async () => ({}) }
  const projects = {
    get: async (id: string) => {
      if (deps.project && deps.project.id === id) return deps.project
      throw new Error("not found")
    },
    list: async () => (deps.project ? [deps.project] : []),
  }
  const limitsService = { snapshot: deps.limitsSnapshot ?? (async () => limits()) }
  const agentRunner = { listRunning: () => deps.agentRuns ?? [] }
  const pipelineRunner = { list: () => deps.pipelineRuns ?? [] }
  const tasks = { list: async () => [] }
  return new BudgetService(
    ledger as never,
    config as never,
    projects as never,
    limitsService as never,
    agentRunner as never,
    pipelineRunner as never,
    tasks as never,
    fakeLogger as never,
  )
}

const project = (budget: Project["budget"]): Project => ({
  id: "alpha",
  name: "Alpha",
  path: "/work/alpha",
  budget,
})

describe("BudgetService.check — caps arithmetic", () => {
  it("ok when the project has no budget", async () => {
    const svc = build({ project: project(undefined) })
    expect(await svc.check("alpha")).toEqual({ ok: true })
  })

  it("ok when under the daily cap", async () => {
    const svc = build({ project: project({ dailyRuns: 2 }), ledger: { countDaily: async () => 1 } })
    expect(await svc.check("alpha")).toEqual({ ok: true })
  })

  it("over when the daily cap is reached", async () => {
    const svc = build({ project: project({ dailyRuns: 2 }), ledger: { countDaily: async () => 2 } })
    const result = await svc.check("alpha")
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.over).toBe("project-daily")
  })

  it("over when the weekly cap is reached", async () => {
    const svc = build({ project: project({ weeklyRuns: 5 }), ledger: { countWeekly: async () => 5 } })
    const result = await svc.check("alpha")
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.over).toBe("project-weekly")
  })

  it("ok for an unattributed dispatch (no projectId, no global pause)", async () => {
    const svc = build()
    expect(await svc.check(undefined)).toEqual({ ok: true })
  })
})

describe("BudgetService.check — global ceiling", () => {
  it("holds when a non-stale window is at the pause threshold", async () => {
    const svc = build({
      config: { read: async () => ({ pauseAtRollingPct: 80 }) },
      limitsSnapshot: async () => limits({ rolling: { usedPct: 85, resetsAt: null } }),
    })
    const result = await svc.check(undefined)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.over).toBe("global")
  })

  it("ignores the threshold when the reading is stale", async () => {
    const svc = build({
      config: { read: async () => ({ pauseAtRollingPct: 80 }) },
      limitsSnapshot: async () => limits({ rolling: { usedPct: 95, resetsAt: null }, stale: true }),
    })
    expect(await svc.check(undefined)).toEqual({ ok: true })
  })
})

describe("BudgetService.check — fail-closed", () => {
  it("holds (over global) when the limits snapshot throws", async () => {
    const svc = build({ limitsSnapshot: async () => { throw new Error("network down") } })
    const result = await svc.check("alpha")
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.over).toBe("global")
  })

  it("holds (over global) when the ledger is unreadable", async () => {
    const svc = build({
      project: project({ dailyRuns: 1 }),
      ledger: { countDaily: async () => { throw new Error("EACCES") } },
    })
    const result = await svc.check("alpha")
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.over).toBe("global")
  })
})

describe("BudgetService.countRunning", () => {
  const agent = (over: Partial<AgentRun>): AgentRun => ({
    runId: "a1", agentId: "x", status: "running", pct: 0, title: "", prompt: "",
    project: "alpha", files: [], cwd: "/t", startedAt: new Date().toISOString(), pid: 1, logFile: "/t.log",
    ...over,
  })
  const pipeline = (over: Partial<PipelineRun>): PipelineRun => ({
    pipelineRunId: "p1", pipelineId: "rel", status: "running", currentStage: null, stageRuns: [],
    startedAt: new Date().toISOString(), cwd: "/p", projectPath: "/work/alpha", ...over,
  })

  it("counts running agent runs + running pipeline runs for the project", async () => {
    const svc = build({
      project: project({ maxConcurrent: 2 }),
      agentRuns: [agent({ runId: "a1" }), agent({ runId: "a2", status: "done" })],
      pipelineRuns: [pipeline({ pipelineRunId: "p1" })],
    })
    expect(await svc.countRunning("alpha")).toBe(2) // a1 (running) + p1; a2 done excluded
  })

  it("excludes runs labelled with a different project", async () => {
    const svc = build({
      project: project({ maxConcurrent: 2 }),
      agentRuns: [agent({ project: "beta" })],
      pipelineRuns: [pipeline({ projectPath: "/work/beta" })],
    })
    expect(await svc.countRunning("alpha")).toBe(0)
  })

  it("counts an awaiting-approval agent run as occupying a slot", async () => {
    const svc = build({
      project: project({ maxConcurrent: 1 }),
      agentRuns: [agent({ status: "awaiting-approval" })],
    })
    expect(await svc.countRunning("alpha")).toBe(1)
  })
})
