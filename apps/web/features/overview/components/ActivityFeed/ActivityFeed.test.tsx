import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import type { ActivityEntry } from "@zibby/contracts"
import { ActivityFeed, ActivityFeedTestId, activityIcon, relativeTime } from "./ActivityFeed"

const entry = (over: Partial<ActivityEntry>): ActivityEntry => ({
  id: Math.random().toString(36),
  at: "2026-06-12T07:00:00.000Z",
  kind: "task-created",
  summary: "created a task",
  refs: {},
  ...over,
})

const items: ActivityEntry[] = [
  entry({ kind: "run-started", summary: "agent writer started", refs: { runRef: "r1" } }),
  entry({ kind: "approval-requested", summary: "approval needed", refs: { approvalId: "ap1" } }),
  entry({ kind: "run-finished", summary: "agent writer → done", refs: { runRef: "r1" } }),
]

describe("ActivityFeed", () => {
  it("renders each entry's summary and trace cue via testids", () => {
    render(<ActivityFeed items={items} />)
    expect(screen.getAllByTestId(ActivityFeedTestId.Item)).toHaveLength(3)
    const summaries = screen.getAllByTestId(ActivityFeedTestId.Summary).map((n) => n.textContent)
    expect(summaries).toContain("agent writer started")
    expect(summaries).toContain("agent writer → done")
  })

  it("respects the limit", () => {
    render(<ActivityFeed items={items} limit={2} />)
    expect(screen.getAllByTestId(ActivityFeedTestId.Item)).toHaveLength(2)
  })
})

describe("activityIcon", () => {
  it("maps kinds to glyph buckets", () => {
    expect(activityIcon("task-created")).toBe("run")
    expect(activityIcon("run-started")).toBe("run")
    expect(activityIcon("pipeline-parked")).toBe("wait")
    expect(activityIcon("approval-requested")).toBe("wait")
    expect(activityIcon("gate-decision")).toBe("wait")
    expect(activityIcon("run-finished")).toBe("ok")
    expect(activityIcon("approval-approved")).toBe("ok")
    expect(activityIcon("channel-reply")).toBe("ok")
    expect(activityIcon("channel-item")).toBe("edit")
    expect(activityIcon("briefing-generated")).toBe("edit")
  })
})

describe("relativeTime", () => {
  const now = new Date("2026-06-12T12:00:00.000Z").getTime()
  it("formats compactly", () => {
    expect(relativeTime("2026-06-12T11:59:30.000Z", now)).toBe("now")
    expect(relativeTime("2026-06-12T11:45:00.000Z", now)).toBe("15m")
    expect(relativeTime("2026-06-12T09:00:00.000Z", now)).toBe("3h")
    expect(relativeTime("2026-06-10T12:00:00.000Z", now)).toBe("2d")
  })
})
