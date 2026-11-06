import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type {
  AutomationToggles,
  Company,
  Project,
  RoadmapItem,
  ScheduledTask,
} from "@zibby/contracts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeSystemConfigStore } from "../system/system-config.fixture";
import { RoadmapGateService } from "./roadmap-gate.service";
import { RoadmapTickService } from "./roadmap-tick.service";
import { RoadmapStore } from "./roadmap.store";

const fakeLogger = {
  child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
};

describe("RoadmapTickService", () => {
  let dir: string;
  let store: RoadmapStore;
  let gate: {
    reconcileRunning: ReturnType<typeof vi.fn>;
    reconcileAwaitingMerge: ReturnType<typeof vi.fn>;
    autoPickup: ReturnType<typeof vi.fn>;
  };
  let activity: { record: ReturnType<typeof vi.fn> };
  let company: Company | undefined;
  let autopilotOn: boolean;
  let globalToggles: Partial<AutomationToggles>;
  let companyToggles: Record<string, Partial<AutomationToggles>>;
  let teamToggles: Record<string, Partial<AutomationToggles>>;
  const projects = {
    get: async (id: string) => ({ id, name: id, path: `/repos/${id}`, teamId: "team-1" }),
  };
  const resolvedProjects = { resolveCompany: async () => company };
  const autopilot = {
    automationFor: ({ companyId, teamId }: { companyId?: string; teamId?: string }) => {
      const off = { autoImplement: false, autoReview: false, autoAddressComments: false };
      if (!autopilotOn) return off;
      return {
        ...off,
        ...globalToggles,
        ...(companyId ? companyToggles[companyId] : {}),
        ...(teamId ? teamToggles[teamId] : {}),
      };
    },
  };

  const makeTick = () =>
    new RoadmapTickService(
      store,
      gate as never,
      fakeSystemConfigStore(),
      { register: () => {} } as never,
      projects as never,
      resolvedProjects as never,
      autopilot as never,
      fakeLogger as never,
    );

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "roadmap-tick-"));
    store = new RoadmapStore(dir);
    await store.onModuleInit();
    company = undefined;
    autopilotOn = true;
    globalToggles = {};
    companyToggles = {};
    teamToggles = {};
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

  it("polls the gate for a project, with every toggle off", async () => {
    await store.writeConfig("acme", {});
    const tick = makeTick();

    await tick.tick();

    expect(gate.reconcileRunning).toHaveBeenCalledWith("acme");
    expect(gate.reconcileAwaitingMerge).toHaveBeenCalledWith("acme");
    expect(gate.autoPickup).not.toHaveBeenCalled();
  });

  it("picks up work when autopilot is on and the global autoImplement is true", async () => {
    await store.writeConfig("acme", {});
    globalToggles = { autoImplement: true };

    await makeTick().tick();

    expect(gate.autoPickup).toHaveBeenCalledWith("acme");
  });

  it("does NOT pick up while autopilot is off, even with the tree saying true", async () => {
    await store.writeConfig("acme", {});
    globalToggles = { autoImplement: true };
    autopilotOn = false;

    await makeTick().tick();

    expect(gate.reconcileRunning).toHaveBeenCalledWith("acme");
    expect(gate.autoPickup).not.toHaveBeenCalled();
  });

  it("the project's team toggle is never applied: several teams work in one project", async () => {
    await store.writeConfig("acme", {});
    teamToggles = { "team-1": { autoImplement: true } };

    await makeTick().tick();

    expect(gate.autoPickup).not.toHaveBeenCalled();
  });

  it("a company override applies to its project", async () => {
    await store.writeConfig("acme", {});
    company = { id: "co", name: "Co" };
    companyToggles = { co: { autoImplement: true } };

    await makeTick().tick();

    expect(gate.autoPickup).toHaveBeenCalledWith("acme");
  });

  it("the legacy _config.json autoPlay:true alone no longer triggers pickup", async () => {
    await store.writeConfig("acme", { autoPlay: true });

    await makeTick().tick();

    expect(gate.autoPickup).not.toHaveBeenCalled();
  });

  it("picks up LAST — after both reconcile passes have run", async () => {
    await store.writeConfig("acme", {});
    globalToggles = { autoImplement: true };
    const order: string[] = [];
    gate.reconcileRunning.mockImplementation(async () => void order.push("reconcileRunning"));
    gate.reconcileAwaitingMerge.mockImplementation(
      async () => void order.push("reconcileAwaitingMerge"),
    );
    gate.autoPickup.mockImplementation(async () => void order.push("autoPickup"));
    const tick = makeTick();

    await tick.tick();

    // Pickup must see the slots the reconcile passes just freed.
    expect(order).toEqual(["reconcileRunning", "reconcileAwaitingMerge", "autoPickup"]);
  });

  it("one project's auto-pickup failure never blocks another project's tick", async () => {
    await store.writeConfig("broken", {});
    await store.writeConfig("fine", {});
    globalToggles = { autoImplement: true };
    gate.autoPickup.mockImplementation(async (projectId: string) => {
      if (projectId === "broken") throw new Error("boom");
    });
    const tick = makeTick();

    await tick.tick();

    expect(gate.autoPickup).toHaveBeenCalledWith("broken");
    expect(gate.autoPickup).toHaveBeenCalledWith("fine");
  });

  it("one project's reconcile failure never blocks another project's tick", async () => {
    await store.writeConfig("broken", {});
    await store.writeConfig("fine", {});
    gate.reconcileRunning.mockImplementation(async (projectId: string) => {
      if (projectId === "broken") throw new Error("boom");
    });
    const tick = makeTick();

    await tick.tick();

    expect(gate.reconcileAwaitingMerge).toHaveBeenCalledWith("broken");
    expect(gate.reconcileAwaitingMerge).toHaveBeenCalledWith("fine");
  });

  it("a project whose toggle resolution throws never blocks another project's tick", async () => {
    await store.writeConfig("broken", {});
    await store.writeConfig("fine", {});
    const spy = vi.spyOn(autopilot, "automationFor");
    spy.mockImplementationOnce(() => {
      throw new Error("unreadable");
    });
    await makeTick().tick();

    expect(gate.reconcileRunning).toHaveBeenCalledTimes(1);
    spy.mockRestore();
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

    it("releases a dependent whose blocker's PR was merged directly on GitHub, with no toggles on", async () => {
      await store.writeConfig("acme", {});
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
      const projectLocal = {
        resolveForRun: vi.fn(async () => ({ path: PROJECT.path, isGitRepo: true })),
      };
      const taskScheduler = {
        createTask: vi.fn(async () => ({
          outcome: "dispatched",
          runRef: "run-1",
          target: { kind: "agent", id: "orchestrator" },
          task: task(),
        })),
      };
      const scheduledTasks = {
        get: vi.fn(async () => task()),
        setRoadmapRef: vi.fn(async () => task()),
        setClassification: vi.fn(async () => task()),
      };
      const taskRuns = { resume: vi.fn() };
      // The release's stage-1 "whose domain is this?" call. `null` = no seated
      // department, so the release stays undirected — this test is about the merge
      // poll releasing a dependent, not about routing.
      const classifier = { classifyDepartment: vi.fn(async () => null) };
      // The operator merged straight on GitHub — the poll (not the eager
      // recordMerge hook) is what has to discover this.
      const projectPr = { isMerged: vi.fn(async () => true), getPr: vi.fn() };
      const realGate = new RoadmapGateService(
        store,
        projects as never,
        projectLocal as never,
        taskScheduler as never,
        classifier as never,
        scheduledTasks as never,
        taskRuns as never,
        projectPr as never,
        activity as never,
        // 125g's decomposition service — unused by this poll-path test.
        {} as never,
        // NS2 F10's routing-proposal store + approvals gate. Nothing ever PARKS here
        // (this test's `classifyDepartment` returns null, so there is no verdict to be
        // ambiguous about), but `drain` still scans the store for already-parked items
        // before releasing — so the store needs a real `list`, not a bare `{}`.
        { list: async () => [] } as never,
        {} as never,
        fakeLogger as never,
      );

      const tick = new RoadmapTickService(
        store,
        realGate,
        fakeSystemConfigStore(),
        { register: () => {} } as never,
        projects as never,
        resolvedProjects as never,
        { automationFor: () => ({ autoImplement: false }) } as never,
        fakeLogger as never,
      );

      await tick.tick();

      expect(projectPr.isMerged).toHaveBeenCalledWith("acme", 42);
      const blocker = await store.get("acme", "blocker");
      expect(blocker.lifecycle).toBe("done");
      const dependent = await store.get("acme", "dependent");
      expect(dependent.lifecycle).toBe("running");
    });
  });
});
