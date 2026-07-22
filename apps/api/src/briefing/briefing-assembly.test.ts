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
  buildPersonalAgenda,
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
          toolGrants: [],
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
    const base = {
      now: NOW,
      since: SINCE,
      approvals: [],
      parkedRuns: [],
      channelItems: [],
      activity: [],
    };

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

describe("per-subsystem lines (NS2 F3b)", () => {
  const base = {
    now: NOW,
    since: SINCE,
    approvals: [],
    parkedRuns: [],
    channelItems: [],
    activity: [],
  };
  const lines = [
    {
      subsystem: "forge" as const,
      name: "Forge",
      state: "waiting" as const,
      tier2Count: 0,
      errorCount: 0,
      tier3Count: 2,
    },
    {
      subsystem: "ledger" as const,
      name: "Ledger",
      state: "idle" as const,
      tier2Count: 0,
      errorCount: 0,
      tier3Count: 0,
      note: "62 % týdenního okna",
    },
  ];

  it("passes the gathered lines through verbatim (present ⇄ absent)", () => {
    const withLines = assembleBriefing({ ...base, subsystems: lines });
    expect(withLines.subsystems).toEqual(lines);
    // Absent (old briefings / failed read) and empty both omit the key entirely —
    // strictly additive to the pre-F3b shape.
    expect(assembleBriefing(base).subsystems).toBeUndefined();
    expect(assembleBriefing({ ...base, subsystems: [] }).subsystems).toBeUndefined();
  });

  it("renders a ## Subsystems markdown block iff lines are present", () => {
    const md = renderBriefingMarkdown(assembleBriefing({ ...base, subsystems: lines }));
    expect(md).toContain("## Subsystems");
    expect(md).toContain("- **Forge** — waiting · 2 waiting on you");
    expect(md).toContain("- **Ledger** — idle · 62 % týdenního okna");
    expect(renderBriefingMarkdown(assembleBriefing(base))).not.toContain("## Subsystems");
  });
});

