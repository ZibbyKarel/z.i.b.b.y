import type { BudgetStatus, InboxEpic, InboxPr, InboxRoadmapItem } from "@zibby/contracts";
import { describe, expect, it } from "vitest";
import type { RunView } from "../../runs/run";
import {
  compareIssues,
  formatUsd,
  issueGroups,
  prGroups,
  prNeed,
  runRows,
  spendTodayUsd,
} from "./rows";

const ago = (iso: string) => `ago:${iso.slice(0, 10)}`;

const item = (over: Partial<InboxRoadmapItem> & { id: string }): InboxRoadmapItem =>
  ({
    projectId: "p1",
    level: "task",
    name: `Item ${over.id}`,
    description: "",
    source: { kind: "jira", externalKey: `ZB-${over.id}` },
    lifecycle: "todo",
    runs: [],
    dependsOn: [],
    updatedAt: "2026-10-01T00:00:00.000Z",
    project: { id: "p1", name: "Shop" },
    hidden: false,
    ...over,
  }) as unknown as InboxRoadmapItem;

const pr = (over: Partial<InboxPr> & { number: number }): InboxPr => ({
  source: "github",
  title: `PR ${over.number}`,
  url: `https://github.com/o/r/pull/${over.number}`,
  repo: "o/orders",
  author: "karel",
  createdAt: "2026-10-01T00:00:00.000Z",
  draft: false,
  ci: "passing",
  review: "none",
  mergeable: true,
  bucket: "mine",
  blocker: "awaiting-review",
  section: "waiting",
  projectId: "p1",
  ...over,
});

describe("issues", () => {
  it("sorts waiting first, then new, running, done; recent first", () => {
    const list = [
      item({ id: "run", lifecycle: "running" }),
      item({ id: "new-old", updatedAt: "2026-09-01T00:00:00.000Z" }),
      item({ id: "new-recent" }),
      item({ id: "wait", lifecycle: "failed" }),
    ];
    expect([...list].sort(compareIssues).map((i) => i.id)).toEqual([
      "wait",
      "new-recent",
      "new-old",
      "run",
    ]);
  });

  it("groups under the epic with progress, loose items last", () => {
    const epic: InboxEpic = {
      id: "e1",
      projectId: "p1",
      key: "EP-1",
      title: "Checkout",
      source: "jira",
      done: 2,
      total: 5,
    };
    const groups = issueGroups(
      "issues",
      [item({ id: "a", parentId: "e1", lifecycle: "failed" }), item({ id: "b" })],
      [epic],
      [pr({ number: 7, url: "https://x/7" })],
      ago,
    );
    expect(groups.map((g) => g.key)).toEqual(["e1", "none"]);
    expect(groups[0]).toMatchObject({ count: "02/05", progress: 40 });
    expect(groups[0]?.rows[0]).toMatchObject({
      key: "issues:p1/a",
      id: "p1/a",
      code: "ZB-a",
      tone: "blocked",
      needsYou: "ago:2026-10-01",
      source: "JIRA",
      sourceKind: "jira",
      project: "SHOP",
      pr: null,
    });
    expect(groups[1]).toMatchObject({ count: "01", progress: 0, epic: null });
  });

  it("shows the linked PR number", () => {
    const [g] = issueGroups(
      "w",
      [item({ id: "a", linkedPr: { number: 12, url: "https://x/12", title: "t" } })],
      [],
      [],
      ago,
    );
    expect(g?.rows[0]?.pr).toBe("#12");
  });
});

describe("pull requests", () => {
  it("prNeed", () => {
    expect(prNeed(pr({ number: 1, bucket: "to-review" }))).toBe("review");
    expect(prNeed(pr({ number: 1, blocker: "ready-to-merge" }))).toBe("merge");
    expect(prNeed(pr({ number: 1, blocker: "ci-failing" }))).toBe("fix");
    expect(prNeed(pr({ number: 1 }))).toBeNull();
  });

  it("groups a stack under its root with ON / WAITS ON, urgent group first", () => {
    const root = pr({ number: 1, headRef: "a", baseRef: "main" });
    const kid = pr({ number: 2, headRef: "b", baseRef: "a", blocker: "ci-failing", ci: "failing" });
    const calm = pr({
      number: 3,
      headRef: "c",
      baseRef: "main",
      createdAt: "2026-09-01T00:00:00.000Z",
    });
    const { groups, visible } = prGroups(
      "prs",
      [calm, root, kid],
      { company: [], team: [], project: [] },
      ago,
    );
    expect(visible).toHaveLength(3);
    expect(groups.map((g) => g.root.number)).toEqual(["#1", "#3"]);
    const k = groups[0]?.kids[0];
    expect(k).toMatchObject({
      number: "#2",
      on: "#1",
      waits: "#1",
      statusKey: "ciFailing",
      tone: "error",
    });
    expect(groups[0]?.root.meta).toBe("orders · YOU · ago:2026-10-01");
  });

  it("applies the inbox filters to the visible set only", () => {
    const { groups } = prGroups(
      "prs",
      [pr({ number: 1, projectId: "p1" }), pr({ number: 2, projectId: "p2" })],
      { company: [], team: [], project: ["p2"] },
      ago,
    );
    expect(groups.map((g) => g.root.number)).toEqual(["#2"]);
  });
});

describe("runs", () => {
  const run = (over: Partial<RunView>): RunView =>
    ({
      runId: "r1",
      kind: "workflow",
      owner: "delivery",
      status: "running",
      pct: null,
      title: "Ship it",
      prompt: "",
      project: "shop",
      startedAt: "",
      logBase: null,
      ...over,
    }) as RunView;
  it("maps status to tone, task id, step, issue label", () => {
    const [a, b] = runRows("runs", [
      run({ taskId: "t1", currentStage: "coder", roadmapItemLabel: "ZB-9", pct: 41.6 }),
      run({
        runId: "r2",
        status: "awaiting-approval",
        processor: { kind: "workflow", id: "d", name: "Delivery" },
      }),
    ]);
    expect(a).toMatchObject({
      key: "runs:r1",
      id: "t1",
      tone: "working",
      step: "DELIVERY · CODER",
      pct: 42,
      issue: "ZB-9",
    });
    expect(b).toMatchObject({
      id: null,
      tone: "blocked",
      pct: null,
      issue: null,
      step: "DELIVERY · WORKFLOW",
    });
  });
});

describe("briefing", () => {
  it("sums today's cost across projects", () => {
    const budget = {
      projects: [{ dailyCost: { spentUsd: 1.5 } }, { dailyCost: { spentUsd: 0.25 } }, {}],
    } as unknown as BudgetStatus;
    expect(spendTodayUsd(budget)).toBe(1.75);
    expect(spendTodayUsd(undefined)).toBe(0);
    expect(formatUsd(1.75)).toBe("$1.75");
  });
});
