import { describe, expect, it } from "vitest";
import type {
  ActivityEntry,
  Approval,
  ChannelItem,
  PipelineRun,
  ScheduledTask,
} from "@zibby/contracts";
import {
  assembleBriefing,
  buildEngagements,
  deterministicHeadline,
  renderBriefingMarkdown,
} from "./briefing-assembly";

const NOW = new Date("2026-06-12T07:00:00.000Z");
const SINCE = "2026-06-11T07:00:00.000Z";

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
});

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
  }) as unknown as PipelineRun;

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
  }) as ChannelItem;

const entry = (over: Partial<ActivityEntry>): ActivityEntry => ({
  id: Math.random().toString(36),
  at: "2026-06-12T06:45:00.000Z",
  kind: "run-finished",
  summary: "agent x → done",
  refs: { status: "done" },
  ...over,
});

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
    });

    expect(briefing.needsYou).toHaveLength(3); // 2 approvals + 1 parked
    expect(briefing.nothingNeedsYou).toBe(false);
    expect(briefing.didForYou.map((d) => d.kind)).toEqual(
      expect.arrayContaining([
        "task-outcome",
        "run-finished",
        "pipeline-finished",
        "channel-reply",
      ]),
    );
    expect(briefing.didForYou.some((d) => d.kind === "gate-decision")).toBe(false);
    expect(briefing.watching).toEqual([
      { integrationId: "team", newItems: 1, lastReceivedAt: "2026-06-12T06:00:00.000Z" },
    ]);
    expect(briefing.counts).toEqual({
      runsFinished: 1, // run-finished done (pipeline-finished failed counts as failed)
      runsFailed: 1,
      parked: 1,
      approvalsPending: 2,
      channelItemsNew: 1,
    });
    // Newest-first: ap2 (06:50) before ap1 (06:30) before parked (05:00).
    expect(briefing.needsYou[0]!.id).toBe("ap2");
  });

  it("M8: a dead-lettered task surfaces in needsYou (parked kind) so it never fails silently", () => {
    const briefing = assembleBriefing({
      now: NOW,
      since: SINCE,
      approvals: [],
      parkedRuns: [],
      channelItems: [],
      activity: [],
      deadLetteredTasks: [
        {
          id: "t-dead",
          text: "ship the thing",
          title: "Ship it",
          paths: [],
          attachments: [],
          status: "dead-letter",
          scheduledAt: 1,
          createdAt: "2026-06-12T06:40:00.000Z",
          error: "boom",
          attempts: 3,
        },
      ],
    });
    expect(briefing.needsYou).toHaveLength(1);
    expect(briefing.needsYou[0]).toMatchObject({
      kind: "parked",
      id: "t-dead",
      refs: { taskId: "t-dead", status: "dead-letter" },
    });
    expect(briefing.needsYou[0]!.summary).toContain("failed repeatedly");
    expect(briefing.nothingNeedsYou).toBe(false);
  });

  it("Phase 9: a paused-limit run joins watching (not needsYou) with its resume epoch", () => {
    const resumeAt = Date.parse("2026-06-12T08:30:00.000Z");
    const briefing = assembleBriefing({
      now: NOW,
      since: SINCE,
      approvals: [],
      parkedRuns: [],
      pausedLimitRuns: [
        parked({ pipelineRunId: "p9", pipelineId: "delivery", status: "paused-limit", resumeAt }),
      ],
      channelItems: [channelItem({})],
      activity: [],
    });
    // A pause is Tier 1 — it watches, it does not need the operator.
    expect(briefing.needsYou).toHaveLength(0);
    // The channel watch item AND the run-pause watch item share the array.
    expect(briefing.watching).toContainEqual({
      runRef: "p9",
      summary: "pipeline delivery paused on the usage limit",
      resumeAt,
    });
    // The markdown surfaces the pause line with its resume time.
    const md = renderBriefingMarkdown(briefing);
    expect(md).toContain("pipeline delivery paused on the usage limit, resumes");
  });

  it("N4b: a red CI status is a needs-you STATE line; a green one surfaces nothing", () => {
    const ciStatus = (state: "red" | "green") => ({
      integrationId: "acme-github",
      projectId: "acme",
      adapterKind: "github-ci",
      state,
      sinceAt: "2026-06-12T06:20:00.000Z",
      checkedAt: "2026-06-12T06:55:00.000Z",
      summary: "build.yml failed on main",
    });
    const base = { now: NOW, since: SINCE, approvals: [], parkedRuns: [], channelItems: [], activity: [] };

    const red = assembleBriefing({ ...base, ciStatuses: [ciStatus("red")] });
    expect(red.needsYou).toEqual([
      expect.objectContaining({
        kind: "ci-red",
        id: "acme-github--github-ci",
        projectId: "acme",
        refs: { integrationId: "acme-github", projectId: "acme" },
      }),
    ]);
    expect(red.needsYou[0]!.summary).toContain("CI red since 2026-06-12T06:20:00.000Z");
    expect(red.headline).toBe("1 thing needs you — 1 red CI.");

    // Green (or absent) CI never re-alerts — the line simply disappears.
    const green = assembleBriefing({ ...base, ciStatuses: [ciStatus("green")] });
    expect(green.needsYou).toHaveLength(0);
    expect(green.nothingNeedsYou).toBe(true);
  });

  it("emits a calm nothing-needs-you output when nothing is pending", () => {
    const briefing = assembleBriefing({
      now: NOW,
      since: SINCE,
      approvals: [],
      parkedRuns: [],
      channelItems: [],
      activity: [],
    });
    expect(briefing.nothingNeedsYou).toBe(true);
    expect(briefing.needsYou).toHaveLength(0);
    expect(briefing.headline).toBe("Nothing needs you.");
  });
});

