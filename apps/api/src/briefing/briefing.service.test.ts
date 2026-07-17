import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DuplicateNoteError } from "../memory/vault.service";
import { BriefingService } from "./briefing.service";

/** A minimal in-memory vault double that mimics create/update collision semantics. */
function makeVault() {
  const notes = new Map<string, { body: string; frontmatter: unknown }>();
  const daily: string[] = [];
  return {
    notes,
    daily,
    createNote: vi.fn(
      async ({ id, body, frontmatter }: { id: string; body: string; frontmatter: unknown }) => {
        if (notes.has(id)) throw new DuplicateNoteError(id);
        notes.set(id, { body, frontmatter });
        return { id };
      },
    ),
    updateNote: vi.fn(
      async (id: string, { body, frontmatter }: { body: string; frontmatter: unknown }) => {
        notes.set(id, { body, frontmatter });
        return { id };
      },
    ),
    appendDaily: vi.fn(async (text: string) => {
      daily.push(text);
      return { id: "daily" };
    }),
  };
}

/** NS2 F3b — a subsystem row fixture in the SubsystemsService.list() shape. */
function subsystemRow(id: string, name: string, state = "idle", tier2Count = 0, tier3Count = 0) {
  return { id, name, tagline: "t", mandate: "m", color: "#000000", state, tier2Count, tier3Count };
}

