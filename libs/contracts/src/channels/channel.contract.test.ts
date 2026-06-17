import { describe, expect, it } from "vitest"
import { ChannelItemSchema, TriageVerdictSchema, channelsContract } from "../index"

describe("channelsContract", () => {
  it("exposes read-only ITEM routes (items are never client-writable, Law 4)", () => {
    expect(channelsContract.listChannelItems.path).toBe("/api/channels/items")
    expect(channelsContract.listChannelItems.method).toBe("GET")
    expect(channelsContract.getChannelItem.path).toBe("/api/channels/items/:id")
    expect(channelsContract.getChannelItem.method).toBe("GET")
  })

  it("the only write surface is proposing a Jira issue — which PARKS an approval, never an item", () => {
    expect(channelsContract.createJiraIssue.method).toBe("POST")
    expect(channelsContract.createJiraIssue.path).toBe("/api/channels/integrations/:id/jira-issue")
    // 202 (parked), not a 201 item-created — the create runs only on approve.
    expect(channelsContract.createJiraIssue.responses).toHaveProperty("202")
  })
})

describe("TriageVerdictSchema (Law 4: closed)", () => {
  const base = { actionable: true, tier: 1 as const, category: "bug" as const, confidence: 0.9, reason: "x" }

  it("accepts a well-formed verdict", () => {
    expect(TriageVerdictSchema.safeParse(base).success).toBe(true)
  })

  it("rejects an extra key (no gate/approval/tier-override side channel)", () => {
    expect(TriageVerdictSchema.safeParse({ ...base, forceApprove: true }).success).toBe(false)
    expect(TriageVerdictSchema.safeParse({ ...base, gate: "allow" }).success).toBe(false)
  })

  it("rejects an out-of-range tier or confidence", () => {
    expect(TriageVerdictSchema.safeParse({ ...base, tier: 4 }).success).toBe(false)
    expect(TriageVerdictSchema.safeParse({ ...base, confidence: 2 }).success).toBe(false)
  })
})

describe("ChannelItemSchema", () => {
  it("accepts a minimal new item", () => {
    expect(
      ChannelItemSchema.safeParse({
        id: "C1-100",
        integrationId: "team-slack",
        kind: "slack",
        externalRef: { channel: "C1", ts: "100" },
        receivedAt: "2026-06-12T00:00:00.000Z",
        text: "hi",
        raw: {},
        state: "new",
      }).success,
    ).toBe(true)
  })
})