describe("buildEngagements (Phase 8.2)", () => {
  const task = (over: Partial<ScheduledTask>): ScheduledTask =>
    ({
      id: "t",
      title: "",
      text: "do",
      paths: [],
      scheduledAt: 1,
      status: "queued",
      createdAt: "2026-06-12T06:00:00.000Z",
      ...over,
    }) as ScheduledTask;

  it("groups queued/held tasks + attributed activity by project, sorted needsYou desc", () => {
    const engagements = buildEngagements(
      [
        task({ id: "t1", status: "queued", projectId: "alpha" }),
        task({ id: "t2", status: "held", projectId: "alpha" }),
        task({ id: "t3", status: "queued", projectId: "beta" }),
        task({ id: "t4", status: "scheduled", projectId: "beta" }), // not waiting → ignored
        task({ id: "t5", status: "queued" }), // unattributed → ignored
      ],
      [
        { kind: "task-outcome", summary: "alpha done", at: "x", projectId: "alpha" },
        { kind: "run-finished", summary: "no project", at: "x" },
      ],
      [],
      { alpha: "Alpha", beta: "Beta" },
    );
    expect(engagements).toEqual([
      { projectId: "alpha", name: "Alpha", needsYou: 1, didForYou: 1, queued: 1, held: 1 },
      { projectId: "beta", name: "Beta", needsYou: 0, didForYou: 0, queued: 1, held: 0 },
    ]);
  });

  it("is empty when nothing carries a projectId", () => {
    expect(buildEngagements([task({ status: "queued" })], [], [], {})).toEqual([]);
  });

  it("falls back to the projectId as the name when none is supplied", () => {
    const [row] = buildEngagements([task({ status: "held", projectId: "gamma" })], [], [], {});
    expect(row).toMatchObject({ projectId: "gamma", name: "gamma", held: 1, needsYou: 1 });
  });
});

describe("deterministicHeadline", () => {
  it("counts approvals and parked runs", () => {
    expect(deterministicHeadline([])).toBe("Nothing needs you.");
    expect(
      deterministicHeadline([
        { kind: "approval", id: "a", summary: "", at: "", refs: {} },
        { kind: "parked", id: "p", summary: "", at: "", refs: {} },
      ]),
    ).toBe("2 things need you — 1 approval, 1 parked run.");
    expect(
      deterministicHeadline([{ kind: "approval", id: "a", summary: "", at: "", refs: {} }]),
    ).toBe("1 thing needs you — 1 approval.");
  });
});

describe("renderBriefingMarkdown", () => {
  it("renders the section headings", () => {
    const md = renderBriefingMarkdown(
      assembleBriefing({
        now: NOW,
        since: SINCE,
        approvals: [approval({})],
        parkedRuns: [],
        channelItems: [],
        activity: [],
      }),
    );
    expect(md).toContain("# Briefing");
    expect(md).toContain("## Needs you");
    expect(md).toContain("## Counts");
  });
});
