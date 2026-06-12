import { describe, expect, it } from "vitest"
import type { ActivityEntry, Approval, ChannelItem, PipelineRun } from "@zibby/contracts"
import { assembleBriefing, deterministicHeadline, renderBriefingMarkdown } from "./briefing-assembly"

const NOW = new Date("2026-06-12T07:00:00.000Z")
const SINCE = "2026-06-11T07:00:00.000Z"

const approval = (over: Partial<Approval>): Approval => ({
  id: "ap1",
  runId: "team/itm1",
  kind: "channel",
  skill: "Team Slack",
  action: "channel-reply",
  detail: "draft",
  risk: "medium",
  status: "pending",
  requestedAt: "2026-06-12T06:30:00.000Z",
  ...over,
})

const parked = (over: Partial<PipelineRun>): PipelineRun =>
  ({
    pipelineRunId: "p1",
    pipelineId: "release",
    status: "parked",
    parkedReason: "retries",
    startedAt: "2026-06-12T05:00:00.000Z",
    stageRuns: [],
    currentStage: null,
    cwd: "/tmp/p1",
    ...over,
  }) as unknown as PipelineRun

const channelItem = (over: Partial<ChannelItem>): ChannelItem =>
  ({
    id: "itm1",
    integrationId: "team",
    kind: "slack",
    externalRef: {},
    receivedAt: "2026-06-12T06:00:00.000Z",
    text: "hi",
    raw: {},
    state: "new",
    ...over,
  }) as ChannelItem

const entry = (over: Partial<ActivityEntry>): ActivityEntry => ({
  id: Math.random().toString(36),
  at: "2026-06-12T06:45:00.000Z",
  kind: "run-finished",
  summary: "agent x → done",
  refs: { status: "done" },
  ...over,
})

describe("assembleBriefing", () => {
  it("partitions state into the briefing's sections with correct counts", () => {
    const briefing = assembleBriefing({
      now: NOW,
      since: SINCE,
      approvals: [approval({}), approval({ id: "ap2", requestedAt: "2026-06-12T06:50:00.000Z" })],
      parkedRuns: [parked({})],
      channelItems: [channelItem({}), channelItem({ id: "itm2", state: "triaged" })],
      activity: [
        entry({ kind: "task-outcome", summary: "task done", refs: { status: "done" } }),
        entry({ kind: "run-finished", summary: "run ok", refs: { status: "done" } }),
        entry({ kind: "pipeline-finished", summary: "pipe failed", refs: { status: "failed" } }),
        entry({ kind: "channel-reply", summary: "replied" }),
        entry({ kind: "gate-decision", summary: "gate ask" }), // not a did-kind
      ],
    })

    expect(briefing.needsYou).toHaveLength(3) // 2 approvals + 1 parked
    expect(briefing.nothingNeedsYou).toBe(false)
    expect(briefing.didForYou.map((d) => d.kind)).toEqual(
      expect.arrayContaining(["task-outcome", "run-finished", "pipeline-finished", "channel-reply"]),
    )
    expect(briefing.didForYou.some((d) => d.kind === "gate-decision")).toBe(false)
    expect(briefing.watching).toEqual([{ integrationId: "team", newItems: 1, lastReceivedAt: "2026-06-12T06:00:00.000Z" }])
    expect(briefing.counts).toEqual({
      runsFinished: 1, // run-finished done (pipeline-finished failed counts as failed)
      runsFailed: 1,
      parked: 1,
      approvalsPending: 2,
      channelItemsNew: 1,
    })
    // Newest-first: ap2 (06:50) before ap1 (06:30) before parked (05:00).
    expect(briefing.needsYou[0]!.id).toBe("ap2")
  })

  it("emits a calm nothing-needs-you output when nothing is pending", () => {
    const briefing = assembleBriefing({
      now: NOW, since: SINCE, approvals: [], parkedRuns: [], channelItems: [], activity: [],
    })
    expect(briefing.nothingNeedsYou).toBe(true)
    expect(briefing.needsYou).toHaveLength(0)
    expect(briefing.headline).toBe("Nothing needs you.")
  })
})

describe("deterministicHeadline", () => {
  it("counts approvals and parked runs", () => {
    expect(deterministicHeadline([])).toBe("Nothing needs you.")
    expect(
      deterministicHeadline([
        { kind: "approval", id: "a", summary: "", at: "", refs: {} },
        { kind: "parked", id: "p", summary: "", at: "", refs: {} },
      ]),
    ).toBe("2 things need you — 1 approval, 1 parked run.")
    expect(
      deterministicHeadline([{ kind: "approval", id: "a", summary: "", at: "", refs: {} }]),
    ).toBe("1 thing needs you — 1 approval.")
  })
})

describe("renderBriefingMarkdown", () => {
  it("renders the section headings", () => {
    const md = renderBriefingMarkdown(
      assembleBriefing({ now: NOW, since: SINCE, approvals: [approval({})], parkedRuns: [], channelItems: [], activity: [] }),
    )
    expect(md).toContain("# Briefing")
    expect(md).toContain("## Needs you")
    expect(md).toContain("## Counts")
  })
})
