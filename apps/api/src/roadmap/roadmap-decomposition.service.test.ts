import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { Project, RoadmapItem, ScheduledTask } from "@zibby/contracts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  RoadmapDecompositionService,
  hasRunningDecomposition,
} from "./roadmap-decomposition.service";
import { RoadmapItemLifecycleError } from "./roadmap.errors";
import { RoadmapStore } from "./roadmap.store";

const fakeLogger = {
  child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
};

const PROJECT: Project = { id: "acme", name: "acme", path: "/repos/acme" };
const NOW = "2026-07-28T00:00:00.000Z";

function epic(over: Partial<RoadmapItem> = {}): RoadmapItem {
  return {
    id: "epic-1",
    projectId: "acme",
    level: "epic",
    name: "Rollout za flagem",
    description: "Zapnout novou detekci",
    source: { kind: "manual" },
    attachments: [],
    dependsOn: [],
    dependsOnFromSource: [],
    lifecycle: "todo",
    runs: [],
    syncNotes: [],
    createdAt: NOW,
    updatedAt: NOW,
    ...over,
  };
}

function task(over: Partial<ScheduledTask> = {}): ScheduledTask {
  return {
    id: "task-1",
    text: "x",
    status: "dispatched",
    createdAt: NOW,
    ...over,
  } as ScheduledTask;
}

describe("hasRunningDecomposition", () => {
  it("is false for an epic with no runs", () => {
    expect(hasRunningDecomposition(epic())).toBe(false);
  });

  it("is true only when the LAST run's outcome is running", () => {
    const running = epic({ runs: [{ taskId: "t", startedAt: NOW, outcome: "running" }] });
    expect(hasRunningDecomposition(running)).toBe(true);

    const done = epic({
      runs: [
        { taskId: "t1", startedAt: NOW, outcome: "failed" },
        { taskId: "t2", startedAt: NOW, outcome: "done" },
      ],
    });
    expect(hasRunningDecomposition(done)).toBe(false);
  });
});