describe("BriefingService", () => {
  let dir: string;
  let vault: ReturnType<typeof makeVault>;
  let record: ReturnType<typeof vi.fn>;
  let briefer: { headline: ReturnType<typeof vi.fn> };
  let subsystems: { list: ReturnType<typeof vi.fn> };
  let limits: { snapshot: ReturnType<typeof vi.fn> };
  let monitorEvents: { listStatuses: ReturnType<typeof vi.fn> };
  let selfKnowledge: { check: ReturnType<typeof vi.fn> };
  let service: BriefingService;

  const now = new Date("2026-06-12T07:00:00.000Z");

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "briefing-"));
    vault = makeVault();
    record = vi.fn().mockResolvedValue(undefined);
    briefer = { headline: vi.fn().mockResolvedValue(null) }; // VITEST-style: fall back

    const approvals = { list: vi.fn().mockResolvedValue([]) };
    const pipelines = { listAll: vi.fn().mockResolvedValue([]) };
    const goals = { listAll: vi.fn().mockResolvedValue([]) };
    const channels = { list: vi.fn().mockResolvedValue([]) };
    const activity = { readSince: vi.fn().mockResolvedValue([]), record };
    const tasks = { list: vi.fn().mockResolvedValue([]) };
    const projects = { list: vi.fn().mockResolvedValue([]) };
    monitorEvents = { listStatuses: vi.fn().mockResolvedValue([]) };
    // NS2 F3b — default fixtures: no subsystem rows, no limits reading (each
    // test overrides what it exercises).
    subsystems = { list: vi.fn().mockResolvedValue([]) };
    limits = {
      snapshot: vi.fn().mockResolvedValue({ weekly: { usedPct: 0 }, rolling: { usedPct: 0 } }),
    };
    // NS2 F4c — default fixture: no drift (each test overrides what it exercises).
    selfKnowledge = { check: vi.fn().mockResolvedValue(false) };

    service = new BriefingService(
      approvals as never,
      pipelines as never,
      goals as never,
      channels as never,
      activity as never,
      briefer as never,
      vault as never,
      tasks as never,
      projects as never,
      monitorEvents as never,
      subsystems as never,
      limits as never,
      selfKnowledge as never,
      dir,
      { child: () => ({ info: vi.fn(), warn: vi.fn(), debug: vi.fn() }) } as never,
    );
  });

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("persists a note, advances the cursor, and records the briefing", async () => {
    const { briefing, noteId } = await service.generate(now);
    expect(noteId).toBe("briefing-2026-06-12");
    expect(vault.createNote).toHaveBeenCalledTimes(1);
    expect(vault.daily[0]).toContain("[[briefing-2026-06-12]]");
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "briefing-generated", refs: { noteId } }),
    );

    // The cursor advanced to this briefing's generatedAt.
    const cursor = JSON.parse(await fs.readFile(path.join(dir, "last-briefing.json"), "utf8"));
    expect(cursor.generatedAt).toBe(briefing.generatedAt);
  });

  it("updates (not 409s) when today's briefing is regenerated", async () => {
    await service.generate(now);
    await service.generate(now); // same day → createNote throws Duplicate → updateNote
    expect(vault.createNote).toHaveBeenCalledTimes(2);
    expect(vault.updateNote).toHaveBeenCalledTimes(1);
  });

  it("falls back to the deterministic headline when the briefer returns null", async () => {
    const { briefing } = await service.generate(now);
    expect(briefing.headline).toBe("Nothing needs you.");
    expect(briefer.headline).toHaveBeenCalledTimes(1);
  });

  it("uses the butler-voice headline when the briefer succeeds", async () => {
    briefer.headline.mockResolvedValueOnce("All quiet — I handled the overnight bits.");
    const { briefing } = await service.generate(now);
    expect(briefing.headline).toBe("All quiet — I handled the overnight bits.");
  });

  it("since-cursor defaults to start of today on first assemble", async () => {
    const briefing = await service.assemble(now);
    expect(briefing.since).toBe("2026-06-12T00:00:00.000Z");
  });

  describe("per-subsystem lines (NS2 F3b)", () => {
    it("mirrors the gathered subsystem states and tier counts", async () => {
      subsystems.list.mockResolvedValue([
        subsystemRow("forge", "Forge", "waiting", 0, 2),
        subsystemRow("beacon", "Beacon", "waiting", 0, 1),
        subsystemRow("scout", "Scout", "report", 3, 0),
      ]);
      const briefing = await service.assemble(now);
      expect(briefing.subsystems).toHaveLength(3);
      expect(briefing.subsystems?.[0]).toMatchObject({
        subsystem: "forge",
        name: "Forge",
        state: "waiting",
        tier3Count: 2,
      });
      expect(briefing.subsystems?.[2]).toMatchObject({ subsystem: "scout", tier2Count: 3 });
    });

    it("Ledger's note carries the weekly usage window %", async () => {
      subsystems.list.mockResolvedValue([subsystemRow("ledger", "Ledger")]);
      limits.snapshot.mockResolvedValue({ weekly: { usedPct: 62 }, rolling: { usedPct: 10 } });
      const briefing = await service.assemble(now);
      expect(briefing.subsystems?.[0]?.note).toBe("62 % týdenního okna");
    });

    it("Puls' note reflects CI health from the gathered statuses", async () => {
      subsystems.list.mockResolvedValue([subsystemRow("puls", "Puls")]);
      monitorEvents.listStatuses.mockResolvedValue([
        {
          integrationId: "gh",
          adapterKind: "github-ci",
          state: "green",
          sinceAt: now.toISOString(),
          summary: "ok",
        },
      ]);
      const green = await service.assemble(now);
      expect(green.subsystems?.[0]?.note).toBe("CI zelené");

      monitorEvents.listStatuses.mockResolvedValue([
        {
          integrationId: "gh",
          adapterKind: "github-ci",
          state: "red",
          sinceAt: now.toISOString(),
          summary: "boom",
        },
      ]);
      const red = await service.assemble(now);
      expect(red.subsystems?.[0]?.note).toBe("CI červená (1)");
    });

    it("a failed subsystem read omits the lines but the briefing still assembles", async () => {
      subsystems.list.mockRejectedValue(new Error("registry down"));
      const briefing = await service.assemble(now);
      expect(briefing.subsystems).toBeUndefined();
      expect(briefing.headline).toBe("Nothing needs you.");
    });

    it("a failed limits read only drops Ledger's note, not the section", async () => {
      subsystems.list.mockResolvedValue([subsystemRow("ledger", "Ledger")]);
      limits.snapshot.mockRejectedValue(new Error("statusline missing"));
      const briefing = await service.assemble(now);
      expect(briefing.subsystems).toHaveLength(1);
      expect(briefing.subsystems?.[0]?.note).toBeUndefined();
    });
  });

  describe("self-knowledge drift (NS2 F4c)", () => {
    it("omits selfKnowledgeDrift when the check reports no drift", async () => {
      selfKnowledge.check.mockResolvedValue(false);
      const briefing = await service.assemble(now);
      expect(briefing.selfKnowledgeDrift).toBeUndefined();
    });

    it("surfaces selfKnowledgeDrift: true when the check reports drift", async () => {
      selfKnowledge.check.mockResolvedValue(true);
      const briefing = await service.assemble(now);
      expect(briefing.selfKnowledgeDrift).toBe(true);
    });

    it("a failed drift check fails open — omits the field, the briefing still assembles", async () => {
      selfKnowledge.check.mockRejectedValue(new Error("compose failed"));
      const briefing = await service.assemble(now);
      expect(briefing.selfKnowledgeDrift).toBeUndefined();
      expect(briefing.headline).toBe("Nothing needs you.");
    });
  });
});
