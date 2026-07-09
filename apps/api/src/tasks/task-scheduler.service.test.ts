import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { AgentRun, PipelineRun } from "@zibby/contracts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ActivityInput } from "../activity/activity-log.service";
import type { BudgetCheck } from "../budget/budget.service";
import { fakeSystemConfigStore } from "../system/system-config.fixture";
import { AttachmentStorageService } from "./attachment-storage.service";
import { ScheduledTasksStorageService } from "./scheduled-tasks.storage.service";
import { TaskSchedulerService } from "./task-scheduler.service";

const fakeLogger = {
  child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
};
const fakeTrace = {
  getTraceId: () => undefined,
  run: (_ctx: unknown, fn: () => unknown) => fn(),
};

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
  };
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
  };
}

describe("TaskSchedulerService — task → run → outcome linkage", () => {
  let dir: string;
  let storage: ScheduledTasksStorageService;
  let agentListener: ((run: AgentRun) => void) | undefined;
  let pipelineListener: ((run: PipelineRun) => void) | undefined;
  let agentRunner: {
    start: ReturnType<typeof vi.fn>;
    startOrchestrator: ReturnType<typeof vi.fn>;
    onRunStatus: ReturnType<typeof vi.fn>;
    get: ReturnType<typeof vi.fn>;
    readLog: ReturnType<typeof vi.fn>;
  };
  let pipelineRunner: {
    start: ReturnType<typeof vi.fn>;
    onRunStatus: ReturnType<typeof vi.fn>;
    get: ReturnType<typeof vi.fn>;
  };
  /** Phase 91: the pipeline definition store, for subsystem-target resolution
   *  (`ownerSubsystem` lookup). Empty by default — no test in this file dispatches
   *  a subsystem target; `task-scheduler.subsystem-dispatch.test.ts` covers those. */
  let pipelinesStore: { list: ReturnType<typeof vi.fn> };
  let goalRunner: {
    start: ReturnType<typeof vi.fn>;
    onRunStatus: ReturnType<typeof vi.fn>;
    get: ReturnType<typeof vi.fn>;
  };
  let chainRunner: {
    start: ReturnType<typeof vi.fn>;
    onRunStatus: ReturnType<typeof vi.fn>;
    get: ReturnType<typeof vi.fn>;
  };
  let chainListener: ((run: { taskId?: string; status: string; steps: unknown[]; chainRunId: string }) => void) | undefined;
  let classifier: {
    classify: ReturnType<typeof vi.fn>;
    /** Phase 91 — the subsystem-scoped classify seam. */
    classifyWithinSubsystem: ReturnType<typeof vi.fn>;
  };
  let fakeLimits: {
    windowExhausted: ReturnType<typeof vi.fn>;
    resolveResumeAt: ReturnType<typeof vi.fn>;
  };
  let fakeBudget: {
    check: ReturnType<typeof vi.fn<(projectId?: string, now?: Date) => Promise<BudgetCheck>>>;
    countRunning: () => Promise<number>;
    recordDispatch: () => Promise<void>;
    recordCost: ReturnType<
      typeof vi.fn<
        (
          entry: { projectId: string; taskId?: string; runRef: string; kind: string; costUsd: number },
          now?: Date,
        ) => Promise<void>
      >
    >;
  };
  let fakeGates: { floor: () => Promise<never[]>; evaluate: ReturnType<typeof vi.fn> };
  let service: TaskSchedulerService;
  let systemConfig: ReturnType<typeof fakeSystemConfigStore>;
  let attachmentStorage: AttachmentStorageService;
  let activity: { record: ReturnType<typeof vi.fn<(input: ActivityInput) => Promise<void>>> };

  /** A fixed near-future window-reset epoch the limit guard defers to. */
  const RESET_AT = Date.parse("2026-06-13T04:30:00.000Z");

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "task-sched-unit-"));
    storage = new ScheduledTasksStorageService(dir);
    await storage.onModuleInit();
    attachmentStorage = new AttachmentStorageService();

    agentRunner = {
      start: vi.fn(async () => agentRun({})),
      startOrchestrator: vi.fn(async () => agentRun({ agentId: "orchestrator" })),
      onRunStatus: vi.fn((l: (run: AgentRun) => void) => {
        agentListener = l;
        return () => {};
      }),
      get: vi.fn(() => agentRun({})),
      readLog: vi.fn(async () => ({
        content: "Working…\nPROGRESS 100\nAll checks passed.\n",
        nextOffset: 0,
        done: true,
      })),
    };
    pipelineRunner = {
      start: vi.fn(async () => pipelineRun({})),
      onRunStatus: vi.fn((l: (run: PipelineRun) => void) => {
        pipelineListener = l;
        return () => {};
      }),
      get: vi.fn(() => pipelineRun({})),
    };
    pipelinesStore = { list: vi.fn(async () => []) };
    goalRunner = {
      start: vi.fn(async () => ({ goalRunId: "goal_1" })),
      onRunStatus: vi.fn(() => () => {}),
      get: vi.fn(() => ({ goalRunId: "goal_1", status: "done", iterations: [] })),
    };
    chainRunner = {
      start: vi.fn(async () => ({ chainRunId: "research-then-build_1", steps: [{}, {}] })),
      onRunStatus: vi.fn((l: typeof chainListener) => {
        chainListener = l;
        return () => {};
      }),
      get: vi.fn(() => ({ chainRunId: "research-then-build_1", status: "running", steps: [{}, {}] })),
    };
    classifier = {
      classify: vi.fn(async () => ({
        target: { kind: "agent", id: "writer", name: "Writer" },
        confidence: 0.9,
        reason: "match",
        matchedTerms: [],
        candidates: [{ kind: "agent", id: "writer", name: "Writer" }],
      })),
      // Phase 91: no test in THIS describe block dispatches a subsystem target
      // (see the "Phase 91 — subsystem dispatch" describe below); a call here
      // would be a scope-guard violation, so the default throws loudly rather
      // than silently returning something plausible.
      classifyWithinSubsystem: vi.fn(async () => {
        throw new Error("classifyWithinSubsystem should not be called by this describe block");
      }),
    };

    const fakeProjects = {
      list: async () => [],
      get: async () => {
        throw new Error("no project");
      },
    };
    // Phase 70: no company in any of these tests — the resolver degrades to the
    // project's own raw budget, so this fake just echoes `project.budget` through,
    // matching TaskSchedulerService's pre-Phase-70 direct-access behavior exactly.
    const fakeResolved = {
      resolveBudget: async (p: { budget?: unknown }) => p.budget,
    };
    fakeBudget = {
      check: vi.fn(async () => ({ ok: true }) as BudgetCheck),
      countRunning: async () => 0,
      recordDispatch: async () => {},
      recordCost: vi.fn(async () => {}),
    };
    const fakeApprovals = {
      register: vi.fn(),
      requestApproval: async () => ({ id: "appr_1" }),
      reject: async () => {},
    };
    fakeGates = { floor: async () => [], evaluate: vi.fn(() => ({ decision: "allow" })) };
    // Limits double (Phase 9): headroom by default; a test flips windowExhausted to
    // exercise the limit guard. resolveResumeAt echoes a fixed near-future reset.
    fakeLimits = {
      windowExhausted: vi.fn(async () => ({ exhausted: false, resumeAt: null })),
      resolveResumeAt: vi.fn(async () => RESET_AT),
    };
    activity = { record: vi.fn(async (_input: ActivityInput) => {}) };

    service = new TaskSchedulerService(
      storage,
      classifier as never,
      agentRunner as never,
      pipelineRunner as never,
      pipelinesStore as never,
      goalRunner as never,
      chainRunner as never,
      fakeLogger as never,
      fakeTrace as never,
      activity as never,
      fakeProjects as never,
      fakeResolved as never,
      fakeBudget as never,
      fakeApprovals as never,
      fakeGates as never,
      fakeLimits as never,
      // The output sink is exercised in task-output.service.test.ts; here it delivers
      // nothing (a `done` run with no chosen output) → returns null, normal outcome.
      { handleTerminal: async () => null } as never,
      (systemConfig = fakeSystemConfigStore()),
      // Namer double: returns null so title derivation falls back to the deterministic
      // slice (the Haiku CLI path never spawns under test).
      { name: async () => null } as never,
      attachmentStorage,
    );
    service.onModuleInit();
  });

  afterEach(async () => {
    service.onModuleDestroy();
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("re-arms the heartbeat live when the system config changes (no restart)", async () => {
    // The scheduler booted with taskTickMs 0 → no timer. Saving a positive interval
    // must arm one (the operator's /settings save applies without a restart).
    const setSpy = vi.spyOn(globalThis, "setInterval");
    const clearSpy = vi.spyOn(globalThis, "clearInterval");

    await systemConfig.write({ ...systemConfig.current(), taskTickMs: 50_000 });
    expect(setSpy).toHaveBeenCalledWith(expect.any(Function), 50_000);

    // Saving 0 again disarms it (clears, no new interval at 0).
    setSpy.mockClear();
    await systemConfig.write({ ...systemConfig.current(), taskTickMs: 0 });
    expect(clearSpy).toHaveBeenCalled();
    expect(setSpy).not.toHaveBeenCalled();

    setSpy.mockRestore();
    clearSpy.mockRestore();
  });

  it("persists an immediate dispatch and the run is born linked to the task id", async () => {
    const result = await service.createTask({ text: "do the thing", title: "Thing" });
    expect(result.outcome).toBe("dispatched");
    if (result.outcome !== "dispatched") return;

    expect(result.task.status).toBe("dispatched");
    expect(result.task.runRef).toBe("writer_1_1");
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
      undefined,
      undefined,
    );
    const persisted = await storage.get(result.task.id);
    expect(persisted.status).toBe("dispatched");
    expect(persisted.outcome).toBeUndefined();
    // Pure intent (no target) is exactly what the classifier routes.
    expect(classifier.classify).toHaveBeenCalledTimes(1);
  });

  describe("Phase 4a — orchestrator-fallback telemetry", () => {
    beforeEach(() => {
      // The classifier's own terminal rule: nothing matched confidently.
      classifier.classify = vi.fn(async () => ({
        target: { kind: "orchestrator", name: "Orchestrator", glyph: "compass" },
        confidence: 0,
        reason: "No agent or pipeline matched confidently",
        matchedTerms: ["deploy", "staging"],
        candidates: [],
      }));
    });

    it("records an orchestrator-fallback activity when the CLASSIFIER routes to the orchestrator", async () => {
      await service.createTask({ text: "Deploy to Staging!", title: "Deploy" });

      const call = activity.record.mock.calls.find(([entry]) => entry.kind === "orchestrator-fallback");
      expect(call).toBeDefined();
      const entry = call?.[0];
      expect(entry?.refs?.normalizedSummary).toBe("deploy to staging");
      expect(entry?.refs?.terms).toBe("deploy,staging");
      expect(entry?.summary).toContain("Deploy to Staging!");
    });

    it("does NOT record a fallback when an explicit orchestrator target overrides the classifier", async () => {
      // e.g. an approved proposed-task whose suggested target is the orchestrator —
      // a deliberate override, not an escape, so it must not count toward the tally.
      await service.createTask(
        { text: "handle this", title: "T" },
        undefined,
        undefined,
        { kind: "orchestrator", name: "Orchestrator", glyph: "compass" },
        false,
      );
      expect(classifier.classify).not.toHaveBeenCalled();
      expect(
        activity.record.mock.calls.some(([entry]) => entry.kind === "orchestrator-fallback"),
      ).toBe(false);
    });

    it("does not record a fallback when the classifier routes to a real agent/pipeline", async () => {
      classifier.classify = vi.fn(async () => ({
        target: { kind: "agent", id: "writer", name: "Writer" },
        confidence: 0.9,
        reason: "match",
        matchedTerms: [],
        candidates: [{ kind: "agent", id: "writer", name: "Writer" }],
      }));
      await service.createTask({ text: "write the doc", title: "Doc" });
      expect(
        activity.record.mock.calls.some(([entry]) => entry.kind === "orchestrator-fallback"),
      ).toBe(false);
    });
  });

  it("resolves and persists attachments from the set id on create", async () => {
    const setId = (
      await attachmentStorage.save([
        { originalname: "a.txt", size: 2, mimetype: "text/plain", buffer: Buffer.from("hi") },
      ])
    ).attachmentSetId;
    const res = await service.createTask(
      { text: "use it", attachmentSetId: setId, scheduledAt: Date.now() + 60_000 },
      undefined,
      undefined,
      undefined,
      false,
    );
    expect(res.outcome).toBe("scheduled");
    const task = (res as { task: { attachments: unknown[]; attachmentSetId?: string } }).task;
    expect(task.attachmentSetId).toBe(setId);
    expect(task.attachments).toEqual([{ name: "a.txt", size: 2, mediaType: "text/plain" }]);
  });

  it("passes attachments to the agent dispatch", async () => {
    const { attachmentSetId } = await attachmentStorage.save([
      { originalname: "a.txt", size: 2, mimetype: "text/plain", buffer: Buffer.from("hi") },
    ]);
    await service.createTask(
      { text: "use it", attachmentSetId, target: { kind: "agent", id: "writer", name: "A" } },
      undefined,
      undefined,
      undefined,
      false,
    );
    const lastArg = agentRunner.start.mock.calls.at(-1)?.at(-1);
    expect(lastArg).toMatchObject({ names: ["a.txt"] });
    expect(String((lastArg as { dir: string }).dir)).toContain(attachmentSetId);
  });

  it("removes attachment sets older than 24h that no task references", async () => {
    // Attachment storage's root is real (ZIBBY_DATA_DIR-scoped, isolated per test
    // FILE not per test) — clear any sets left behind by earlier tests in this file
    // so the removed-count assertion below is order-independent.
    for (const s of await attachmentStorage.listSetIds()) await attachmentStorage.remove(s.id);
    const orphan = (
      await attachmentStorage.save([{ originalname: "o.txt", size: 1, buffer: Buffer.from("x") }])
    ).attachmentSetId;
    const referenced = (
      await attachmentStorage.save([{ originalname: "r.txt", size: 1, buffer: Buffer.from("y") }])
    ).attachmentSetId;
    await service.createTask(
      { text: "keep", attachmentSetId: referenced, scheduledAt: Date.now() + 60_000 },
      undefined,
      undefined,
      undefined,
      false,
    );
    const removed = await service.sweepOrphanAttachmentSets(Date.now() + 25 * 60 * 60 * 1000);
    expect(removed).toBe(1);
    expect(await attachmentStorage.list(orphan)).toEqual([]);
    expect(await attachmentStorage.list(referenced)).toHaveLength(1);
  });

  it("an explicit target on the wire bypasses the classifier entirely (DNA: explicit target overrides)", async () => {
    // N1: naming a pipeline/agent is a hard override — the named unit runs and the
    // classifier is never consulted, so an explicit run is fully deterministic.
    const result = await service.createTask({
      text: "run exactly this",
      title: "Direct",
      target: { kind: "pipeline", id: "release", name: "Release" },
    });
    expect(result.outcome).toBe("dispatched");
    if (result.outcome !== "dispatched") return;

    expect(classifier.classify).not.toHaveBeenCalled();
    expect(pipelineRunner.start).toHaveBeenCalledWith(
      "release",
      result.task.id,
      undefined,
      [],
      undefined,
      undefined,
    );
    expect(result.task.target).toEqual({ kind: "pipeline", id: "release", name: "Release" });
  });

  it("background path: returns a pending task immediately, then dispatches off the response path", async () => {
    // The interactive (dialog) path: `background` defers classify + spawn so the
    // submit returns at once with a `pending` task to redirect to.
    const result = await service.createTask(
      { text: "do the thing", title: "Thing" },
      undefined,
      undefined,
      undefined,
      true,
    );
    expect(result.outcome).toBe("pending");
    if (result.outcome !== "pending") return;
    // The record returned to the dialog is `pending` with no run yet — proof the
    // submit didn't block on the spawn (createPending persists this before dispatch).
    expect(result.task.status).toBe("pending");
    expect(result.task.runRef).toBeUndefined();

    // The background dispatch then flips it to `dispatched`, born linked to the task id.
    await vi.waitFor(async () => {
      const task = await storage.get(result.task.id);
      expect(task.status).toBe("dispatched");
      expect(task.runRef).toBe("writer_1_1");
    });
    expect(agentRunner.start).toHaveBeenCalledWith(
      "writer",
      "do the thing",
      "",
      [],
      "Thing",
      result.task.id,
      [],
      undefined,
      undefined,
    );
  });

  it("background path: a dispatch with nothing to route to flips the pending task to failed (never silent)", async () => {
    classifier.classify.mockResolvedValueOnce(null); // empty catalog
    const result = await service.createTask(
      { text: "do the thing", title: "Thing" },
      undefined,
      undefined,
      undefined,
      true,
    );
    expect(result.outcome).toBe("pending");
    if (result.outcome !== "pending") return;

    await vi.waitFor(async () => {
      const task = await storage.get(result.task.id);
      expect(task.status).toBe("failed");
      expect(task.error).toContain("No agents or pipelines");
    });
    expect(agentRunner.start).not.toHaveBeenCalled();
  });

  it("boot recovery: re-drives a task left pending by a restart (no stranded work)", async () => {
    // Simulate a crash mid-dispatch: a task sits on disk as `pending`, its background
    // dispatch never finished. Boot must re-drive it — neither sweep (skips non-
    // dispatched) nor drain (skips non-queued) would.
    const taskId = storage.newId();
    await storage.createPending(
      taskId,
      { text: "do the thing", title: "Thing" },
      undefined,
      Date.now(),
    );

    service.onApplicationBootstrap();

    await vi.waitFor(async () => {
      const task = await storage.get(taskId);
      expect(task.status).toBe("dispatched");
      expect(task.runRef).toBe("writer_1_1");
    });
  });

  it("fast path: a terminal agent run writes outcome done + last log line as summary", async () => {
    const result = await service.createTask({ text: "do" });
    if (result.outcome !== "dispatched") throw new Error("expected dispatched");

    agentListener?.(agentRun({ status: "done", taskId: result.task.id }));
    await vi.waitFor(async () => {
      const task = await storage.get(result.task.id);
      expect(task.outcome).toMatchObject({ status: "done", summary: "All checks passed." });
    });
  });

  it("maps an interrupted agent run to outcome error", async () => {
    const result = await service.createTask({ text: "do" });
    if (result.outcome !== "dispatched") throw new Error("expected dispatched");

    agentListener?.(agentRun({ status: "interrupted", taskId: result.task.id }));
    await vi.waitFor(async () => {
      const task = await storage.get(result.task.id);
      expect(task.outcome?.status).toBe("error");
    });
  });

  it("maps a failed pipeline to error with the stage tally as summary", async () => {
    classifier.classify.mockResolvedValue({
      target: { kind: "pipeline", id: "release", name: "Release" },
      confidence: 0.9,
      reason: "match",
      matchedTerms: [],
      candidates: [{ kind: "pipeline", id: "release", name: "Release" }],
    });
    const result = await service.createTask({ text: "ship it" });
    if (result.outcome !== "dispatched") throw new Error("expected dispatched");
    expect(pipelineRunner.start).toHaveBeenCalledWith(
      "release",
      result.task.id,
      undefined,
      [],
      undefined,
      undefined,
    );

    pipelineListener?.(
      pipelineRun({
        status: "failed",
        taskId: result.task.id,
        stageRuns: [
          { phaseId: "a", runId: "r.a", attempt: 1, status: "done" },
          { phaseId: "b", runId: "r.b", attempt: 1, status: "error" },
        ],
      }),
    );
    await vi.waitFor(async () => {
      const task = await storage.get(result.task.id);
      expect(task.outcome).toMatchObject({ status: "error", summary: "2 stages, failed" });
    });
  });

  it("dispatches a chain-targeted task through the chain runner with the taskId", async () => {
    const result = await service.createTask({
      text: "research then build",
      title: "Chain",
      target: { kind: "chain", id: "research-then-build", name: "Research then Build" },
    });
    expect(result.outcome).toBe("dispatched");
    if (result.outcome !== "dispatched") return;
    // Chain is explicit-only — never classified.
    expect(classifier.classify).not.toHaveBeenCalled();
    expect(chainRunner.start).toHaveBeenCalledWith("research-then-build", result.task.id);
    expect(result.task.runRef).toBe("research-then-build_1");
  });

  it("writes a terminal chain run's outcome back onto the task (N steps, done)", async () => {
    const result = await service.createTask({
      text: "research then build",
      target: { kind: "chain", id: "research-then-build", name: "Research then Build" },
    });
    if (result.outcome !== "dispatched") throw new Error("expected dispatched");
    chainListener?.({
      chainRunId: "research-then-build_1",
      status: "done",
      taskId: result.task.id,
      steps: [{}, {}, {}],
    });
    await vi.waitFor(async () => {
      const task = await storage.get(result.task.id);
      expect(task.outcome).toMatchObject({ status: "done", summary: "3 steps, done" });
    });
  });

  it("non-terminal transitions write nothing", async () => {
    const result = await service.createTask({ text: "do" });
    if (result.outcome !== "dispatched") throw new Error("expected dispatched");
    agentListener?.(agentRun({ status: "awaiting-approval", taskId: result.task.id }));
    await new Promise((r) => setTimeout(r, 30));
    expect((await storage.get(result.task.id)).outcome).toBeUndefined();
  });

  it("catch-up sweep writes the outcome of a run that ended while the API was down", async () => {
    // A dispatched task persisted in a previous life, no outcome yet.
    const id = storage.newId();
    await storage.createDispatched(
      id,
      { text: "old task" },
      "writer_1_1",
      { kind: "agent", id: "writer", name: "Writer" },
      Date.now(),
    );
    agentRunner.get.mockReturnValue(agentRun({ status: "error" }));

    service.onApplicationBootstrap();
    await vi.waitFor(async () => {
      const task = await storage.get(id);
      expect(task.outcome?.status).toBe("error");
    });
  });

  it("writeOutcome is idempotent — the first verdict wins", async () => {
    const id = storage.newId();
    await storage.createDispatched(
      id,
      { text: "t" },
      "writer_1_1",
      { kind: "agent", id: "writer", name: "Writer" },
      Date.now(),
    );
    const first = {
      status: "done" as const,
      summary: "first",
      finishedAt: new Date().toISOString(),
    };
    await storage.writeOutcome(id, first);
    await storage.writeOutcome(id, { ...first, status: "error", summary: "second" });
    const task = await storage.get(id);
    expect(task.outcome).toMatchObject({ status: "done", summary: "first" });
  });

  it("truncates an over-long summary line to ~200 chars", async () => {
    agentRunner.readLog.mockResolvedValue({
      content: `${"x".repeat(500)}\n`,
      nextOffset: 0,
      done: true,
    });
    const result = await service.createTask({ text: "do" });
    if (result.outcome !== "dispatched") throw new Error("expected dispatched");
    agentListener?.(agentRun({ status: "done", taskId: result.task.id }));
    await vi.waitFor(async () => {
      const task = await storage.get(result.task.id);
      expect(task.outcome?.summary.length).toBeLessThanOrEqual(200);
      expect(task.outcome?.summary.endsWith("…")).toBe(true);
    });
  });

  // ─── Phase 9: pre-dispatch limit guard (decision 4/5) ─────────────────────

  it("defers an immediate create to the window reset when the usage window is exhausted", async () => {
    fakeLimits.windowExhausted.mockResolvedValue({ exhausted: true, resumeAt: RESET_AT });
    const result = await service.createTask({ text: "do the thing", title: "Thing" });
    // The task parks as a scheduled (window-deferred) task — never dispatched.
    expect(result.outcome).toBe("scheduled");
    if (result.outcome !== "scheduled") return;
    expect(result.task.status).toBe("scheduled");
    expect(result.task.scheduledAt).toBe(RESET_AT);
    expect(result.task.deferredReason).toBe("limit");
    expect(result.task.limitDeferrals).toBe(1);
    expect(agentRunner.start).not.toHaveBeenCalled();
  });

  it("a stale/headroom reading does NOT defer — the dispatch proceeds (fail-open)", async () => {
    fakeLimits.windowExhausted.mockResolvedValue({ exhausted: false, resumeAt: null });
    const result = await service.createTask({ text: "do the thing" });
    expect(result.outcome).toBe("dispatched");
    expect(agentRunner.start).toHaveBeenCalled();
  });

  it("the limit guard runs BEFORE the budget guard — over-cap + exhausted defers, not holds", async () => {
    // Force both over-budget AND exhausted: the limit guard wins (decision 4), so the
    // task defers (scheduled) rather than holding behind a spend-past-cap approval.
    fakeLimits.windowExhausted.mockResolvedValue({ exhausted: true, resumeAt: RESET_AT });
    const result = await service.createTask({ text: "do" });
    expect(result.outcome).toBe("scheduled");
    if (result.outcome !== "scheduled") return;
    expect(result.task.deferredReason).toBe("limit");
    expect(result.task.heldReason).toBeUndefined();
  });

  it("re-defers a fired scheduled task that is still window-exhausted at tick time", async () => {
    // A previously window-deferred task comes due; the tick re-runs the guard.
    fakeLimits.windowExhausted.mockResolvedValue({ exhausted: true, resumeAt: RESET_AT });
    const created = await service.createTask({ text: "do" });
    if (created.outcome !== "scheduled") throw new Error("expected scheduled");
    const id = created.task.id;
    // Make it due, then tick — still exhausted → re-deferred with a bumped counter.
    const nextReset = RESET_AT + 3_600_000;
    fakeLimits.windowExhausted.mockResolvedValue({ exhausted: true, resumeAt: nextReset });
    await service.tick(new Date(RESET_AT + 1000));
    const task = await storage.get(id);
    expect(task.status).toBe("scheduled");
    expect(task.scheduledAt).toBe(nextReset);
    expect(task.limitDeferrals).toBe(2);
    expect(agentRunner.start).not.toHaveBeenCalled();
  });

  // ─── Phase 12: dollar cost-cap lines + gate metrics ────────────────────────

  it("writes a best-effort cost line when a terminal agent run carries costUsd + a project", async () => {
    // Attribution is server-derived off `paths` (Law 4) — a plain `createTask` in
    // this suite never resolves a project (the project store is empty), so a
    // project-attributed task is built directly, as the catch-up sweep test does.
    const id = storage.newId();
    await storage.createDispatched(
      id,
      { text: "do" },
      "writer_1_1",
      { kind: "agent", id: "writer", name: "Writer" },
      Date.now(),
      "alpha",
    );
    agentListener?.(agentRun({ status: "done", taskId: id, costUsd: 0.42 }));
    await vi.waitFor(() => {
      expect(fakeBudget.recordCost).toHaveBeenCalledWith(
        expect.objectContaining({
          projectId: "alpha",
          taskId: id,
          runRef: "writer_1_1",
          kind: "agent",
          costUsd: 0.42,
        }),
      );
    });
  });

  it("does not write a cost line when the terminal agent run has no costUsd", async () => {
    const id = storage.newId();
    await storage.createDispatched(
      id,
      { text: "do" },
      "writer_1_1",
      { kind: "agent", id: "writer", name: "Writer" },
      Date.now(),
      "alpha",
    );
    agentListener?.(agentRun({ status: "done", taskId: id }));
    await vi.waitFor(async () => {
      const task = await storage.get(id);
      expect(task.outcome).toBeDefined();
    });
    expect(fakeBudget.recordCost).not.toHaveBeenCalled();
  });

  it("writes a cost line summed from stage costs on a terminal pipeline run", async () => {
    const id = storage.newId();
    await storage.createDispatched(
      id,
      { text: "ship it" },
      "release_1",
      { kind: "pipeline", id: "release", name: "Release" },
      Date.now(),
      "alpha",
    );
    pipelineListener?.(
      pipelineRun({
        status: "done",
        taskId: id,
        stageRuns: [
          { phaseId: "a", runId: "r.a", attempt: 1, status: "done", costUsd: 0.1 },
          { phaseId: "b", runId: "r.b", attempt: 1, status: "done", costUsd: 0.25 },
        ],
      }),
    );
    await vi.waitFor(() => {
      expect(fakeBudget.recordCost).toHaveBeenCalled();
    });
    const call = fakeBudget.recordCost.mock.calls.at(-1)?.[0] as {
      projectId: string;
      taskId: string;
      runRef: string;
      kind: string;
      costUsd: number;
    };
    expect(call).toMatchObject({
      projectId: "alpha",
      taskId: id,
      runRef: "release_1",
      kind: "pipeline",
    });
    expect(call.costUsd).toBeCloseTo(0.35, 10);
  });

  it("does not write a cost line when no stage of the pipeline run carries costUsd", async () => {
    const id = storage.newId();
    await storage.createDispatched(
      id,
      { text: "ship it" },
      "release_1",
      { kind: "pipeline", id: "release", name: "Release" },
      Date.now(),
      "alpha",
    );
    pipelineListener?.(
      pipelineRun({
        status: "done",
        taskId: id,
        stageRuns: [{ phaseId: "a", runId: "r.a", attempt: 1, status: "done" }],
      }),
    );
    await vi.waitFor(async () => {
      const task = await storage.get(id);
      expect(task.outcome).toBeDefined();
    });
    expect(fakeBudget.recordCost).not.toHaveBeenCalled();
  });

  it("propagates the BudgetCheck's dollar metrics into the spend-past-cap gate evaluation", async () => {
    fakeBudget.check.mockResolvedValue({
      ok: false,
      over: "project-daily-cost",
      detail: "daily cost cap reached ($12.00/$10.00)",
      metrics: { costUsd: 12, capUsd: 10 },
    });
    const result = await service.createTask({ text: "do the thing" });
    expect(result.outcome).toBe("scheduled");
    expect(fakeGates.evaluate).toHaveBeenCalledWith(
      [],
      expect.objectContaining({
        action: "spend-past-cap",
        metrics: { costUsd: 12, capUsd: 10 },
      }),
    );
  });

  it("evaluates the gate with no metrics on a plain run-count hold", async () => {
    fakeBudget.check.mockResolvedValue({
      ok: false,
      over: "project-daily",
      detail: "daily run cap reached (2/2)",
    });
    await service.createTask({ text: "do the thing" });
    expect(fakeGates.evaluate).toHaveBeenCalledWith(
      [],
      expect.objectContaining({ action: "spend-past-cap" }),
    );
    const call = fakeGates.evaluate.mock.calls.at(-1)?.[1] as { metrics?: unknown };
    expect(call.metrics).toBeUndefined();
  });

  describe("Phase 91 — subsystem dispatch (0/1/N owned pipelines)", () => {
    /** A minimal pipeline definition fixture — only the fields the resolver reads. */
    function pipelineDef(id: string, name: string) {
      return { id, name, ownerSubsystem: "forge", desc: "", phases: [] };
    }

    it("1 owned pipeline → direct dispatch, the classifier is NEVER called", async () => {
      pipelinesStore.list.mockResolvedValue([pipelineDef("delivery", "Delivery")]);
      const result = await service.createTask({
        text: "ship it",
        title: "Ship",
        target: { kind: "subsystem", id: "forge", name: "Forge" },
      });
      expect(result.outcome).toBe("dispatched");
      if (result.outcome !== "dispatched") return;
      expect(classifier.classify).not.toHaveBeenCalled();
      expect(classifier.classifyWithinSubsystem).not.toHaveBeenCalled();
      expect(pipelineRunner.start).toHaveBeenCalledWith(
        "delivery",
        result.task.id,
        undefined,
        [],
        undefined,
        undefined,
      );
      // The resolved target IS a concrete pipeline target — a subsystem target
      // never reaches persistence (its "via <subsystem>" attribution rides on the
      // dispatched pipeline's own `ownerSubsystem`, not a new run-level field).
      expect(result.task.target).toEqual({
        kind: "pipeline",
        id: "delivery",
        name: "Delivery",
        glyph: "flow",
        avatar: undefined,
      });
    });

    it("N owned pipelines → the classifier IS called, restricted to just the owned catalog", async () => {
      pipelinesStore.list.mockResolvedValue([
        pipelineDef("delivery", "Delivery"),
        pipelineDef("build-feature", "Build Feature"),
      ]);
      classifier.classifyWithinSubsystem.mockResolvedValue({
        target: { kind: "pipeline", id: "build-feature", name: "Build Feature" },
        confidence: 0.9,
        reason: "matched",
        matchedTerms: [],
        candidates: [],
        mode: "single",
        proposedGoal: null,
        paths: [],
      });
      const result = await service.createTask({
        text: "spec out the new feature",
        title: "Spec",
        target: { kind: "subsystem", id: "forge", name: "Forge" },
      });
      expect(result.outcome).toBe("dispatched");
      if (result.outcome !== "dispatched") return;
      expect(classifier.classify).not.toHaveBeenCalled();
      expect(classifier.classifyWithinSubsystem).toHaveBeenCalledWith(
        { text: "spec out the new feature", paths: [] },
        ["delivery", "build-feature"],
      );
      expect(pipelineRunner.start).toHaveBeenCalledWith(
        "build-feature",
        result.task.id,
        undefined,
        [],
        undefined,
        undefined,
      );
    });

    it("low-confidence N-owned verdict still lands INSIDE the subsystem, never the orchestrator (asserted via the classifier stub's own contract)", async () => {
      pipelinesStore.list.mockResolvedValue([
        pipelineDef("delivery", "Delivery"),
        pipelineDef("build-feature", "Build Feature"),
      ]);
      // classifyWithinSubsystem itself is responsible for the never-orchestrator
      // fallback rule (see task-classifier.service.test.ts's "low-confidence
      // fallback" case) — here we only assert the scheduler faithfully dispatches
      // whatever concrete pipeline target the scoped classify hands back.
      classifier.classifyWithinSubsystem.mockResolvedValue({
        target: { kind: "pipeline", id: "delivery", name: "Delivery" },
        confidence: 0,
        reason: "no confident match — first owned pipeline",
        matchedTerms: [],
        candidates: [],
        mode: "single",
        proposedGoal: null,
        paths: [],
      });
      const result = await service.createTask({
        text: "xyzzy — no signal",
        title: "T",
        target: { kind: "subsystem", id: "forge", name: "Forge" },
      });
      expect(result.outcome).toBe("dispatched");
      if (result.outcome !== "dispatched") return;
      expect(pipelineRunner.start).toHaveBeenCalledWith(
        "delivery",
        result.task.id,
        undefined,
        [],
        undefined,
        undefined,
      );
    });

    it("0 owned pipelines → rejects immediately with a clear Czech message — no task, no run, classifier never touched", async () => {
      pipelinesStore.list.mockResolvedValue([]);
      await expect(
        service.createTask({
          text: "do anything",
          title: "T",
          target: { kind: "subsystem", id: "forge", name: "Forge" },
        }),
      ).rejects.toThrow(/Forge.*nemá žádnou pipeline/);
      expect(classifier.classify).not.toHaveBeenCalled();
      expect(classifier.classifyWithinSubsystem).not.toHaveBeenCalled();
      expect(pipelineRunner.start).not.toHaveBeenCalled();
      expect(agentRunner.start).not.toHaveBeenCalled();
      expect(agentRunner.startOrchestrator).not.toHaveBeenCalled();
    });

    it("an explicit subsystem target never reaches the top-level classifier — 1-owned direct-dispatch path", async () => {
      // Belt-and-braces on top of the first test above: the scope guard's whole
      // point is that naming a subsystem is a hard override, structurally
      // incapable of falling through to the undirected top-level classify().
      pipelinesStore.list.mockResolvedValue([pipelineDef("delivery", "Delivery")]);
      await service.createTask({
        text: "ship it",
        title: "Ship",
        target: { kind: "subsystem", id: "forge", name: "Forge" },
      });
      expect(classifier.classify).not.toHaveBeenCalled();
    });
  });
});
