import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { Project, RoadmapItem, ScheduledTask } from "@zibby/contracts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeSystemConfigStore } from "../system/system-config.fixture";
import { RoadmapGateService } from "./roadmap-gate.service";
import { RoadmapTickService } from "./roadmap-tick.service";
import { RoadmapStore } from "./roadmap.store";

const fakeLogger = {
  child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
};

const ZERO_SUMMARY = { imported: 0, updated: 0, archived: 0, skipped: 0, notes: [] };

describe("RoadmapTickService", () => {
  let dir: string;
  let store: RoadmapStore;
  let source: { sync: ReturnType<typeof vi.fn> };
  let gate: {
    reconcileRunning: ReturnType<typeof vi.fn>;
    reconcileAwaitingMerge: ReturnType<typeof vi.fn>;
    autoPickup: ReturnType<typeof vi.fn>;
  };
  let activity: { record: ReturnType<typeof vi.fn> };

  const makeTick = () =>
    new RoadmapTickService(
      store,
      source as never,
      gate as never,
      activity as never,
      fakeSystemConfigStore(),
      { register: () => {} } as never,
      fakeLogger as never,
    );

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "roadmap-tick-"));
    store = new RoadmapStore(dir);
    await store.onModuleInit();
    source = { sync: vi.fn(async () => ({ ...ZERO_SUMMARY })) };
    gate = {
      reconcileRunning: vi.fn(async () => {}),
      reconcileAwaitingMerge: vi.fn(async () => {}),
      autoPickup: vi.fn(async () => {}),
    };
    activity = { record: vi.fn(async () => {}) };
  });

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("skips sync for a project with autoSync: false, but still polls the gate", async () => {
    await store.writeConfig("acme", { autoSync: false });
    const tick = makeTick();

    await tick.tick();

    expect(source.sync).not.toHaveBeenCalled();
    expect(gate.reconcileRunning).toHaveBeenCalledWith("acme");
    expect(gate.reconcileAwaitingMerge).toHaveBeenCalledWith("acme");
  });

  it("syncs a project with autoSync: true", async () => {
    await store.writeConfig("acme", { autoSync: true });
    const tick = makeTick();

    await tick.tick();

    expect(source.sync).toHaveBeenCalledWith("acme");
  });

  it("skips auto-pickup for a project with autoPlay: false — the default", async () => {
    await store.writeConfig("acme", { autoSync: true });
    const tick = makeTick();

    await tick.tick();

    expect(gate.autoPickup).not.toHaveBeenCalled();
  });

  it("picks up work for a project with autoPlay: true, independently of autoSync", async () => {
    await store.writeConfig("acme", { autoSync: false, autoPlay: true });
    const tick = makeTick();

    await tick.tick();

    expect(source.sync).not.toHaveBeenCalled();
    expect(gate.autoPickup).toHaveBeenCalledWith("acme");
  });

  it("picks up LAST — after the sync and both reconcile passes have run", async () => {
    await store.writeConfig("acme", { autoSync: true, autoPlay: true });
    const order: string[] = [];
    source.sync.mockImplementation(async () => {
      order.push("sync");
      return { ...ZERO_SUMMARY };
    });
    gate.reconcileRunning.mockImplementation(async () => void order.push("reconcileRunning"));
    gate.reconcileAwaitingMerge.mockImplementation(
      async () => void order.push("reconcileAwaitingMerge"),
    );
    gate.autoPickup.mockImplementation(async () => void order.push("autoPickup"));
    const tick = makeTick();

    await tick.tick();

    // Pickup must see the freshly imported items and the slots the reconcile
    // passes just freed — anything earlier works off a stale picture.
    expect(order).toEqual(["sync", "reconcileRunning", "reconcileAwaitingMerge", "autoPickup"]);
  });

  it("one project's auto-pickup failure never blocks another project's tick", async () => {
    await store.writeConfig("broken", { autoPlay: true });
    await store.writeConfig("fine", { autoPlay: true });
    gate.autoPickup.mockImplementation(async (projectId: string) => {
      if (projectId === "broken") throw new Error("boom");
    });
    const tick = makeTick();

    await tick.tick();

    expect(gate.autoPickup).toHaveBeenCalledWith("broken");
    expect(gate.autoPickup).toHaveBeenCalledWith("fine");
  });

  it("one project's sync failure never blocks another project's tick", async () => {
    await store.writeConfig("broken", { autoSync: true });
    await store.writeConfig("fine", { autoSync: true });
    source.sync.mockImplementation(async (projectId: string) => {
      if (projectId === "broken") throw new Error("jira down");
      return { ...ZERO_SUMMARY };
    });
    const tick = makeTick();

    await tick.tick();

    expect(source.sync).toHaveBeenCalledWith("broken");
    expect(source.sync).toHaveBeenCalledWith("fine");
    // The broken project's OWN reconcile pass still runs — a sync failure
    // doesn't skip the poll step for the same project either.
    expect(gate.reconcileRunning).toHaveBeenCalledWith("broken");
    expect(gate.reconcileRunning).toHaveBeenCalledWith("fine");
  });

  it("one project's reconcile failure never blocks another project's tick", async () => {
    await store.writeConfig("broken", { autoSync: false });
    await store.writeConfig("fine", { autoSync: false });
    gate.reconcileRunning.mockImplementation(async (projectId: string) => {
      if (projectId === "broken") throw new Error("boom");
    });
    const tick = makeTick();

    await tick.tick();

    expect(gate.reconcileAwaitingMerge).toHaveBeenCalledWith("broken");
    expect(gate.reconcileAwaitingMerge).toHaveBeenCalledWith("fine");
  });

  it("a project whose readConfig itself throws never blocks another project's tick", async () => {
    await store.writeConfig("fine", { autoSync: true });
    // "broken" has no _config.json at all but IS a real directory under the
    // root (readConfig degrades to defaults for a missing file, so simulate a
    // harder failure — projectIds() lists a dir that readConfig then rejects).
    const readConfigSpy = vi
      .spyOn(store, "readConfig")
      .mockImplementation(async (projectId: string) => {
        if (projectId === "broken") throw new Error("unreadable");
        return { autoSync: true, autoPlay: false };
      });
    await fs.mkdir(path.join(dir, "broken"), { recursive: true });
    const tick = makeTick();

    await tick.tick();

    expect(source.sync).toHaveBeenCalledWith("fine");
    // "broken"'s readConfig threw, so its whole tickProject step aborted —
    // but "fine" still ran to completion.
    expect(gate.reconcileRunning).toHaveBeenCalledWith("fine");
    readConfigSpy.mockRestore();
  });

  it("records roadmap-sync activity only when a sync actually imports or archives something", async () => {
    await store.writeConfig("acme", { autoSync: true });
    source.sync.mockResolvedValue({ imported: 2, updated: 1, archived: 1, skipped: 0, notes: [] });
    const tick = makeTick();

    await tick.tick();

    expect(activity.record).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "roadmap-sync",
        refs: { projectId: "acme" },
      }),
    );
  });

  it("records no activity for a no-op tick (nothing imported/archived, nothing to reconcile)", async () => {
    await store.writeConfig("acme", { autoSync: true });
    source.sync.mockResolvedValue({ ...ZERO_SUMMARY });
    const tick = makeTick();

    await tick.tick();

    expect(activity.record).not.toHaveBeenCalled();
  });

  describe("poll path — a PR merged directly on GitHub (real RoadmapGateService)", () => {
    const PROJECT: Project = { id: "acme", name: "acme", path: "/repos/acme" };
    const NOW = "2026-07-28T00:00:00.000Z";

    function realItem(over: Partial<RoadmapItem> & Pick<RoadmapItem, "id">): RoadmapItem {
      return {
        projectId: "acme",
        level: "task",
        name: over.id,
        description: "",
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

    it("releases a dependent whose blocker's PR was merged directly on GitHub, with autoSync off", async () => {
      await store.writeConfig("acme", { autoSync: false });
      await store.put(
        realItem({
          id: "blocker",
          lifecycle: "awaiting-merge",
          runs: [
            { taskId: "blocker-task", startedAt: NOW, outcome: "awaiting-merge", prNumber: 42 },
          ],
        }),
      );
      await store.put(
        realItem({
          id: "dependent",
          dependsOn: ["blocker"],
          lifecycle: "enqueued",
          enqueuedAt: NOW,
        }),
      );

      const projects = { get: vi.fn(async () => PROJECT) };
      const taskScheduler = {
        createTask: vi.fn(async () => ({
          outcome: "dispatched",
          runRef: "run-1",
          target: { kind: "agent", id: "orchestrator" },
          task: task(),
        })),
      };
      const scheduledTasks = { get: vi.fn(async () => task()) };
      const taskRuns = { resume: vi.fn() };
      // The operator merged straight on GitHub — the poll (not the eager
      // recordMerge hook) is what has to discover this.
      const projectPr = { isMerged: vi.fn(async () => true), getPr: vi.fn() };
      const realGate = new RoadmapGateService(
        store,
        projects as never,
        taskScheduler as never,
        scheduledTasks as never,
        taskRuns as never,
        projectPr as never,
        activity as never,
        // 125g's decomposition service — unused by this poll-path test.
        {} as never,
        fakeLogger as never,
      );

      const tick = new RoadmapTickService(
        store,
        source as never,
        realGate,
        activity as never,
        fakeSystemConfigStore(),
        { register: () => {} } as never,
        fakeLogger as never,
      );

      await tick.tick();

      expect(projectPr.isMerged).toHaveBeenCalledWith("acme", 42);
      const blocker = await store.get("acme", "blocker");
      expect(blocker.lifecycle).toBe("done");
      const dependent = await store.get("acme", "dependent");
      expect(dependent.lifecycle).toBe("running");
      // Auto-sync stayed off — the poll release is independent of it.
      expect(source.sync).not.toHaveBeenCalled();
    });
  });
});
