import { describe, expect, it, vi } from "vitest";
import type { ChannelItem } from "@zibby/contracts";
import { LoggerService } from "../../shared/logging/logger.service";
import { TraceContextService } from "../../shared/logging/trace-context.service";
import { ReplyDraftSweeperService } from "./reply-draft-sweeper.service";

function item(over: Partial<ChannelItem> = {}): ChannelItem {
  return {
    id: "jira-ABC-1-c501",
    integrationId: "jira-x",
    kind: "jira",
    externalRef: { messageId: "ABC-1" },
    receivedAt: "2026-08-25T10:00:00.000Z",
    text: "How does X work?",
    raw: {},
    state: "needs-draft",
    projectId: "proj-1",
    triage: {
      actionable: true,
      tier: 3,
      category: "question",
      confidence: 0.8,
      reason: "q",
    },
    ...over,
  } as ChannelItem;
}

/**
 * The store is a live map, not a fixed snapshot, so a test can mutate an item *while*
 * a research is in flight — which is the only way to exercise the two dismissal doors
 * (before the lock write, and after the research returns) at their real call order.
 */
function harness(over: {
  items?: ChannelItem[];
  research?: (i: ChannelItem) => Promise<string | null>;
  park?: (i: ChannelItem, d: string | null) => Promise<void>;
}) {
  const updates: ChannelItem[] = [];
  const seed = over.items ?? [item()];
  const world = new Map<string, ChannelItem>(seed.map((i) => [i.id, i]));
  const store = {
    list: async () => [...world.values()].filter((i) => i.state === "needs-draft"),
    findById: async (id: string) => world.get(id),
    update: async (i: ChannelItem) => {
      updates.push(i);
      world.set(i.id, i);
      return i;
    },
  } as never;
  const draft = { research: over.research ?? (async () => "a real answer") } as never;
  const parked: { item: ChannelItem; draft: string | null }[] = [];
  const flow = {
    parkOrSurface: async (i: ChannelItem, _v: unknown, d: string | null) => {
      await over.park?.(i, d);
      parked.push({ item: i, draft: d });
      return i;
    },
  } as never;
  const svc = new ReplyDraftSweeperService(
    store,
    draft,
    flow,
    new LoggerService(new TraceContextService()),
  );
  return {
    svc,
    updates,
    parked,
    /** The operator retiring an item from the UI, mid-sweep. */
    dismiss: (id: string) => {
      const cur = world.get(id);
      if (cur) world.set(id, { ...cur, state: "ignored" });
    },
    remove: (id: string) => world.delete(id),
    /** Age the pending lock past STALE_PENDING_MS so the next sweep retries it. */
    age: (id: string) => {
      const cur = world.get(id);
      if (cur?.draftResearch) {
        world.set(id, {
          ...cur,
          draftResearch: {
            ...cur.draftResearch,
            startedAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
          },
        });
      }
    },
  };
}

