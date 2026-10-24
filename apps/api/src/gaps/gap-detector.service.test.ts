import { mkdtempSync, rmSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ActivityEntry } from "@zibby/contracts";
import { ProposalsService, proposalId } from "../proposals/proposals.service";
import { ProposalsStore } from "../proposals/proposals.store";
import { GapDetectorService } from "./gap-detector.service";

const tmpDirs: string[] = [];
afterEach(() => {
  for (const d of tmpDirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function makeProposals(): ProposalsService {
  const dir = mkdtempSync(path.join(os.tmpdir(), "gaps-proposals-"));
  tmpDirs.push(dir);
  const logger = { child: () => ({ info: vi.fn(), warn: vi.fn(), debug: vi.fn() }) };
  return new ProposalsService(
    new ProposalsStore(dir),
    { record: vi.fn(async () => {}) } as never,
    {} as never,
    logger as never,
  );
}

function taskCreated(summary: string, daysAgo = 1, i = 0): ActivityEntry {
  return {
    id: `tc-${summary}-${daysAgo}-${i}`,
    at: new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000).toISOString(),
    kind: "task-created",
    summary,
    refs: {},
  };
}

function makeService(
  entries: ActivityEntry[] = [],
  vaultBody = "",
  proposals: ProposalsService = makeProposals(),
) {
  const activity = { readRange: vi.fn(async () => entries) };
  const vault = {
    note: vi.fn(async () => {
      if (!vaultBody) throw new Error("not found");
      return {
        id: "suggestions/automation-gaps",
        title: "Automation Gaps",
        body: vaultBody,
        tier: "memory",
      };
    }),
    updateNote: vi.fn(async () => ({}) as never),
    createNote: vi.fn(async () => ({}) as never),
  };
  const logger = { child: () => ({ info: vi.fn(), warn: vi.fn(), debug: vi.fn() }) };
  return {
    svc: new GapDetectorService(activity as never, vault as never, logger as never, proposals),
    vault,
    proposals,
  };
}

describe("GapDetectorService", () => {
  it("returns no gaps when there is no task-created activity", async () => {
    const { svc } = makeService([]);
    const result = await svc.detect(new Date());
    expect(result.gaps).toHaveLength(0);
    expect(result.suggestions).toHaveLength(0);
  });

  it("ignores a summary that repeats below the 3× threshold", async () => {
    const { svc } = makeService([
      taskCreated("Deploy to staging", 1),
      taskCreated("Deploy to staging", 2),
    ]);
    const result = await svc.detect(new Date());
    expect(result.gaps).toHaveLength(0);
  });

  it("flags a recurring task summary (≥3×, punctuation/case-insensitive) and writes the vault note", async () => {
    const { svc, vault } = makeService([
      taskCreated("Deploy to staging", 1, 1),
      taskCreated("deploy to STAGING!", 2, 2),
      taskCreated("Deploy   to staging", 3, 3),
    ]);
    const result = await svc.detect(new Date());
    expect(result.gaps).toHaveLength(1);
    expect(result.gaps[0]?.count).toBe(3);
    expect(result.suggestions[0]).toContain("automate it?");
    expect(vault.updateNote).toHaveBeenCalled();
  });

  it("ignores non-task-created kinds", async () => {
    const entries: ActivityEntry[] = [
      { id: "x", at: new Date().toISOString(), kind: "run-finished", summary: "x done", refs: {} },
      { id: "y", at: new Date().toISOString(), kind: "run-finished", summary: "x done", refs: {} },
      { id: "z", at: new Date().toISOString(), kind: "run-finished", summary: "x done", refs: {} },
    ];
    const { svc } = makeService(entries);
    expect((await svc.detect(new Date())).gaps).toHaveLength(0);
  });

  it("reads the suggestion bullets back for the briefing", async () => {
    const body =
      '*Updated: 2026-06-17*\n\n- [ ] You created 3 similar tasks ("X") — automate it?\n';
    const { svc } = makeService([], body);
    expect(await svc.readGaps()).toEqual(['You created 3 similar tasks ("X") — automate it?']);
  });

  describe("proposals (TODO 14)", () => {
    const recurring = (summary: string, n: number) =>
      Array.from({ length: n }, (_, i) => taskCreated(summary, i + 1, i));
    const writtenBody = (vault: ReturnType<typeof makeService>["vault"]): string => {
      const call = vault.updateNote.mock.calls.at(-1) as unknown as [string, { body: string }];
      return call[1].body;
    };

    it("upserts one proposal per gap keyed by the normalized pattern", async () => {
      const { svc, proposals } = makeService(recurring("Deploy to staging", 7));
      await svc.detect(new Date(), { automationId: "gap-detect" });
      const listed = await proposals.list();
      expect(listed).toHaveLength(1);
      expect(listed[0]).toMatchObject({
        id: proposalId("gap-detect", "deploy to staging"),
        source: "gap-detect",
        occurrences: 7,
        confidence: "high",
        provenance: { automationId: "gap-detect", noteId: "suggestions/automation-gaps" },
      });
    });

    it("a dismissed proposal is omitted from the note on rerun", async () => {
      const { svc, vault, proposals } = makeService([
        ...recurring("Deploy to staging", 3),
        ...recurring("Rotate logs", 3),
      ]);
      await svc.detect(new Date());
      await proposals.decide(proposalId("gap-detect", "deploy to staging"), {
        action: "dismiss",
      });
      const rerun = await svc.detect(new Date());
      expect(writtenBody(vault)).not.toContain("Deploy to staging");
      expect(writtenBody(vault)).toContain("Rotate logs");
      expect(rerun.suggestions).toHaveLength(1);
    });

    it("an edited proposal is written with editedText", async () => {
      const { svc, vault, proposals } = makeService(recurring("Deploy to staging", 3));
      await svc.detect(new Date());
      await proposals.decide(proposalId("gap-detect", "deploy to staging"), {
        action: "edit",
        text: "Nightly staging deploy automation",
      });
      await svc.detect(new Date());
      expect(writtenBody(vault)).toContain("- [ ] Nightly staging deploy automation");
    });
  });
});
