import { promises as fs } from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import type { IntendedAction, PipelineRun } from "@zibby/contracts"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { ResumableRunner } from "../approvals/approvals.service"
import { RunNotFoundError } from "../runner/runner-core"
import { PipelineRunnerService } from "./pipeline-runner.service"

/** Minimal logger double matching the LoggerService surface the service uses. */
const fakeLogger = {
  child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}

const fakeTrace = {
  getTraceId: () => undefined,
  run: (_ctx: unknown, fn: () => unknown) => fn(),
}

interface FakeCore {
  init: ReturnType<typeof vi.fn>
  get: ReturnType<typeof vi.fn>
  resume: ReturnType<typeof vi.fn>
  cancel: ReturnType<typeof vi.fn>
  holdForApproval: ReturnType<typeof vi.fn>
  allowIntent: ReturnType<typeof vi.fn>
  denyIntent: ReturnType<typeof vi.fn>
  shutdown: ReturnType<typeof vi.fn>
}

interface Harness {
  service: PipelineRunnerService
  core: FakeCore
  approvals: { register: ReturnType<typeof vi.fn>; requestApproval: ReturnType<typeof vi.fn> }
  gates: { rulesForAgent: ReturnType<typeof vi.fn>; evaluate: ReturnType<typeof vi.fn> }
  runs: Map<string, PipelineRun>
  registered: Map<string, ResumableRunner>
  dir: string
}

const STAGE_RUN_ID = "release_100.build_200_42"
const PIPELINE_RUN_ID = "release_100"

async function makeHarness(dir: string): Promise<Harness> {
  const registered = new Map<string, ResumableRunner>()
  const approvals = {
    register: vi.fn((kind: string, runner: ResumableRunner) => registered.set(kind, runner)),
    requestApproval: vi.fn(async () => ({})),
  }
  const gates = {
    rulesForAgent: vi.fn(async () => []),
    evaluate: vi.fn(() => ({ decision: "ask", ruleId: "rule-1" })),
  }
  const pipelines = {
    get: vi.fn(async () => ({
      id: "release",
      phases: [
        {
          id: "build",
          agent: "writer",
          consumes: "in.md",
          produces: "out.md",
          model: "sonnet",
          thinking: "medium",
        },
      ],
      instructions: "ship",
    })),
  }
  const agents = {
    get: vi.fn(async () => ({
      id: "writer",
      name: "Writer",
      instructions: "writes",
      risk: "high",
    })),
  }

  const service = new PipelineRunnerService(
    dir,
    pipelines as never,
    agents as never,
    { buildClaudeCommand: vi.fn() } as never,
    { assertAvailable: vi.fn(), probe: vi.fn() } as never,
    approvals as never,
    gates as never,
    fakeLogger as never,
    fakeTrace as never,
  )

  // Swap the real core (which spawns processes) for a scriptable double.
  const core: FakeCore = {
    init: vi.fn(async () => {}),
    get: vi.fn(() => ({
      runId: STAGE_RUN_ID,
      pipelineRunId: PIPELINE_RUN_ID,
      phaseId: "build",
      status: "running",
    })),
    resume: vi.fn(async () => ({})),
    cancel: vi.fn(),
    holdForApproval: vi.fn(async () => {}),
    allowIntent: vi.fn(async () => {}),
    denyIntent: vi.fn(async () => {}),
    shutdown: vi.fn(),
  }
  ;(service as unknown as { core: FakeCore }).core = core

  // Seed the in-memory aggregate the intent path mutates.
  const run: PipelineRun = {
    pipelineRunId: PIPELINE_RUN_ID,
    pipelineId: "release",
    status: "running",
    currentStage: "build",
    stageRuns: [],
    startedAt: new Date().toISOString(),
    cwd: path.join(dir, PIPELINE_RUN_ID),
  }
  await fs.mkdir(run.cwd, { recursive: true })
  const runs = (service as unknown as { runs: Map<string, PipelineRun> }).runs
  runs.set(PIPELINE_RUN_ID, run)

  return { service, core, approvals, gates, runs, registered, dir }
}

const intent: IntendedAction = { action: "delete" }

async function fireIntent(h: Harness): Promise<void> {
  await (
    h.service as unknown as {
      onStageIntent(id: string, action: IntendedAction): Promise<void>
    }
  ).onStageIntent(STAGE_RUN_ID, intent)
}

