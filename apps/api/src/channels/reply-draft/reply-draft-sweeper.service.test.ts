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

function harness(over: {
  items?: ChannelItem[];
  research?: (i: ChannelItem) => Promise<string | null>;
}) {
  const updates: ChannelItem[] = [];
  const store = {
    list: async () => over.items ?? [item()],
    update: async (i: ChannelItem) => {
      updates.push(i);
      return i;
    },
  } as never;
  const draft = { research: over.research ?? (async () => "a real answer") } as never;
  const parked: { item: ChannelItem; draft: string | null }[] = [];
  const flow = {
    parkOrSurface: async (i: ChannelItem, _v: unknown, d: string | null) => {
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
  return { svc, updates, parked };
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
