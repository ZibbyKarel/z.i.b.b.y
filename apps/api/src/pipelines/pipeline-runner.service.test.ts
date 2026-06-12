import { promises as fs } from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import {
  DEFAULT_VERIFY_CHECKS,
  type IntendedAction,
  type PipelinePhase,
  type PipelineRun,
  type Project,
} from "@zibby/contracts"
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
  readLog: ReturnType<typeof vi.fn>
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
    { get: vi.fn(async () => null), list: vi.fn(async () => []) } as never,
    // Workspace double: non-git by default, so the test path keeps the Phase 2
    // direct-checkout behavior (no worktree). Phase 3.1 worktree wiring is covered
    // by workspace.service.test.ts + the git-fixture e2e.
    {
      isGitRepo: vi.fn(async () => false),
      createWorktree: vi.fn(),
      removeWorktree: vi.fn(async () => {}),
      diffstat: vi.fn(async () => ""),
    } as never,
    { compose: vi.fn(async () => "") } as never,
    // Limits double (Phase 9): headroom by default so the boundary/mid-stage limit
    // guards stay out of the way of the gate/resume tests; windowExhausted → false.
    {
      noteLimitHit: vi.fn(),
      resolveResumeAt: vi.fn(async () => Date.now() + 1_000),
      windowExhausted: vi.fn(async () => ({ exhausted: false, resumeAt: null })),
    } as never,
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
    readLog: vi.fn(async () => ({ content: "tail of the failure", nextOffset: 0, done: true })),
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

  describe("buildStageCommand", () => {
    const PROJECT: Project = {
      id: "demo-proj",
      name: "Demo project",
      path: "/srv/checkouts/demo",
      checks: ["pnpm check:one", "pnpm check:two"],
    }

    const build = (phase: PipelinePhase, project: Project | null) =>
      (
        h.service as unknown as {
          buildStageCommand(
            phase: PipelinePhase,
            cwd: string,
            project: Project | null,
          ): Promise<{ command: string; args: string[]; spawnCwd?: string }>
        }
      ).buildStageCommand(phase, "/sandbox/stage", project)

    const verifyPhase = (over: Partial<PipelinePhase> = {}): PipelinePhase => ({
      id: "verify",
      type: "verify",
      ...over,
    })

    const agentPhase = (over: Partial<PipelinePhase> = {}): PipelinePhase => ({
      id: "build",
      type: "agent",
      agent: "writer",
      consumes: "in.md",
      produces: "out.md",
      model: "sonnet",
      thinking: "medium",
      ...over,
    })

    afterEach(() => {
      delete process.env.AGENT_RUNNER_MODE
    })

    it("verify: a phase-level commands override wins", async () => {
      const cmd = await build(verifyPhase({ commands: ["make test"] }), PROJECT)
      expect(cmd).toEqual({
        command: "/bin/sh",
        args: ["-c", "make test"],
        spawnCwd: "/srv/checkouts/demo",
      })
    })

    it("verify: falls back to the project's checks, joined with &&", async () => {
      const cmd = await build(verifyPhase(), PROJECT)
      expect(cmd.args).toEqual(["-c", "pnpm check:one && pnpm check:two"])
      expect(cmd.spawnCwd).toBe("/srv/checkouts/demo")
    })

    it("verify: falls back to the shared defaults in the sandbox without a project", async () => {
      const cmd = await build(verifyPhase(), null)
      expect(cmd.args).toEqual(["-c", DEFAULT_VERIFY_CHECKS.join(" && ")])
      expect(cmd.spawnCwd).toBeUndefined()
    })

    it("verify runs identically in claude mode (no model, no preflight)", async () => {
      process.env.AGENT_RUNNER_MODE = "claude"
      const cmd = await build(verifyPhase(), PROJECT)
      expect(cmd.command).toBe("/bin/sh")
    })

    it("claude: a project-targeted stage spawns in the checkout with the sandbox granted", async () => {
      process.env.AGENT_RUNNER_MODE = "claude"
      const buildClaude = vi.fn(async (opts: { task: string; grantDirs?: readonly string[] }) => ({
        command: "claude",
        args: ["-p", opts.task],
      }))
      ;(h.service as unknown as { claude: unknown }).claude = { buildClaudeCommand: buildClaude }
      ;(h.service as unknown as { agents: unknown }).agents = {
        get: vi.fn(async () => ({ id: "writer", instructions: "write", model: "opus" })),
      }

      const cmd = await build(agentPhase(), PROJECT)
      expect(cmd.spawnCwd).toBe("/srv/checkouts/demo")
      const opts = buildClaude.mock.calls[0]?.[0] as {
        task: string
        grantDirs?: readonly string[]
        model?: string
      }
      expect(opts.grantDirs).toEqual(["/sandbox/stage"])
      // Handoff paths are absolute — sandbox-relative would resolve in the repo.
      expect(opts.task).toContain(path.join("/sandbox/stage", "in.md"))
      expect(opts.task).toContain(path.join("/sandbox/stage", "out.md"))
      // The phase-level model wins over the agent's default.
      expect(opts.model).toBe("sonnet")
    })

    it("claude: without a project the stage stays in its sandbox (no grant)", async () => {
      process.env.AGENT_RUNNER_MODE = "claude"
      const buildClaude = vi.fn(async (opts: { task: string }) => ({
        command: "claude",
        args: ["-p", opts.task],
      }))
      ;(h.service as unknown as { claude: unknown }).claude = { buildClaudeCommand: buildClaude }
      ;(h.service as unknown as { agents: unknown }).agents = {
        get: vi.fn(async () => ({ id: "writer", instructions: "write" })),
      }

      const cmd = await build(agentPhase(), null)
      expect(cmd.spawnCwd).toBeUndefined()
      const opts = buildClaude.mock.calls[0]?.[0] as { grantDirs?: readonly string[] }
      expect(opts.grantDirs).toBeUndefined()
    })
  })

  it("reconstruct reconciles an approval-parked aggregate to failed", async () => {
    const ghostId = "ghost_1780000000000"
    const root = path.join(dir, ghostId)
    await fs.mkdir(root, { recursive: true })
    await fs.writeFile(
      path.join(root, "run.json"),
      JSON.stringify({
        pipelineRunId: ghostId,
        pipelineId: "release",
        status: "parked",
        parkedReason: "approval",
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
    expect(run.parkedReason).toBeUndefined()
  })

  it("reconstruct keeps a retries-parked aggregate parked (durable, no child)", async () => {
    const ghostId = "ghost_1780000000001"
    const root = path.join(dir, ghostId)
    await fs.mkdir(root, { recursive: true })
    await fs.writeFile(
      path.join(root, "run.json"),
      JSON.stringify({
        pipelineRunId: ghostId,
        pipelineId: "release",
        status: "parked",
        parkedReason: "retries",
        parked: { phaseId: "build", attempts: 3, failureFile: path.join(root, "build.failure.txt") },
        retries: { build: 2 },
        currentStage: "build",
        stageRuns: [],
        startedAt: new Date().toISOString(),
        cwd: root,
      }),
      "utf8",
    )
    await (h.service as unknown as { reconstruct(): Promise<void> }).reconstruct()
    const run = h.service.get(ghostId)
    expect(run.status).toBe("parked")
    expect(run.parkedReason).toBe("retries")
    expect(run.retries).toEqual({ build: 2 })
  })

  describe("escalation ladder", () => {
    const phaseWithLadder: PipelinePhase = {
      id: "review",
      type: "agent",
      agent: "writer",
      consumes: "in.md",
      produces: "out.md",
      model: "sonnet",
      thinking: "medium",
      loop: {
        to: "build",
        maxRetries: 5,
        escalate: true,
        then: "park",
        escalation: [{ model: "opus" }, { model: "opus", thinking: "high" }],
      },
    }

    const rungFor = (attempt: number) =>
      (
        h.service as unknown as {
          escalationFor(phase: PipelinePhase, attempt: number): unknown
        }
      ).escalationFor(phaseWithLadder, attempt)

    it("applies no rung to the original attempt", () => {
      expect(rungFor(1)).toBeNull()
    })

    it("retry n applies rung n (1-based)", () => {
      expect(rungFor(2)).toEqual({ model: "opus" })
      expect(rungFor(3)).toEqual({ model: "opus", thinking: "high" })
    })

    it("later retries clamp to the last rung", () => {
      expect(rungFor(6)).toEqual({ model: "opus", thinking: "high" })
    })
  })

  describe("retries parking + resume", () => {
    const parkedPipeline = {
      id: "release",
      phases: [
        {
          id: "build",
          type: "agent",
          agent: "writer",
          consumes: "in.md",
          produces: "out.md",
          model: "sonnet",
          thinking: "medium",
        },
        {
          id: "review",
          type: "agent",
          agent: "writer",
          consumes: "out.md",
          produces: "review.md",
          model: "sonnet",
          thinking: "medium",
          loop: { to: "build", maxRetries: 0, escalate: true, then: "park" },
        },
      ],
      instructions: "ship",
    }

    it("exhaustion with then:'park' parks durably — no failed status, no synthetic marker", async () => {
      const run = h.runs.get(PIPELINE_RUN_ID)
      if (!run) throw new Error("missing run")
      // Stage results: build done, review error → retries (0) exhausted → park.
      const statuses = ["done", "error"]
      let call = 0
      ;(h.service as unknown as { runStage: unknown }).runStage = vi.fn(
        async (_run: unknown, phase: { id: string }, _cwd: string, attempt: number) => ({
          phaseId: phase.id,
          runId: `${PIPELINE_RUN_ID}.${phase.id}_${call}`,
          attempt,
          status: statuses[Math.min(call++, statuses.length - 1)],
        }),
      )

      await (
        h.service as unknown as {
          drive(run: PipelineRun, pipeline: unknown): Promise<void>
        }
      ).drive(run, parkedPipeline)

      expect(run.status).toBe("parked")
      expect(run.parkedReason).toBe("retries")
      expect(run.parked).toMatchObject({ phaseId: "review", attempts: 1 })
      expect(run.retries).toEqual({})
      // No synthetic ".escalated" marker on the park path.
      expect(run.stageRuns.some((s) => s.runId.endsWith(".escalated"))).toBe(false)
      // The failure context exists (the resume handoff).
      const failure = await fs.readFile(run.parked?.failureFile ?? "", "utf8")
      expect(failure).toContain('Phase "review" failed')
    })

    it("resumeParked injects the note, resets the counter and re-enters at loop.to", async () => {
      const run = h.runs.get(PIPELINE_RUN_ID)
      if (!run) throw new Error("missing run")
      const failureFile = path.join(run.cwd, "review.failure.txt")
      await fs.writeFile(failureFile, "Phase review failed.", "utf8")
      run.status = "parked"
      run.parkedReason = "retries"
      run.parked = { phaseId: "review", attempts: 3, failureFile }
      run.retries = { review: 2 }
      ;(
        h.service as unknown as { pipelines: { get: ReturnType<typeof vi.fn> } }
      ).pipelines.get.mockResolvedValue(parkedPipeline)

      const drive = vi.fn(async () => {})
      ;(h.service as unknown as { drive: unknown }).drive = drive

      const resumed = await h.service.resumeParked(PIPELINE_RUN_ID, "zkus to přes mock")
      expect(resumed.status).toBe("running")
      expect(resumed.parkedReason).toBeUndefined()
      expect(resumed.parked).toBeUndefined()
      expect(resumed.retries).toEqual({ review: 0 })
      expect(resumed.currentStage).toBe("build")

      // The note landed in its own file AND in the failure-context handoff.
      const note = await fs.readFile(path.join(run.cwd, "review.note.md"), "utf8")
      expect(note).toContain("zkus to přes mock")
      const failure = await fs.readFile(failureFile, "utf8")
      expect(failure).toContain("Operator note")
      expect(failure).toContain("zkus to přes mock")

      // The driver re-entered the machine at loop.to with the failure handoff.
      await vi.waitFor(() => expect(drive).toHaveBeenCalled())
      const resume = drive.mock.calls[0]?.[3] as {
        cursor: string
        handoffSource: string
        retries: Map<string, number>
      }
      expect(resume.cursor).toBe("build")
      expect(resume.handoffSource).toBe(failureFile)
      expect(resume.retries.get("review")).toBe(0)
    })

    it("resumeParked refuses a run that is not retries-parked (409 material)", async () => {
      const run = h.runs.get(PIPELINE_RUN_ID)
      if (!run) throw new Error("missing run")
      run.status = "parked"
      run.parkedReason = "approval"
      await expect(h.service.resumeParked(PIPELINE_RUN_ID)).rejects.toMatchObject({
        name: "RunNotRetriesParkedError",
      })
      run.status = "running"
      delete run.parkedReason
      await expect(h.service.resumeParked(PIPELINE_RUN_ID)).rejects.toMatchObject({
        name: "RunNotRetriesParkedError",
      })
    })
  })
})
