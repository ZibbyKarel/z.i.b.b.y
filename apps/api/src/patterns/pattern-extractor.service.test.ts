import { describe, expect, it, vi } from "vitest";
import type { ActivityEntry } from "@zibby/contracts";
import { PatternExtractorService } from "./pattern-extractor.service";

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

function makeService(entries: ActivityEntry[] = [], vaultBody = "") {
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
    svc: new PatternExtractorService(activity as never, vault as never, logger as never),
    vault,
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
});
