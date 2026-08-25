import { describe, expect, it } from "vitest";
import { EmptyBodySchema } from "../common.schema";
import {
  ChannelItemSchema,
  ChannelItemStateSchema,
  TriageVerdictSchema,
  channelsContract,
} from "../index";

describe("channelsContract", () => {
  it("exposes read-only ITEM routes (items are never client-writable, Law 4)", () => {
    expect(channelsContract.listChannelItems.path).toBe("/api/channels/items");
    expect(channelsContract.listChannelItems.method).toBe("GET");
    expect(channelsContract.getChannelItem.path).toBe("/api/channels/items/:id");
    expect(channelsContract.getChannelItem.method).toBe("GET");
  });

  it("the only write surface is proposing a Jira issue — which PARKS an approval, never an item", () => {
    expect(channelsContract.createJiraIssue.method).toBe("POST");
    expect(channelsContract.createJiraIssue.path).toBe("/api/channels/integrations/:id/jira-issue");
    // 202 (parked), not a 201 item-created — the create runs only on approve.
    expect(channelsContract.createJiraIssue.responses).toHaveProperty("202");
  });

  it("dismissChannelItem's empty body IS the shared EmptyBodySchema (T11 dedup, finding #37)", () => {
    expect(channelsContract.dismissChannelItem.body).toBe(EmptyBodySchema);
  });
});

describe("TriageVerdictSchema (Law 4: closed)", () => {
  const base = {
    actionable: true,
    tier: 1 as const,
    category: "bug" as const,
    confidence: 0.9,
    reason: "x",
  };

  it("accepts a well-formed verdict", () => {
    expect(TriageVerdictSchema.safeParse(base).success).toBe(true);
  });

  it("rejects an extra key (no gate/approval/tier-override side channel)", () => {
    expect(TriageVerdictSchema.safeParse({ ...base, forceApprove: true }).success).toBe(false);
    expect(TriageVerdictSchema.safeParse({ ...base, gate: "allow" }).success).toBe(false);
  });

  it("rejects an out-of-range tier or confidence", () => {
    expect(TriageVerdictSchema.safeParse({ ...base, tier: 4 }).success).toBe(false);
    expect(TriageVerdictSchema.safeParse({ ...base, confidence: 2 }).success).toBe(false);
  });

  it("caps reason at 2000 chars (T11 finding #6): 2000 passes, 2001 rejects", () => {
    expect(TriageVerdictSchema.safeParse({ ...base, reason: "x".repeat(2000) }).success).toBe(true);
    expect(TriageVerdictSchema.safeParse({ ...base, reason: "x".repeat(2001) }).success).toBe(
      false,
    );
  });
});

describe("ChannelItemSchema", () => {
  const minimal = {
    id: "C1-100",
    integrationId: "team-slack",
    kind: "slack",
    externalRef: { channel: "C1", ts: "100" },
    receivedAt: "2026-06-12T00:00:00.000Z",
    text: "hi",
    raw: {},
    state: "new",
  };

  it("accepts a minimal new item", () => {
    expect(ChannelItemSchema.safeParse(minimal).success).toBe(true);
  });

  it("caps text at 4500 chars (T11 finding #8, headroom above MAX_INBOUND_CHARS=4000): 4500 passes, 4501 rejects", () => {
    expect(ChannelItemSchema.safeParse({ ...minimal, text: "x".repeat(4500) }).success).toBe(true);
    expect(ChannelItemSchema.safeParse({ ...minimal, text: "x".repeat(4501) }).success).toBe(false);
  });

  describe("url (Phase 127)", () => {
    it("accepts a source link (Jira/GitHub/Slack)", () => {
      const parsed = ChannelItemSchema.safeParse({
        ...minimal,
        url: "https://example.atlassian.net/browse/PROJ-1",
      });
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.url).toBe("https://example.atlassian.net/browse/PROJ-1");
      }
    });

    it("is omissible — a pre-existing item without url re-parses untouched", () => {
      const parsed = ChannelItemSchema.safeParse(minimal);
      expect(parsed.success).toBe(true);
      if (parsed.success) expect(parsed.data.url).toBeUndefined();
    });
  });
});

describe("ChannelItem draft-research fields", () => {
  const base = {
    id: "jira-ABC-1-c99",
    integrationId: "jira-x",
    kind: "jira" as const,
    externalRef: { messageId: "ABC-1" },
    receivedAt: "2026-08-25T10:00:00.000Z",
    text: "hello",
    raw: {},
  };

  it("accepts the needs-draft state", () => {
    expect(ChannelItemStateSchema.safeParse("needs-draft").success).toBe(true);
  });

  it("accepts an item carrying a pending draftResearch marker", () => {
    const parsed = ChannelItemSchema.safeParse({
      ...base,
      state: "needs-draft",
      draftResearch: { status: "pending", attempts: 1, startedAt: base.receivedAt },
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects an unknown draftResearch status", () => {
    const parsed = ChannelItemSchema.safeParse({
      ...base,
      state: "needs-draft",
      draftResearch: { status: "elsewhere", attempts: 0 },
    });
    expect(parsed.success).toBe(false);
  });

  it("still accepts an item with no draftResearch at all", () => {
    expect(ChannelItemSchema.safeParse({ ...base, state: "new" }).success).toBe(true);
  });
});
