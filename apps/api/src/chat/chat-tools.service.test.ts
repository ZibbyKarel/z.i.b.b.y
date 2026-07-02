import type { Briefing, CreateTaskResult, SearchHit } from "@zibby/contracts";
import { describe, expect, it, vi } from "vitest";
import type { BriefingService } from "../briefing/briefing.service";
import type { MachineService } from "../machine/machine.service";
import type { VaultService } from "../memory/vault.service";
import type { TaskSchedulerService } from "../tasks/task-scheduler.service";
import { ChatToolsService } from "./chat-tools.service";

/** Build the service with just the methods each tool touches, stubbed. */
function makeService(overrides: {
  createTask?: TaskSchedulerService["createTask"];
  search?: VaultService["search"];
  assemble?: BriefingService["assemble"];
  propose?: MachineService["propose"];
}): ChatToolsService {
  const scheduler = { createTask: overrides.createTask ?? vi.fn() } as unknown as TaskSchedulerService;
  const vault = { search: overrides.search ?? vi.fn() } as unknown as VaultService;
  const briefing = { assemble: overrides.assemble ?? vi.fn() } as unknown as BriefingService;
  const machine = { propose: overrides.propose ?? vi.fn() } as unknown as MachineService;
  return new ChatToolsService(scheduler, vault, briefing, machine);
}

const DISPATCHED: CreateTaskResult = {
  outcome: "dispatched",
  runRef: "run-99",
  target: { kind: "agent", id: "builder", name: "Builder" },
  task: {
    id: "task-7",
    title: "",
    text: "postav appku",
    paths: [],
    scheduledAt: 1,
    status: "dispatched",
    createdAt: "2026-06-23T10:00:00.000Z",
  } as CreateTaskResult["task"],
};

describe("ChatToolsService", () => {
  describe("createTask", () => {
    it("delegates to the scheduler with text + paths and confirms the dispatch", async () => {
      const createTask = vi.fn().mockResolvedValue(DISPATCHED);
      const svc = makeService({ createTask });
      const out = await svc.createTask({ text: "postav appku", paths: ["apps/web"] });

      expect(createTask).toHaveBeenCalledWith({ text: "postav appku", paths: ["apps/web"] });
      expect(out).toContain("task-7");
      expect(out).toContain("Builder");
      expect(out).toContain("run-99");
    });

    it("omits an empty paths array from the scheduler body", async () => {
      const createTask = vi.fn().mockResolvedValue(DISPATCHED);
      const svc = makeService({ createTask });
      await svc.createTask({ text: "postav appku" });
      expect(createTask).toHaveBeenCalledWith({ text: "postav appku" });
    });

    it("reports a scheduled outcome distinctly", async () => {
      const scheduled: CreateTaskResult = {
        outcome: "scheduled",
        task: { ...DISPATCHED.task, status: "scheduled", scheduledAt: 1_900_000_000_000 },
      };
      const svc = makeService({ createTask: vi.fn().mockResolvedValue(scheduled) });
      const out = await svc.createTask({ text: "později" });
      expect(out).toContain("Naplánoval");
      expect(out).toContain("task-7");
    });
  });

  describe("recallMemory", () => {
    it("formats the top hits as title + snippet lines", async () => {
      const hits: SearchHit[] = [
        { id: "n1", title: "Calendar integration", tier: "memory", snippet: "service-account auth" },
        { id: "n2", title: "Email redesign", tier: "knowledge", snippet: "notify-only" },
      ];
      const svc = makeService({ search: vi.fn().mockResolvedValue(hits) });
      const out = await svc.recallMemory("calendar");
      expect(out).toContain("Calendar integration");
      expect(out).toContain("service-account auth");
      expect(out).toContain("Email redesign");
    });

    it("returns a not-found line when nothing matches", async () => {
      const svc = makeService({ search: vi.fn().mockResolvedValue([]) });
      const out = await svc.recallMemory("xyzzy");
      expect(out).toContain("nenašel");
    });

    it("caps the number of hits surfaced", async () => {
      const hits: SearchHit[] = Array.from({ length: 9 }, (_, i) => ({
        id: `n${i}`,
        title: `Note ${i}`,
        tier: "memory",
        snippet: "s",
      }));
      const svc = makeService({ search: vi.fn().mockResolvedValue(hits) });
      const out = await svc.recallMemory("note");
      expect(out.split("\n").filter((l) => l.startsWith("- "))).toHaveLength(5);
    });
  });

  describe("getStatus", () => {
    const baseBriefing: Briefing = {
      generatedAt: "2026-06-23T10:00:00.000Z",
      since: "2026-06-23T00:00:00.000Z",
      headline: "Dvě věci čekají na tebe.",
      nothingNeedsYou: false,
      needsYou: [
        {
          kind: "approval",
          id: "a1",
          summary: "Schválit PR pro bug X",
          at: "2026-06-23T09:00:00.000Z",
          refs: {},
        },
      ],
      didForYou: [],
      watching: [{ integrationId: "gmail", newItems: 3 }],
      engagements: [],
      counts: { runsFinished: 0, runsFailed: 0, parked: 0, approvalsPending: 1, channelItemsNew: 3 },
    };

    it("summarizes headline, needs-you and watching", async () => {
      const svc = makeService({ assemble: vi.fn().mockResolvedValue(baseBriefing) });
      const out = await svc.getStatus();
      expect(out).toContain("Dvě věci čekají na tebe.");
      expect(out).toContain("Schválit PR pro bug X");
      expect(out).toContain("Sleduji");
    });

    it("says nothing needs you when both lists are empty", async () => {
      const quiet: Briefing = {
        ...baseBriefing,
        headline: "Nic tě nepotřebuje.",
        nothingNeedsYou: true,
        needsYou: [],
        watching: [],
      };
      const svc = makeService({ assemble: vi.fn().mockResolvedValue(quiet) });
      const out = await svc.getStatus();
      expect(out).toContain("Nic teď nepotřebuje tvou pozornost.");
    });
  });
});

