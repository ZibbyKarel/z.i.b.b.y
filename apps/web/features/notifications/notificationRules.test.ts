import { describe, expect, it } from "vitest"
import { navBadgeCount, selectNotifications } from "./notificationRules"

describe("selectNotifications", () => {
  it("emits only the three disciplined kinds from a noisy state", () => {
    const notifications = selectNotifications({
      approvals: [{ id: "ap1", skill: "Payer", action: "payment" }],
      runs: [
        { runId: "r-running", status: "running", title: "live" },
        { runId: "r-done", status: "done", title: "finished" },
        { runId: "r-scheduled", status: "scheduled", title: "later" },
        { runId: "r-failed", status: "failed", title: "broke" },
        { runId: "r-awaiting", status: "awaiting-approval", title: "gated" }, // approval-parked → NOT parked
        { runId: "r-parked", status: "parked", title: "release" }, // retries-parked → counts
      ],
      briefing: { nothingNeedsYou: false },
    })

    const kinds = notifications.map((n) => n.kind).sort()
    expect(kinds).toEqual(["approval", "briefing", "parked"])
    // The parked notification points at the retries-parked run, not the gated one.
    expect(notifications.find((n) => n.kind === "parked")!.id).toBe("r-parked")
  })

  it("emits nothing for a calm, empty state", () => {
    expect(
      selectNotifications({ approvals: [], runs: [], briefing: { nothingNeedsYou: true } }),
    ).toEqual([])
  })

  it("omits the briefing notification when nothing needs the operator", () => {
    const n = selectNotifications({ approvals: [], runs: [], briefing: { nothingNeedsYou: true } })
    expect(n.some((x) => x.kind === "briefing")).toBe(false)
  })
})

describe("navBadgeCount", () => {
  it("counts only approvals and parked runs (not the briefing)", () => {
    const notifications = selectNotifications({
      approvals: [{ id: "a1" }, { id: "a2" }],
      runs: [{ runId: "p1", status: "parked" }],
      briefing: { nothingNeedsYou: false },
    })
    expect(notifications).toHaveLength(4) // 2 approvals + 1 parked + 1 briefing
    expect(navBadgeCount(notifications)).toBe(3) // briefing excluded
  })
})
