import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
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

function taskCreated(summary: string, daysAgo = 1, i = 0, manual = true): ActivityEntry {
  return {
    id: `tc-${summary}-${daysAgo}-${i}`,
    at: new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000).toISOString(),
    kind: "task-created",
    summary,
    refs: { taskId: `task-${daysAgo}-${i}`, ...(manual ? { manual } : {}) },
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
        id: "automation-gaps",
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
  it("ignores tasks not created by hand (autopilot, inbox flows, automations)", async () => {
    const { svc } = makeService([
      taskCreated("Address review comments: acme#1", 1, 1, false),
      taskCreated("Address review comments: acme#1", 2, 2, false),
      taskCreated("Address review comments: acme#1", 3, 3, false),
    ]);
    expect((await svc.detect(new Date())).gaps).toHaveLength(0);
  });

  it("links the most recent task and expires a gap that stopped recurring", async () => {
    const proposals = makeProposals();
    const recurring = [1, 2, 3].map((d) => taskCreated("Standup", d, d));
    // Activity is read oldest first.
    await makeService([...recurring].reverse(), "", proposals).svc.detect(new Date());
    const [open] = await proposals.list();
    expect(open?.provenance.taskId).toBe("task-1-1");

    await makeService([], "", proposals).svc.detect(new Date());
    expect(await proposals.list()).toHaveLength(0);
  });

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
        provenance: {
          automationId: "gap-detect",
          noteId: "automation-gaps",
          sample: "Deploy to staging",
        },
      });
    });

    it("strips the activity 'task created:' prefix from the stored sample", async () => {
      const { svc, proposals } = makeService(recurring("task created: Standup", 3));
      await svc.detect(new Date());
      const listed = await proposals.list();
      expect(listed[0]?.provenance.sample).toBe("Standup");
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

    it("rewrites the note without a dismissed line when nothing qualifies any more", async () => {
      const proposals = makeProposals();
      await makeService(recurring("Deploy to staging", 3), "", proposals).svc.detect(new Date());
      const dismissed = (await proposals.list())[0];
      if (!dismissed) throw new Error("no proposal");
      await proposals.decide(dismissed.id, { action: "dismiss" });
      const body = `- [ ] ${dismissed.text}\n- [ ] Stale but not dismissed\n`;
      const { svc, vault } = makeService([], body, proposals);
      await svc.detect(new Date());
      expect(writtenBody(vault)).not.toContain("Deploy to staging");
      expect(writtenBody(vault)).toContain("- [ ] Stale but not dismissed");
    });

    it("does not touch the note when nothing qualifies and nothing is dismissed", async () => {
      const { svc, vault } = makeService([], "- [ ] Stale but not dismissed\n");
      await svc.detect(new Date());
      expect(vault.updateNote).not.toHaveBeenCalled();
      expect(vault.createNote).not.toHaveBeenCalled();
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

    it("a corrupt proposals.json is quarantined (bytes kept) and the note is still written", async () => {
      const dir = mkdtempSync(path.join(os.tmpdir(), "gaps-corrupt-"));
      tmpDirs.push(dir);
      writeFileSync(path.join(dir, "proposals.json"), "{ corrupt");
      const logger = { child: () => ({ info: vi.fn(), warn: vi.fn(), debug: vi.fn() }) };
      const proposals = new ProposalsService(
        new ProposalsStore(dir),
        { record: vi.fn(async () => {}) } as never,
        {} as never,
        logger as never,
      );
      expect(await proposals.list()).toEqual([]);
      const { svc, vault } = makeService(recurring("Deploy to staging", 3), "", proposals);
      await svc.detect(new Date());
      const quarantined = readdirSync(dir).filter((n) => n.startsWith("proposals.json.corrupt-"));
      expect(quarantined).toHaveLength(1);
      expect(readFileSync(path.join(dir, quarantined[0] ?? ""), "utf8")).toBe("{ corrupt");
      expect(await proposals.list()).toHaveLength(1);
      expect(writtenBody(vault)).toContain("Deploy to staging");
    });
  });
});
