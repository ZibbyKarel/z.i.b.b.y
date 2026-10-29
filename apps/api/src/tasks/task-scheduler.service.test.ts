import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { AgentRun, ScheduledTask, TaskTarget, WorkflowRun } from "@zibby/contracts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ActivityInput } from "../activity/activity-log.service";
import type { BudgetCheck } from "../budget/budget.service";
import { RunSlots } from "../run-slots/run-slots.service";
import { fakeSystemConfigStore } from "../system/system-config.fixture";
import { AttachmentStorageService } from "./attachment-storage.service";
import { ScheduledTasksStorageService } from "./scheduled-tasks.storage.service";
import {
  PR_ADDRESS_COMMENTS_ARTIFACT,
  PR_FIX_CI_ARTIFACT,
  PR_REBASE_ARTIFACT,
  PR_REPLIES_ARTIFACT,
  PR_REVIEW_ARTIFACT,
} from "./task-output.service";
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

function workflowRun(over: Partial<WorkflowRun>): WorkflowRun {
  return {
    workflowRunId: "release_1",
    workflowId: "release",
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
  let workflowListener: ((run: WorkflowRun) => void) | undefined;
  let agentRunner: {
    start: ReturnType<typeof vi.fn>;
    startOrchestrator: ReturnType<typeof vi.fn>;
    onRunStatus: ReturnType<typeof vi.fn>;
    get: ReturnType<typeof vi.fn>;
    readLog: ReturnType<typeof vi.fn>;
  };
  let workflowRunner: {
    start: ReturnType<typeof vi.fn>;
    onRunStatus: ReturnType<typeof vi.fn>;
    get: ReturnType<typeof vi.fn>;
    readArtifact: ReturnType<typeof vi.fn>;
  };
  let taskOutput: {
    handleTerminal: () => Promise<null>;
    parkPrReview: ReturnType<typeof vi.fn>;
    parkPrRebase: ReturnType<typeof vi.fn>;
    parkPrAddressComments: ReturnType<typeof vi.fn>;
    parkPrFixCi: ReturnType<typeof vi.fn>;
  };
  /** Phase 91: the workflow definition store, for department-target resolution
   *  (`department` lookup). Empty by default — no test in this file dispatches
   *  a department target; `task-scheduler.department-dispatch.test.ts` covers those. */
  let workflowsStore: { list: ReturnType<typeof vi.fn> };
  /** F2b — {@link TaskSchedulerService}'s owned-agents lookup for department resolution. */
  let agentsStore: { listActive: ReturnType<typeof vi.fn> };
  let goalRunner: {
    start: ReturnType<typeof vi.fn>;
    onRunStatus: ReturnType<typeof vi.fn>;
    get: ReturnType<typeof vi.fn>;
  };
  let classifier: {
    classify: ReturnType<typeof vi.fn>;
    /** Phase 91 — the department-scoped classify seam. */
    classifyWithinDepartment: ReturnType<typeof vi.fn>;
  };
  let fakeLimits: {
    windowExhausted: ReturnType<typeof vi.fn>;
    resolveResumeAt: ReturnType<typeof vi.fn>;
  };
  let fakeBudget: {
    maxConcurrent: () => Promise<number | undefined>;
    check: ReturnType<typeof vi.fn<(projectId?: string, now?: Date) => Promise<BudgetCheck>>>;
    recordDispatch: () => Promise<void>;
    recordCost: ReturnType<
      typeof vi.fn<
        (
          entry: {
            projectId: string;
            taskId?: string;
            runRef: string;
            kind: string;
            costUsd: number;
          },
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
  let fakeApprovals: Record<string, unknown>;

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
    workflowRunner = {
      start: vi.fn(async () => workflowRun({})),
      onRunStatus: vi.fn((l: (run: WorkflowRun) => void) => {
        workflowListener = l;
        return () => {};
      }),
      get: vi.fn(() => workflowRun({})),
      readArtifact: vi.fn(async () => null),
    };
    workflowsStore = { list: vi.fn(async () => []) };
    agentsStore = { listActive: vi.fn(async () => []) };
    goalRunner = {
      start: vi.fn(async () => ({ goalRunId: "goal_1" })),
      onRunStatus: vi.fn(() => () => {}),
      get: vi.fn(() => ({ goalRunId: "goal_1", status: "done", iterations: [] })),
    };
    classifier = {
      classify: vi.fn(async () => ({
        target: { kind: "agent", id: "writer", name: "Writer" },
        confidence: 0.9,
        reason: "match",
        matchedTerms: [],
        candidates: [{ kind: "agent", id: "writer", name: "Writer" }],
      })),
      // Phase 91: no test in THIS describe block dispatches a department target
      // (see the "Phase 91 — department dispatch" describe below); a call here
      // would be a scope-guard violation, so the default throws loudly rather
      // than silently returning something plausible.
      classifyWithinDepartment: vi.fn(async () => {
        throw new Error("classifyWithinDepartment should not be called by this describe block");
      }),
    };

    const fakeProjects = {
      list: async () => [],
      get: async () => {
        throw new Error("no project");
      },
    };
    fakeBudget = {
      check: vi.fn(async () => ({ ok: true }) as BudgetCheck),
      recordDispatch: async () => {},
      recordCost: vi.fn(async () => {}),
      maxConcurrent: vi.fn(async (): Promise<number | undefined> => undefined),
    };
    fakeApprovals = {
      register: vi.fn(),
      requestApproval: async () => ({ id: "appr_1" }),
      reject: async () => {},
      list: async () => [],
    };
    fakeGates = { floor: async () => [], evaluate: vi.fn(() => ({ decision: "allow" })) };
    // Limits double (Phase 9): headroom by default; a test flips windowExhausted to
    // exercise the limit guard. resolveResumeAt echoes a fixed near-future reset.
    fakeLimits = {
      windowExhausted: vi.fn(async () => ({ exhausted: false, resumeAt: null })),
      resolveResumeAt: vi.fn(async () => RESET_AT),
    };
    activity = { record: vi.fn(async (_input: ActivityInput) => {}) };

    taskOutput = {
      handleTerminal: async () => null,
      parkPrReview: vi.fn(async () => ({ summary: "parked" })),
      parkPrRebase: vi.fn(async () => ({ summary: "rebase parked" })),
      parkPrAddressComments: vi.fn(async () => ({ summary: "fixes parked" })),
      parkPrFixCi: vi.fn(async () => ({ summary: "ci fix parked" })),
    };
    service = new TaskSchedulerService(
      storage,
      classifier as never,
      agentRunner as never,
      workflowRunner as never,
      workflowsStore as never,
      agentsStore as never,
      new RunSlots(fakeSystemConfigStore()),
      goalRunner as never,
      fakeLogger as never,
      fakeTrace as never,
      activity as never,
      fakeProjects as never,
      fakeBudget as never,
      fakeApprovals as never,
      fakeGates as never,
      fakeLimits as never,
      // The output sink is exercised in task-output.service.test.ts; here it delivers
      // nothing (a `done` run with no chosen output) → returns null, normal outcome.
      taskOutput as never,
      (systemConfig = fakeSystemConfigStore()),
      // Namer double: returns null so title derivation falls back to the deterministic
      // slice (the Haiku CLI path never spawns under test).
      { name: async () => null } as never,
      attachmentStorage,
      // F6c watcher-health registry double — registration is exercised in the
      // base/e2e specs, not here.
      { register: () => {} } as never,
      undefined,
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
        reason: "No agent or workflow matched confidently",
        matchedTerms: ["deploy", "staging"],
        candidates: [],
      }));
    });

    it("records an orchestrator-fallback activity when the CLASSIFIER routes to the orchestrator", async () => {
      await service.createTask({ text: "Deploy to Staging!", title: "Deploy" });

      const call = activity.record.mock.calls.find(
        ([entry]) => entry.kind === "orchestrator-fallback",
      );
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

    it("does not record a fallback when the classifier routes to a real agent/workflow", async () => {
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

  it("passes attachments to the workflow dispatch (Spending audit)", async () => {
    const { attachmentSetId } = await attachmentStorage.save([
      { originalname: "a.pdf", size: 2, mimetype: "application/pdf", buffer: Buffer.from("hi") },
    ]);
    await service.createTask(
      {
        text: "use it",
        attachmentSetId,
        target: { kind: "workflow", id: "release", name: "Release" },
      },
      undefined,
      undefined,
      undefined,
      false,
    );
    const lastArg = workflowRunner.start.mock.calls.at(-1)?.at(-1);
    expect(lastArg).toMatchObject({ names: ["a.pdf"] });
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

  describe("todoId (a task created from a TODO note removes the note)", () => {
    function withTodo(todo: { remove: (id: string) => Promise<boolean> }, warn = vi.fn()) {
      const logger = { child: () => ({ info: vi.fn(), warn, error: vi.fn(), debug: vi.fn() }) };
      return new TaskSchedulerService(
        storage,
        classifier as never,
        agentRunner as never,
        workflowRunner as never,
        workflowsStore as never,
        agentsStore as never,
        new RunSlots(fakeSystemConfigStore()),
        goalRunner as never,
        logger as never,
        fakeTrace as never,
        activity as never,
        {
          list: async () => [],
          get: async () => {
            throw new Error("no project");
          },
        } as never,
        fakeBudget as never,
        fakeApprovals as never,
        fakeGates as never,
        fakeLimits as never,
        taskOutput as never,
        systemConfig,
        { name: async () => null } as never,
        attachmentStorage,
        { register: () => {} } as never,
        undefined,
        todo as never,
      );
    }

    it("removes the referenced note after the task is created", async () => {
      const remove = vi.fn(async () => true);
      const result = await withTodo({ remove }).createTask({
        text: "do the thing",
        title: "Thing",
        todoId: "todo_abc",
      });
      expect(result.outcome).toBeDefined();
      expect(remove).toHaveBeenCalledWith("todo_abc");
    });

    it("still creates the task when the note no longer exists", async () => {
      const remove = vi.fn(async () => false);
      const result = await withTodo({ remove }).createTask({
        text: "do the thing",
        title: "Thing",
        todoId: "todo_gone",
      });
      expect(result.outcome).toBeDefined();
      expect(remove).toHaveBeenCalledWith("todo_gone");
    });

    it("returns the created task and logs when the delete throws", async () => {
      const warn = vi.fn();
      const remove = vi.fn(async () => {
        throw new Error("disk full");
      });
      const result = await withTodo({ remove }, warn).createTask({
        text: "do the thing",
        title: "Thing",
        todoId: "todo_abc",
      });
      expect(result.outcome).toBeDefined();
      expect(warn).toHaveBeenCalled();
    });

    it("never touches the store without a todoId", async () => {
      const remove = vi.fn(async () => true);
      await withTodo({ remove }).createTask({ text: "do the thing", title: "Thing" });
      expect(remove).not.toHaveBeenCalled();
    });
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
      workflowRunner as never,
      workflowsStore as never,
      agentsStore as never,
      new RunSlots(fakeSystemConfigStore()),
      goalRunner as never,
      fakeLogger as never,
      fakeTrace as never,
      activity as never,
      {
        list: async () => [],
        get: async () => {
          throw new Error("no project");
        },
      } as never,
      fakeBudget as never,
      {
        register: vi.fn(),
        requestApproval: async () => ({ id: "appr_x" }),
        reject: async () => {},
      } as never,
      fakeGates as never,
      fakeLimits as never,
      { handleTerminal: async () => null } as never,
      systemConfig,
      { name: async () => null } as never,
      attachmentStorage,
      { register: () => {} } as never,
      [refProvider] as never,
    );

    const removed = await svcWithProvider.sweepOrphanAttachmentSets(
      Date.now() + 25 * 60 * 60 * 1000,
    );

    expect(refProvider.referencedSetIds).toHaveBeenCalledTimes(1);
    expect(removed).toBe(1);
    expect(await attachmentStorage.list(orphan)).toEqual([]);
    expect(await attachmentStorage.list(referencedByAutomation)).toHaveLength(1);
  });

  it("an explicit target on the wire bypasses the classifier entirely (DNA: explicit target overrides)", async () => {
    // N1: naming a workflow/agent is a hard override — the named unit runs and the
    // classifier is never consulted, so an explicit run is fully deterministic.
    const result = await service.createTask({
      text: "run exactly this",
      title: "Direct",
      target: { kind: "workflow", id: "release", name: "Release" },
    });
    expect(result.outcome).toBe("dispatched");
    if (result.outcome !== "dispatched") return;

    expect(classifier.classify).not.toHaveBeenCalled();
    expect(workflowRunner.start).toHaveBeenCalledWith(
      "release",
      result.task.id,
      undefined,
      [],
      undefined,
      undefined,
      expect.any(String),
      undefined,
      undefined,
    );
    expect(result.task.target).toEqual({ kind: "workflow", id: "release", name: "Release" });
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
      expect(task.error).toContain("No agents or workflows");
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
      expect(task.outcome).toMatchObject({
        status: "error",
        summary: "Běh přerušen — zastaven ručně nebo restartem API.",
      });
    });
  });

  it("names the rejected approval as the reason an interrupted agent run stopped", async () => {
    const result = await service.createTask({ text: "do" });
    if (result.outcome !== "dispatched") throw new Error("expected dispatched");
    const run = agentRun({ status: "interrupted", taskId: result.task.id });
    fakeApprovals.list = vi.fn(async () => [
      {
        runId: run.runId,
        action: "overwrite",
        detail: JSON.stringify({ summary: "Přepsat soubor" }),
        decidedAt: "2026-10-16T07:25:27.890Z",
      },
    ]);

    agentListener?.(run);
    await vi.waitFor(async () => {
      const task = await storage.get(result.task.id);
      expect(task.outcome).toMatchObject({
        status: "error",
        summary: "Zrušeno: zamítnutý approval „Přepsat soubor (overwrite)“",
      });
    });
  });

  it("maps a failed workflow to error with the stage tally as summary", async () => {
    classifier.classify.mockResolvedValue({
      target: { kind: "workflow", id: "release", name: "Release" },
      confidence: 0.9,
      reason: "match",
      matchedTerms: [],
      candidates: [{ kind: "workflow", id: "release", name: "Release" }],
    });
    const result = await service.createTask({ text: "ship it" });
    if (result.outcome !== "dispatched") throw new Error("expected dispatched");
    expect(workflowRunner.start).toHaveBeenCalledWith(
      "release",
      result.task.id,
      undefined,
      [],
      undefined,
      undefined,
      expect.any(String),
      undefined,
      undefined,
    );

    workflowListener?.(
      workflowRun({
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

  it("writes a cost line summed from stage costs on a terminal workflow run", async () => {
    const id = storage.newId();
    await storage.createDispatched(
      id,
      { text: "ship it" },
      "release_1",
      { kind: "workflow", id: "release", name: "Release" },
      Date.now(),
      "alpha",
    );
    workflowListener?.(
      workflowRun({
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
      kind: "workflow",
    });
    expect(call.costUsd).toBeCloseTo(0.35, 10);
  });

  it("does not write a cost line when no stage of the workflow run carries costUsd", async () => {
    const id = storage.newId();
    await storage.createDispatched(
      id,
      { text: "ship it" },
      "release_1",
      { kind: "workflow", id: "release", name: "Release" },
      Date.now(),
      "alpha",
    );
    workflowListener?.(
      workflowRun({
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

  describe("Phase 91 — department dispatch (0/1/N owned workflows)", () => {
    /** A minimal workflow definition fixture — only the fields the resolver reads. */
    function workflowDef(id: string, name: string) {
      // `outputs` mirrors `WorkflowSchema`'s `default([])` and declares a `pr` sink —
      // the resolver reads it to decide which units may serve a task that must open a
      // PR, and a fixture omitting it reached the resolver as `undefined`.
      return {
        id,
        name,
        department: "dev",
        desc: "",
        phases: [],
        outputs: [{ type: "pr", from: "out.md" }],
      };
    }

    it("1 owned workflow → direct dispatch, the classifier is NEVER called", async () => {
      workflowsStore.list.mockResolvedValue([workflowDef("delivery", "Delivery")]);
      const result = await service.createTask({
        text: "ship it",
        title: "Ship",
        target: { kind: "department", id: "dev", name: "Dev" },
      });
      expect(result.outcome).toBe("dispatched");
      if (result.outcome !== "dispatched") return;
      expect(classifier.classify).not.toHaveBeenCalled();
      expect(classifier.classifyWithinDepartment).not.toHaveBeenCalled();
      expect(workflowRunner.start).toHaveBeenCalledWith(
        "delivery",
        result.task.id,
        undefined,
        [],
        undefined,
        undefined,
        expect.any(String),
        undefined,
        undefined,
      );
      // The resolved target IS a concrete workflow target — a department target
      // never reaches persistence (its "via <department>" attribution rides on the
      // dispatched workflow's own `department`, not a new run-level field).
      expect(result.task.target).toEqual({
        kind: "workflow",
        id: "delivery",
        name: "Delivery",
        glyph: "flow",
        avatar: undefined,
      });
    });

    it("N owned workflows → the classifier IS called, restricted to just the owned catalog", async () => {
      workflowsStore.list.mockResolvedValue([
        workflowDef("delivery", "Delivery"),
        workflowDef("build-feature", "Build Feature"),
      ]);
      classifier.classifyWithinDepartment.mockResolvedValue({
        target: { kind: "workflow", id: "build-feature", name: "Build Feature" },
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
        target: { kind: "department", id: "dev", name: "Dev" },
      });
      expect(result.outcome).toBe("dispatched");
      if (result.outcome !== "dispatched") return;
      expect(classifier.classify).not.toHaveBeenCalled();
      expect(classifier.classifyWithinDepartment).toHaveBeenCalledWith(
        { text: "spec out the new feature", paths: [] },
        "dev",
      );
      expect(workflowRunner.start).toHaveBeenCalledWith(
        "build-feature",
        result.task.id,
        undefined,
        [],
        undefined,
        undefined,
        expect.any(String),
        undefined,
        undefined,
      );
    });

    it("low-confidence N-owned verdict still lands INSIDE the department, never the orchestrator (asserted via the classifier stub's own contract)", async () => {
      workflowsStore.list.mockResolvedValue([
        workflowDef("delivery", "Delivery"),
        workflowDef("build-feature", "Build Feature"),
      ]);
      // classifyWithinDepartment itself is responsible for the never-orchestrator
      // fallback rule (see task-classifier.service.test.ts's "low-confidence
      // fallback" case) — here we only assert the scheduler faithfully dispatches
      // whatever concrete workflow target the scoped classify hands back.
      classifier.classifyWithinDepartment.mockResolvedValue({
        target: { kind: "workflow", id: "delivery", name: "Delivery" },
        confidence: 0,
        reason: "no confident match — first owned workflow",
        matchedTerms: [],
        candidates: [],
        mode: "single",
        proposedGoal: null,
        paths: [],
      });
      const result = await service.createTask({
        text: "xyzzy — no signal",
        title: "T",
        target: { kind: "department", id: "dev", name: "Dev" },
      });
      expect(result.outcome).toBe("dispatched");
      if (result.outcome !== "dispatched") return;
      expect(workflowRunner.start).toHaveBeenCalledWith(
        "delivery",
        result.task.id,
        undefined,
        [],
        undefined,
        undefined,
        expect.any(String),
        undefined,
        undefined,
      );
    });

    it("0 owned workflows → rejects immediately with a clear Czech message — no task, no run, classifier never touched", async () => {
      workflowsStore.list.mockResolvedValue([]);
      await expect(
        service.createTask({
          text: "do anything",
          title: "T",
          target: { kind: "department", id: "dev", name: "Dev" },
        }),
      ).rejects.toThrow(/Dev.*nemá žádnou workflow/);
      expect(classifier.classify).not.toHaveBeenCalled();
      expect(classifier.classifyWithinDepartment).not.toHaveBeenCalled();
      expect(workflowRunner.start).not.toHaveBeenCalled();
      expect(agentRunner.start).not.toHaveBeenCalled();
      expect(agentRunner.startOrchestrator).not.toHaveBeenCalled();
    });

    it("an explicit department target never reaches the top-level classifier — 1-owned direct-dispatch path", async () => {
      // Belt-and-braces on top of the first test above: the scope guard's whole
      // point is that naming a department is a hard override, structurally
      // incapable of falling through to the undirected top-level classify().
      workflowsStore.list.mockResolvedValue([workflowDef("delivery", "Delivery")]);
      await service.createTask({
        text: "ship it",
        title: "Ship",
        target: { kind: "department", id: "dev", name: "Dev" },
      });
      expect(classifier.classify).not.toHaveBeenCalled();
    });
  });

  describe("F2b — owned agents widen the roster (workflows + active agents)", () => {
    /** A minimal workflow definition fixture — only the fields the resolver reads. */
    function workflowDef(id: string, name: string) {
      // `outputs` mirrors `WorkflowSchema`'s `default([])` and declares a `pr` sink —
      // the resolver reads it to decide which units may serve a task that must open a
      // PR, and a fixture omitting it reached the resolver as `undefined`.
      return {
        id,
        name,
        department: "dev",
        desc: "",
        phases: [],
        outputs: [{ type: "pr", from: "out.md" }],
      };
    }
    /** A minimal agent definition fixture — only the fields the resolver reads. */
    function agentDef(id: string, name: string) {
      return { id, name, department: "dev" };
    }

    it("1 owned agent, 0 owned workflows → direct dispatch to the agent, the classifier is NEVER called", async () => {
      workflowsStore.list.mockResolvedValue([]);
      agentsStore.listActive.mockResolvedValue([agentDef("coder", "Coder")]);
      const result = await service.createTask({
        text: "fix the bug",
        title: "Fix",
        target: { kind: "department", id: "dev", name: "Dev" },
      });
      expect(result.outcome).toBe("dispatched");
      if (result.outcome !== "dispatched") return;
      expect(classifier.classify).not.toHaveBeenCalled();
      expect(classifier.classifyWithinDepartment).not.toHaveBeenCalled();
      expect(agentRunner.start).toHaveBeenCalledWith(
        "coder",
        "fix the bug",
        "",
        [],
        "Fix",
        result.task.id,
        [],
        undefined,
        undefined,
        undefined,
      );
    });

    it("1 owned workflow + 1 owned agent (2 units) → classifyWithinDepartment is invoked, restricted to the owned catalog", async () => {
      workflowsStore.list.mockResolvedValue([workflowDef("delivery", "Delivery")]);
      agentsStore.listActive.mockResolvedValue([agentDef("coder", "Coder")]);
      classifier.classifyWithinDepartment.mockResolvedValue({
        target: { kind: "agent", id: "coder", name: "Coder" },
        confidence: 0.9,
        reason: "matched",
        matchedTerms: [],
        candidates: [],
        mode: "single",
        proposedGoal: null,
        paths: [],
      });
      const result = await service.createTask({
        text: "fix a small bug",
        title: "Fix",
        target: { kind: "department", id: "dev", name: "Dev" },
      });
      expect(result.outcome).toBe("dispatched");
      if (result.outcome !== "dispatched") return;
      expect(classifier.classifyWithinDepartment).toHaveBeenCalledWith(
        { text: "fix a small bug", paths: [] },
        "dev",
      );
      expect(agentRunner.start).toHaveBeenCalledWith(
        "coder",
        "fix a small bug",
        "",
        [],
        "Fix",
        result.task.id,
        [],
        undefined,
        undefined,
        undefined,
      );
    });
  });

  /**
   * The scheduler half of the required-PR-sink invariant. It mirrors
   * `TaskClassifierService.constrainByOutput` on purpose: a direct dispatch and the
   * scoped classifier must agree on what is even eligible, or a roadmap item that has
   * to open a PR could still resolve to an agent that cannot open one — the misroute
   * that put a pnpm/Turborepo monorepo skeleton on `documentation-engineer`.
   */
  describe("a required PR sink makes department resolution a workflow-only sizing choice", () => {
    function workflowDef(id: string, name: string, deliversPr = true, complexity = "standard") {
      return {
        id,
        name,
        department: "dev",
        desc: "",
        phases: [],
        complexity,
        outputs: deliversPr ? [{ type: "pr", from: "out.md" }] : [],
      };
    }
    function agentDef(id: string, name: string) {
      return { id, name, department: "dev" };
    }

    it("resolves to the sole PR-capable workflow WITHOUT classifying, even though the roster has 2 units", async () => {
      // One agent + one PR workflow is 2 owned units, so the old rule would classify.
      // The constraint leaves exactly one eligible unit, so there is nothing to ask.
      workflowsStore.list.mockResolvedValue([workflowDef("delivery", "Delivery")]);
      agentsStore.listActive.mockResolvedValue([agentDef("documentation-engineer", "Docs")]);
      const result = await service.createTask({
        text: "Monorepo & CLI skeleton — set up pnpm workspaces + Turborepo",
        title: "Skeleton",
        target: { kind: "department", id: "dev", name: "Dev" },
        output: { type: "pr" },
      });
      expect(result.outcome).toBe("dispatched");
      expect(classifier.classifyWithinDepartment).not.toHaveBeenCalled();
      expect(agentRunner.start).not.toHaveBeenCalled();
      expect(workflowRunner.start).toHaveBeenCalledWith(
        "delivery",
        expect.any(String),
        undefined,
        [],
        undefined,
        { type: "pr" },
        expect.any(String),
        undefined,
        undefined,
      );
    });

    it("passes the sink into classifyWithinDepartment when 2+ units stay eligible", async () => {
      workflowsStore.list.mockResolvedValue([
        workflowDef("quick-fix", "Quick Fix", true, "light"),
        workflowDef("delivery", "Delivery", true, "deep"),
      ]);
      agentsStore.listActive.mockResolvedValue([agentDef("documentation-engineer", "Docs")]);
      classifier.classifyWithinDepartment.mockResolvedValue({
        target: { kind: "workflow", id: "delivery", name: "Delivery" },
        confidence: 0.9,
        reason: "multi-surface scaffolding",
        matchedTerms: [],
        candidates: [],
        mode: "single",
        proposedGoal: null,
        paths: [],
      });
      await service.createTask({
        text: "prove the dev-loop mechanism on a real shop",
        title: "Spike",
        target: { kind: "department", id: "dev", name: "Dev" },
        output: { type: "pr" },
      });
      expect(classifier.classifyWithinDepartment).toHaveBeenCalledWith(
        {
          text: "prove the dev-loop mechanism on a real shop",
          paths: [],
          output: { type: "pr" },
        },
        "dev",
      );
    });

    it("ignores a workflow that declares no PR sink when picking the fallback unit", async () => {
      // `notes` is the CHEAPEST rung, so the unconstrained rule would name it. It
      // declares no `pr` output, so it is not eligible and `delivery` is the answer.
      workflowsStore.list.mockResolvedValue([
        workflowDef("notes", "Notes", false, "light"),
        workflowDef("delivery", "Delivery", true, "deep"),
      ]);
      agentsStore.listActive.mockResolvedValue([]);
      await service.createTask({
        text: "implement it",
        title: "Impl",
        target: { kind: "department", id: "dev", name: "Dev" },
        output: { type: "pr" },
      });
      expect(classifier.classifyWithinDepartment).not.toHaveBeenCalled();
      expect(workflowRunner.start).toHaveBeenCalledWith(
        "delivery",
        expect.any(String),
        undefined,
        [],
        undefined,
        { type: "pr" },
        expect.any(String),
        undefined,
        undefined,
      );
    });

    it("routes stage 2 on routingText, never on the framed text the run receives", async () => {
      // The roadmap gate's `text` carries a trust-boundary footer for the ACTOR; stage 2
      // must rank the item's own words instead, or the framing lands back in the haystack.
      workflowsStore.list.mockResolvedValue([
        workflowDef("quick-fix", "Quick Fix", true, "light"),
        workflowDef("delivery", "Delivery", true, "deep"),
      ]);
      agentsStore.listActive.mockResolvedValue([]);
      classifier.classifyWithinDepartment.mockResolvedValue({
        target: { kind: "workflow", id: "delivery", name: "Delivery" },
        confidence: 0.9,
        reason: "deep",
        matchedTerms: [],
        candidates: [],
        mode: "single",
        proposedGoal: null,
        paths: [],
      });
      await service.createTask({
        text: "Monorepo skeleton\n\n---\nZIBBY ROADMAP CONTEXT (system-generated …)\nEpic: Phase 0",
        routingText: "Monorepo skeleton",
        title: "Skeleton",
        target: { kind: "department", id: "dev", name: "Dev" },
        output: { type: "pr" },
      });
      expect(classifier.classifyWithinDepartment).toHaveBeenCalledWith(
        { text: "Monorepo skeleton", paths: [], output: { type: "pr" } },
        "dev",
      );
    });

    it("persists the stage-2 rationale on the trace, including the leg and the constraint", async () => {
      // The half of the trace that used to be discarded: `resolveDepartmentTargetOrNull`
      // returned `routing?.target ?? primary`, so the decision that picks the RUNNING
      // unit left no record — which is what made the original misroute undiagnosable.
      workflowsStore.list.mockResolvedValue([
        workflowDef("quick-fix", "Quick Fix", true, "light"),
        workflowDef("delivery", "Delivery", true, "deep"),
      ]);
      agentsStore.listActive.mockResolvedValue([agentDef("documentation-engineer", "Docs")]);
      classifier.classify.mockResolvedValue({
        target: { kind: "department", id: "dev", name: "Dev" },
        confidence: 0.8,
        reason: "delivery work",
        matchedTerms: ["code"],
        candidates: [],
        mode: "single",
        proposedGoal: null,
        paths: [],
        leg: "router",
      });
      classifier.classifyWithinDepartment.mockResolvedValue({
        target: { kind: "workflow", id: "delivery", name: "Delivery" },
        confidence: 0.86,
        reason: "multi-surface scaffolding",
        matchedTerms: [],
        candidates: [
          { kind: "workflow", id: "quick-fix", name: "Quick Fix" },
          { kind: "workflow", id: "delivery", name: "Delivery" },
        ],
        mode: "single",
        proposedGoal: null,
        paths: [],
        leg: "scorer",
      });
      const result = await service.createTask({
        text: "set up the monorepo skeleton",
        title: "Skeleton",
        output: { type: "pr" },
      });
      expect(result.outcome).toBe("dispatched");
      if (result.outcome !== "dispatched") return;
      expect(result.task.classification).toMatchObject({
        department: "dev",
        leg: "router",
        stage2: {
          target: { kind: "workflow", id: "delivery" },
          confidence: 0.86,
          reason: "multi-surface scaffolding",
          leg: "scorer",
          rankedCandidates: 2,
          constrainedBy: "pr-output",
        },
      });
    });

    it("without a PR sink the agent is still reachable — the constraint is what changes the outcome", async () => {
      workflowsStore.list.mockResolvedValue([]);
      agentsStore.listActive.mockResolvedValue([agentDef("documentation-engineer", "Docs")]);
      const result = await service.createTask({
        text: "write the API guide",
        title: "Docs",
        target: { kind: "department", id: "dev", name: "Dev" },
      });
      expect(result.outcome).toBe("dispatched");
      expect(agentRunner.start).toHaveBeenCalled();
    });
  });

  describe("F2a — switchboard department verdicts (soft stage-2 in dispatch(), never a hard error)", () => {
    /** A minimal workflow definition fixture — only the fields the resolver reads. */
    function workflowDef(id: string, name: string, department = "dev") {
      // See the `workflowDef` above on why `outputs` has to be present.
      return {
        id,
        name,
        department,
        desc: "",
        phases: [],
        outputs: [{ type: "pr", from: "out.md" }],
      };
    }

    it("non-empty roster: an undirected department verdict resolves to the owned workflow and dispatches to it", async () => {
      workflowsStore.list.mockResolvedValue([workflowDef("delivery", "Delivery")]);
      classifier.classify.mockResolvedValue({
        target: { kind: "department", id: "dev", name: "Dev" },
        confidence: 0.8,
        reason: "matches dev's mandate",
        matchedTerms: [],
        candidates: [],
      });
      const result = await service.createTask({ text: "ship the delivery workflow" });
      expect(result.outcome).toBe("dispatched");
      if (result.outcome !== "dispatched") return;
      // A non-empty roster with exactly one owned workflow resolves directly — the
      // scoped classifier is never called (mirrors the explicit-path 1-owned case).
      expect(classifier.classifyWithinDepartment).not.toHaveBeenCalled();
      expect(workflowRunner.start).toHaveBeenCalledWith(
        "delivery",
        result.task.id,
        undefined,
        [],
        undefined,
        undefined,
        expect.any(String),
        undefined,
        undefined,
      );
      expect(result.task.target).toEqual({
        kind: "workflow",
        id: "delivery",
        name: "Delivery",
        glyph: "flow",
        avatar: undefined,
      });
    });

    it("empty roster: falls back to the orchestrator (soft — never a 422/thrown error), persists ORCHESTRATOR_TARGET, and records orchestrator-fallback", async () => {
      workflowsStore.list.mockResolvedValue([]); // dev owns nothing right now
      classifier.classify.mockResolvedValue({
        target: { kind: "department", id: "dev", name: "Dev" },
        confidence: 0.6,
        reason: "matches dev's mandate",
        matchedTerms: [],
        candidates: [],
      });
      const result = await service.createTask({ text: "ship something" });
      expect(result.outcome).toBe("dispatched");
      if (result.outcome !== "dispatched") return;
      expect(classifier.classifyWithinDepartment).not.toHaveBeenCalled();
      expect(agentRunner.startOrchestrator).toHaveBeenCalled();
      expect(workflowRunner.start).not.toHaveBeenCalled();
      // The soft fallback persists the honest terminal target — never the raw
      // department verdict (that would be a lie: the department never ran anything).
      expect(result.task.target).toEqual({
        kind: "orchestrator",
        name: "Orchestrator",
        glyph: "compass",
      });
      expect(activity.record).toHaveBeenCalledWith(
        expect.objectContaining({ kind: "orchestrator-fallback" }),
      );
    });
  });

  describe("F2c — classification trace persists + activity carries department", () => {
    /** A minimal workflow definition fixture — only the fields the resolver reads. */
    function workflowDef(id: string, name: string, department = "dev") {
      // See the `workflowDef` above on why `outputs` has to be present.
      return {
        id,
        name,
        department,
        desc: "",
        phases: [],
        outputs: [{ type: "pr", from: "out.md" }],
      };
    }

    it("an undirected department verdict persists the full two-stage trace: stage1 is the raw department verdict, department is set, and the final target is the resolved concrete workflow", async () => {
      workflowsStore.list.mockResolvedValue([workflowDef("delivery", "Delivery")]);
      classifier.classify.mockResolvedValue({
        target: { kind: "department", id: "dev", name: "Dev" },
        confidence: 0.8,
        reason: "matches dev's mandate",
        matchedTerms: ["ship"],
        candidates: [],
      });
      const result = await service.createTask({ text: "ship the delivery workflow" });
      expect(result.outcome).toBe("dispatched");
      if (result.outcome !== "dispatched") return;
      expect(result.task.classification?.stage1).toEqual({
        kind: "department",
        id: "dev",
        name: "Dev",
      });
      expect(result.task.classification?.department).toBe("dev");
      expect(result.task.classification?.confidence).toBe(0.8);
      expect(result.task.classification?.matchedTerms).toEqual(["ship"]);
      expect(result.task.target?.kind).toBe("workflow");
      expect(activity.record).toHaveBeenCalledWith(
        expect.objectContaining({
          kind: "task-dispatched",
          refs: expect.objectContaining({ department: "dev" }),
        }),
      );
    });

    it("a directly-classified workflow target (no department delegation) persists a trace with NO department field, and the activity's department falls back to a guarded store read of the unit's own ownership", async () => {
      workflowsStore.list.mockResolvedValue([workflowDef("delivery", "Delivery", "dev")]);
      classifier.classify.mockResolvedValue({
        target: { kind: "workflow", id: "delivery", name: "Delivery" },
        confidence: 0.9,
        reason: "matched",
        matchedTerms: ["ship"],
        candidates: [],
      });
      const result = await service.createTask({ text: "ship the delivery workflow" });
      expect(result.outcome).toBe("dispatched");
      if (result.outcome !== "dispatched") return;
      expect(result.task.classification?.stage1).toEqual({
        kind: "workflow",
        id: "delivery",
        name: "Delivery",
      });
      expect(result.task.classification?.department).toBeUndefined();
      expect(activity.record).toHaveBeenCalledWith(
        expect.objectContaining({
          refs: expect.objectContaining({ department: "dev" }),
        }),
      );
    });

    it("an explicit target (bypasses classify entirely) persists NO classification trace", async () => {
      const result = await service.createTask({
        text: "write it",
        target: { kind: "agent", id: "writer", name: "Writer" },
      });
      expect(result.outcome).toBe("dispatched");
      if (result.outcome !== "dispatched") return;
      expect(result.task.classification).toBeUndefined();
    });
  });

  describe("PR-inbox rebase run (todo-11)", () => {
    async function seedRebase(): Promise<string> {
      const id = storage.newId();
      await storage.createDispatched(
        id,
        { text: "rebase" },
        "pr-rebase_1",
        { kind: "workflow", id: "pr-rebase", name: "pr-rebase" },
        Date.now(),
        "alpha",
      );
      await storage.setPrRebase(id, () => ({
        repo: "acme/app",
        number: 7,
        url: "https://github.com/acme/app/pull/7",
        head: "feat",
        base: "main",
        headSha: "abc",
        conflictAtStart: false,
        state: "running",
      }));
      return id;
    }
    const rebaseRun = (taskId: string, status: WorkflowRun["status"]) =>
      workflowRun({
        workflowRunId: "pr-rebase_1",
        workflowId: "pr-rebase",
        status,
        taskId,
        workspace: { branch: "zibby/pr-rebase_1", path: "/wt", baseRef: "main" },
      });

    it("a done run hands the report and the worktree to parkPrRebase", async () => {
      const id = await seedRebase();
      workflowRunner.readArtifact.mockResolvedValue({
        name: PR_REBASE_ARTIFACT,
        content: "Conflicts: none",
      });
      workflowListener?.(rebaseRun(id, "done"));
      await vi.waitFor(async () => {
        expect((await storage.get(id)).outcome).toBeDefined();
      });
      expect(workflowRunner.readArtifact).toHaveBeenCalledWith("pr-rebase_1", PR_REBASE_ARTIFACT);
      expect(taskOutput.parkPrRebase).toHaveBeenCalledWith(
        expect.objectContaining({ id }),
        "Conflicts: none",
        "/wt",
      );
      expect((await storage.get(id)).outcome?.summary).toBe("rebase parked");
    });

    it("a stopped rebase run writes an error outcome so the row reads failed", async () => {
      const id = await seedRebase();
      workflowListener?.(rebaseRun(id, "interrupted"));
      await vi.waitFor(async () => {
        expect((await storage.get(id)).outcome?.status).toBe("error");
      });
      expect(taskOutput.parkPrRebase).not.toHaveBeenCalled();
    });
  });

  describe("PR-inbox address-comments run (PR inbox redesign)", () => {
    async function seedFix(): Promise<string> {
      const id = storage.newId();
      await storage.createDispatched(
        id,
        { text: "address" },
        "pr-address-comments_1",
        { kind: "workflow", id: "pr-address-comments", name: "pr-address-comments" },
        Date.now(),
        "alpha",
      );
      await storage.setPrAddressComments(id, () => ({
        repo: "acme/app",
        number: 7,
        url: "https://github.com/acme/app/pull/7",
        head: "feat",
        base: "main",
        headSha: "abc",
        state: "running",
      }));
      return id;
    }
    const fixRun = (taskId: string, status: WorkflowRun["status"]) =>
      workflowRun({
        workflowRunId: "pr-address-comments_1",
        workflowId: "pr-address-comments",
        status,
        taskId,
        workspace: { branch: "zibby/pr-address-comments_1", path: "/wt", baseRef: "main" },
      });

    it("a done run hands the report and the worktree to parkPrAddressComments", async () => {
      const id = await seedFix();
      workflowRunner.readArtifact.mockImplementation(async (_run: string, name: string) => ({
        name,
        content: name === PR_REPLIES_ARTIFACT ? "[]" : "Addressed: all",
      }));
      workflowListener?.(fixRun(id, "done"));
      await vi.waitFor(async () => {
        expect((await storage.get(id)).outcome).toBeDefined();
      });
      expect(workflowRunner.readArtifact).toHaveBeenCalledWith(
        "pr-address-comments_1",
        PR_ADDRESS_COMMENTS_ARTIFACT,
      );
      expect(taskOutput.parkPrAddressComments).toHaveBeenCalledWith(
        expect.objectContaining({ id }),
        "Addressed: all",
        "/wt",
        "[]",
      );
      expect(taskOutput.parkPrRebase).not.toHaveBeenCalled();
      expect((await storage.get(id)).outcome?.summary).toBe("fixes parked");
    });

    it("a missing reply file never blocks the park (replies = undefined)", async () => {
      const id = await seedFix();
      workflowRunner.readArtifact.mockImplementation(async (_run: string, name: string) => {
        if (name === PR_REPLIES_ARTIFACT) throw new Error("ENOENT");
        return { name, content: "Addressed: partial" };
      });
      workflowListener?.(fixRun(id, "done"));
      await vi.waitFor(async () => {
        expect((await storage.get(id)).outcome).toBeDefined();
      });
      expect(taskOutput.parkPrAddressComments).toHaveBeenCalledWith(
        expect.objectContaining({ id }),
        "Addressed: partial",
        "/wt",
        undefined,
      );
    });

    it("a stopped address-comments run writes an error outcome and parks nothing", async () => {
      const id = await seedFix();
      workflowListener?.(fixRun(id, "interrupted"));
      await vi.waitFor(async () => {
        expect((await storage.get(id)).outcome?.status).toBe("error");
      });
      expect(taskOutput.parkPrAddressComments).not.toHaveBeenCalled();
    });

    it("a park that throws marks the task failed instead of leaving it running", async () => {
      const id = await seedFix();
      taskOutput.parkPrAddressComments.mockRejectedValueOnce(new Error("boom"));
      workflowRunner.readArtifact.mockResolvedValue({ name: "x", content: "Addressed: all" });
      workflowListener?.(fixRun(id, "done"));
      await vi.waitFor(async () => {
        expect((await storage.get(id)).prAddressComments).toMatchObject({
          state: "failed",
          note: "park failed",
        });
      });
    });
  });

  describe("PR-inbox fix-ci run", () => {
    async function seedCi(): Promise<string> {
      const id = storage.newId();
      await storage.createDispatched(
        id,
        { text: "fix ci" },
        "pr-fix-ci_1",
        { kind: "workflow", id: "pr-fix-ci", name: "pr-fix-ci" },
        Date.now(),
        "alpha",
      );
      await storage.setPrFixCi(id, () => ({
        repo: "acme/app",
        number: 7,
        url: "https://github.com/acme/app/pull/7",
        head: "feat",
        base: "main",
        headSha: "abc",
        state: "running",
      }));
      return id;
    }
    const ciRun = (taskId: string, status: WorkflowRun["status"]) =>
      workflowRun({
        workflowRunId: "pr-fix-ci_1",
        workflowId: "pr-fix-ci",
        status,
        taskId,
        workspace: { branch: "zibby/pr-fix-ci_1", path: "/wt", baseRef: "main" },
      });

    it("a done pr-fix-ci run parks via parkPrFixCi", async () => {
      const id = await seedCi();
      workflowRunner.readArtifact.mockResolvedValue({ name: "x", content: "Fixed: all" });
      workflowListener?.(ciRun(id, "done"));
      await vi.waitFor(async () => {
        expect((await storage.get(id)).outcome).toBeDefined();
      });
      expect(workflowRunner.readArtifact).toHaveBeenCalledWith("pr-fix-ci_1", PR_FIX_CI_ARTIFACT);
      expect(taskOutput.parkPrFixCi).toHaveBeenCalledWith(
        expect.objectContaining({ id }),
        "Fixed: all",
        "/wt",
      );
      expect((await storage.get(id)).outcome?.summary).toBe("ci fix parked");
    });

    it("a stopped pr-fix-ci run writes an error outcome so the row reads failed", async () => {
      const id = await seedCi();
      workflowListener?.(ciRun(id, "interrupted"));
      await vi.waitFor(async () => {
        expect((await storage.get(id)).outcome?.status).toBe("error");
      });
      expect(taskOutput.parkPrFixCi).not.toHaveBeenCalled();
    });

    it("a park that throws marks the task failed instead of leaving it running", async () => {
      const id = await seedCi();
      taskOutput.parkPrFixCi.mockRejectedValueOnce(new Error("boom"));
      workflowRunner.readArtifact.mockResolvedValue({ name: "x", content: "Fixed: all" });
      workflowListener?.(ciRun(id, "done"));
      await vi.waitFor(async () => {
        expect((await storage.get(id)).prFixCi).toMatchObject({
          state: "failed",
          note: "park failed",
        });
      });
    });
  });

  describe("PR-inbox review run as a workflow (todo-4)", () => {
    async function seedReview(): Promise<string> {
      const id = storage.newId();
      await storage.createDispatched(
        id,
        { text: "review" },
        "pr-review-thorough_1",
        { kind: "workflow", id: "pr-review-thorough", name: "pr-review-thorough" },
        Date.now(),
        "alpha",
      );
      await storage.setPrReview(id, () => ({
        repo: "acme/app",
        number: 7,
        url: "https://github.com/acme/app/pull/7",
        state: "running",
      }));
      return id;
    }
    const done = (taskId: string) =>
      workflowRun({
        workflowRunId: "pr-review-thorough_1",
        workflowId: "pr-review-thorough",
        status: "done",
        taskId,
      });

    it("parks the final phase's review artifact and folds its summary into the outcome", async () => {
      const id = await seedReview();
      workflowRunner.readArtifact.mockResolvedValue({
        name: PR_REVIEW_ARTIFACT,
        content: "## Review\n\nbug at a.ts:3",
      });
      workflowListener?.(done(id));
      await vi.waitFor(async () => {
        expect((await storage.get(id)).outcome).toBeDefined();
      });
      expect(workflowRunner.readArtifact).toHaveBeenCalledWith(
        "pr-review-thorough_1",
        PR_REVIEW_ARTIFACT,
      );
      expect(taskOutput.parkPrReview).toHaveBeenCalledWith(
        expect.objectContaining({ id }),
        "## Review\n\nbug at a.ts:3",
        undefined,
        undefined,
      );
      expect((await storage.get(id)).outcome?.summary).toBe("parked");
    });

    it("passes the approved final gate on, so the review posts on that sign-off", async () => {
      const id = await seedReview();
      workflowRunner.readArtifact.mockResolvedValue({ name: PR_REVIEW_ARTIFACT, content: "x" });
      workflowListener?.({ ...done(id), approvedFinalGate: "comment" });
      await vi.waitFor(async () => {
        expect((await storage.get(id)).outcome).toBeDefined();
      });
      expect(taskOutput.parkPrReview).toHaveBeenCalledWith(
        expect.objectContaining({ id }),
        "x",
        "comment",
        undefined,
      );
    });

    it("todo-10: passes the operator's gate pick on to parkPrReview", async () => {
      const id = await seedReview();
      workflowRunner.readArtifact.mockResolvedValue({ name: PR_REVIEW_ARTIFACT, content: "x" });
      workflowListener?.({
        ...done(id),
        approvedFinalGate: "comment",
        approvedReviewEvent: "APPROVE",
      });
      await vi.waitFor(async () => {
        expect((await storage.get(id)).outcome).toBeDefined();
      });
      expect(taskOutput.parkPrReview).toHaveBeenCalledWith(
        expect.objectContaining({ id }),
        "x",
        "comment",
        "APPROVE",
      );
    });

    it("a missing artifact still goes through parkPrReview (which fails the review)", async () => {
      const id = await seedReview();
      workflowListener?.(done(id));
      await vi.waitFor(async () => {
        expect((await storage.get(id)).outcome).toBeDefined();
      });
      expect(taskOutput.parkPrReview).toHaveBeenCalledWith(
        expect.objectContaining({ id }),
        "",
        undefined,
        undefined,
      );
    });

    it("parks once when the done event arrives twice", async () => {
      const id = await seedReview();
      workflowRunner.readArtifact.mockResolvedValue({ name: PR_REVIEW_ARTIFACT, content: "x" });
      taskOutput.parkPrReview.mockImplementation(async (task: ScheduledTask) => {
        await storage.setPrReview(task.id, (c) => (c ? { ...c, state: "awaiting-approval" } : c));
        return { summary: "parked" };
      });
      workflowListener?.(done(id));
      workflowListener?.(done(id));
      await vi.waitFor(async () => {
        expect((await storage.get(id)).outcome).toBeDefined();
      });
      await vi.waitFor(() => expect(taskOutput.parkPrReview).toHaveBeenCalledTimes(1));
      expect(taskOutput.parkPrReview).toHaveBeenCalledTimes(1);
    });

    it("a failed workflow run parks nothing", async () => {
      const id = await seedReview();
      workflowListener?.({ ...done(id), status: "failed" });
      await vi.waitFor(async () => {
        expect((await storage.get(id)).outcome?.status).toBe("error");
      });
      expect(taskOutput.parkPrReview).not.toHaveBeenCalled();
    });

    it("an interrupted review run writes an error outcome", async () => {
      const id = await seedReview();
      workflowListener?.({ ...done(id), status: "interrupted" });
      await vi.waitFor(async () => {
        expect((await storage.get(id)).outcome?.status).toBe("error");
      });
      expect(taskOutput.parkPrReview).not.toHaveBeenCalled();
    });

    it("an interrupted non-review workflow writes no outcome", async () => {
      const id = storage.newId();
      await storage.createDispatched(
        id,
        { text: "ship it" },
        "release_1",
        { kind: "workflow", id: "release", name: "Release" },
        Date.now(),
        "alpha",
      );
      workflowListener?.(workflowRun({ status: "interrupted", taskId: id }));
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect((await storage.get(id)).outcome).toBeUndefined();
    });

    it("a park that throws marks the review failed", async () => {
      const id = await seedReview();
      taskOutput.parkPrReview.mockRejectedValue(new Error("approvals down"));
      workflowListener?.(done(id));
      await vi.waitFor(async () => {
        expect((await storage.get(id)).prReview?.state).toBe("failed");
      });
    });

    it("a workflow task without prReview never reads the artifact", async () => {
      const id = storage.newId();
      await storage.createDispatched(
        id,
        { text: "ship it" },
        "release_1",
        { kind: "workflow", id: "release", name: "Release" },
        Date.now(),
        "alpha",
      );
      workflowListener?.(workflowRun({ status: "done", taskId: id }));
      await vi.waitFor(async () => {
        expect((await storage.get(id)).outcome).toBeDefined();
      });
      expect(workflowRunner.readArtifact).not.toHaveBeenCalled();
      expect(taskOutput.parkPrReview).not.toHaveBeenCalled();
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
    const workflowRunner = {
      start: vi.fn(async () => workflowRun({})),
      onRunStatus: vi.fn(() => () => {}),
      get: vi.fn(() => workflowRun({})),
    };
    const workflowsStore = { list: vi.fn(async () => []) };
    const agentsStore = { listActive: vi.fn(async () => []) };
    const goalRunner = {
      start: vi.fn(async () => ({ goalRunId: "goal_1" })),
      onRunStatus: vi.fn(() => () => {}),
      get: vi.fn(() => ({ goalRunId: "goal_1", status: "done", iterations: [] })),
    };
    const classifier = {
      classify: vi.fn(async () => ({
        target: { kind: "agent", id: "writer", name: "Writer" },
        confidence: 0.9,
        reason: "match",
        matchedTerms: [],
        candidates: [{ kind: "agent", id: "writer", name: "Writer" }],
      })),
      classifyWithinDepartment: vi.fn(async () => {
        throw new Error("classifyWithinDepartment should not be called by this describe block");
      }),
    };
    const fakeProjects = {
      list: async () => [],
      get: async () => {
        throw new Error("no project");
      },
    };
    const fakeBudget = {
      check: vi.fn(async () => ({ ok: true }) as BudgetCheck),
      recordDispatch: async () => {},
      recordCost: vi.fn(async () => {}),
      maxConcurrent: vi.fn(async (): Promise<number | undefined> => undefined),
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
      workflowRunner as never,
      workflowsStore as never,
      agentsStore as never,
      new RunSlots(fakeSystemConfigStore()),
      goalRunner as never,
      fakeLogger as never,
      fakeTrace as never,
      activity as never,
      fakeProjects as never,
      fakeBudget as never,
      fakeApprovals as never,
      fakeGates as never,
      fakeLimits as never,
      taskOutput as never,
      systemConfig,
      { name: async () => null } as never,
      attachmentStorage,
      // F6c watcher-health registry double — registration is exercised in the
      // base/e2e specs, not here.
      { register: () => {} } as never,
      undefined,
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

describe("Task 3c — project-capacity lock closes the budget check→record race (#9); run slots cannot be raced (#8)", () => {
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

  const PROJECT_ID = "proj_1";
  const RESET_AT = Date.parse("2026-06-13T04:30:00.000Z");

  /**
   * Builds a scheduler wired to a single project (or none), with a run-slot cap of
   * `maxConcurrentRuns`. `agentRunner.start` resolves one tick later (`setImmediate`)
   * — a real, non-instant async gap, wide enough that an unserialized check→record
   * would let two concurrent creates both read a stale snapshot under `Promise.all`.
   */
  function makeService(
    project: { id: string; name: string; budget?: Record<string, unknown> } | null,
    maxConcurrentRuns = 1000,
  ): {
    fakeBudget: {
      check: ReturnType<typeof vi.fn>;
      recordDispatch: ReturnType<typeof vi.fn>;
      recordCost: ReturnType<typeof vi.fn>;
    };
    resumeRunner: (taskId: string) => void;
    onRunStatusListener: () => ((run: AgentRun) => void) | undefined;
  } {
    const workflowRunner = {
      start: vi.fn(async () => workflowRun({})),
      onRunStatus: vi.fn(() => () => {}),
      get: vi.fn(() => workflowRun({})),
    };
    const workflowsStore = { list: vi.fn(async () => []) };
    const agentsStore = { listActive: vi.fn(async () => []) };
    const goalRunner = {
      start: vi.fn(async () => ({ goalRunId: "goal_1" })),
      onRunStatus: vi.fn(() => () => {}),
      get: vi.fn(() => ({ goalRunId: "goal_1", status: "done", iterations: [] })),
    };
    let runId = 0;
    let onRunStatusListener: ((run: AgentRun) => void) | undefined;
    agentRunner = {
      start: vi.fn(async () => {
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
      classifyWithinDepartment: vi.fn(async () => {
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
    const fakeBudget = {
      check: vi.fn(async () => ({ ok: true }) as BudgetCheck),
      recordDispatch: vi.fn(async () => {}),
      recordCost: vi.fn(async () => {}),
      maxConcurrent: vi.fn(async (): Promise<number | undefined> => undefined),
    };
    let registeredRunner:
      | { resume: (taskId: string) => void; cancel: (taskId: string) => void }
      | undefined;
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
      workflowRunner as never,
      workflowsStore as never,
      agentsStore as never,
      new RunSlots(fakeSystemConfigStore({ maxConcurrentRuns })),
      goalRunner as never,
      fakeLogger as never,
      fakeTrace as never,
      activity as never,
      fakeProjects as never,
      fakeBudget as never,
      fakeApprovals as never,
      fakeGates as never,
      fakeLimits as never,
      { handleTerminal: async () => null } as never,
      fakeSystemConfigStore(),
      { name: async () => null } as never,
      attachmentStorage,
      // F6c watcher-health registry double — registration is exercised in the
      // base/e2e specs, not here.
      { register: () => {} } as never,
      undefined,
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
  });

  afterEach(async () => {
    service.onModuleDestroy();
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("slot TOCTOU (#8): two concurrent background creates under a global cap of 1 dispatch exactly one, queue the other", async () => {
    makeService({ id: PROJECT_ID, name: "Proj" }, 1);

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

  it("slot TOCTOU (#8): two concurrent SYNCHRONOUS creates under a global cap of 1 dispatch exactly one, queue the other", async () => {
    makeService({ id: PROJECT_ID, name: "Proj" }, 1);

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
    const { fakeBudget } = makeService({ id: PROJECT_ID, name: "Proj" });
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
        service.createTask(
          { text: `do ${i}`, title: `T${i}` },
          undefined,
          PROJECT_ID,
          undefined,
          true,
        ),
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

  it("an immediate task over budget is still held behind approval", async () => {
    const { fakeBudget } = makeService({ id: PROJECT_ID, name: "Proj" }, 1);
    fakeBudget.check.mockResolvedValue({
      ok: false,
      over: "project-daily",
      detail: "daily run cap reached",
    });
    const r = await service.createTask(
      { text: "now", title: "now", immediate: true },
      undefined,
      PROJECT_ID,
    );
    expect(r.outcome).toBe("scheduled");
    expect(r.task.status).toBe("held");
  });

  it("tick heartbeat path (finding #1): tick's dispatch of a due scheduled task racing dispatchPending's dispatch of a pending task, both under a global cap of 1, dispatch exactly one and queue the other", async () => {
    const { fakeBudget } = makeService({ id: PROJECT_ID, name: "Proj" }, 1);
    const project = { id: PROJECT_ID, name: "Proj" };
    const now = Date.now();

    // Task A: a due scheduled task for `tick` to fire. `storage.list()` is stubbed
    // to resolve it WITHOUT a real fs round-trip — the two race participants below
    // (tick's own attemptDispatch and a direct dispatchPending call) are otherwise
    // symmetric chains of fast fakes ending in the same staffing check, exactly like the two already-passing "two concurrent creates" tests
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
    // staffing check at the same moment, reproducing the exact race
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
    // The finding's own proof: with a global cap of 1, exactly one real dispatch may ever
    // happen across the tick fire and the racing dispatchPending call.
    expect(agentRunner.start).toHaveBeenCalledTimes(1);
  });

  it("tick skips a task cancelled after its list() snapshot", async () => {
    makeService({ id: PROJECT_ID, name: "Proj" });
    const now = Date.now();
    const task = await storage.create(
      { text: "scheduled A", title: "A", scheduledAt: now - 1000 },
      new Date(now).toISOString(),
      PROJECT_ID,
    );
    // The snapshot still says `scheduled`; the cancel lands before tick takes the lock.
    vi.spyOn(storage, "list").mockImplementation(async () => {
      const snapshot = [task];
      await storage.cancel(task.id);
      return snapshot;
    });

    expect(await service.tick(new Date(now))).toEqual([]);
    expect(agentRunner.start).not.toHaveBeenCalled();
    expect((await storage.get(task.id)).status).toBe("cancelled");
  });

  it("T7 — two overlapping timer-driven ticks: the second is skipped while the first is in flight, so a due task is dispatched exactly once", async () => {
    // No run-slot cap here — this regression is about TickingWatcherBase's
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
    const guardedTick = () =>
      (service as unknown as { guardedTick(): Promise<void> }).guardedTick();
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
    // double-dispatch gap in `guardExisting` — see task-7-scope.md
    // §"task-scheduler nuance" — is a different call-path race and stays out of
    // scope for this guard; it isn't exercised here because only one `tick()` body
    // ever runs concurrently now.)
    expect(agentRunner.start).toHaveBeenCalledTimes(1);
  });
});

describe("run slots (global + per-project cap)", () => {
  let dir: string;
  let storage: ScheduledTasksStorageService;
  let service: TaskSchedulerService;
  let slots: RunSlots;
  let agentListener: ((run: AgentRun) => void) | undefined;
  let workflowListener: ((run: WorkflowRun) => void) | undefined;
  let goalListener: ((run: { goalRunId: string; status: string }) => void) | undefined;
  let agentRunner: {
    start: ReturnType<typeof vi.fn>;
    startOrchestrator: ReturnType<typeof vi.fn>;
    onRunStatus: ReturnType<typeof vi.fn>;
    get: ReturnType<typeof vi.fn>;
    readLog: ReturnType<typeof vi.fn>;
    rerun: ReturnType<typeof vi.fn>;
  };
  let workflowRunner: {
    start: ReturnType<typeof vi.fn>;
    continueFailed: ReturnType<typeof vi.fn>;
    onRunStatus: ReturnType<typeof vi.fn>;
    get: ReturnType<typeof vi.fn>;
  };
  let goalRunner: {
    start: ReturnType<typeof vi.fn>;
    onRunStatus: ReturnType<typeof vi.fn>;
    get: ReturnType<typeof vi.fn>;
  };
  let classifier: {
    classify: ReturnType<typeof vi.fn>;
    classifyWithinDepartment: ReturnType<typeof vi.fn>;
  };

  const PROJECTS = [
    { id: "proj_A", name: "A" },
    { id: "proj_B", name: "B" },
  ];
  const RELEASE: TaskTarget = { kind: "workflow", id: "release", name: "Release" };
  const GOAL: TaskTarget = { kind: "goal", id: "ship-it", name: "Ship it" };

  /** A scheduler over REAL run slots; `caps` is the per-project `budget.maxConcurrent`. */
  function makeService(
    maxConcurrentRuns = 1000,
    caps: Record<string, number | undefined> = {},
  ): void {
    slots = new RunSlots(fakeSystemConfigStore({ maxConcurrentRuns }));
    let runSeq = 0;
    agentRunner = {
      start: vi.fn(async () => agentRun({ runId: `koder_${++runSeq}`, agentId: "koder" })),
      startOrchestrator: vi.fn(async () => agentRun({ agentId: "orchestrator" })),
      onRunStatus: vi.fn((l: (run: AgentRun) => void) => {
        agentListener = l;
        return () => {};
      }),
      get: vi.fn(() => agentRun({})),
      readLog: vi.fn(async () => ({ content: "", nextOffset: 0, done: true })),
      rerun: vi.fn(async () => agentRun({ runId: "koder_rerun", agentId: "koder" })),
    };
    workflowRunner = {
      start: vi.fn(async () => workflowRun({ workflowRunId: `release_${++runSeq}` })),
      continueFailed: vi.fn(async (runRef: string) => workflowRun({ workflowRunId: runRef })),
      onRunStatus: vi.fn((l: (run: WorkflowRun) => void) => {
        workflowListener = l;
        return () => {};
      }),
      get: vi.fn(() => workflowRun({})),
    };
    goalRunner = {
      start: vi.fn(async () => ({ goalRunId: `goal_${++runSeq}` })),
      onRunStatus: vi.fn((l: (run: { goalRunId: string; status: string }) => void) => {
        goalListener = l;
        return () => {};
      }),
      get: vi.fn(() => ({ status: "running" })),
    };
    classifier = {
      classify: vi.fn(async () => ({
        target: { kind: "agent", id: "koder", name: "Koder" },
        confidence: 0.9,
        reason: "match",
        matchedTerms: [],
        candidates: [{ kind: "agent", id: "koder", name: "Koder" }],
      })),
      classifyWithinDepartment: vi.fn(async () => {
        throw new Error("not exercised by this describe block");
      }),
    };
    const fakeProjects = {
      list: async () => PROJECTS,
      get: async (id: string) => {
        const found = PROJECTS.find((p) => p.id === id);
        if (!found) throw new Error("no project");
        return found;
      },
    };
    service = new TaskSchedulerService(
      storage,
      classifier as never,
      agentRunner as never,
      workflowRunner as never,
      {
        list: async () => [
          {
            id: "release",
            department: "dev",
            phases: [
              { id: "code", agent: "koder" },
              { id: "review", agent: "reviewer" },
              { id: "test", agent: "tester" },
            ],
          },
        ],
      } as never,
      { listActive: async () => [] } as never,
      slots,
      goalRunner as never,
      fakeLogger as never,
      fakeTrace as never,
      { record: vi.fn(async () => {}) } as never,
      fakeProjects as never,
      {
        check: vi.fn(async () => ({ ok: true }) as BudgetCheck),
        recordDispatch: vi.fn(async () => {}),
        recordCost: vi.fn(async () => {}),
        maxConcurrent: vi.fn(async (id: string) => caps[id]),
      } as never,
      { register: vi.fn(), requestApproval: async () => ({ id: "appr_1" }) } as never,
      { floor: async () => [], evaluate: vi.fn() } as never,
      { windowExhausted: vi.fn(async () => ({ exhausted: false, resumeAt: null })) } as never,
      { handleTerminal: async () => null } as never,
      fakeSystemConfigStore(),
      { name: async () => null } as never,
      new AttachmentStorageService(),
      { register: () => {} } as never,
      undefined,
    );
    service.onModuleInit();
  }

  /** Create a task and assert it dispatched; returns its run ref. */
  async function dispatched(
    text: string,
    projectId?: string,
    target?: TaskTarget,
  ): Promise<string> {
    const result = await service.createTask({ text, title: text }, undefined, projectId, target);
    if (result.outcome !== "dispatched") throw new Error(`expected dispatched: ${result.outcome}`);
    return result.runRef;
  }

  /** Create a task and assert it queued; returns its task id. */
  async function queued(text: string, projectId?: string, target?: TaskTarget): Promise<string> {
    const result = await service.createTask({ text, title: text }, undefined, projectId, target);
    if (result.outcome !== "scheduled") throw new Error(`expected queued: ${result.outcome}`);
    expect(result.task.status).toBe("queued");
    return result.task.id;
  }

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "task-sched-slots-"));
    storage = new ScheduledTasksStorageService(dir);
    await storage.onModuleInit();
    agentListener = undefined;
    workflowListener = undefined;
    goalListener = undefined;
  });

  afterEach(async () => {
    service.onModuleDestroy();
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("cap 1: the second task queues with its target; the run's end dispatches it without re-classifying", async () => {
    makeService(1);
    const firstRef = await dispatched("do A", "proj_A");
    const secondId = await queued("do B", "proj_B");
    expect((await storage.get(secondId)).target).toMatchObject({ kind: "agent", id: "koder" });
    expect(classifier.classify).toHaveBeenCalledTimes(2);

    agentListener?.(agentRun({ runId: firstRef, status: "done" }));
    await vi.waitFor(async () => {
      expect((await storage.get(secondId)).status).toBe("dispatched");
    });
    expect(classifier.classify).toHaveBeenCalledTimes(2); // the persisted target was reused
    expect(agentRunner.start).toHaveBeenCalledTimes(2);
    expect(slots.inUse()).toBe(1);
  });

  it("an agent run holds exactly one slot until its terminal status", async () => {
    makeService();
    const ref = await dispatched("do A");
    expect(slots.inUse()).toBe(1);
    agentListener?.(agentRun({ runId: ref, status: "done" }));
    expect(slots.inUse()).toBe(0);
  });

  it("a workflow run holds exactly one slot for its lifetime, however many stages it has", async () => {
    makeService(2);
    const ref = await dispatched("ship it", undefined, RELEASE); // 3 phases, 3 agents
    expect(slots.inUse()).toBe(1);
    expect(workflowRunner.start).toHaveBeenCalledTimes(1);

    await dispatched("small job"); // still room for a second run
    expect(slots.inUse()).toBe(2);
    await queued("third job"); // the global cap of 2 is now full

    workflowListener?.(workflowRun({ workflowRunId: ref, status: "done" }));
    await vi.waitFor(() => expect(agentRunner.start).toHaveBeenCalledTimes(2));
    expect(slots.inUse()).toBe(2);
  });

  it("an immediate task dispatches past a full global cap and holds no slot (background path)", async () => {
    makeService(1);
    await dispatched("do A");
    const r = await service.createTask(
      { text: "now", title: "now", immediate: true },
      undefined,
      undefined,
      undefined,
      true,
    );
    expect(r.outcome).toBe("pending");
    await vi.waitFor(async () => expect((await storage.get(r.task.id)).status).toBe("dispatched"));
    expect((await storage.get(r.task.id)).immediate).toBe(true);
    expect(slots.inUse()).toBe(1);
  });

  it("an immediate run does not take the slot a normal task needs", async () => {
    makeService(1);
    const r = await service.createTask({ text: "now", title: "now", immediate: true });
    expect(r.outcome).toBe("dispatched");
    expect(slots.inUse()).toBe(0);
    await dispatched("do B"); // the cap of 1 is still free
  });

  it("an immediate task also bypasses a full per-project cap", async () => {
    makeService(1000, { proj_A: 1 });
    await dispatched("do A", "proj_A");
    const r = await service.createTask(
      { text: "now", title: "now", immediate: true },
      undefined,
      "proj_A",
    );
    expect(r.outcome).toBe("dispatched");
    expect(slots.inUse("proj_A")).toBe(1);
  });

  it("a goal run holds one slot; a second task queues until the goal ends", async () => {
    makeService(1);
    const ref = await dispatched("work towards it", undefined, GOAL);
    expect(slots.inUse()).toBe(1);
    const queuedId = await queued("do B");

    goalListener?.({ goalRunId: ref, status: "done" });
    await vi.waitFor(async () => {
      expect((await storage.get(queuedId)).status).toBe("dispatched");
    });
  });

  it("a run waiting on an approval (parked / paused-limit) keeps its slot; interrupted frees it", async () => {
    makeService(1);
    const ref = await dispatched("ship it", undefined, RELEASE);
    const queuedId = await queued("do B");

    workflowListener?.(workflowRun({ workflowRunId: ref, status: "parked" }));
    workflowListener?.(workflowRun({ workflowRunId: ref, status: "paused-limit" }));
    await new Promise((r) => setTimeout(r, 30));
    expect(slots.inUse()).toBe(1);
    expect((await storage.get(queuedId)).status).toBe("queued");

    workflowListener?.(workflowRun({ workflowRunId: ref, status: "interrupted" }));
    await vi.waitFor(async () => {
      expect((await storage.get(queuedId)).status).toBe("dispatched");
    });
  });

  it("a project at its budget.maxConcurrent queues while another project's task still dispatches", async () => {
    makeService(10, { proj_A: 1 });
    const a1 = await dispatched("A one", "proj_A");
    const a2 = await queued("A two", "proj_A"); // global room, but A's cap of 1 is full
    expect(slots.inUse("proj_A")).toBe(1);
    await dispatched("B one", "proj_B"); // another project is unaffected
    await dispatched("loose", undefined);
    expect(slots.inUse()).toBe(3);

    agentListener?.(agentRun({ runId: a1, status: "done" }));
    await vi.waitFor(async () => {
      expect((await storage.get(a2)).status).toBe("dispatched");
    });
    expect(slots.inUse("proj_A")).toBe(1);
  });

  it("a spawn that throws gives back the slot", async () => {
    makeService(1);
    agentRunner.start.mockRejectedValueOnce(new Error("preflight failed"));
    await expect(service.createTask({ text: "do A", title: "A" })).rejects.toThrow("preflight");
    expect(slots.inUse()).toBe(0);
  });

  it("a run already terminal when start() resolves releases its slot at once", async () => {
    makeService(1);
    // The fast-failing child emitted `error` during start()'s sidecar await — before
    // the scheduler had recorded anything for the terminal handler to release.
    agentRunner.start.mockResolvedValueOnce(agentRun({ runId: "koder_fast", status: "error" }));
    agentRunner.get.mockReturnValueOnce(agentRun({ runId: "koder_fast", status: "error" }));
    await dispatched("do A");
    expect(slots.inUse()).toBe(0);
  });

  it("a queued task cancelled before the drain never dispatches", async () => {
    makeService(1);
    const firstRef = await dispatched("do A");
    const secondId = await queued("do B");

    await service.cancel(secondId);
    expect((await storage.get(secondId)).status).toBe("cancelled");

    agentListener?.(agentRun({ runId: firstRef, status: "done" })); // frees the slot → drain
    await new Promise((r) => setTimeout(r, 50));
    expect(agentRunner.start).toHaveBeenCalledTimes(1);
    expect((await storage.get(secondId)).status).toBe("cancelled");
  });

  describe("operator continue (queueContinue)", () => {
    /** Dispatch a task on `target`, fail its run (slot freed); returns the task id + run ref. */
    async function failedRun(target?: TaskTarget): Promise<{ taskId: string; runRef: string }> {
      const runRef = await dispatched("do A", undefined, target);
      if (target) workflowListener?.(workflowRun({ workflowRunId: runRef, status: "failed" }));
      else agentListener?.(agentRun({ runId: runRef, status: "error" }));
      const [task] = await storage.list();
      return { taskId: task!.id, runRef };
    }

    it("continues the workflow run in place under a free slot and clears the marker", async () => {
      makeService(1);
      const { taskId, runRef } = await failedRun(RELEASE);
      await service.queueContinue(taskId, { kind: "workflow", runRef, note: "fix lint" });
      await vi.waitFor(async () => expect((await storage.get(taskId)).status).toBe("dispatched"));
      expect(workflowRunner.continueFailed).toHaveBeenCalledWith(runRef, "fix lint");
      const task = await storage.get(taskId);
      expect(task.runRef).toBe(runRef);
      expect(task.continueRun).toBeUndefined();
      expect(slots.inUse()).toBe(1);
    });

    it("an immediate task continues past a full global cap and takes no slot", async () => {
      makeService(1);
      const r = await service.createTask(
        { text: "do A", title: "do A", immediate: true },
        undefined,
        undefined,
        RELEASE,
      );
      if (r.outcome !== "dispatched") throw new Error(`expected dispatched: ${r.outcome}`);
      workflowListener?.(workflowRun({ workflowRunId: r.runRef, status: "failed" }));
      await dispatched("do B"); // fills the cap of 1
      await service.queueContinue(r.task.id, { kind: "workflow", runRef: r.runRef });
      await vi.waitFor(async () =>
        expect((await storage.get(r.task.id)).status).toBe("dispatched"),
      );
      expect(workflowRunner.continueFailed).toHaveBeenCalledWith(r.runRef, undefined);
      expect(slots.inUse()).toBe(1);
    });

    it("stays queued while the global cap is full, then continues once a slot frees", async () => {
      makeService(1);
      const { taskId, runRef } = await failedRun(RELEASE);
      const holder = await dispatched("do B");
      await service.queueContinue(taskId, { kind: "workflow", runRef });
      await new Promise((r) => setTimeout(r, 30));
      expect((await storage.get(taskId)).status).toBe("queued");
      expect(workflowRunner.continueFailed).not.toHaveBeenCalled();

      agentListener?.(agentRun({ runId: holder, status: "done" }));
      await vi.waitFor(async () => expect((await storage.get(taskId)).status).toBe("dispatched"));
      expect(workflowRunner.continueFailed).toHaveBeenCalledWith(runRef, undefined);
    });

    it("falls back to a fresh dispatch with the note appended when there is nothing to continue", async () => {
      makeService(1);
      const { taskId, runRef } = await failedRun(RELEASE);
      workflowRunner.continueFailed.mockResolvedValueOnce(null);
      await service.queueContinue(taskId, { kind: "workflow", runRef, note: "use v2" });
      await vi.waitFor(async () => expect((await storage.get(taskId)).status).toBe("dispatched"));
      expect(workflowRunner.start).toHaveBeenCalledTimes(2);
      expect(JSON.stringify(workflowRunner.start.mock.calls[1])).toContain("Operator note: use v2");
      expect((await storage.get(taskId)).continueRun).toBeUndefined();
      expect(slots.inUse()).toBe(1);
    });

    it("re-runs an agent run and re-points the task at the new run", async () => {
      makeService(1);
      const { taskId, runRef } = await failedRun();
      await service.queueContinue(taskId, { kind: "agent", runRef, note: "try again" });
      await vi.waitFor(async () => expect((await storage.get(taskId)).status).toBe("dispatched"));
      expect(agentRunner.rerun).toHaveBeenCalledWith(runRef, { note: "try again" });
      expect((await storage.get(taskId)).runRef).toBe("koder_rerun");
    });
  });
});
