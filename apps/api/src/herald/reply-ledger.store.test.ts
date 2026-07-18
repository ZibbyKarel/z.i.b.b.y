import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { ReplyLedgerEntry } from "@zibby/contracts";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
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
    outcome: "pending",
    proposedAt: `2026-07-17T00:00:${String(seq).padStart(2, "0")}.000Z`,
    ...over,
  };
};

describe("ReplyLedgerStore", () => {
  let dir: string;
  let store: ReplyLedgerStore;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "reply-ledger-"));
    store = new ReplyLedgerStore(dir, fakeLogger as never);
    seq = 0;
  });
  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("record → list round-trips, sorted by proposedAt", async () => {
    const b = entry({ proposedAt: "2026-07-17T00:00:02.000Z" });
    const a = entry({ proposedAt: "2026-07-17T00:00:01.000Z" });
    await store.record(b);
    await store.record(a);
    const listed = await store.list();
    expect(listed.map((e) => e.id)).toEqual([a.id, b.id]);
  });

  it("patchOutcome updates outcome + decidedAt", async () => {
    const e = entry();
    await store.record(e);
    await store.patchOutcome(e.id, "approved", "2026-07-17T01:00:00.000Z");
    const listed = await store.list();
    expect(listed[0]?.outcome).toBe("approved");
    expect(listed[0]?.decidedAt).toBe("2026-07-17T01:00:00.000Z");
  });

  it("patchOutcome on a missing id is a warn no-op, never a throw", async () => {
    await expect(
      store.patchOutcome("reply_missing", "approved", "2026-07-17T01:00:00.000Z"),
    ).resolves.toBeUndefined();
  });

  it("listFiltered narrows by integrationId and category", async () => {
    await store.record(entry({ integrationId: "team", category: "question" }));
    await store.record(entry({ integrationId: "team", category: "bug" }));
    await store.record(entry({ integrationId: "other", category: "question" }));
    const filtered = await store.listFiltered({ integrationId: "team", category: "question" });
    expect(filtered).toHaveLength(1);
  });

  it("consecutiveApproved: three approved → 3", async () => {
    for (let i = 0; i < 3; i++) await store.record(entry({ outcome: "approved" }));
    expect(await store.consecutiveApproved("team", "question")).toBe(3);
  });

  it("consecutiveApproved counts the head run only — a rejected breaks the streak", async () => {
    // Oldest → newest: approved, rejected, approved, approved → head run = 2.
    await store.record(entry({ outcome: "approved", proposedAt: "2026-07-17T00:00:01.000Z" }));
    await store.record(entry({ outcome: "rejected", proposedAt: "2026-07-17T00:00:02.000Z" }));
    await store.record(entry({ outcome: "approved", proposedAt: "2026-07-17T00:00:03.000Z" }));
    await store.record(entry({ outcome: "approved", proposedAt: "2026-07-17T00:00:04.000Z" }));
    expect(await store.consecutiveApproved("team", "question")).toBe(2);
  });

  it("consecutiveApproved: a rejected at the head → 0 (downgrade)", async () => {
    await store.record(entry({ outcome: "approved", proposedAt: "2026-07-17T00:00:01.000Z" }));
    await store.record(entry({ outcome: "rejected", proposedAt: "2026-07-17T00:00:02.000Z" }));
    expect(await store.consecutiveApproved("team", "question")).toBe(0);
  });

  it("consecutiveApproved skips pending and sent-auto entries", async () => {
    await store.record(entry({ outcome: "approved", proposedAt: "2026-07-17T00:00:01.000Z" }));
    await store.record(entry({ outcome: "sent-auto", proposedAt: "2026-07-17T00:00:02.000Z" }));
    await store.record(entry({ outcome: "approved", proposedAt: "2026-07-17T00:00:03.000Z" }));
    await store.record(entry({ outcome: "pending", proposedAt: "2026-07-17T00:00:04.000Z" }));
    expect(await store.consecutiveApproved("team", "question")).toBe(2);
  });

  it("consecutiveApproved is scoped to the (integrationId, category) pair", async () => {
    await store.record(entry({ outcome: "approved", integrationId: "other" }));
    await store.record(entry({ outcome: "approved", category: "bug" }));
    expect(await store.consecutiveApproved("team", "question")).toBe(0);
  });

  it("a corrupt entry file is skipped, never fatal (fail-open)", async () => {
    const e = entry();
    await store.record(e);
    await fs.writeFile(path.join(dir, "reply_corrupt.json"), "{ not json", "utf8");
    const listed = await store.list();
    expect(listed.map((x) => x.id)).toEqual([e.id]);
  });
});