describe("machine tools (N5b) — propose only, never execute", () => {
  it("proposeRename parks the action and confirms with the preview count", async () => {
    const propose = vi.fn().mockResolvedValue({
      id: "machine-1",
      preview: [
        { from: "IMG_1.jpg", to: "vylet-1.jpg" },
        { from: "IMG_2.jpg", to: "vylet-2.jpg" },
      ],
      state: "proposed",
    });
    const svc = makeService({ propose });
    const out = await svc.proposeRename({ folder: "/tmp/fotky", find: "IMG_", replace: "vylet-" });
    expect(propose).toHaveBeenCalledWith({
      kind: "rename-files",
      folder: "/tmp/fotky",
      find: "IMG_",
      replace: "vylet-",
    });
    expect(out).toContain("2 souborů");
    expect(out).toContain("schválení");
  });

  it("proposeOpenMaps parks the lookup and confirms", async () => {
    const propose = vi.fn().mockResolvedValue({ id: "machine-2", preview: [], state: "proposed" });
    const svc = makeService({ propose });
    const out = await svc.proposeOpenMaps("nejbližší lékárna");
    expect(propose).toHaveBeenCalledWith({ kind: "open-maps", query: "nejbližší lékárna" });
    expect(out).toContain("schválení");
  });

  it("a refused guard comes back as the message, not a crash", async () => {
    const { MachineActionRejectedError } = await import("../machine/machine.service");
    const propose = vi
      .fn()
      .mockRejectedValue(new MachineActionRejectedError("folder must be an absolute path: fotky"));
    const svc = makeService({ propose });
    const out = await svc.proposeRename({ folder: "fotky", find: "a", replace: "b" });
    expect(out).toContain("odmítl");
    expect(out).toContain("absolute path");
  });
});
