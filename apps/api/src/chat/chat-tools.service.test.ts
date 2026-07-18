import type { Briefing, CreateTaskResult, SearchHit, TaskTarget } from "@zibby/contracts";
import { describe, expect, it, vi } from "vitest";
import type { ActivityLogService } from "../activity/activity-log.service";
import type { BriefingService } from "../briefing/briefing.service";
import type { MachineService } from "../machine/machine.service";
import type { VaultService } from "../memory/vault.service";
import type { SubsystemsService } from "../subsystems/subsystems.service";
import type { TaskSchedulerService } from "../tasks/task-scheduler.service";
import { ChatToolsService, personalNoteId } from "./chat-tools.service";

/** Build the service with just the methods each tool touches, stubbed. */
function makeService(overrides: {
  createTask?: TaskSchedulerService["createTask"];
  search?: VaultService["search"];
  createNote?: VaultService["createNote"];
  assemble?: BriefingService["assemble"];
  propose?: MachineService["propose"];
  subsystemGet?: SubsystemsService["get"];
  activityList?: ActivityLogService["list"];
}): ChatToolsService {
  const scheduler = {
    createTask: overrides.createTask ?? vi.fn(),
  } as unknown as TaskSchedulerService;
  const vault = {
    search: overrides.search ?? vi.fn(),
    createNote: overrides.createNote ?? vi.fn(),
  } as unknown as VaultService;
  const briefing = { assemble: overrides.assemble ?? vi.fn() } as unknown as BriefingService;
  const machine = { propose: overrides.propose ?? vi.fn() } as unknown as MachineService;
  const subsystems = { get: overrides.subsystemGet ?? vi.fn() } as unknown as SubsystemsService;
  const activity = {
    list: overrides.activityList ?? vi.fn().mockResolvedValue([]),
  } as unknown as ActivityLogService;
  return new ChatToolsService(scheduler, vault, briefing, machine, subsystems, activity);
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
    toolGrants: [],
    attachments: [],
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

      expect(createTask).toHaveBeenCalledWith(
        { text: "postav appku", paths: ["apps/web"] },
        undefined,
        undefined,
        undefined,
      );
      expect(out.text).toContain("task-7");
      expect(out.text).toContain("Builder");
      expect(out.text).toContain("run-99");
      expect(out.meta).toEqual({
        runRef: "run-99",
        taskId: "task-7",
        target: DISPATCHED.target,
      });
    });

    it("omits an empty paths array from the scheduler body", async () => {
      const createTask = vi.fn().mockResolvedValue(DISPATCHED);
      const svc = makeService({ createTask });
      await svc.createTask({ text: "postav appku" });
      expect(createTask).toHaveBeenCalledWith(
        { text: "postav appku" },
        undefined,
        undefined,
        undefined,
      );
    });

    it("reports a scheduled outcome distinctly, with no meta (nothing was dispatched)", async () => {
      const scheduled: CreateTaskResult = {
        outcome: "scheduled",
        task: { ...DISPATCHED.task, status: "scheduled", scheduledAt: 1_900_000_000_000 },
      };
      const svc = makeService({ createTask: vi.fn().mockResolvedValue(scheduled) });
      const out = await svc.createTask({ text: "později" });
      expect(out.text).toContain("Naplánoval");
      expect(out.text).toContain("task-7");
      expect(out.meta).toBeUndefined();
    });

    it("passes an explicit target through to the scheduler and notes it in the confirmation", async () => {
      const createTask = vi.fn().mockResolvedValue(DISPATCHED);
      const svc = makeService({ createTask });
      const explicitTarget: TaskTarget = { kind: "agent", id: "builder", name: "Builder" };
      const out = await svc.createTask({ text: "postav appku", explicitTarget });

      expect(createTask).toHaveBeenCalledWith(
        { text: "postav appku" },
        undefined,
        undefined,
        explicitTarget,
      );
      expect(out.text).toContain("Oslovil jsi přímo");
      expect(out.meta?.target).toEqual(DISPATCHED.target);
    });
  });

  describe("recallMemory", () => {
    it("formats the top hits as title + snippet lines", async () => {
      const hits: SearchHit[] = [
        {
          id: "n1",
          title: "Calendar integration",
          tier: "memory",
          snippet: "service-account auth",
        },
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
      counts: {
        runsFinished: 0,
        runsFailed: 0,
        parked: 0,
        approvalsPending: 1,
        channelItemsNew: 3,
      },
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

    describe("per-subsystem lens (NS2 F3c)", () => {
      const forgeRow = {
        id: "forge",
        name: "Forge",
        tagline: "t",
        mandate: "m",
        color: "#000000",
        state: "waiting",
        tier2Count: 1,
        tier3Count: 2,
      };

      it("getStatus('forge') answers with the subsystem's state, counts, and owned activity", async () => {
        const subsystemGet = vi.fn().mockResolvedValue(forgeRow);
        const activityList = vi.fn().mockResolvedValue([
          {
            id: "a1",
            at: "2026-07-17T08:00:00.000Z",
            kind: "pipeline-finished",
            summary: "delivery pipeline finished",
            refs: { ownerSubsystem: "forge" },
          },
          {
            id: "a2",
            at: "2026-07-17T07:00:00.000Z",
            kind: "run-finished",
            summary: "puls CI sweep done",
            refs: { ownerSubsystem: "puls" },
          },
        ]);
        const assemble = vi.fn();
        const svc = makeService({ assemble, subsystemGet, activityList });
        const out = await svc.getStatus("forge");

        expect(subsystemGet).toHaveBeenCalledWith("forge");
        expect(assemble).not.toHaveBeenCalled(); // narrowed answer, not the global briefing
        expect(out).toContain("Forge");
        expect(out).toContain("čeká na tvé rozhodnutí");
        expect(out).toContain("Čeká na tebe: 2");
        expect(out).toContain("K reportu od tvé poslední návštěvy: 1");
        expect(out).toContain("delivery pipeline finished");
        expect(out).not.toContain("puls CI sweep done"); // other owners filtered out
      });

      it("a quiet subsystem reads as calm, without count lines", async () => {
        const subsystemGet = vi.fn().mockResolvedValue({
          ...forgeRow,
          id: "codex",
          name: "Codex",
          state: "idle",
          tier2Count: 0,
          tier3Count: 0,
        });
        const svc = makeService({ subsystemGet });
        const out = await svc.getStatus("codex");
        expect(out).toContain("Codex — v klidu.");
        expect(out).toContain("Nic z něj teď nečeká na tvou pozornost.");
        expect(out).not.toContain("Čeká na tebe");
      });

      it("getStatus() without an argument keeps the global briefing summary", async () => {
        const assemble = vi.fn().mockResolvedValue(baseBriefing);
        const subsystemGet = vi.fn();
        const svc = makeService({ assemble, subsystemGet });
        const out = await svc.getStatus();
        expect(assemble).toHaveBeenCalledTimes(1);
        expect(subsystemGet).not.toHaveBeenCalled();
        expect(out).toContain("Dvě věci čekají na tebe.");
      });

      it("a failed activity read degrades to no activity lines, not a failed answer", async () => {
        const subsystemGet = vi.fn().mockResolvedValue(forgeRow);
        const activityList = vi.fn().mockRejectedValue(new Error("log unreadable"));
        const svc = makeService({ subsystemGet, activityList });
        const out = await svc.getStatus("forge");
        expect(out).toContain("Forge");
        expect(out).not.toContain("Poslední aktivita");
      });
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

  it("proposeOpenFolder parks the action and confirms with the path", async () => {
    const propose = vi.fn().mockResolvedValue({ id: "machine-3", preview: [], state: "proposed" });
    const svc = makeService({ propose });
    const out = await svc.proposeOpenFolder("/Users/op/Downloads");
    expect(propose).toHaveBeenCalledWith({ kind: "open-folder", path: "/Users/op/Downloads" });
    expect(out).toContain("/Users/op/Downloads");
    expect(out).toContain("schválení");
  });

  it("proposeOpenFolder returns the guard message, not a crash, when the path is refused", async () => {
    const { MachineActionRejectedError } = await import("../machine/machine.service");
    const propose = vi
      .fn()
      .mockRejectedValue(new MachineActionRejectedError("path must be an absolute path: fotky"));
    const svc = makeService({ propose });
    const out = await svc.proposeOpenFolder("fotky");
    expect(out).toContain("odmítl");
    expect(out).toContain("absolute path");
  });
});

describe("personalNoteId", () => {
  const now = new Date("2026-07-17T12:34:56.000Z");

  it("slugs a usable title", () => {
    expect(personalNoteId("Zubař v úterý", now)).toBe("personal-zuba-v-ter");
  });

  it("falls back to a timestamp id when the title is absent", () => {
    expect(personalNoteId(undefined, now)).toBe("personal-20260717-123456");
  });

  it("falls back to a timestamp id when the title slugs to nothing usable", () => {
    expect(personalNoteId("!!!", now)).toBe("personal-20260717-123456");
  });
});

describe("F8: capturePersonalNote — quick capture to the personal domain", () => {
  it("creates a raw note with frontmatter.domain === 'personal' and no tier", async () => {
    const createNote = vi.fn().mockResolvedValue({ id: "personal-zuba-v-ter" });
    const svc = makeService({ createNote });
    const out = await svc.capturePersonalNote({
      text: "Zubař v úterý v 9",
      title: "Zubař v úterý",
    });

    expect(createNote).toHaveBeenCalledTimes(1);
    const call = createNote.mock.calls[0]?.[0];
    expect(call.tier).toBeUndefined();
    expect(call.frontmatter).toEqual({ domain: "personal" });
    expect(call.body).toBe("Zubař v úterý v 9");
    expect(out).toContain("personal-zuba-v-ter");
  });

  it("retries with a -N suffix on a duplicate id, then succeeds", async () => {
    const { DuplicateNoteError } = await import("../memory/vault.service");
    const createNote = vi
      .fn()
      .mockRejectedValueOnce(new DuplicateNoteError("personal-jot"))
      .mockResolvedValueOnce({ id: "personal-jot-2" });
    const svc = makeService({ createNote });
    const out = await svc.capturePersonalNote({ text: "x", title: "jot" });

    expect(createNote).toHaveBeenCalledTimes(2);
    expect(createNote.mock.calls[1]?.[0].id).toBe("personal-jot-2");
    expect(out).toContain("personal-jot-2");
  });

  it("degrades to an apology string when the retry budget is exhausted", async () => {
    const { DuplicateNoteError } = await import("../memory/vault.service");
    const createNote = vi.fn().mockRejectedValue(new DuplicateNoteError("personal-jot"));
    const svc = makeService({ createNote });
    const out = await svc.capturePersonalNote({ text: "x", title: "jot" });
    expect(out).toContain("Omlouvám se");
  });

  it("degrades to an apology string on any other vault failure, never throws", async () => {
    const createNote = vi.fn().mockRejectedValue(new Error("disk full"));
    const svc = makeService({ createNote });
    const out = await svc.capturePersonalNote({ text: "x" });
    expect(out).toContain("Omlouvám se");
  });
});
