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
    // Phase 108 appended `toolGrants` as the FINAL positional arg — attachments
    // (`runAttachments`) is now the second-to-last.
    const lastArg = agentRunner.start.mock.calls.at(-1)?.at(-2);
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

  it("Phase 116b — a registered AttachmentSetRefProvider keeps its referenced set alive past the sweep", async () => {
    // No ScheduledTask references either set — a `task`-target automation's set
    // would otherwise age out between cron fires (it never becomes a ScheduledTask
    // until it actually dispatches). A contributor registered via the
    // ATTACHMENT_SET_REF_PROVIDER DI token exempts it (see attachment-set-refs.module.ts).
    for (const s of await attachmentStorage.listSetIds()) await attachmentStorage.remove(s.id);
    const orphan = (
      await attachmentStorage.save([{ originalname: "o.txt", size: 1, buffer: Buffer.from("x") }])
    ).attachmentSetId;
    const referencedByAutomation = (
      await attachmentStorage.save([{ originalname: "a.txt", size: 1, buffer: Buffer.from("y") }])
    ).attachmentSetId;
    const refProvider = { referencedSetIds: vi.fn(async () => [referencedByAutomation]) };
    const svcWithProvider = new TaskSchedulerService(
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
      { list: async () => [], get: async () => { throw new Error("no project"); } } as never,
      { resolveBudget: async () => undefined } as never,
      fakeBudget as never,
      { register: vi.fn(), requestApproval: async () => ({ id: "appr_x" }), reject: async () => {} } as never,
      fakeGates as never,
      fakeLimits as never,
      { handleTerminal: async () => null } as never,
      systemConfig,
      { name: async () => null } as never,
      attachmentStorage,
      [refProvider] as never,
    );

    const removed = await svcWithProvider.sweepOrphanAttachmentSets(Date.now() + 25 * 60 * 60 * 1000);

    expect(refProvider.referencedSetIds).toHaveBeenCalledTimes(1);
    expect(removed).toBe(1);
    expect(await attachmentStorage.list(orphan)).toEqual([]);
    expect(await attachmentStorage.list(referencedByAutomation)).toHaveLength(1);
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
      // The background path re-dispatches from the PERSISTED task record, whose
      // `toolGrants` defaults to `[]` (ScheduledTaskSchema) — not `undefined`.
      [],
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

describe("Task 3b — concurrent terminal handlers must not double-open a PR (finding #7)", () => {
  let dir: string;
  let storage: ScheduledTasksStorageService;
  let agentListener: ((run: AgentRun) => void) | undefined;
  let service: TaskSchedulerService;
  let openPrCalls: number;

  const RESET_AT = Date.parse("2026-06-13T04:30:00.000Z");

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "task-sched-race-"));
    storage = new ScheduledTasksStorageService(dir);
    await storage.onModuleInit();
    const attachmentStorage = new AttachmentStorageService();

    const agentRunner = {
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
    const pipelineRunner = {
      start: vi.fn(async () => pipelineRun({})),
      onRunStatus: vi.fn(() => () => {}),
      get: vi.fn(() => pipelineRun({})),
    };
    const pipelinesStore = { list: vi.fn(async () => []) };
    const goalRunner = {
      start: vi.fn(async () => ({ goalRunId: "goal_1" })),
      onRunStatus: vi.fn(() => () => {}),
      get: vi.fn(() => ({ goalRunId: "goal_1", status: "done", iterations: [] })),
    };
    const chainRunner = {
      start: vi.fn(async () => ({ chainRunId: "chain_1", steps: [] })),
      onRunStatus: vi.fn(() => () => {}),
      get: vi.fn(() => ({ chainRunId: "chain_1", status: "running", steps: [] })),
    };
    const classifier = {
      classify: vi.fn(async () => ({
        target: { kind: "agent", id: "writer", name: "Writer" },
        confidence: 0.9,
        reason: "match",
        matchedTerms: [],
        candidates: [{ kind: "agent", id: "writer", name: "Writer" }],
      })),
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
    const fakeResolved = { resolveBudget: async (p: { budget?: unknown }) => p.budget };
    const fakeBudget = {
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
    const fakeGates = { floor: async () => [], evaluate: vi.fn(() => ({ decision: "allow" })) };
    const fakeLimits = {
      windowExhausted: vi.fn(async () => ({ exhausted: false, resumeAt: null })),
      resolveResumeAt: vi.fn(async () => RESET_AT),
    };
    const activity = { record: vi.fn(async (_input: ActivityInput) => {}) };
    const systemConfig = fakeSystemConfigStore();

    // The double-open-PR race lives in the guard-read -> handleTerminal -> writeOutcome
    // sequence. A real `openPr` shells out to git/gh and is far slower than the guard
    // read either way; widen the window here with an explicit delay so the race is
    // deterministic under test instead of relying on incidental fs timing.
    openPrCalls = 0;
    const taskOutput = {
      handleTerminal: vi.fn(async () => {
        openPrCalls += 1;
        await new Promise((resolve) => setTimeout(resolve, 10));
        return {
          summary: "PR opened",
          pr: { url: `https://example.test/pr/${openPrCalls}`, additions: 1, deletions: 0 },
        };
      }),
    };

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
      taskOutput as never,
      systemConfig,
      { name: async () => null } as never,
      attachmentStorage,
    );
    service.onModuleInit();
  });

  afterEach(async () => {
    service.onModuleDestroy();
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("two concurrent terminal handlers for the same task open the PR exactly once", async () => {
    const result = await service.createTask({
      text: "ship the fix",
      title: "Fix",
      output: { type: "pr" },
    });
    if (result.outcome !== "dispatched") throw new Error("expected dispatched");
    const taskId = result.task.id;

    // Simulate finding #7's two racing terminal-handler entry points: the
    // `onRunStatus` fast path firing directly, racing a second pass over the same
    // taskId (e.g. `reconcileOutcome` via the boot sweep or a dispatch-adjacent
    // reconcile call). Both are fire-and-forget (`void this.writeAgentOutcome(...)`)
    // from the scheduler's own wiring, so firing the shared listener twice
    // back-to-back reproduces the same unserialized double-entry into
    // `writeAgentOutcome` without needing to expose the private method.
    agentListener?.(agentRun({ status: "done", taskId }));
    agentListener?.(agentRun({ status: "done", taskId }));

    await vi.waitFor(
      async () => {
        const task = await storage.get(taskId);
        expect(task.outcome?.status).toBe("done");
      },
      { timeout: 2000 },
    );
    // Let any second, racing write finish settling too before asserting counts.
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(openPrCalls).toBe(1);
    const task = await storage.get(taskId);
    expect(task.outcome?.pr?.url).toBe("https://example.test/pr/1");
  });
});

describe("Task 3c — project-capacity lock closes the maxConcurrent TOCTOU (#8) and the budget check→record race (#9)", () => {
  let dir: string;
  let storage: ScheduledTasksStorageService;
  let service: TaskSchedulerService;
  let agentRunner: {
    start: ReturnType<typeof vi.fn>;
    startOrchestrator: ReturnType<typeof vi.fn>;
    onRunStatus: ReturnType<typeof vi.fn>;
    get: ReturnType<typeof vi.fn>;
    readLog: ReturnType<typeof vi.fn>;
  };
  /** Runs currently "in flight" per the fake `agentRunner` — drives the fake `countRunning`. */
  let inFlight: number;

  const PROJECT_ID = "proj_1";
  const RESET_AT = Date.parse("2026-06-13T04:30:00.000Z");

  /**
   * Builds a scheduler wired to a single project (or none). `agentRunner.start`
   * marks the run "in flight" the moment it is CALLED (mirroring the real
   * `AgentRunnerService`: the process is spawned synchronously, before the promise
   * settles), then resolves one tick later (`setImmediate`) — a real, non-instant
   * async gap, wide enough that the PRE-FIX (unlocked) code reliably lets two
   * concurrent creates both read the stale "under cap" snapshot and both dispatch
   * under `Promise.all`, without needing any manually-controlled deferred/release
   * choreography in the test itself.
   */
  function makeService(project: { id: string; name: string; budget?: Record<string, unknown> } | null): {
    fakeBudget: {
      check: ReturnType<typeof vi.fn>;
      countRunning: ReturnType<typeof vi.fn>;
      recordDispatch: ReturnType<typeof vi.fn>;
      recordCost: ReturnType<typeof vi.fn>;
    };
    resumeRunner: (taskId: string) => void;
    onRunStatusListener: () => ((run: AgentRun) => void) | undefined;
  } {
    const pipelineRunner = {
      start: vi.fn(async () => pipelineRun({})),
      onRunStatus: vi.fn(() => () => {}),
      get: vi.fn(() => pipelineRun({})),
    };
    const pipelinesStore = { list: vi.fn(async () => []) };
    const goalRunner = {
      start: vi.fn(async () => ({ goalRunId: "goal_1" })),
      onRunStatus: vi.fn(() => () => {}),
      get: vi.fn(() => ({ goalRunId: "goal_1", status: "done", iterations: [] })),
    };
    const chainRunner = {
      start: vi.fn(async () => ({ chainRunId: "chain_1", steps: [] })),
      onRunStatus: vi.fn(() => () => {}),
      get: vi.fn(() => ({ chainRunId: "chain_1", status: "running", steps: [] })),
    };
    let runId = 0;
    let onRunStatusListener: ((run: AgentRun) => void) | undefined;
    agentRunner = {
      start: vi.fn(async () => {
        inFlight += 1;
        await new Promise<void>((resolve) => setImmediate(resolve));
        runId += 1;
        return agentRun({ runId: `writer_${runId}` });
      }),
      startOrchestrator: vi.fn(async () => agentRun({ agentId: "orchestrator" })),
      onRunStatus: vi.fn((l: (run: AgentRun) => void) => {
        onRunStatusListener = l;
        return () => {};
      }),
      get: vi.fn(() => agentRun({})),
      readLog: vi.fn(async () => ({ content: "", nextOffset: 0, done: true })),
    };
    const classifier = {
      classify: vi.fn(async () => ({
        target: { kind: "agent", id: "writer", name: "Writer" },
        confidence: 0.9,
        reason: "match",
        matchedTerms: [],
        candidates: [{ kind: "agent", id: "writer", name: "Writer" }],
      })),
      classifyWithinSubsystem: vi.fn(async () => {
        throw new Error("not exercised by this describe block");
      }),
    };
    const fakeProjects = {
      list: async () => (project ? [project] : []),
      get: async () => {
        if (!project) throw new Error("no project");
        return project;
      },
    };
    const fakeResolved = { resolveBudget: async (p: { budget?: unknown }) => p.budget };
    const fakeBudget = {
      check: vi.fn(async () => ({ ok: true }) as BudgetCheck),
      countRunning: vi.fn(async () => inFlight),
      recordDispatch: vi.fn(async () => {}),
      recordCost: vi.fn(async () => {}),
    };
    let registeredRunner: { resume: (taskId: string) => void; cancel: (taskId: string) => void } | undefined;
    const fakeApprovals = {
      register: vi.fn((_kind: string, runner: typeof registeredRunner) => {
        registeredRunner = runner;
      }),
      requestApproval: async () => ({ id: "appr_1" }),
      reject: async () => {},
    };
    const fakeGates = { floor: async () => [], evaluate: vi.fn(() => ({ decision: "allow" })) };
    const fakeLimits = {
      windowExhausted: vi.fn(async () => ({ exhausted: false, resumeAt: null })),
      resolveResumeAt: vi.fn(async () => RESET_AT),
    };
    const activity = { record: vi.fn(async (_input: ActivityInput) => {}) };
    const attachmentStorage = new AttachmentStorageService();

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
      { handleTerminal: async () => null } as never,
      fakeSystemConfigStore(),
      { name: async () => null } as never,
      attachmentStorage,
    );
    service.onModuleInit();
    return {
      fakeBudget,
      resumeRunner: (taskId: string) => registeredRunner?.resume(taskId),
      onRunStatusListener: () => onRunStatusListener,
    };
  }

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "task-sched-capacity-"));
    storage = new ScheduledTasksStorageService(dir);
    await storage.onModuleInit();
    inFlight = 0;
  });

  afterEach(async () => {
    service.onModuleDestroy();
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("maxConcurrent TOCTOU (#8): two concurrent background creates for a maxConcurrent=1 project dispatch exactly one, queue the other", async () => {
    makeService({ id: PROJECT_ID, name: "Proj", budget: { maxConcurrent: 1 } });

    const [a, b] = await Promise.all([
      service.createTask({ text: "do A", title: "A" }, undefined, PROJECT_ID, undefined, true),
      service.createTask({ text: "do B", title: "B" }, undefined, PROJECT_ID, undefined, true),
    ]);
    // The interactive path always returns fast, whichever way the race resolves —
    // proof neither call blocked on the other's real dispatch.
    expect(a.outcome).toBe("pending");
    expect(b.outcome).toBe("pending");

    await vi.waitFor(async () => {
      const [taskA, taskB] = await Promise.all([storage.get(a.task.id), storage.get(b.task.id)]);
      const statuses = [taskA.status, taskB.status].sort();
      expect(statuses).toEqual(["dispatched", "queued"]);
    });
    expect(agentRunner.start).toHaveBeenCalledTimes(1);
  });

  it("maxConcurrent TOCTOU (#8): two concurrent SYNCHRONOUS creates for a maxConcurrent=1 project dispatch exactly one, queue the other", async () => {
    makeService({ id: PROJECT_ID, name: "Proj", budget: { maxConcurrent: 1 } });

    const [a, b] = await Promise.all([
      service.createTask({ text: "do A", title: "A" }, undefined, PROJECT_ID),
      service.createTask({ text: "do B", title: "B" }, undefined, PROJECT_ID),
    ]);
    const outcomes = [a.outcome, b.outcome].sort();
    expect(outcomes).toEqual(["dispatched", "scheduled"]);
    const scheduled = a.outcome === "scheduled" ? a : b;
    if (scheduled.outcome !== "scheduled") throw new Error("unreachable");
    expect(scheduled.task.status).toBe("queued");
    expect(agentRunner.start).toHaveBeenCalledTimes(1);
  });

  it("budget check→record race (#9): N concurrent background creates against a daily cap of M dispatch exactly M and record exactly M ledger lines, holding the rest", async () => {
    const DAILY_CAP = 2;
    const N = 4;
    const { fakeBudget } = makeService({
      id: PROJECT_ID,
      name: "Proj",
      // maxConcurrent deliberately HIGHER than the daily cap (and higher than N) so
      // this test exercises ONLY the ledger race, not the concurrency-slot race
      // (#8's own test above already covers that).
      budget: { maxConcurrent: 10 },
    });
    let dailyCount = 0;
    fakeBudget.check.mockImplementation(async (projectId?: string) => {
      if (projectId === PROJECT_ID && dailyCount >= DAILY_CAP) {
        return {
          ok: false,
          over: "project-daily",
          detail: `daily run cap reached (${dailyCount}/${DAILY_CAP})`,
        };
      }
      return { ok: true };
    });
    fakeBudget.recordDispatch.mockImplementation(async () => {
      dailyCount += 1;
    });

    const results = await Promise.all(
      Array.from({ length: N }, (_, i) =>
        service.createTask({ text: `do ${i}`, title: `T${i}` }, undefined, PROJECT_ID, undefined, true),
      ),
    );
    for (const r of results) expect(r.outcome).toBe("pending");

    await vi.waitFor(async () => {
      const tasks = await Promise.all(results.map((r) => storage.get(r.task.id)));
      const dispatched = tasks.filter((t) => t.status === "dispatched");
      const held = tasks.filter((t) => t.status === "held");
      expect(dispatched).toHaveLength(DAILY_CAP);
      expect(held).toHaveLength(N - DAILY_CAP);
    });
    // The Critical finding's own proof: the ledger recorded exactly the cap, never
    // more — even though N (> the cap) concurrent creates all raced the check.
    expect(dailyCount).toBe(DAILY_CAP);
    expect(fakeBudget.recordDispatch).toHaveBeenCalledTimes(DAILY_CAP);
  });

  // NOTE: an optional 4th test ("releaseHeld vs. drainQueues") was attempted per the
  // brief's item 3, but was deliberately NOT kept. releaseHeld's path to its own
  // capacity check is naturally much shorter (one storage.get) than drainQueues' (a
  // full storage.list scan first), so firing them "concurrently" via fakes never
  // reliably reproduces the pre-fix race — even artificial one-tick delays on
  // storage.get did not make the test go RED against the unpatched code, so it would
  // have shipped as a non-regression-proving (and thus misleading) test. The
  // releaseHeld code fix itself IS in place (see task-scheduler.service.ts, wrapped in
  // the same withCapacityLock/guardExisting path exercised by the two tests above),
  // and it shares 100% of its guard logic with attemptDispatch's other caller
  // (drainQueues), which the mandatory tests above do exercise indirectly via
  // guardExisting. See task-3c-report.md for the full writeup.

  it("tick heartbeat path (finding #1): tick's dispatch of a due scheduled task racing dispatchPending's dispatch of a pending task, both for a maxConcurrent=1 project, dispatch exactly one and queue the other", async () => {
    const { fakeBudget } = makeService({
      id: PROJECT_ID,
      name: "Proj",
      budget: { maxConcurrent: 1 },
    });
    const project = { id: PROJECT_ID, name: "Proj", budget: { maxConcurrent: 1 } };
    const now = Date.now();

    // Task A: a due scheduled task for `tick` to fire. `storage.list()` is stubbed
    // to resolve it WITHOUT a real fs round-trip — the two race participants below
    // (tick's own attemptDispatch and a direct dispatchPending call) are otherwise
    // symmetric chains of fast fakes ending in the same `atCapacity`/`countRunning`
    // check, exactly like the two already-passing "two concurrent creates" tests
    // above; without stubbing `list()`, tick's one genuine disk read is enough
    // asymmetric latency to reliably let dispatchPending finish first and never
    // actually overlap the check, producing a false-negative green.
    const taskA = await storage.create(
      { text: "scheduled A", title: "A", scheduledAt: now - 1000 },
      new Date(now).toISOString(),
      PROJECT_ID,
    );
    vi.spyOn(storage, "list").mockResolvedValue([taskA]);

    // Task B: a `pending` task, persisted directly — mirrors exactly what
    // `attemptCreate`'s background branch leaves behind right before its own
    // (unawaited) `dispatchPending` call, isolating the finding to precisely the
    // two call sites in question (tick vs. dispatchPending) without the create-time
    // gate's own extra `project-capacity` acquisition in between.
    const taskB = await storage.createPending(
      storage.newId(),
      { text: "do B", title: "B" },
      PROJECT_ID,
      now,
    );

    // Even with `list()` stubbed, `tick`'s preamble (list → project fetch → limit
    // check) has more hops than a bare `dispatchPending` call, so — deterministically,
    // not just occasionally — dispatchPending would otherwise always reach its
    // capacity check first and finish before `tick` ever got there, never actually
    // overlapping it regardless of the fix under test. `budget.check` is the first
    // step BOTH paths' `guardExisting` shares: rendezvous there so both reach the
    // `atCapacity`/`countRunning` read at the same moment, reproducing the exact race
    // window findings #8/#9 are about. Pre-fix (unlocked) both `check` calls arrive
    // concurrently and pair up instantly. Post-fix, the lock fully serializes the two
    // callers — only one is ever in `guardExisting` at a time — so a lone arrival
    // falls through after a short timeout instead of hanging forever.
    let arrivals: Array<() => void> = [];
    fakeBudget.check.mockImplementation(async () => {
      await new Promise<void>((resolve) => {
        arrivals.push(resolve);
        if (arrivals.length >= 2) {
          const toRelease = arrivals;
          arrivals = [];
          for (const release of toRelease) release();
        } else {
          setTimeout(resolve, 50);
        }
      });
      return { ok: true } as BudgetCheck;
    });

    await Promise.all([
      service.tick(new Date(now)),
      (
        service as unknown as {
          dispatchPending: (
            task: typeof taskB,
            project: { id: string; name: string; budget?: Record<string, unknown> } | null,
            explicitTarget: undefined,
            titleAuto: boolean,
          ) => Promise<void>;
        }
      ).dispatchPending(taskB, project, undefined, false),
    ]);

    await vi.waitFor(async () => {
      const [a, b] = await Promise.all([storage.get(taskA.id), storage.get(taskB.id)]);
      const statuses = [a.status, b.status].sort();
      expect(statuses).toEqual(["dispatched", "queued"]);
    });
    // The finding's own proof: with a cap of 1, exactly one real dispatch may ever
    // happen across the tick fire and the racing dispatchPending call.
    expect(agentRunner.start).toHaveBeenCalledTimes(1);
  });

  it("T7 — two overlapping timer-driven ticks: the second is skipped while the first is in flight, so a due task is dispatched exactly once", async () => {
    // No maxConcurrent here — this regression is about TickingWatcherBase's
    // skip-if-in-flight guard on the timer-driven path itself (two `setInterval`
    // firings racing each other), not the T3c project-capacity lock exercised by
    // the test above. Before the guard, two independently-stale `storage.list()`
    // snapshots (the exact M-T3c-1 tick-overlap scenario) could each dispatch the
    // same due task; the guard now makes it structurally impossible for a second
    // `tick()` to even start while the first is still running.
    makeService({ id: PROJECT_ID, name: "Proj" });
    const now = Date.now();
    const taskA = await storage.create(
      { text: "scheduled A", title: "A", scheduledAt: now - 1000 },
      new Date(now).toISOString(),
      PROJECT_ID,
    );

    let resolveList: () => void = () => {};
    const listGate = new Promise<void>((resolve) => {
      resolveList = resolve;
    });
    const listSpy = vi.spyOn(storage, "list").mockImplementation(async () => {
      await listGate;
      return [taskA];
    });

    // Simulate two `setInterval` firings in quick succession via the base's
    // timer-driven entry point (not two direct `tick()` calls, which is exactly
    // the call-site distinction T7 closes).
    const guardedTick = () => (service as unknown as { guardedTick(): Promise<void> }).guardedTick();
    const first = guardedTick();
    const second = guardedTick();
    await second; // the skipped firing returns immediately, without re-entering tick()

    expect(listSpy).toHaveBeenCalledTimes(1); // tick()'s body ran only once so far

    resolveList();
    await first;

    await vi.waitFor(async () => {
      expect((await storage.get(taskA.id)).status).toBe("dispatched");
    });
    // The regression's own proof: exactly one real dispatch for the one due task,
    // even though two ticks "fired". (The separately-tracked uncapped-project
    // double-dispatch gap in `guardExisting`/`atCapacity` — see task-7-scope.md
    // §"task-scheduler nuance" — is a different call-path race and stays out of
    // scope for this guard; it isn't exercised here because only one `tick()` body
    // ever runs concurrently now.)
    expect(agentRunner.start).toHaveBeenCalledTimes(1);
  });
});
