import { describe, expect, it, vi } from "vitest";
import { fakeSystemConfigStore } from "../system/system-config.fixture";
import { LimitResumeService } from "./limit-resume.service";

const fakeLogger = {
  child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
};

/** A near-future epoch the resumes treat as "due" relative to NOW below. */
const NOW = Date.parse("2026-06-13T05:00:00.000Z");
const PAST = NOW - 60_000;
const FUTURE = NOW + 60_000;

function makeService(over: {
  readiness?: { stale: boolean; hasHeadroom: boolean };
  agentPaused?: Array<{ runId: string; resumeAt: number | null; limitResumeCycles?: number }>;
  workflowPaused?: Array<{
    workflowRunId: string;
    resumeAt: number | null;
    limitResumeCycles?: number;
  }>;
}) {
  const limits = {
    resumeReadiness: vi.fn(async () => over.readiness ?? { stale: false, hasHeadroom: true }),
  };
  const agentRunner = {
    listLimitPaused: vi.fn(() => over.agentPaused ?? []),
    resumeLimitPaused: vi.fn(async () => {}),
    failLimitFlapped: vi.fn(async () => {}),
  };
  const workflowRunner = {
    listLimitPaused: vi.fn(() => over.workflowPaused ?? []),
    resumeLimitPaused: vi.fn(async () => {}),
    parkLimitFlapped: vi.fn(async () => {}),
  };
  const service = new LimitResumeService(
    limits as never,
    agentRunner as never,
    workflowRunner as never,
    fakeSystemConfigStore(),
    // F6c watcher-health registry double — registration is exercised in the
    // base/e2e specs, not here.
    { register: () => {} } as never,
    fakeLogger as never,
  );
  return { service, limits, agentRunner, workflowRunner };
}

describe("LimitResumeService", () => {
  it("skips a run whose resumeAt has not yet passed", async () => {
    const { service, agentRunner, workflowRunner } = makeService({
      workflowPaused: [{ workflowRunId: "p1", resumeAt: FUTURE }],
    });
    await service.tick(new Date(NOW));
    expect(workflowRunner.resumeLimitPaused).not.toHaveBeenCalled();
    expect(agentRunner.resumeLimitPaused).not.toHaveBeenCalled();
  });

  it("resumes a due run when the window has headroom", async () => {
    const { service, workflowRunner } = makeService({
      readiness: { stale: false, hasHeadroom: true },
      workflowPaused: [{ workflowRunId: "p1", resumeAt: PAST, limitResumeCycles: 0 }],
    });
    await service.tick(new Date(NOW));
    expect(workflowRunner.resumeLimitPaused).toHaveBeenCalledWith("p1");
  });

  it("skips the whole tick when the snapshot is stale (fail-closed)", async () => {
    const { service, workflowRunner } = makeService({
      readiness: { stale: true, hasHeadroom: false },
      workflowPaused: [{ workflowRunId: "p1", resumeAt: PAST }],
    });
    await service.tick(new Date(NOW));
    expect(workflowRunner.resumeLimitPaused).not.toHaveBeenCalled();
  });

  it("parks a workflow run that has flapped past the cycle cap", async () => {
    const { service, workflowRunner } = makeService({
      workflowPaused: [{ workflowRunId: "p1", resumeAt: PAST, limitResumeCycles: 3 }],
    });
    await service.tick(new Date(NOW));
    expect(workflowRunner.parkLimitFlapped).toHaveBeenCalledWith("p1");
    expect(workflowRunner.resumeLimitPaused).not.toHaveBeenCalled();
  });

  it("fails an agent run that has flapped past the cycle cap (no parked state)", async () => {
    const { service, agentRunner } = makeService({
      agentPaused: [{ runId: "a1", resumeAt: PAST, limitResumeCycles: 3 }],
    });
    await service.tick(new Date(NOW));
    expect(agentRunner.failLimitFlapped).toHaveBeenCalledWith(
      "a1",
      expect.stringContaining("flapped"),
    );
  });

  it("resumes oldest-first and skips the rest once a sibling consumes the window (herd guard)", async () => {
    const { service, limits, workflowRunner } = makeService({
      workflowPaused: [
        { workflowRunId: "younger", resumeAt: PAST + 1000, limitResumeCycles: 0 },
        { workflowRunId: "older", resumeAt: PAST, limitResumeCycles: 0 },
      ],
    });
    // Headroom for the first resume, then the window is consumed (no headroom).
    limits.resumeReadiness
      .mockResolvedValueOnce({ stale: false, hasHeadroom: true })
      .mockResolvedValue({ stale: false, hasHeadroom: false });
    await service.tick(new Date(NOW));
    // Oldest (smallest resumeAt) resumes; the younger one is left for the next tick.
    expect(workflowRunner.resumeLimitPaused).toHaveBeenCalledTimes(1);
    expect(workflowRunner.resumeLimitPaused).toHaveBeenCalledWith("older");
  });

  it("attempts a lone due run even with no headroom (a flap that burns one cycle)", async () => {
    const { service, workflowRunner } = makeService({
      readiness: { stale: false, hasHeadroom: false },
      workflowPaused: [{ workflowRunId: "p1", resumeAt: PAST, limitResumeCycles: 1 }],
    });
    await service.tick(new Date(NOW));
    // No sibling resumed, so the genuine-flap path still attempts it (re-pauses at the
    // boundary, burning a cycle toward the cap) rather than waiting forever.
    expect(workflowRunner.resumeLimitPaused).toHaveBeenCalledWith("p1");
  });

  it("T7 — two rapid timer-driven firings run tick() once (TickingWatcherBase guard)", async () => {
    const { service } = makeService({
      workflowPaused: [{ workflowRunId: "p1", resumeAt: PAST, limitResumeCycles: 0 }],
    });
    let resolveFirst: () => void = () => {};
    const deferred = new Promise<void>((resolve) => {
      resolveFirst = resolve;
    });
    const tickSpy = vi.spyOn(service, "tick").mockImplementation(async () => {
      await deferred;
    });
    // `tick()` itself stays public/unguarded (every other test above calls it
    // directly); the guard sits only on the timer-driven path.
    const guardedTick = () =>
      (service as unknown as { guardedTick(): Promise<void> }).guardedTick();

    const first = guardedTick();
    const second = guardedTick();
    await second; // skipped — resolves without waiting on the first
    expect(tickSpy).toHaveBeenCalledTimes(1);

    resolveFirst();
    await first;
    expect(tickSpy).toHaveBeenCalledTimes(1); // still once
  });
});