describe("PipelineRunnerService — stage gates & resume", () => {
  let dir: string
  let h: Harness

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "pipe-runner-unit-"))
    h = await makeHarness(dir)
  })

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true })
  })

  it("ask: holds the stage, parks the aggregate, and raises a pipeline-stage approval", async () => {
    h.gates.evaluate.mockReturnValue({ decision: "ask", ruleId: "rule-1" })
    await fireIntent(h)

    expect(h.core.holdForApproval).toHaveBeenCalledWith(STAGE_RUN_ID)
    expect(h.runs.get(PIPELINE_RUN_ID)?.status).toBe("parked")
    expect(h.approvals.requestApproval).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "pipeline-stage", runId: STAGE_RUN_ID, risk: "high" }),
    )
    // The parked transition was persisted for restart fidelity.
    const sidecar = JSON.parse(
      await fs.readFile(path.join(dir, PIPELINE_RUN_ID, "run.json"), "utf8"),
    ) as PipelineRun
    expect(sidecar.status).toBe("parked")
  })

  it("deny: refuses the intent without parking", async () => {
    h.gates.evaluate.mockReturnValue({ decision: "deny", ruleId: "rule-d" })
    await fireIntent(h)
    expect(h.core.denyIntent).toHaveBeenCalledWith(STAGE_RUN_ID)
    expect(h.runs.get(PIPELINE_RUN_ID)?.status).toBe("running")
    expect(h.approvals.requestApproval).not.toHaveBeenCalled()
  })

  it("allow: releases the intent immediately", async () => {
    h.gates.evaluate.mockReturnValue({ decision: "allow" })
    await fireIntent(h)
    expect(h.core.allowIntent).toHaveBeenCalledWith(STAGE_RUN_ID)
  })

  it("fails safe to deny when the evaluation blows up", async () => {
    h.gates.evaluate.mockImplementation(() => {
      throw new Error("boom")
    })
    await fireIntent(h)
    expect(h.core.denyIntent).toHaveBeenCalledWith(STAGE_RUN_ID)
  })

  it("registers for pipeline-stage approvals; resume un-parks the aggregate", async () => {
    await h.service.onModuleInit()
    const runner = h.registered.get("pipeline-stage")
    expect(runner).toBeDefined()

    const run = h.runs.get(PIPELINE_RUN_ID)
    if (run) run.status = "parked"
    await runner?.resume(STAGE_RUN_ID)
    expect(h.core.resume).toHaveBeenCalledWith(STAGE_RUN_ID)
    expect(h.runs.get(PIPELINE_RUN_ID)?.status).toBe("running")
  })

  it("resume/cancel tolerate an unknown run (log + no-op)", async () => {
    await h.service.onModuleInit()
    const runner = h.registered.get("pipeline-stage")
    h.core.resume.mockRejectedValue(new RunNotFoundError("gone"))
    await expect(runner?.resume("gone")).resolves.toBeUndefined()
    h.core.cancel.mockImplementation(() => {
      throw new RunNotFoundError("gone")
    })
    expect(() => runner?.cancel("gone")).not.toThrow()
  })

  it("waitForStage rides through awaiting-approval and returns only on terminal", async () => {
    const statuses = ["running", "awaiting-approval", "awaiting-approval", "done"]
    let i = 0
    h.core.get.mockImplementation(() => ({
      runId: STAGE_RUN_ID,
      status: statuses[Math.min(i++, statuses.length - 1)],
    }))
    const status = await (
      h.service as unknown as { waitForStage(id: string): Promise<string> }
    ).waitForStage(STAGE_RUN_ID)
    expect(status).toBe("done")
    expect(i).toBeGreaterThanOrEqual(4)
  })

  it("reconstruct reconciles a parked aggregate to failed", async () => {
    const ghostId = "ghost_1780000000000"
    const root = path.join(dir, ghostId)
    await fs.mkdir(root, { recursive: true })
    await fs.writeFile(
      path.join(root, "run.json"),
      JSON.stringify({
        pipelineRunId: ghostId,
        pipelineId: "release",
        status: "parked",
        currentStage: "build",
        stageRuns: [],
        startedAt: new Date().toISOString(),
        cwd: root,
      }),
      "utf8",
    )
    await (h.service as unknown as { reconstruct(): Promise<void> }).reconstruct()
    const run = h.service.get(ghostId)
    expect(run.status).toBe("failed")
    expect(run.currentStage).toBeNull()
  })
})
