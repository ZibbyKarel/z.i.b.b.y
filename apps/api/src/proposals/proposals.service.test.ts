import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { Approval } from "@zibby/contracts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApprovalAlreadyDecidedError } from "../approvals/approvals.errors";
import { ProposalsStore } from "./proposals.store";
import {
  ProposalConflictError,
  ProposalNotFoundError,
  ProposalsService,
  confidenceFor,
  proposalId,
} from "./proposals.service";

const NOW = new Date("2026-10-24T08:00:00.000Z");
const DAY = 24 * 60 * 60 * 1000;
const at = (days: number) => new Date(NOW.getTime() + days * DAY);

function pendingApproval(id: string, runId: string): Approval {
  return {
    id,
    runId,
    kind: "agent-proposal",
    skill: "agent-factory",
    action: "agent.propose_new",
    detail: "{}",
    risk: "medium",
    status: "pending",
    requestedAt: NOW.toISOString(),
  };
}

describe("proposalId / confidenceFor", () => {
  it("is stable for the same source+key and differs across source or key", () => {
    expect(proposalId("gap-detect", "deploy to staging")).toBe(
      proposalId("gap-detect", "deploy to staging"),
    );
    expect(proposalId("gap-detect", "a")).not.toBe(proposalId("pattern-extract", "a"));
    expect(proposalId("gap-detect", "a")).not.toBe(proposalId("gap-detect", "b"));
    expect(proposalId("gap-detect", "a")).toMatch(/^prop_[0-9a-f]{12}$/);
  });

  it("buckets with m = 3: ≤3 low, ≤6 medium, 7 high", () => {
    expect(confidenceFor(3, 3)).toBe("low");
    expect(confidenceFor(4, 3)).toBe("medium");
    expect(confidenceFor(6, 3)).toBe("medium");
    expect(confidenceFor(7, 3)).toBe("high");
  });
});

