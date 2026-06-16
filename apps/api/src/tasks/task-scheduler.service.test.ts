import { promises as fs } from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import type { AgentRun, PipelineRun } from "@zibby/contracts"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { ScheduledTasksStorageService } from "./scheduled-tasks.storage.service"
import { TaskSchedulerService } from "./task-scheduler.service"

const fakeLogger = {
  child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}
const fakeTrace = {
  getTraceId: () => undefined,
  run: (_ctx: unknown, fn: () => unknown) => fn(),
}

function agentRun(over: Partial<AgentRun>): AgentRun {
  return {
    runId: "writer_1_1",
    agentId: "writer",
    status: "running",
    pct: 0,
    title: "",
    prompt: "",
    project: "",
    files: [],
    cwd: "/tmp/x",
    startedAt: new Date().toISOString(),
    pid: 1,
    logFile: "/tmp/x.log",
    ...over,
  }
}

function pipelineRun(over: Partial<PipelineRun>): PipelineRun {
  return {
    pipelineRunId: "release_1",
    pipelineId: "release",
    status: "running",
    currentStage: null,
    stageRuns: [],
    startedAt: new Date().toISOString(),
    cwd: "/tmp/p",
    ...over,
  }
}

describe("TaskSchedulerService — task → run → outcome linkage", () => {
  let dir: string
  let storage: ScheduledTasksStorageService
  let agentListener: ((run: AgentRun) => void) | undefined
  let pipelineListener: ((run: PipelineRun) => void) | undefined
  let agentRunner: {
    start: ReturnType<typeof vi.fn>
    startOrchestrator: ReturnType<typeof vi.fn>
    onRunStatus: ReturnType<typeof vi.fn>
    get: ReturnType<typeof vi.fn>
    readLog: ReturnType<typeof vi.fn>
  }
  let pipelineRunner: {
    start: ReturnType<typeof vi.fn>
    onRunStatus: ReturnType<typeof vi.fn>
    get: ReturnType<typeof vi.fn>
  }
  let goalRunner: {
    start: ReturnType<typeof vi.fn>
    onRunStatus: ReturnType<typeof vi.fn>
    get: ReturnType<typeof vi.fn>
  }
  let classifier: { classify: ReturnType<typeof vi.fn> }
  let fakeLimits: {
    windowExhausted: ReturnType<typeof vi.fn>
    resolveResumeAt: ReturnType<typeof vi.fn>
  }
  let service: TaskSchedulerService

  /** A fixed near-future window-reset epoch the limit guard defers to. */
  const RESET_AT = Date.parse("2026-06-13T04:30:00.000Z")

  beforeEach(async () => {
    process.env.TASK_TICK_MS = "0"
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "task-sched-unit-"))
    storage = new ScheduledTasksStorageService(dir)
    await storage.onModuleInit()

    agentRunner = {
      start: vi.fn(async () => agentRun({})),
      startOrchestrator: vi.fn(async () => agentRun({ agentId: "orchestrator" })),
      onRunStatus: vi.fn((l: (run: AgentRun) => void) => {
        agentListener = l
        return () => {}
      }),
      get: vi.fn(() => agentRun({})),
      readLog: vi.fn(async () => ({
        content: "Working…\nPROGRESS 100\nAll checks passed.\n",
        nextOffset: 0,
        done: true,
      })),
    }
    pipelineRunner = {
      start: vi.fn(async () => pipelineRun({})),
      onRunStatus: vi.fn((l: (run: PipelineRun) => void) => {
        pipelineListener = l
        return () => {}
      }),
      get: vi.fn(() => pipelineRun({})),
    }
    goalRunner = {
      start: vi.fn(async () => ({ goalRunId: "goal_1" })),
      onRunStatus: vi.fn(() => () => {}),
      get: vi.fn(() => ({ goalRunId: "goal_1", status: "done", iterations: [] })),
    }
    classifier = {
      classify: vi.fn(async () => ({
        target: { kind: "agent", id: "writer", name: "Writer" },
        confidence: 0.9,
        reason: "match",
        matchedTerms: [],
        candidates: [{ kind: "agent", id: "writer", name: "Writer" }],
      })),
    }

    const fakeProjects = { list: async () => [], get: async () => { throw new Error("no project") } }
    const fakeBudget = {
      check: async () => ({ ok: true }),
      countRunning: async () => 0,
      recordDispatch: async () => {},
    }
    const fakeApprovals = {
      register: vi.fn(),
      requestApproval: async () => ({ id: "appr_1" }),
      reject: async () => {},
    }
    const fakeGates = { floor: async () => [], evaluate: () => ({ decision: "allow" }) }
    // Limits double (Phase 9): headroom by default; a test flips windowExhausted to
    // exercise the limit guard. resolveResumeAt echoes a fixed near-future reset.
    fakeLimits = {
      windowExhausted: vi.fn(async () => ({ exhausted: false, resumeAt: null })),
      resolveResumeAt: vi.fn(async () => RESET_AT),
    }

    service = new TaskSchedulerService(
      storage,
      classifier as never,
      agentRunner as never,
      pipelineRunner as never,
      goalRunner as never,
      fakeLogger as never,
      fakeTrace as never,
      { record: async () => {} } as never,
      fakeProjects as never,
      fakeBudget as never,
      fakeApprovals as never,
      fakeGates as never,
      fakeLimits as never,
      // The output gate is exercised in task-output.service.test.ts; here it never
      // parks (a `done` run with no chosen output) → returns false, normal outcome.
      { handleTerminal: async () => false } as never,
    )
    service.onModuleInit()
  })

  afterEach(async () => {
    service.onModuleDestroy()
    await fs.rm(dir, { recursive: true, force: true })
    delete process.env.TASK_TICK_MS
  })

  it("persists an immediate dispatch and the run is born linked to the task id", async () => {
    const result = await service.createTask({ text: "do the thing", title: "Thing" })
    expect(result.outcome).toBe("dispatched")
    if (result.outcome !== "dispatched") return

    expect(result.task.status).toBe("dispatched")
    expect(result.task.runRef).toBe("writer_1_1")
    // The taskId travelled into the runner BEFORE dispatch (projectId "" when
    // unattributed; matchedTerms ride along for memory grounding).
    expect(agentRunner.start).toHaveBeenCalledWith(
      "writer",
      "do the thing",
      "",
      [],
      "Thing",
      result.task.id,
      [],
    )
    const persisted = await storage.get(result.task.id)
    expect(persisted.status).toBe("dispatched")
    expect(persisted.outcome).toBeUndefined()
  })

  it("fast path: a terminal agent run writes outcome done + last log line as summary", async () => {
    const result = await service.createTask({ text: "do" })
    if (result.outcome !== "dispatched") throw new Error("expected dispatched")

    agentListener?.(agentRun({ status: "done", taskId: result.task.id }))
    await vi.waitFor(async () => {
      const task = await storage.get(result.task.id)
      expect(task.outcome).toMatchObject({ status: "done", summary: "All checks passed." })
    })
  })

  it("maps an interrupted agent run to outcome error", async () => {
    const result = await service.createTask({ text: "do" })
    if (result.outcome !== "dispatched") throw new Error("expected dispatched")

    agentListener?.(agentRun({ status: "interrupted", taskId: result.task.id }))
    await vi.waitFor(async () => {
      const task = await storage.get(result.task.id)
      expect(task.outcome?.status).toBe("error")
    })
  })

  it("maps a failed pipeline to error with the stage tally as summary", async () => {
    classifier.classify.mockResolvedValue({
      target: { kind: "pipeline", id: "release", name: "Release" },
      confidence: 0.9,
      reason: "match",
      matchedTerms: [],
      candidates: [{ kind: "pipeline", id: "release", name: "Release" }],
    })
    const result = await service.createTask({ text: "ship it" })
    if (result.outcome !== "dispatched") throw new Error("expected dispatched")
    expect(pipelineRunner.start).toHaveBeenCalledWith(
      "release",
      result.task.id,
      undefined,
      [],
      undefined,
      undefined,
    )

    pipelineListener?.(
      pipelineRun({
        status: "failed",
        taskId: result.task.id,
        stageRuns: [
          { phaseId: "a", runId: "r.a", attempt: 1, status: "done" },
          { phaseId: "b", runId: "r.b", attempt: 1, status: "error" },
        ],
      }),
    )
    await vi.waitFor(async () => {
      const task = await storage.get(result.task.id)
      expect(task.outcome).toMatchObject({ status: "error", summary: "2 stages, failed" })
    })
  })

  it("non-terminal transitions write nothing", async () => {
    const result = await service.createTask({ text: "do" })
    if (result.outcome !== "dispatched") throw new Error("expected dispatched")
    agentListener?.(agentRun({ status: "awaiting-approval", taskId: result.task.id }))
    await new Promise((r) => setTimeout(r, 30))
    expect((await storage.get(result.task.id)).outcome).toBeUndefined()
  })

  it("catch-up sweep writes the outcome of a run that ended while the API was down", async () => {
    // A dispatched task persisted in a previous life, no outcome yet.
    const id = storage.newId()
    await storage.createDispatched(
      id,
      { text: "old task" },
      "writer_1_1",
      { kind: "agent", id: "writer", name: "Writer" },
      Date.now(),
    )
    agentRunner.get.mockReturnValue(agentRun({ status: "error" }))

    service.onApplicationBootstrap()
    await vi.waitFor(async () => {
      const task = await storage.get(id)
      expect(task.outcome?.status).toBe("error")
    })
  })

  it("writeOutcome is idempotent — the first verdict wins", async () => {
    const id = storage.newId()
    await storage.createDispatched(
      id,
      { text: "t" },
      "writer_1_1",
      { kind: "agent", id: "writer", name: "Writer" },
      Date.now(),
    )
    const first = { status: "done" as const, summary: "first", finishedAt: new Date().toISOString() }
    await storage.writeOutcome(id, first)
    await storage.writeOutcome(id, { ...first, status: "error", summary: "second" })
    const task = await storage.get(id)
    expect(task.outcome).toMatchObject({ status: "done", summary: "first" })
  })

  it("truncates an over-long summary line to ~200 chars", async () => {
    agentRunner.readLog.mockResolvedValue({
      content: `${"x".repeat(500)}\n`,
      nextOffset: 0,
      done: true,
    })
    const result = await service.createTask({ text: "do" })
    if (result.outcome !== "dispatched") throw new Error("expected dispatched")
    agentListener?.(agentRun({ status: "done", taskId: result.task.id }))
    await vi.waitFor(async () => {
      const task = await storage.get(result.task.id)
      expect(task.outcome?.summary.length).toBeLessThanOrEqual(200)
      expect(task.outcome?.summary.endsWith("…")).toBe(true)
    })
  })

  // ─── Phase 9: pre-dispatch limit guard (decision 4/5) ─────────────────────

  it("defers an immediate create to the window reset when the usage window is exhausted", async () => {
    fakeLimits.windowExhausted.mockResolvedValue({ exhausted: true, resumeAt: RESET_AT })
    const result = await service.createTask({ text: "do the thing", title: "Thing" })
    // The task parks as a scheduled (window-deferred) task — never dispatched.
    expect(result.outcome).toBe("scheduled")
    if (result.outcome !== "scheduled") return
    expect(result.task.status).toBe("scheduled")
    expect(result.task.scheduledAt).toBe(RESET_AT)
    expect(result.task.deferredReason).toBe("limit")
    expect(result.task.limitDeferrals).toBe(1)
    expect(agentRunner.start).not.toHaveBeenCalled()
  })

  it("a stale/headroom reading does NOT defer — the dispatch proceeds (fail-open)", async () => {
    fakeLimits.windowExhausted.mockResolvedValue({ exhausted: false, resumeAt: null })
    const result = await service.createTask({ text: "do the thing" })
    expect(result.outcome).toBe("dispatched")
    expect(agentRunner.start).toHaveBeenCalled()
  })

  it("the limit guard runs BEFORE the budget guard — over-cap + exhausted defers, not holds", async () => {
    // Force both over-budget AND exhausted: the limit guard wins (decision 4), so the
    // task defers (scheduled) rather than holding behind a spend-past-cap approval.
    fakeLimits.windowExhausted.mockResolvedValue({ exhausted: true, resumeAt: RESET_AT })
    const result = await service.createTask({ text: "do" })
    expect(result.outcome).toBe("scheduled")
    if (result.outcome !== "scheduled") return
    expect(result.task.deferredReason).toBe("limit")
    expect(result.task.heldReason).toBeUndefined()
  })

  it("re-defers a fired scheduled task that is still window-exhausted at tick time", async () => {
    // A previously window-deferred task comes due; the tick re-runs the guard.
    fakeLimits.windowExhausted.mockResolvedValue({ exhausted: true, resumeAt: RESET_AT })
    const created = await service.createTask({ text: "do" })
    if (created.outcome !== "scheduled") throw new Error("expected scheduled")
    const id = created.task.id
    // Make it due, then tick — still exhausted → re-deferred with a bumped counter.
    const nextReset = RESET_AT + 3_600_000
    fakeLimits.windowExhausted.mockResolvedValue({ exhausted: true, resumeAt: nextReset })
    await service.tick(new Date(RESET_AT + 1000))
    const task = await storage.get(id)
    expect(task.status).toBe("scheduled")
    expect(task.scheduledAt).toBe(nextReset)
    expect(task.limitDeferrals).toBe(2)
    expect(agentRunner.start).not.toHaveBeenCalled()
  })
})