describe("self-knowledge drift (NS2 F4c)", () => {
  const base = {
    now: NOW,
    since: SINCE,
    approvals: [],
    parkedRuns: [],
    channelItems: [],
    activity: [],
  };
  const lines = [
    {
      subsystem: "forge" as const,
      name: "Forge",
      state: "waiting" as const,
      tier2Count: 0,
      errorCount: 0,
      tier3Count: 2,
    },
  ];

  it("omits selfKnowledgeDrift when absent or false — strictly additive to today's shape", () => {
    expect(assembleBriefing(base).selfKnowledgeDrift).toBeUndefined();
    expect(
      assembleBriefing({ ...base, selfKnowledgeDrift: false }).selfKnowledgeDrift,
    ).toBeUndefined();
  });

  it("surfaces selfKnowledgeDrift: true when the gathered check reports drift", () => {
    expect(assembleBriefing({ ...base, selfKnowledgeDrift: true }).selfKnowledgeDrift).toBe(true);
  });

  it("a briefing with no subsystems and no drift renders no ## Subsystems block (today's exact output)", () => {
    const md = renderBriefingMarkdown(assembleBriefing(base));
    expect(md).not.toContain("## Subsystems");
  });

  it("drift alone (no subsystem lines) still opens a ## Subsystems block with just the drift bullet", () => {
    const md = renderBriefingMarkdown(assembleBriefing({ ...base, selfKnowledgeDrift: true }));
    expect(md).toContain("## Subsystems");
    expect(md).toContain(
      "- self-knowledge note drifted from the live catalog (nightly refresh may have failed)",
    );
  });

  it("drift renders inside the same section as subsystem lines — no duplicate heading", () => {
    const md = renderBriefingMarkdown(
      assembleBriefing({ ...base, subsystems: lines, selfKnowledgeDrift: true }),
    );
    expect(md.match(/^## Subsystems$/gm)).toHaveLength(1);
    expect(md).toContain("- **Forge** — waiting · 2 waiting on you");
    expect(md).toContain(
      "- self-knowledge note drifted from the live catalog (nightly refresh may have failed)",
    );
  });
});

describe("stale watchers (NS2 F6c)", () => {
  const base = {
    now: NOW,
    since: SINCE,
    approvals: [],
    parkedRuns: [],
    channelItems: [],
    activity: [],
  };
  const stale = ["channel watcher stale — last tick 5 m ago (interval 30 s)"];

  it("omits staleWatchers when absent or empty — strictly additive to today's shape", () => {
    expect(assembleBriefing(base).staleWatchers).toBeUndefined();
    expect(assembleBriefing({ ...base, staleWatchers: [] }).staleWatchers).toBeUndefined();
  });

  it("surfaces the gathered stale-watcher lines", () => {
    expect(assembleBriefing({ ...base, staleWatchers: stale }).staleWatchers).toEqual(stale);
  });

  it("renders a ## Watchers markdown block iff stale lines are present", () => {
    const md = renderBriefingMarkdown(assembleBriefing({ ...base, staleWatchers: stale }));
    expect(md).toContain("## Watchers");
    expect(md).toContain("- channel watcher stale — last tick 5 m ago (interval 30 s)");
    expect(renderBriefingMarkdown(assembleBriefing(base))).not.toContain("## Watchers");
  });
});

describe("merged recently (NS2 F7b-2)", () => {
  const base = {
    now: NOW,
    since: SINCE,
    approvals: [],
    parkedRuns: [],
    channelItems: [],
    activity: [],
  };
  const merged = ["acme/app: PR #42 merged, CI green"];

  it("omits mergedRecently when absent or empty — strictly additive to today's shape", () => {
    expect(assembleBriefing(base).mergedRecently).toBeUndefined();
    expect(assembleBriefing({ ...base, mergedRecently: [] }).mergedRecently).toBeUndefined();
  });

  it("surfaces the gathered merged-recently lines", () => {
    expect(assembleBriefing({ ...base, mergedRecently: merged }).mergedRecently).toEqual(merged);
  });

  it("renders a ## Merged markdown block iff merged lines are present", () => {
    const md = renderBriefingMarkdown(assembleBriefing({ ...base, mergedRecently: merged }));
    expect(md).toContain("## Merged");
    expect(md).toContain("- acme/app: PR #42 merged, CI green");
    expect(renderBriefingMarkdown(assembleBriefing(base))).not.toContain("## Merged");
  });
});

describe("buildPersonalAgenda (NS2 F8c)", () => {
  it("a calendar item dated today becomes one HH:mm — label line", () => {
    const items = [
      channelItem({
        kind: "calendar",
        text: "[2026-06-12T09:00:00.000Z] Zubař",
      }),
    ];
    expect(buildPersonalAgenda(items, NOW)).toEqual(["09:00 — Zubař"]);
  });

  it("a calendar item dated tomorrow is dropped", () => {
    const items = [
      channelItem({
        kind: "calendar",
        text: "[2026-06-13T09:00:00.000Z] Zubař zítra",
      }),
    ];
    expect(buildPersonalAgenda(items, NOW)).toEqual([]);
  });

  it("a non-calendar channel item is ignored even if it looks like a calendar line", () => {
    const items = [
      channelItem({
        kind: "slack",
        text: "[2026-06-12T09:00:00.000Z] not actually a calendar event",
      }),
    ];
    expect(buildPersonalAgenda(items, NOW)).toEqual([]);
  });

  it("an unparseable calendar item text is dropped, never throws", () => {
    const items = [channelItem({ kind: "calendar", text: "no brackets here" })];
    expect(() => buildPersonalAgenda(items, NOW)).not.toThrow();
    expect(buildPersonalAgenda(items, NOW)).toEqual([]);
  });

  it("sorts multiple same-day events by start time", () => {
    const items = [
      channelItem({ id: "a", kind: "calendar", text: "[2026-06-12T15:00:00.000Z] Odpoledne" }),
      channelItem({ id: "b", kind: "calendar", text: "[2026-06-12T09:00:00.000Z] Ráno" }),
    ];
    expect(buildPersonalAgenda(items, NOW)).toEqual(["09:00 — Ráno", "15:00 — Odpoledne"]);
  });
});

describe("personal agenda + reminders (NS2 F8c — strictly additive)", () => {
  const base = {
    now: NOW,
    since: SINCE,
    approvals: [],
    parkedRuns: [],
    channelItems: [],
    activity: [],
  };
  const reminders = ["Zavolat do banky"];

  it("omits personalAgenda/reminders when absent or empty — strictly additive to today's shape", () => {
    expect(assembleBriefing(base).personalAgenda).toBeUndefined();
    expect(assembleBriefing({ ...base, reminders: [] }).reminders).toBeUndefined();
  });

  it("derives personalAgenda from today's calendar channel items", () => {
    const withAgenda = assembleBriefing({
      ...base,
      channelItems: [channelItem({ kind: "calendar", text: "[2026-06-12T09:00:00.000Z] Zubař" })],
    });
    expect(withAgenda.personalAgenda).toEqual(["09:00 — Zubař"]);
  });

  it("surfaces the gathered reminders lines verbatim", () => {
    expect(assembleBriefing({ ...base, reminders }).reminders).toEqual(reminders);
  });

  it("renders ## Osobní — dnešní agenda and ## Připomínky blocks iff their arrays are non-empty", () => {
    const md = renderBriefingMarkdown(
      assembleBriefing({
        ...base,
        channelItems: [channelItem({ kind: "calendar", text: "[2026-06-12T09:00:00.000Z] Zubař" })],
        reminders,
      }),
    );
    expect(md).toContain("## Osobní — dnešní agenda");
    expect(md).toContain("- 09:00 — Zubař");
    expect(md).toContain("## Připomínky");
    expect(md).toContain("- Zavolat do banky");

    const empty = renderBriefingMarkdown(assembleBriefing(base));
    expect(empty).not.toContain("## Osobní");
    expect(empty).not.toContain("## Připomínky");
  });

  it("a briefing with neither personalAgenda nor reminders renders byte-identical to today (regression)", () => {
    const md = renderBriefingMarkdown(assembleBriefing(base));
    expect(md).toBe(
      "# Briefing\n\n" +
        "Nothing needs you.\n\n" +
        "## Needs you\n" +
        "- Nothing needs you.\n\n" +
        "## Did for you\n" +
        "- Nothing recorded in this window.\n\n" +
        "## Counts\n" +
        "- 0 finished · 0 failed · 0 parked · 0 approvals pending · 0 new channel items\n",
    );
  });
});