describe("ProposalsService", () => {
  let dir: string;
  let store: ProposalsStore;
  let activity: { record: ReturnType<typeof vi.fn> };
  let approvals: {
    get: ReturnType<typeof vi.fn>;
    reject: ReturnType<typeof vi.fn>;
    list: ReturnType<typeof vi.fn>;
  };
  let svc: ProposalsService;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "proposals-svc-"));
    store = new ProposalsStore(path.join(dir, "proposals"));
    activity = { record: vi.fn(async () => {}) };
    approvals = {
      get: vi.fn(async (id: string) => pendingApproval(id, "agent-x")),
      list: vi.fn(async () => [pendingApproval("appr_1", "agent-x")]),
      reject: vi.fn(async (id: string) => ({
        ...pendingApproval(id, "agent-x"),
        status: "rejected",
      })),
    };
    const logger = { child: () => ({ info: vi.fn(), warn: vi.fn(), debug: vi.fn() }) };
    svc = new ProposalsService(store, activity as never, approvals as never, logger as never);
  });
  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  const gap = (over: Partial<Parameters<ProposalsService["upsert"]>[0]> = {}) =>
    svc.upsert({
      source: "gap-detect",
      key: "deploy to staging",
      text: "Automate deploy?",
      occurrences: 3,
      minOccurrences: 3,
      provenance: { noteId: "suggestions/automation-gaps" },
      now: NOW,
      ...over,
    });

  it("upsert creates an open record with confidence, lastSeenAt and expiry = +30 days", async () => {
    const p = await gap();
    expect(p).toMatchObject({
      id: proposalId("gap-detect", "deploy to staging"),
      source: "gap-detect",
      text: "Automate deploy?",
      confidence: "low",
      occurrences: 3,
      status: "open",
      createdAt: NOW.toISOString(),
      lastSeenAt: NOW.toISOString(),
      expiresAt: at(30).toISOString(),
    });
    expect(await svc.list(NOW)).toEqual([p]);
  });

  it("upsert caps text at 500 chars", async () => {
    const p = await gap({ text: "x".repeat(800) });
    expect(p.text).toHaveLength(500);
  });

  it("rerun updates text/occurrences/confidence/seen/expiry/provenance but keeps status, editedText, decidedAt, createdAt", async () => {
    const first = await gap();
    await svc.decide(first.id, { action: "edit", text: "  Mine  " }, at(1));
    const second = await gap({
      text: "Automate deploy now?",
      occurrences: 7,
      provenance: { noteId: "suggestions/automation-gaps", automationId: "gap-detect" },
      now: at(2),
    });
    expect(second).toMatchObject({
      id: first.id,
      text: "Automate deploy now?",
      editedText: "Mine",
      occurrences: 7,
      confidence: "high",
      createdAt: NOW.toISOString(),
      lastSeenAt: at(2).toISOString(),
      expiresAt: at(32).toISOString(),
      decidedAt: at(1).toISOString(),
      provenance: { noteId: "suggestions/automation-gaps", automationId: "gap-detect" },
      status: "open",
    });
    expect(await svc.list(at(2))).toHaveLength(1);
  });

  it("a dismissed proposal is never re-opened by a rerun", async () => {
    const first = await gap();
    await svc.decide(first.id, { action: "dismiss" }, at(1));
    const again = await gap({ now: at(2), occurrences: 9 });
    expect(again.status).toBe("dismissed");
    expect(await svc.list(at(2))).toEqual([]);
    expect((await svc.decisions("gap-detect")).get(first.id)?.status).toBe("dismissed");
  });

  it("expired proposals are not listed but are kept on disk", async () => {
    const p = await gap();
    expect(await svc.list(at(29))).toHaveLength(1);
    expect(await svc.list(at(30))).toEqual([]);
    expect((await store.readAll()).map((x) => x.id)).toEqual([p.id]);
  });

  it("lists confidence high first, then lastSeenAt descending", async () => {
    const low = await gap({ key: "a", occurrences: 3, now: at(3) });
    const highOld = await gap({ key: "b", occurrences: 9, now: at(1) });
    const highNew = await gap({ key: "c", occurrences: 9, now: at(2) });
    const medium = await gap({ key: "d", occurrences: 5, now: at(4) });
    expect((await svc.list(at(4))).map((p) => p.id)).toEqual([
      highNew.id,
      highOld.id,
      medium.id,
      low.id,
    ]);
  });

  it("decide edit trims, validates 1–500 chars and sets decidedAt + records activity", async () => {
    const p = await gap();
    const edited = await svc.decide(p.id, { action: "edit", text: "  Better wording " }, at(1));
    expect(edited.editedText).toBe("Better wording");
    expect(edited.decidedAt).toBe(at(1).toISOString());
    expect(activity.record).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "proposal-decided",
        summary: expect.stringContaining("edited"),
        refs: expect.objectContaining({ itemId: p.id, action: "edit" }),
      }),
    );
    expect(String(activity.record.mock.calls[0]?.[0].summary)).toContain("gap-detect");
    await expect(svc.decide(p.id, { action: "edit", text: "   " }, at(1))).rejects.toThrow();
    await expect(
      svc.decide(p.id, { action: "edit", text: "x".repeat(501) }, at(1)),
    ).rejects.toThrow();
  });

  it("decide dismiss sets status + decidedAt and records activity", async () => {
    const p = await gap();
    const dismissed = await svc.decide(p.id, { action: "dismiss" }, at(1));
    expect(dismissed).toMatchObject({ status: "dismissed", decidedAt: at(1).toISOString() });
    expect(activity.record).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "proposal-decided",
        summary: expect.stringContaining("dismissed"),
        refs: expect.objectContaining({ itemId: p.id, action: "dismiss" }),
      }),
    );
  });

  it("decide on an unknown id → ProposalNotFoundError", async () => {
    await expect(svc.decide("prop_nope", { action: "dismiss" })).rejects.toBeInstanceOf(
      ProposalNotFoundError,
    );
  });

  it("any decide on a dismissed proposal → ProposalConflictError", async () => {
    const p = await gap();
    await svc.decide(p.id, { action: "dismiss" });
    await expect(svc.decide(p.id, { action: "dismiss" })).rejects.toBeInstanceOf(
      ProposalConflictError,
    );
    await expect(svc.decide(p.id, { action: "edit", text: "x" })).rejects.toBeInstanceOf(
      ProposalConflictError,
    );
  });

  describe("agent-factory", () => {
    const agent = () =>
      svc.upsert({
        source: "agent-factory",
        key: "agent-x",
        text: 'New agent "X"',
        occurrences: 4,
        minOccurrences: 3,
        provenance: { agentId: "agent-x", approvalId: "appr_1" },
        now: NOW,
      });

    it("edit → ProposalConflictError (edited on the agent page)", async () => {
      const p = await agent();
      await expect(svc.decide(p.id, { action: "edit", text: "x" })).rejects.toBeInstanceOf(
        ProposalConflictError,
      );
    });

    it("dismiss rejects the pending agent-proposal approval through ApprovalsService.reject", async () => {
      const p = await agent();
      const res = await svc.decide(p.id, { action: "dismiss" });
      expect(res.status).toBe("dismissed");
      expect(approvals.reject).toHaveBeenCalledTimes(1);
      expect(approvals.reject.mock.calls[0]?.[0]).toBe("appr_1");
    });

    it("dismiss with an already-decided approval only updates the record", async () => {
      approvals.get.mockResolvedValueOnce({
        ...pendingApproval("appr_1", "agent-x"),
        status: "approved",
      });
      const p = await agent();
      expect((await svc.decide(p.id, { action: "dismiss" })).status).toBe("dismissed");
      expect(approvals.reject).not.toHaveBeenCalled();
    });

    it("dismiss tolerates a reject race (already decided) and a missing approval", async () => {
      approvals.reject.mockRejectedValueOnce(new ApprovalAlreadyDecidedError("appr_1"));
      const p = await agent();
      expect((await svc.decide(p.id, { action: "dismiss" })).status).toBe("dismissed");
    });

    it("is hidden from the list once its approval is no longer pending", async () => {
      await agent();
      approvals.list.mockResolvedValueOnce([]);
      expect(await svc.list(NOW)).toEqual([]);
      expect(await svc.list(NOW)).toHaveLength(1);
      approvals.list.mockRejectedValueOnce(new Error("disk"));
      expect(await svc.list(NOW)).toHaveLength(1);
      expect(approvals.list).toHaveBeenCalledWith("pending");
    });
  });
});
