import { mkdtempSync, rmSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ActivityEntry } from "@zibby/contracts";
import { ProposalsService, proposalId } from "../proposals/proposals.service";
import { ProposalsStore } from "../proposals/proposals.store";
import { PatternExtractorService } from "./pattern-extractor.service";

const tmpDirs: string[] = [];
afterEach(() => {
  for (const d of tmpDirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function makeProposals(): ProposalsService {
  const dir = mkdtempSync(path.join(os.tmpdir(), "patterns-proposals-"));
  tmpDirs.push(dir);
  const logger = { child: () => ({ info: vi.fn(), warn: vi.fn(), debug: vi.fn() }) };
  return new ProposalsService(
    new ProposalsStore(dir),
    { record: vi.fn(async () => {}) } as never,
    {} as never,
    logger as never,
  );
}

function makeEntry(
  kind: "approval-approved" | "approval-rejected",
  action: string,
  daysAgo = 1,
): ActivityEntry {
  const at = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000).toISOString();
  return {
    id: `${kind}-${action}-${daysAgo}`,
    at,
    kind,
    summary: `${kind} ${action}`,
    refs: { action, decision: kind === "approval-approved" ? "approved" : "rejected" },
  };
}

function makeService(
  entries: ActivityEntry[] = [],
  vaultBody = "",
  proposals: ProposalsService = makeProposals(),
) {
  const activity = {
    readRange: vi.fn(async () => entries),
  };
  const vault = {
    note: vi.fn(async () => {
      if (!vaultBody) throw new Error("not found");
      return {
        id: "patterns/suggestions",
        title: "Pattern Suggestions",
        body: vaultBody,
        tier: "memory",
      };
    }),
    updateNote: vi.fn(async () => ({}) as never),
    createNote: vi.fn(async () => ({}) as never),
  };
  const logger = { child: () => ({ info: vi.fn(), warn: vi.fn(), debug: vi.fn() }) };
  return {
    svc: new PatternExtractorService(activity as never, vault as never, logger as never, proposals),
    vault,
    proposals,
  };
}

describe("PatternExtractorService", () => {
  it("returns empty results when no approval activity exists", async () => {
    const { svc } = makeService([]);
    const result = await svc.extract(new Date());
    expect(result.patterns).toHaveLength(0);
    expect(result.proposals).toHaveLength(0);
  });

  it("ignores entries that don't meet the 3-occurrence threshold", async () => {
    const entries = [
      makeEntry("approval-approved", "deploy", 1),
      makeEntry("approval-approved", "deploy", 2),
    ];
    const { svc } = makeService(entries);
    const result = await svc.extract(new Date());
    expect(result.patterns).toHaveLength(0);
  });

  it("surfaces approved pattern meeting threshold as proposal", async () => {
    const entries = [
      makeEntry("approval-approved", "deploy", 1),
      makeEntry("approval-approved", "deploy", 2),
      makeEntry("approval-approved", "deploy", 3),
    ];
    const { svc } = makeService(entries);
    const result = await svc.extract(new Date());
    expect(result.patterns).toHaveLength(1);
    expect(result.patterns[0]?.action).toBe("deploy");
    expect(result.patterns[0]?.decision).toBe("approved");
    expect(result.patterns[0]?.count).toBe(3);
    expect(result.proposals[0]).toContain("Always allow");
    expect(result.proposals[0]).toContain("deploy");
  });

  it("surfaces rejected pattern as deny proposal", async () => {
    const entries = [
      makeEntry("approval-rejected", "delete-all", 1),
      makeEntry("approval-rejected", "delete-all", 2),
      makeEntry("approval-rejected", "delete-all", 3),
    ];
    const { svc } = makeService(entries);
    const result = await svc.extract(new Date());
    expect(result.proposals[0]).toContain("Always deny");
    expect(result.proposals[0]).toContain("delete-all");
  });

  it("writes proposals to vault when patterns found", async () => {
    const entries = Array.from({ length: 3 }, (_, i) =>
      makeEntry("approval-approved", "send-email", i + 1),
    );
    const { svc, vault } = makeService(entries);
    await svc.extract(new Date());
    // updateNote is tried first; createNote is the fallback when the note doesn't exist yet.
    const wrote = vault.updateNote.mock.calls.length > 0 || vault.createNote.mock.calls.length > 0;
    expect(wrote).toBe(true);
  });

  it("readProposals parses bullet items from vault note body", async () => {
    const body = [
      "*Updated: 2026-06-17*",
      "",
      '- [ ] Always allow "deploy" (approved 3× in the past 30 days)',
      '- [x] Always deny "delete-all" (rejected 4× in the past 30 days)',
    ].join("\n");
    const { svc } = makeService([], body);
    const proposals = await svc.readProposals();
    expect(proposals).toHaveLength(2);
    expect(proposals[0]).toContain("Always allow");
    expect(proposals[1]).toContain("Always deny");
  });

  it("readProposals returns [] when vault note is missing", async () => {
    const { svc } = makeService([]);
    const proposals = await svc.readProposals();
    expect(proposals).toHaveLength(0);
  });

  it("separates approved and rejected patterns for the same action", async () => {
    const entries = [
      ...Array.from({ length: 3 }, (_, i) => makeEntry("approval-approved", "pr.open", i + 1)),
      ...Array.from({ length: 3 }, (_, i) => makeEntry("approval-rejected", "pr.open", i + 10)),
    ];
    const { svc } = makeService(entries);
    const result = await svc.extract(new Date());
    expect(result.patterns).toHaveLength(2);
    const actions = result.patterns.map((p) => p.decision).sort();
    expect(actions).toEqual(["approved", "rejected"]);
  });

  describe("proposals (TODO 14)", () => {
    const deploys = () =>
      Array.from({ length: 4 }, (_, i) => makeEntry("approval-approved", "deploy", i + 1));
    const writtenBody = (vault: ReturnType<typeof makeService>["vault"]): string => {
      const call = vault.updateNote.mock.calls.at(-1) as unknown as [string, { body: string }];
      return call[1].body;
    };

    it("upserts one proposal per pattern with provenance and confidence", async () => {
      const { svc, proposals } = makeService(deploys());
      await svc.extract(new Date(), { automationId: "nightly-patterns" });
      const listed = await proposals.list();
      expect(listed).toHaveLength(1);
      expect(listed[0]).toMatchObject({
        id: proposalId("pattern-extract", "deploy:approved"),
        source: "pattern-extract",
        occurrences: 4,
        confidence: "medium",
        provenance: { automationId: "nightly-patterns", noteId: "patterns/suggestions" },
      });
      expect(listed[0]?.text).toContain("Always allow");
    });

    it("omits automationId when the run is not attributed to an automation", async () => {
      const { svc, proposals } = makeService(deploys());
      await svc.extract(new Date());
      expect((await proposals.list())[0]?.provenance).toEqual({ noteId: "patterns/suggestions" });
    });

    it("a dismissed proposal is omitted from the note on rerun", async () => {
      const entries = [
        ...deploys(),
        ...Array.from({ length: 3 }, (_, i) => makeEntry("approval-rejected", "wipe", i + 1)),
      ];
      const { svc, vault, proposals } = makeService(entries);
      await svc.extract(new Date());
      await proposals.decide(proposalId("pattern-extract", "deploy:approved"), {
        action: "dismiss",
      });
      const rerun = await svc.extract(new Date());
      const body = writtenBody(vault);
      expect(body).not.toContain('"deploy"');
      expect(body).toContain('"wipe"');
      expect(rerun.proposals).toHaveLength(1);
    });

    it("an edited proposal is written with editedText (producer text still refreshed)", async () => {
      const { svc, vault, proposals } = makeService(deploys());
      await svc.extract(new Date());
      const id = proposalId("pattern-extract", "deploy:approved");
      await proposals.decide(id, { action: "edit", text: "Let deploys through" });
      await svc.extract(new Date());
      expect(writtenBody(vault)).toContain("- [ ] Let deploys through");
      const record = (await proposals.decisions("pattern-extract")).get(id);
      expect(record?.editedText).toBe("Let deploys through");
      expect(record?.text).toContain("Always allow");
    });

    it("still writes the note when the proposals store fails", async () => {
      const brokenStore = {
        readAll: vi.fn(async () => []),
        mutate: vi.fn(async () => Promise.reject(new Error("disk"))),
      };
      const logger = { child: () => ({ info: vi.fn(), warn: vi.fn(), debug: vi.fn() }) };
      const broken = new ProposalsService(
        brokenStore as never,
        { record: vi.fn() } as never,
        {} as never,
        logger as never,
      );
      const { svc, vault } = makeService(deploys(), "", broken);
      const result = await svc.extract(new Date());
      expect(result.proposals).toHaveLength(1);
      expect(writtenBody(vault)).toContain("Always allow");
    });
  });
});
