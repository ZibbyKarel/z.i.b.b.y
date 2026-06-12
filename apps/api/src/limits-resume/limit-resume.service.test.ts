import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { LimitResumeService } from "./limit-resume.service"

const fakeLogger = {
  child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}

/** A near-future epoch the resumes treat as "due" relative to NOW below. */
const NOW = Date.parse("2026-06-13T05:00:00.000Z")
const PAST = NOW - 60_000
const FUTURE = NOW + 60_000

function makeService(over: {
  readiness?: { stale: boolean; hasHeadroom: boolean }
  agentPaused?: Array<{ runId: string; resumeAt: number | null; limitResumeCycles?: number }>
  pipelinePaused?: Array<{ pipelineRunId: string; resumeAt: number | null; limitResumeCycles?: number }>
}) {
  const limits = {
    resumeReadiness: vi.fn(async () => over.readiness ?? { stale: false, hasHeadroom: true }),
  }
  const agentRunner = {
    listLimitPaused: vi.fn(() => over.agentPaused ?? []),
    resumeLimitPaused: vi.fn(async () => {}),
    failLimitFlapped: vi.fn(async () => {}),
  }
  const pipelineRunner = {
    listLimitPaused: vi.fn(() => over.pipelinePaused ?? []),
    resumeLimitPaused: vi.fn(async () => {}),
    parkLimitFlapped: vi.fn(async () => {}),
  }
  const service = new LimitResumeService(
    limits as never,
    agentRunner as never,
    pipelineRunner as never,
    fakeLogger as never,
  )
  return { service, limits, agentRunner, pipelineRunner }
}

describe("LimitResumeService", () => {
  beforeEach(() => {
    process.env.LIMIT_RESUME_TICK_MS = "0"
    process.env.LIMIT_RESUME_MAX = "3"
  })
  afterEach(() => {
    delete process.env.LIMIT_RESUME_TICK_MS
    delete process.env.LIMIT_RESUME_MAX
  })

  it("skips a run whose resumeAt has not yet passed", async () => {
    const { service, agentRunner, pipelineRunner } = makeService({
      pipelinePaused: [{ pipelineRunId: "p1", resumeAt: FUTURE }],
    })
    await service.tick(new Date(NOW))
    expect(pipelineRunner.resumeLimitPaused).not.toHaveBeenCalled()
    expect(agentRunner.resumeLimitPaused).not.toHaveBeenCalled()
  })

  it("resumes a due run when the window has headroom", async () => {
    const { service, pipelineRunner } = makeService({
      readiness: { stale: false, hasHeadroom: true },
      pipelinePaused: [{ pipelineRunId: "p1", resumeAt: PAST, limitResumeCycles: 0 }],
    })
    await service.tick(new Date(NOW))
    expect(pipelineRunner.resumeLimitPaused).toHaveBeenCalledWith("p1")
  })

  it("skips the whole tick when the snapshot is stale (fail-closed)", async () => {
    const { service, pipelineRunner } = makeService({
      readiness: { stale: true, hasHeadroom: false },
      pipelinePaused: [{ pipelineRunId: "p1", resumeAt: PAST }],
    })
    await service.tick(new Date(NOW))
    expect(pipelineRunner.resumeLimitPaused).not.toHaveBeenCalled()
  })

  it("parks a pipeline run that has flapped past the cycle cap", async () => {
    const { service, pipelineRunner } = makeService({
      pipelinePaused: [{ pipelineRunId: "p1", resumeAt: PAST, limitResumeCycles: 3 }],
    })
    await service.tick(new Date(NOW))
    expect(pipelineRunner.parkLimitFlapped).toHaveBeenCalledWith("p1")
    expect(pipelineRunner.resumeLimitPaused).not.toHaveBeenCalled()
  })

  it("fails an agent run that has flapped past the cycle cap (no parked state)", async () => {
    const { service, agentRunner } = makeService({
      agentPaused: [{ runId: "a1", resumeAt: PAST, limitResumeCycles: 3 }],
    })
    await service.tick(new Date(NOW))
    expect(agentRunner.failLimitFlapped).toHaveBeenCalledWith("a1", expect.stringContaining("flapped"))
  })

  it("resumes oldest-first and skips the rest once a sibling consumes the window (herd guard)", async () => {
    const { service, limits, pipelineRunner } = makeService({
      pipelinePaused: [
        { pipelineRunId: "younger", resumeAt: PAST + 1000, limitResumeCycles: 0 },
        { pipelineRunId: "older", resumeAt: PAST, limitResumeCycles: 0 },
      ],
    })
    // Headroom for the first resume, then the window is consumed (no headroom).
    limits.resumeReadiness
      .mockResolvedValueOnce({ stale: false, hasHeadroom: true })
      .mockResolvedValue({ stale: false, hasHeadroom: false })
    await service.tick(new Date(NOW))
    // Oldest (smallest resumeAt) resumes; the younger one is left for the next tick.
    expect(pipelineRunner.resumeLimitPaused).toHaveBeenCalledTimes(1)
    expect(pipelineRunner.resumeLimitPaused).toHaveBeenCalledWith("older")
  })

  it("attempts a lone due run even with no headroom (a flap that burns one cycle)", async () => {
    const { service, pipelineRunner } = makeService({
      readiness: { stale: false, hasHeadroom: false },
      pipelinePaused: [{ pipelineRunId: "p1", resumeAt: PAST, limitResumeCycles: 1 }],
    })
    await service.tick(new Date(NOW))
    // No sibling resumed, so the genuine-flap path still attempts it (re-pauses at the
    // boundary, burning a cycle toward the cap) rather than waiting forever.
    expect(pipelineRunner.resumeLimitPaused).toHaveBeenCalledWith("p1")
  })
})