describe("ReplyDraftSweeperService.sweep", () => {
  it("marks the item pending BEFORE researching (the in-flight lock)", async () => {
    const order: string[] = [];
    const h = harness({
      research: async () => {
        order.push("research");
        return "answer";
      },
    });
    // record the first update as it happens
    await h.svc.sweep();
    order.unshift(h.updates[0]?.draftResearch?.status === "pending" ? "pending-write" : "??");
    expect(order[0]).toBe("pending-write");
  });

  it("hands a researched draft to the flow's park/surface stage", async () => {
    const h = harness({ research: async () => "Backoff doubles — runner-core.ts:88." });
    await h.svc.sweep();
    expect(h.parked).toHaveLength(1);
    expect(h.parked[0]?.draft).toBe("Backoff doubles — runner-core.ts:88.");
    // the `ok` marker rides ON the handed-off item: parkOrSurface's own write is what
    // persists it, so the terminal status can never outlive a failed hand-off.
    expect(h.parked[0]?.item.draftResearch?.status).toBe("ok");
  });

  it("passes a null draft through when research found no answer", async () => {
    const h = harness({ research: async () => null });
    await h.svc.sweep();
    // attempts 1 of 2 — retried next tick, not surfaced yet
    expect(h.parked).toHaveLength(0);
    const last = h.updates.at(-1);
    expect(last?.draftResearch?.status).toBe("failed");
    expect(last?.draftResearch?.attempts).toBe(1);
  });

  it("surfaces notify-only once the retry budget is spent", async () => {
    const h = harness({
      items: [item({ draftResearch: { status: "failed", attempts: 1 } })],
      research: async () => null,
    });
    await h.svc.sweep();
    expect(h.parked).toHaveLength(1);
    expect(h.parked[0]?.draft).toBeNull();
  });

  it("skips an item already in flight", async () => {
    const research = vi.fn(async () => "answer");
    const h = harness({
      items: [
        item({
          draftResearch: { status: "pending", attempts: 1, startedAt: new Date().toISOString() },
        }),
      ],
      research,
    });
    await h.svc.sweep();
    expect(research).not.toHaveBeenCalled();
  });

  it("resets a stale pending marker (process died mid-research)", async () => {
    const stale = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const research = vi.fn(async () => "answer");
    const h = harness({
      items: [item({ draftResearch: { status: "pending", attempts: 1, startedAt: stale } })],
      research,
    });
    await h.svc.sweep();
    expect(research).toHaveBeenCalledTimes(1);
  });

  // ── Door 1: the operator dismisses the item WHILE ITS OWN research is running ──
  // The snapshot the sweeper holds is stale by then. Writing it back would resurrect the
  // item and hand it to parkOrSurface, which can AUTO-SEND a Tier-2 reply on something
  // the operator explicitly retired. The post-research re-read is what stops that.
  it("discards the research when the operator dismissed the item mid-flight", async () => {
    const h: ReturnType<typeof harness> = harness({
      research: async () => {
        h.dismiss("jira-ABC-1-c501");
        return "a real answer";
      },
    });
    await h.svc.sweep();
    expect(h.parked).toHaveLength(0);
    // only the pending lock was written — the stale snapshot never went back
    expect(h.updates).toHaveLength(1);
    expect(h.updates[0]?.draftResearch?.status).toBe("pending");
  });

  it("discards a failed research too when the item left needs-draft", async () => {
    const h: ReturnType<typeof harness> = harness({
      items: [item({ draftResearch: { status: "failed", attempts: 1 } })],
      research: async () => {
        h.dismiss("jira-ABC-1-c501");
        return null;
      },
    });
    await h.svc.sweep();
    // retry budget was spent, but a dismissed item must not be surfaced anyway
    expect(h.parked).toHaveLength(0);
    expect(h.updates).toHaveLength(1);
  });

  it("discards the research when the item was deleted mid-flight", async () => {
    const h: ReturnType<typeof harness> = harness({
      research: async () => {
        h.remove("jira-ABC-1-c501");
        return "a real answer";
      },
    });
    await h.svc.sweep();
    expect(h.parked).toHaveLength(0);
    expect(h.updates).toHaveLength(1);
  });

  // ── Door 2: the operator dismisses B while an EARLIER candidate is researching ──
  // The candidate list is snapshotted once, but researches run sequentially, so B's turn
  // can come minutes later. Locking B from that stale snapshot would resurrect it — and
  // the post-research guard would then read B's own resurrection and wave it through.
  it("never locks a candidate dismissed while an earlier one was researching", async () => {
    const research = vi.fn(async (i: ChannelItem) => {
      if (i.id === "A") h.dismiss("B");
      return "answer";
    });
    const h: ReturnType<typeof harness> = harness({
      items: [item({ id: "A" }), item({ id: "B" })],
      research,
    });
    await h.svc.sweep();
    expect(research).toHaveBeenCalledTimes(1);
    expect(research.mock.calls[0]?.[0]?.id).toBe("A");
    // B was never locked, never researched, never handed off
    expect(h.updates.some((u) => u.id === "B")).toBe(false);
    expect(h.parked.map((p) => p.item.id)).not.toContain("B");
  });

  // ── Liveness: a terminal marker must never outlive a failed hand-off ──
  // parkOrSurface reaches integrations, credentials and approvals, any of which can
  // throw. sweep() swallows that, so persisting `ok` first would strand the item:
  // isReady never retries `ok`, and it has neither an approval nor a surface.
  it("does not persist a terminal ok marker when the hand-off throws", async () => {
    const h = harness({
      research: async () => "a real answer",
      park: async () => {
        throw new Error("no credentials for jira-x");
      },
    });
    await h.svc.sweep();
    expect(h.updates).toHaveLength(1);
    expect(h.updates[0]?.draftResearch?.status).toBe("pending");
  });

  it("does not persist a terminal failed marker when the notify-only hand-off throws", async () => {
    const h = harness({
      items: [item({ draftResearch: { status: "failed", attempts: 1 } })],
      research: async () => null,
      park: async () => {
        throw new Error("approvals unavailable");
      },
    });
    await h.svc.sweep();
    expect(h.updates).toHaveLength(1);
    expect(h.updates[0]?.draftResearch?.status).toBe("pending");
  });

  it("retries a failed hand-off once the pending lock goes stale", async () => {
    const research = vi.fn(async () => "a real answer");
    let park: () => Promise<void> = async () => {
      throw new Error("approvals unavailable");
    };
    const h: ReturnType<typeof harness> = harness({ research, park: () => park() });
    await h.svc.sweep();
    expect(h.parked).toHaveLength(0);

    // the item is left on its pending lock; once that ages out it is picked up again
    h.age("jira-ABC-1-c501");
    park = async () => {};
    await h.svc.sweep();
    expect(research).toHaveBeenCalledTimes(2);
    expect(h.parked).toHaveLength(1);
  });

  // ── The cap: a permanently-throwing hand-off must not bill forever ──────────────
  // The stale-retry above is deliberate, but against a hand-off that always throws (a
  // deleted integration, missing credentials on the Tier-2 sendReply path) it re-spawns
  // a PAID 5-minute research every STALE_PENDING_MS, forever. The retry budget the
  // failure path already uses has to bound the stale-pending path too.
  //
  // `parkOrSurface` here throws only when it carries a draft — that is the real shape:
  // the reply legs reach integrations/credentials, `surfaceWithoutDraft` reaches neither.
  const throwsOnDraft = async (_i: ChannelItem, d: string | null) => {
    if (d !== null) throw new Error("no credentials for jira-x");
  };

  it("stops re-researching once the stale-pending retry budget is spent", async () => {
    const research = vi.fn(async () => "a real answer");
    const h = harness({ research, park: throwsOnDraft });

    // Three sweeps, each after the pending lock has aged out — without a cap this is
    // three paid researches, and it would keep going every 15 minutes forever.
    for (let i = 0; i < 3; i++) {
      await h.svc.sweep();
      h.age("jira-ABC-1-c501");
    }
    expect(research).toHaveBeenCalledTimes(2);

    // …and it stays stopped on every later sweep, too.
    await h.svc.sweep();
    expect(research).toHaveBeenCalledTimes(2);
  });

  it("surfaces the item notify-only at the cap instead of discarding it", async () => {
    const h = harness({ research: async () => "a real answer", park: throwsOnDraft });
    for (let i = 0; i < 3; i++) {
      await h.svc.sweep();
      h.age("jira-ABC-1-c501");
    }
    // The correct terminal state for "we cannot hand this off": the operator is told.
    expect(h.parked).toHaveLength(1);
    expect(h.parked[0]?.draft).toBeNull();
    expect(h.parked[0]?.item.draftResearch?.status).toBe("failed");
    expect(h.parked[0]?.item.draftResearch?.attempts).toBe(2);
  });

  it("researches at most 2 items per sweep", async () => {
    const research = vi.fn(async () => "answer");
    const h = harness({
      items: [item({ id: "a" }), item({ id: "b" }), item({ id: "c" })],
      research,
    });
    await h.svc.sweep();
    expect(research).toHaveBeenCalledTimes(2);
  });
});
