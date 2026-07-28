import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { Project, RoadmapItem, ScheduledTask } from "@zibby/contracts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RoadmapGateService, parsePrNumberFromUrl } from "./roadmap-gate.service";
import { RoadmapItemLifecycleError } from "./roadmap.errors";
import { RoadmapStore } from "./roadmap.store";

const fakeLogger = {
  child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
};

const PROJECT: Project = { id: "acme", name: "acme", path: "/repos/acme" };
const NOW = "2026-07-28T00:00:00.000Z";

function item(over: Partial<RoadmapItem> = {}): RoadmapItem {
  return {
    id: "item-1",
    projectId: "acme",
    level: "task",
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

describe("RoadmapGateService", () => {
  let dir: string;
  let store: RoadmapStore;
  let projects: { get: ReturnType<typeof vi.fn> };
  let taskScheduler: { createTask: ReturnType<typeof vi.fn> };
  let scheduledTasks: { get: ReturnType<typeof vi.fn> };
  let taskRuns: { resume: ReturnType<typeof vi.fn> };
  let projectPr: { isMerged: ReturnType<typeof vi.fn>; getPr: ReturnType<typeof vi.fn> };
  let activity: { record: ReturnType<typeof vi.fn> };
  let decomposition: { dispatch: ReturnType<typeof vi.fn> };

  const makeGate = () =>
    new RoadmapGateService(
      store,
      projects as never,
      taskScheduler as never,
      scheduledTasks as never,
      taskRuns as never,
      projectPr as never,
      activity as never,
      decomposition as never,
      fakeLogger as never,
    );

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "roadmap-gate-"));
    store = new RoadmapStore(dir);
    await store.onModuleInit();
    projects = { get: vi.fn(async () => PROJECT) };
    taskScheduler = {
      createTask: vi.fn(async () => ({
        outcome: "dispatched",
        runRef: "run-1",
        target: { kind: "agent", id: "orchestrator" },
        task: task({ id: "task-1" }),
      })),
    };
    scheduledTasks = { get: vi.fn(async () => task()) };
    taskRuns = { resume: vi.fn(async () => ({ runId: "run-2" })) };
    projectPr = { isMerged: vi.fn(async () => false), getPr: vi.fn(async () => null) };
    activity = { record: vi.fn(async () => {}) };
    decomposition = { dispatch: vi.fn(async (_projectId: string, epic: RoadmapItem) => epic) };
  });

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  describe("play", () => {
    it("releases a ready (unblocked) item immediately — lifecycle -> running, a run record is appended", async () => {
      await store.put(item());
      const gate = makeGate();

      const played = await gate.play("acme", "item-1");

      expect(played.lifecycle).toBe("running");
      expect(played.runs).toHaveLength(1);
      expect(played.runs[0]).toMatchObject({
        taskId: "task-1",
        runRef: "run-1",
        outcome: "running",
      });
      expect(taskScheduler.createTask).toHaveBeenCalledTimes(1);
      const [input] = taskScheduler.createTask.mock.calls[0]!;
      expect(input.paths).toEqual(["/repos/acme"]);
      expect(input.output).toEqual({ type: "pr" });
      expect(input.text).toContain("Rollout za flagem");
    });

    it("parks a blocked item as enqueued — no task is created", async () => {
      await store.put(item({ id: "blocker", lifecycle: "todo" }));
      await store.put(item({ id: "item-1", dependsOn: ["blocker"] }));
      const gate = makeGate();

      const played = await gate.play("acme", "item-1");

      expect(played.lifecycle).toBe("enqueued");
      expect(played.enqueuedAt).toBeDefined();
      expect(taskScheduler.createTask).not.toHaveBeenCalled();
    });

    it("409s (RoadmapItemLifecycleError) when the item isn't todo", async () => {
      await store.put(item({ lifecycle: "running" }));
      const gate = makeGate();
      await expect(gate.play("acme", "item-1")).rejects.toBeInstanceOf(RoadmapItemLifecycleError);
    });

    it("a failed blocker does NOT release its dependent", async () => {
      await store.put(item({ id: "blocker", lifecycle: "failed" }));
      await store.put(item({ id: "item-1", dependsOn: ["blocker"] }));
      const gate = makeGate();

      const played = await gate.play("acme", "item-1");

      expect(played.lifecycle).toBe("enqueued");
      expect(taskScheduler.createTask).not.toHaveBeenCalled();
    });

    it("the blocker's merge releases the dependent (onMerge -> drain)", async () => {
      await store.put(
        item({
          id: "blocker",
          lifecycle: "awaiting-merge",
          runs: [
            {
              taskId: "blocker-task",
              startedAt: NOW,
              outcome: "awaiting-merge",
              prNumber: 42,
              prUrl: "https://github.com/acme/app/pull/42",
            },
          ],
        }),
      );
      await store.put(item({ id: "item-1", dependsOn: ["blocker"] }));
      const gate = makeGate();
      await gate.play("acme", "item-1"); // parks, blocked

      await gate.onMerge("acme", 42);

      const blocker = await store.get("acme", "blocker");
      expect(blocker.lifecycle).toBe("done");
      const dependent = await store.get("acme", "item-1");
      expect(dependent.lifecycle).toBe("running"); // released by the drain onMerge triggers
    });

    it("onMerge for an unrelated PR number is a no-op", async () => {
      await store.put(
        item({
          id: "blocker",
          lifecycle: "awaiting-merge",
          runs: [{ taskId: "t", startedAt: NOW, outcome: "awaiting-merge", prNumber: 42 }],
        }),
      );
      const gate = makeGate();

      await gate.onMerge("acme", 999);

      const blocker = await store.get("acme", "blocker");
      expect(blocker.lifecycle).toBe("awaiting-merge");
    });
  });

  describe("play on an epic (125g)", () => {
    it("with children — enqueues every todo child via playBulk, epic itself is untouched", async () => {
      await store.put(item({ id: "epic-1", level: "epic", name: "Epic" }));
      await store.put(item({ id: "child-a", level: "task", parentId: "epic-1" }));
      await store.put(item({ id: "child-b", level: "task", parentId: "epic-1" }));
      const gate = makeGate();

      const played = await gate.play("acme", "epic-1");

      expect(played.level).toBe("epic");
      expect(played.lifecycle).toBe("todo"); // an epic's own lifecycle never moves
      expect(decomposition.dispatch).not.toHaveBeenCalled();
      const a = await store.get("acme", "child-a");
      const b = await store.get("acme", "child-b");
      expect(a.lifecycle).toBe("running");
      expect(b.lifecycle).toBe("running");
    });

    it("with children but none todo — a no-op, never 409s", async () => {
      await store.put(item({ id: "epic-1", level: "epic", name: "Epic" }));
      await store.put(
        item({ id: "child-a", level: "task", parentId: "epic-1", lifecycle: "done" }),
      );
      const gate = makeGate();

      const played = await gate.play("acme", "epic-1");

      expect(played.lifecycle).toBe("todo");
      expect(taskScheduler.createTask).not.toHaveBeenCalled();
      expect(decomposition.dispatch).not.toHaveBeenCalled();
    });

    it("childless — dispatches a decomposition run instead of a normal task", async () => {
      await store.put(item({ id: "epic-1", level: "epic", name: "Epic" }));
      const gate = makeGate();

      await gate.play("acme", "epic-1");

      expect(decomposition.dispatch).toHaveBeenCalledTimes(1);
      expect(decomposition.dispatch.mock.calls[0]![0]).toBe("acme");
      expect(decomposition.dispatch.mock.calls[0]![1]).toMatchObject({ id: "epic-1" });
      // Never the ordinary release() path — no plain task for the epic itself.
      expect(taskScheduler.createTask).not.toHaveBeenCalled();
    });

    it("playing the same epic again after it gains children takes the enqueue-children branch", async () => {
      await store.put(item({ id: "epic-1", level: "epic", name: "Epic" }));
      const gate = makeGate();
      await gate.play("acme", "epic-1"); // childless — decomposes (mocked, no real children created)
      await store.put(item({ id: "child-a", level: "task", parentId: "epic-1" }));

      await gate.play("acme", "epic-1");

      expect(decomposition.dispatch).toHaveBeenCalledTimes(1); // not called a second time
      const a = await store.get("acme", "child-a");
      expect(a.lifecycle).toBe("running");
    });
  });

  describe("playBulk", () => {
    it("enqueues every todo item in array order (FIFO) and releases the unblocked ones", async () => {
      await store.put(item({ id: "a" }));
      await store.put(item({ id: "b" }));
      await store.put(item({ id: "c", lifecycle: "done" })); // already in flight — skipped
      const gate = makeGate();

      const released = await gate.playBulk("acme", ["a", "b", "c"]);

      // Only a/b were touched (todo); both released since nothing blocks them.
      expect(released.map((i) => i.id).sort()).toEqual(["a", "b"]);
      expect(taskScheduler.createTask).toHaveBeenCalledTimes(2);
    });

    it("skips an epic id even if it is (nonsensically) included in the payload", async () => {
      await store.put(item({ id: "epic-1", level: "epic", name: "Epic" }));
      await store.put(item({ id: "task-a" }));
      const gate = makeGate();

      const released = await gate.playBulk("acme", ["epic-1", "task-a"]);

      expect(released.map((i) => i.id)).toEqual(["task-a"]);
      const epic = await store.get("acme", "epic-1");
      expect(epic.lifecycle).toBe("todo");
      expect(taskScheduler.createTask).toHaveBeenCalledTimes(1);
    });

    it("FIFO drain order matches enqueuedAt order even when one item is blocked", async () => {
      const order: string[] = [];
      taskScheduler.createTask.mockImplementation(async (input: { title: string }) => {
        order.push(input.title);
        return {
          outcome: "dispatched",
          runRef: "run-x",
          target: { kind: "agent", id: "orchestrator" },
          task: task({ id: `task-${input.title}` }),
        };
      });
      await store.put(item({ id: "first", name: "First" }));
      await store.put(item({ id: "second", name: "Second" }));
      const gate = makeGate();

      await gate.playBulk("acme", ["second", "first"]);

      // Bulk-play order is preserved even though "first" sorts alphabetically ahead.
      expect(order).toEqual(["Second", "First"]);
    });
  });

  describe("override", () => {
    it("releases an item blocked only by its dependency once overridden", async () => {
      await store.put(item({ id: "blocker", lifecycle: "todo" }));
      await store.put(item({ id: "item-1", dependsOn: ["blocker"] }));
      const gate = makeGate();
      await gate.play("acme", "item-1"); // parks, blocked

      const overridden = await gate.override("acme", "item-1", true);

      expect(overridden.overrideBlocked).toBe(true);
      expect(overridden.lifecycle).toBe("running");
      expect(taskScheduler.createTask).toHaveBeenCalledTimes(1);
    });

    it("setting the flag on a todo item doesn't play it — play is still the operator's click", async () => {
      await store.put(item());
      const gate = makeGate();

      const overridden = await gate.override("acme", "item-1", true);

      expect(overridden.lifecycle).toBe("todo");
      expect(taskScheduler.createTask).not.toHaveBeenCalled();
    });
  });

  describe("reconcileRunning — lifecycle completion", () => {
    it("a document (file-output) item reaches done directly, without ever going through awaiting-merge", async () => {
      await store.put(
        item({
          lifecycle: "running",
          runs: [{ taskId: "task-1", startedAt: NOW, outcome: "running" }],
        }),
      );
      scheduledTasks.get.mockResolvedValue(
        task({
          id: "task-1",
          output: { type: "file", dest: "vault", to: "note-1" },
          outcome: { status: "done", summary: "wrote the note", finishedAt: NOW },
        }),
      );
      const gate = makeGate();

      await gate.reconcileRunning("acme");

      const updated = await store.get("acme", "item-1");
      expect(updated.lifecycle).toBe("done");
      expect(updated.runs[0]!.outcome).toBe("done");
    });

    it("a pr-output run that finished with a PR moves to awaiting-merge, capturing the PR number", async () => {
      await store.put(
        item({
          lifecycle: "running",
          runs: [{ taskId: "task-1", startedAt: NOW, outcome: "running" }],
        }),
      );
      scheduledTasks.get.mockResolvedValue(
        task({
          id: "task-1",
          output: { type: "pr" },
          outcome: {
            status: "done",
            summary: "PR opened",
            finishedAt: NOW,
            pr: { url: "https://github.com/acme/app/pull/7", additions: 1, deletions: 0 },
          },
        }),
      );
      const gate = makeGate();

      await gate.reconcileRunning("acme");

      const updated = await store.get("acme", "item-1");
      expect(updated.lifecycle).toBe("awaiting-merge");
      expect(updated.runs[0]).toMatchObject({
        outcome: "awaiting-merge",
        prNumber: 7,
        prUrl: "https://github.com/acme/app/pull/7",
      });
    });

    it("an errored run marks the item failed", async () => {
      await store.put(
        item({
          lifecycle: "running",
          runs: [{ taskId: "task-1", startedAt: NOW, outcome: "running" }],
        }),
      );
      scheduledTasks.get.mockResolvedValue(
        task({ id: "task-1", outcome: { status: "error", summary: "boom", finishedAt: NOW } }),
      );
      const gate = makeGate();

      await gate.reconcileRunning("acme");

      const updated = await store.get("acme", "item-1");
      expect(updated.lifecycle).toBe("failed");
    });

    it("a done run with a pr output but no pr artifact (no artifact) also fails", async () => {
      await store.put(
        item({
          lifecycle: "running",
          runs: [{ taskId: "task-1", startedAt: NOW, outcome: "running" }],
        }),
      );
      scheduledTasks.get.mockResolvedValue(
        task({
          id: "task-1",
          output: { type: "pr" },
          outcome: { status: "done", summary: "", finishedAt: NOW },
        }),
      );
      const gate = makeGate();

      await gate.reconcileRunning("acme");

      const updated = await store.get("acme", "item-1");
      expect(updated.lifecycle).toBe("failed");
    });

    it("still-running (no outcome yet) items are left alone", async () => {
      await store.put(
        item({
          lifecycle: "running",
          runs: [{ taskId: "task-1", startedAt: NOW, outcome: "running" }],
        }),
      );
      scheduledTasks.get.mockResolvedValue(task({ id: "task-1" })); // no outcome
      const gate = makeGate();

      await gate.reconcileRunning("acme");

      const updated = await store.get("acme", "item-1");
      expect(updated.lifecycle).toBe("running");
    });
  });

  describe("reconcileAwaitingMerge", () => {
    it("marks an item done once ProjectPrService.isMerged resolves true, and drains its dependents", async () => {
      await store.put(
        item({
          id: "blocker",
          lifecycle: "awaiting-merge",
          runs: [{ taskId: "t", startedAt: NOW, outcome: "awaiting-merge", prNumber: 42 }],
        }),
      );
      await store.put(
        item({ id: "item-1", dependsOn: ["blocker"], lifecycle: "enqueued", enqueuedAt: NOW }),
      );
      projectPr.isMerged.mockResolvedValue(true);
      const gate = makeGate();

      await gate.reconcileAwaitingMerge("acme");

      const blocker = await store.get("acme", "blocker");
      expect(blocker.lifecycle).toBe("done");
      const dependent = await store.get("acme", "item-1");
      expect(dependent.lifecycle).toBe("running");
    });

    it("fail-closed: an isMerged rejection leaves the item awaiting-merge", async () => {
      await store.put(
        item({
          lifecycle: "awaiting-merge",
          runs: [{ taskId: "t", startedAt: NOW, outcome: "awaiting-merge", prNumber: 42 }],
        }),
      );
      projectPr.isMerged.mockRejectedValue(new Error("github rate limited"));
      const gate = makeGate();

      await gate.reconcileAwaitingMerge("acme");

      const updated = await store.get("acme", "item-1");
      expect(updated.lifecycle).toBe("awaiting-merge");
    });
  });

  describe("restart / resume", () => {
    it("restart re-enqueues a failed item and dispatches a brand-new task, keeping run history", async () => {
      await store.put(
        item({
          lifecycle: "failed",
          runs: [{ taskId: "old-task", runRef: "old-run", startedAt: NOW, outcome: "failed" }],
        }),
      );
      const gate = makeGate();

      const restarted = await gate.restart("acme", "item-1");

      expect(restarted.lifecycle).toBe("running");
      expect(restarted.runs).toHaveLength(2);
      expect(restarted.runs[0]!.taskId).toBe("old-task");
      expect(restarted.runs[1]!.taskId).toBe("task-1");
    });

    it("restart 409s outside failed", async () => {
      await store.put(item({ lifecycle: "todo" }));
      const gate = makeGate();
      await expect(gate.restart("acme", "item-1")).rejects.toBeInstanceOf(
        RoadmapItemLifecycleError,
      );
    });

    it("resume reuses TaskRunsService.resume and flips lifecycle back to running in place", async () => {
      await store.put(
        item({
          lifecycle: "failed",
          runs: [{ taskId: "task-1", runRef: "old-run", startedAt: NOW, outcome: "failed" }],
        }),
      );
      const gate = makeGate();

      const resumed = await gate.resume("acme", "item-1");

      expect(taskRuns.resume).toHaveBeenCalledWith("old-run");
      expect(resumed.lifecycle).toBe("running");
      expect(resumed.runs).toHaveLength(1); // resumed in place, not a new run record
      expect(resumed.runs[0]).toMatchObject({
        taskId: "task-1",
        runRef: "run-2",
        outcome: "running",
      });
    });

    it("resume 409s when the last run has no runRef", async () => {
      await store.put(
        item({
          lifecycle: "failed",
          runs: [{ taskId: "task-1", startedAt: NOW, outcome: "failed" }],
        }),
      );
      const gate = makeGate();
      await expect(gate.resume("acme", "item-1")).rejects.toBeInstanceOf(RoadmapItemLifecycleError);
    });

    it("resume 409s when TaskRunsService.resume itself rejects", async () => {
      await store.put(
        item({
          lifecycle: "failed",
          runs: [{ taskId: "task-1", runRef: "old-run", startedAt: NOW, outcome: "failed" }],
        }),
      );
      taskRuns.resume.mockRejectedValue(new Error("not resumable"));
      const gate = makeGate();
      await expect(gate.resume("acme", "item-1")).rejects.toBeInstanceOf(RoadmapItemLifecycleError);
    });
  });

  describe("release failures", () => {
    it("a createTask failure marks the item failed rather than throwing out of drain", async () => {
      await store.put(item());
      taskScheduler.createTask.mockRejectedValue(new Error("no capacity"));
      const gate = makeGate();

      const played = await gate.play("acme", "item-1");

      expect(played.lifecycle).toBe("failed");
      expect(played.runs).toHaveLength(0);
    });

    it("a project with no local path fails the release instead of attributing the task incorrectly", async () => {
      projects.get.mockResolvedValue({ id: "acme", name: "acme" }); // no `path`
      await store.put(item());
      const gate = makeGate();

      const played = await gate.play("acme", "item-1");

      expect(played.lifecycle).toBe("failed");
      expect(taskScheduler.createTask).not.toHaveBeenCalled();
    });
  });
});

describe("parsePrNumberFromUrl", () => {
  it("parses the PR number out of a github PR url", () => {
    expect(parsePrNumberFromUrl("https://github.com/acme/app/pull/42")).toBe(42);
  });

  it("returns undefined for a url with no /pull/<n> segment", () => {
    expect(parsePrNumberFromUrl("https://github.com/acme/app")).toBeUndefined();
  });
});