describe("RoadmapDecompositionService", () => {
  let dir: string;
  let store: RoadmapStore;
  let projects: { get: ReturnType<typeof vi.fn> };
  let taskScheduler: { createTask: ReturnType<typeof vi.fn> };
  let scheduledTasks: { get: ReturnType<typeof vi.fn> };
  let agentRunner: { readLog: ReturnType<typeof vi.fn> };
  let activity: { record: ReturnType<typeof vi.fn> };

  const makeService = () =>
    new RoadmapDecompositionService(
      store,
      projects as never,
      taskScheduler as never,
      scheduledTasks as never,
      agentRunner as never,
      activity as never,
      fakeLogger as never,
    );

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "roadmap-decomposition-"));
    store = new RoadmapStore(dir);
    await store.onModuleInit();
    projects = { get: vi.fn(async () => PROJECT) };
    taskScheduler = {
      createTask: vi.fn(async () => ({
        outcome: "dispatched",
        runRef: "run-1",
        target: { kind: "agent", id: "roadmap-decomposer" },
        task: task({ id: "task-1" }),
      })),
    };
    scheduledTasks = { get: vi.fn(async () => task()) };
    agentRunner = { readLog: vi.fn(async () => ({ content: "", nextOffset: 0, done: true })) };
    activity = { record: vi.fn(async () => {}) };
  });

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  describe("dispatch", () => {
    it("creates a task with the explicit roadmap-decomposer target and a void output", async () => {
      await store.put(epic());
      const service = makeService();

      const updated = await service.dispatch("acme", await store.get("acme", "epic-1"));

      expect(updated.lifecycle).toBe("todo"); // the epic's own lifecycle never moves
      expect(updated.runs).toHaveLength(1);
      expect(updated.runs[0]).toMatchObject({
        taskId: "task-1",
        runRef: "run-1",
        outcome: "running",
      });
      expect(taskScheduler.createTask).toHaveBeenCalledTimes(1);
      const [input, , trustedProjectId, explicitTarget, background] =
        taskScheduler.createTask.mock.calls[0]!;
      expect(input.paths).toEqual(["/repos/acme"]);
      expect(input.output).toEqual({ type: "void" });
      expect(input.text).toContain("Rollout za flagem");
      expect(trustedProjectId).toBeUndefined();
      expect(explicitTarget).toMatchObject({ kind: "agent", id: "roadmap-decomposer" });
      expect(background).toBe(false);
    });

    it("409s (RoadmapItemLifecycleError) when a decomposition is already running", async () => {
      const running = epic({ runs: [{ taskId: "t", startedAt: NOW, outcome: "running" }] });
      await store.put(running);
      const service = makeService();

      await expect(service.dispatch("acme", running)).rejects.toBeInstanceOf(
        RoadmapItemLifecycleError,
      );
      expect(taskScheduler.createTask).not.toHaveBeenCalled();
    });

    it("throws when the project has no local path configured", async () => {
      projects.get = vi.fn(async () => ({ id: "acme", name: "acme" }) as Project);
      await store.put(epic());
      const service = makeService();

      await expect(service.dispatch("acme", await store.get("acme", "epic-1"))).rejects.toThrow();
    });
  });

  describe("reconcile", () => {
    it("ignores a task-level item entirely", async () => {
      await store.put({
        ...epic({ id: "task-not-epic", level: "task" }),
        runs: [{ taskId: "t", startedAt: NOW, outcome: "running" }],
      });
      const service = makeService();

      await service.reconcile("acme");

      expect(scheduledTasks.get).not.toHaveBeenCalled();
    });

    it("ignores an epic with no in-flight run", async () => {
      await store.put(epic());
      const service = makeService();

      await service.reconcile("acme");

      expect(scheduledTasks.get).not.toHaveBeenCalled();
    });

    it("leaves the run alone while the task has no outcome yet", async () => {
      await store.put(epic({ runs: [{ taskId: "task-1", startedAt: NOW, outcome: "running" }] }));
      scheduledTasks.get = vi.fn(async () => task({ status: "dispatched" })); // no outcome
      const service = makeService();

      await service.reconcile("acme");

      const after = await store.get("acme", "epic-1");
      expect(after.runs[0]!.outcome).toBe("running");
    });

    it("marks the run failed when the task outcome is an error", async () => {
      await store.put(epic({ runs: [{ taskId: "task-1", startedAt: NOW, outcome: "running" }] }));
      scheduledTasks.get = vi.fn(async () =>
        task({
          runRef: "run-1",
          outcome: { status: "error", summary: "boom", finishedAt: NOW },
        }),
      );
      const service = makeService();

      await service.reconcile("acme");

      const after = await store.get("acme", "epic-1");
      expect(after.runs[0]!.outcome).toBe("failed");
      expect(
        activity.record.mock.calls.some(
          (c: unknown[]) => (c[0] as { kind: string }).kind === "roadmap-item-outcome",
        ),
      ).toBe(true);
    });

    it("marks the run failed when the task never produced a runRef", async () => {
      await store.put(epic({ runs: [{ taskId: "task-1", startedAt: NOW, outcome: "running" }] }));
      scheduledTasks.get = vi.fn(async () =>
        task({ outcome: { status: "done", summary: "ok", finishedAt: NOW } }),
      );
      const service = makeService();

      await service.reconcile("acme");

      const after = await store.get("acme", "epic-1");
      expect(after.runs[0]!.outcome).toBe("failed");
    });

    it("marks the run failed when the log carries no valid artifact", async () => {
      await store.put(epic({ runs: [{ taskId: "task-1", startedAt: NOW, outcome: "running" }] }));
      scheduledTasks.get = vi.fn(async () =>
        task({ runRef: "run-1", outcome: { status: "done", summary: "ok", finishedAt: NOW } }),
      );
      agentRunner.readLog = vi.fn(async () => ({
        content: "I could not decompose this epic.",
        nextOffset: 0,
        done: true,
      }));
      const service = makeService();

      await service.reconcile("acme");

      const after = await store.get("acme", "epic-1");
      expect(after.runs[0]!.outcome).toBe("failed");
    });

    it("ingests a valid artifact into children and marks the run done", async () => {
      await store.put(epic({ runs: [{ taskId: "task-1", startedAt: NOW, outcome: "running" }] }));
      scheduledTasks.get = vi.fn(async () =>
        task({ runRef: "run-1", outcome: { status: "done", summary: "ok", finishedAt: NOW } }),
      );
      agentRunner.readLog = vi.fn(async () => ({
        content: JSON.stringify([
          { name: "Add schema", description: "…", dependsOn: [] },
          { name: "Add endpoint", description: "…", dependsOn: [0] },
        ]),
        nextOffset: 0,
        done: true,
      }));
      const service = makeService();

      await service.reconcile("acme");

      const after = await store.get("acme", "epic-1");
      expect(after.runs[0]!.outcome).toBe("done");
      const children = (await store.list("acme")).filter((i) => i.parentId === "epic-1");
      expect(children).toHaveLength(2);
      expect(children.every((c) => c.origin === "zibby-decomposed")).toBe(true);
      expect(children.every((c) => c.lifecycle === "todo")).toBe(true);
      const endpoint = children.find((c) => c.name === "Add endpoint")!;
      const schema = children.find((c) => c.name === "Add schema")!;
      expect(endpoint.dependsOn).toEqual([schema.id]);
    });

    it("is idempotent-safe — never re-ingests once the epic already has children", async () => {
      await store.put(epic({ runs: [{ taskId: "task-1", startedAt: NOW, outcome: "running" }] }));
      await store.put({
        ...epic({ id: "existing-child", level: "task", parentId: "epic-1", name: "Existing" }),
      });
      scheduledTasks.get = vi.fn(async () =>
        task({ runRef: "run-1", outcome: { status: "done", summary: "ok", finishedAt: NOW } }),
      );
      agentRunner.readLog = vi.fn(async () => ({
        content: JSON.stringify([{ name: "Would-be duplicate", dependsOn: [] }]),
        nextOffset: 0,
        done: true,
      }));
      const service = makeService();

      await service.reconcile("acme");

      // Only the one pre-existing child — reconcile never called readLog/ingested again.
      const children = (await store.list("acme")).filter((i) => i.parentId === "epic-1");
      expect(children).toHaveLength(1);
      expect(children[0]!.name).toBe("Existing");
      expect(agentRunner.readLog).not.toHaveBeenCalled();
      const after = await store.get("acme", "epic-1");
      expect(after.runs[0]!.outcome).toBe("done");
    });

    it("running reconcile twice never double-creates children", async () => {
      await store.put(epic({ runs: [{ taskId: "task-1", startedAt: NOW, outcome: "running" }] }));
      scheduledTasks.get = vi.fn(async () =>
        task({ runRef: "run-1", outcome: { status: "done", summary: "ok", finishedAt: NOW } }),
      );
      agentRunner.readLog = vi.fn(async () => ({
        content: JSON.stringify([{ name: "Only child", dependsOn: [] }]),
        nextOffset: 0,
        done: true,
      }));
      const service = makeService();

      await service.reconcile("acme");
      await service.reconcile("acme"); // the run's outcome is already "done" — a no-op

      const children = (await store.list("acme")).filter((i) => i.parentId === "epic-1");
      expect(children).toHaveLength(1);
    });
  });
});
