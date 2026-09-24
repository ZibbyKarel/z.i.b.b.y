import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { Approval, ReplyLedgerEntry } from "@zibby/contracts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HeraldGraduationStore } from "./herald-graduation.store";
import { HeraldService } from "./herald.service";
import { ReplyLedgerStore } from "./reply-ledger.store";

const fakeLogger = {
  child: () => ({ info: () => {}, warn: () => {}, debug: () => {}, error: () => {} }),
};

let seq = 0;
const entry = (over: Partial<ReplyLedgerEntry> = {}): ReplyLedgerEntry => {
  seq += 1;
  return {
    id: `reply_${seq}`,
    integrationId: "team",
    kind: "slack",
    itemId: `C1-${seq}`,
    category: "question",
    confidence: 0.8,
    tier: 3,
    outcome: "approved",
    proposedAt: `2026-07-17T00:00:${String(seq).padStart(2, "0")}.000Z`,
    ...over,
  };
};

describe("HeraldService", () => {
  let dir: string;
  let ledger: ReplyLedgerStore;
  let graduation: HeraldGraduationStore;
  let requestApproval: ReturnType<typeof vi.fn>;
  let pendingApprovals: Approval[];
  let service: HeraldService;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "herald-"));
    process.env.HERALD_GRADUATION_THRESHOLD = "3";
    seq = 0;
    ledger = new ReplyLedgerStore(path.join(dir, "ledger"), fakeLogger as never);
    graduation = new HeraldGraduationStore(path.join(dir, "graduations.json"), fakeLogger as never);
    pendingApprovals = [];
    requestApproval = vi.fn(async () => ({ id: "appr_grad_1" }));
    const approvals = {
      register: vi.fn(),
      requestApproval,
      list: vi.fn(async () => pendingApprovals),
    };
    service = new HeraldService(
      ledger,
      graduation,
      approvals as never,
      { record: async () => {} } as never,
      fakeLogger as never,
    );
  });
  afterEach(async () => {
    delete process.env.HERALD_GRADUATION_THRESHOLD;
    await fs.rm(dir, { recursive: true, force: true });
  });

  /** Seed `n` already-approved entries + one pending entry, return the pending one. */
  async function seedStreak(
    n: number,
    over: Partial<ReplyLedgerEntry> = {},
  ): Promise<ReplyLedgerEntry> {
    for (let i = 0; i < n; i++) await ledger.record(entry({ outcome: "approved", ...over }));
    const pending = entry({ outcome: "pending", ...over });
    await ledger.record(pending);
    return pending;
  }

  it("a decision that completes the streak parks exactly one herald-graduation approval", async () => {
    const pending = await seedStreak(2); // 2 approved + this approval = 3 = threshold
    await service.recordDecision(pending.itemId, "team", "question", "approved");
    expect(requestApproval).toHaveBeenCalledTimes(1);
    expect(requestApproval.mock.calls[0]![0]).toMatchObject({
      kind: "herald-graduation",
      runId: "team/question",
      risk: "medium",
      action: "graduate-tier2",
    });
  });

  it("below the threshold no graduation is proposed", async () => {
    const pending = await seedStreak(1); // 1 + 1 = 2 < 3
    await service.recordDecision(pending.itemId, "team", "question", "approved");
    expect(requestApproval).not.toHaveBeenCalled();
  });

  it("a pending graduation approval for the pair suppresses a second park (no nagging)", async () => {
    pendingApprovals = [
      { kind: "herald-graduation", runId: "team/question", status: "pending" } as Approval,
    ];
    const pending = await seedStreak(5);
    await service.recordDecision(pending.itemId, "team", "question", "approved");
    expect(requestApproval).not.toHaveBeenCalled();
  });

  it("a rejected decision resets the streak — no park even past the threshold", async () => {
    const pending = await seedStreak(5);
    await service.recordDecision(pending.itemId, "team", "question", "rejected");
    expect(requestApproval).not.toHaveBeenCalled();
    // And the next approval starts from a broken streak:
    expect(await ledger.consecutiveApproved("team", "question")).toBe(0);
  });

  it("resume writes the graduation — isGraduated flips true (invariant e: Tier-3 decided)", async () => {
    await seedStreak(3);
    expect(await service.isGraduated("team", "question")).toBe(false);
    await service.resume("team/question");
    expect(await service.isGraduated("team", "question")).toBe(true);
    const all = await graduation.list();
    expect(all[0]).toMatchObject({ integrationId: "team", kind: "slack", category: "question" });
    expect(all[0]!.evidenceCount).toBeGreaterThanOrEqual(1);
  });

  it("cancel writes nothing — the pair stays Tier-3, the streak survives", async () => {
    await seedStreak(3);
    service.cancel("team/question");
    expect(await service.isGraduated("team", "question")).toBe(false);
    expect(await ledger.consecutiveApproved("team", "question")).toBe(3);
  });

  it("an already-graduated pair never re-proposes", async () => {
    await graduation.add({
      integrationId: "team",
      kind: "slack",
      category: "question",
      evidenceCount: 3,
      approvalId: "appr_old",
      graduatedAt: "2026-07-17T00:00:00.000Z",
    });
    const pending = await seedStreak(5);
    await service.recordDecision(pending.itemId, "team", "question", "approved");
    expect(requestApproval).not.toHaveBeenCalled();
  });

  it("email/notify-only defense (invariant a): an email-kind streak never proposes graduation", async () => {
    const pending = await seedStreak(5, { kind: "email" });
    await service.recordDecision(pending.itemId, "team", "question", "approved");
    expect(requestApproval).not.toHaveBeenCalled();
  });

  it("resume on an unparseable runId is a warn no-op", async () => {
    await expect(service.resume("garbage")).resolves.toBeUndefined();
    await expect(service.resume("team/not-a-category")).resolves.toBeUndefined();
    expect(await graduation.list()).toEqual([]);
  });

  it("recordDecision with no matching pending entry is a warn no-op", async () => {
    await expect(
      service.recordDecision("missing-item", "team", "question", "approved"),
    ).resolves.toBeUndefined();
    expect(requestApproval).not.toHaveBeenCalled();
  });
});
