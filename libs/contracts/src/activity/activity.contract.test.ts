import { describe, expect, it } from "vitest"
import { ActivityEntrySchema, ActivityKindSchema, ActivityRefsSchema, activityContract } from "../index"

describe("activityContract", () => {
  it("exposes a single read-only route under /api/activity", () => {
    expect(activityContract.listActivity.path).toBe("/api/activity")
    expect(activityContract.listActivity.method).toBe("GET")
    const methods = Object.values(activityContract).map((r) => r.method)
    expect(methods.every((m) => m === "GET")).toBe(true)
  })
})

describe("ActivityRefsSchema (Law 4: closed)", () => {
  it("accepts the known refs", () => {
    expect(
      ActivityRefsSchema.safeParse({ taskId: "t1", runRef: "r1", decision: "ask" }).success,
    ).toBe(true)
  })

  it("rejects an unknown ref key (no payload smuggling)", () => {
    expect(ActivityRefsSchema.safeParse({ forceApprove: "yes" }).success).toBe(false)
    expect(ActivityRefsSchema.safeParse({ tier: "1" }).success).toBe(false)
  })
})

describe("ActivityEntrySchema", () => {
  const base = {
    id: "act_1",
    at: "2026-06-12T07:00:00.000Z",
    kind: "task-created" as const,
    summary: "created a task",
    refs: {},
  }

  it("accepts a well-formed entry", () => {
    expect(ActivityEntrySchema.safeParse(base).success).toBe(true)
  })

  it("rejects an unknown kind (closed enum)", () => {
    expect(ActivityEntrySchema.safeParse({ ...base, kind: "made-up" }).success).toBe(false)
  })

  it("enumerates the whole accountability vocabulary", () => {
    expect(ActivityKindSchema.options).toContain("gate-decision")
    expect(ActivityKindSchema.options).toContain("briefing-generated")
    expect(ActivityKindSchema.options).toContain("channel-reply")
  })
})
