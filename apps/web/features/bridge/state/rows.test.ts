import type { BudgetStatus, InboxEpic, InboxPr, InboxRoadmapItem } from "@zibby/contracts";
import { describe, expect, it } from "vitest";
import type { RunView } from "../../runs/run";
import {
  type PrFilterPick,
  type PrNodeVm,
  compareIssues,
  formatUsd,
  issueGroups,
  prTeamLabel,
  prTeams,
  prTree,
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
      source: "Jira",
      sourceKind: "jira",
      project: "Shop",
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
  const none = { company: [], team: [], project: [] };
  const flat = (nodes: PrNodeVm[], depth = 0): [string, number][] =>
    nodes.flatMap((n) => [[n.row.number, depth] as [string, number], ...flat(n.kids, depth + 1)]);

  it("prRow conversations counts unresolved threads only on my PRs", () => {
    const conv = (p: InboxPr) => prTree("w", [p], none, {}, ago).nodes[0]?.row.conversations;
    expect(conv(pr({ number: 1, unresolvedThreads: 2 }))).toBe(2);
    expect(conv(pr({ number: 1 }))).toBe(0);
    expect(conv(pr({ number: 1, bucket: "to-review", unresolvedThreads: 2 }))).toBe(0);
  });

  it("one flat list, newest first; a stack nests base -> head and sorts by its newest PR", () => {
    const { nodes } = prTree(
      "prs",
      [
        pr({ number: 1, headRef: "a", baseRef: "main", createdAt: "2026-09-01T00:00:00.000Z" }),
        pr({ number: 2, headRef: "b", baseRef: "a", bucket: "to-review", author: "jana" }),
        pr({ number: 3, headRef: "c", baseRef: "b", createdAt: "2026-10-05T00:00:00.000Z" }),
        pr({ number: 4, headRef: "d", baseRef: "main", createdAt: "2026-10-03T00:00:00.000Z" }),
      ],
      none,
      {},
      ago,
    );
    expect(flat(nodes)).toEqual([
      ["#1", 0],
      ["#2", 1],
      ["#3", 2],
      ["#4", 0],
    ]);
    expect(nodes[0]?.kids[0]?.row).toMatchObject({ mine: false, author: "jana" });
  });

  it("row: author name or login, avatar, repo, age, icons and tone", () => {
    const [n] = prTree(
      "prs",
      [
        pr({
          number: 5,
          bucket: "to-review",
          author: "jana",
          authorName: "Jana Nová",
          authorAvatarUrl: "https://a/j.png",
          ci: "failing",
        }),
      ],
      none,
      {},
      ago,
    ).nodes;
    expect(n?.row).toMatchObject({
      author: "Jana Nová",
      avatarUrl: "https://a/j.png",
      project: "orders",
      age: "ago:2026-10-01",
      ci: "failing",
      review: "review",
      reviewHint: "reviewYou",
      needsYou: true,
      tone: "thinking", // someone else's red CI is not my blocker
    });
    const mine = prTree("p", [pr({ number: 6, ci: "failing" })], none, {}, ago).nodes[0]?.row;
    expect(mine).toMatchObject({ author: "karel", tone: "error", needsYou: false });
  });

  it("a pick keeps a hit's listed ancestors as muted context and drops the rest", () => {
    const all = [
      pr({ number: 1, headRef: "a", baseRef: "main" }),
      pr({ number: 2, headRef: "b", baseRef: "a", bucket: "to-review" }),
      pr({ number: 3, headRef: "c", baseRef: "b", mergeable: false }),
      pr({ number: 4, headRef: "d", baseRef: "main" }),
    ];
    const { nodes, total, you, counts } = prTree("p", all, none, { ci: ["conflict"] }, ago);
    expect(flat(nodes)).toEqual([
      ["#1", 0],
      ["#2", 1],
      ["#3", 2],
    ]);
    const muted = (n?: PrNodeVm) => n?.row.muted;
    expect(muted(nodes[0])).toBe(true);
    expect(muted(nodes[0]?.kids[0])).toBe(true);
    expect(muted(nodes[0]?.kids[0]?.kids[0])).toBe(false);
    expect(prTree("p", all, none, { review: ["approved"] }, ago).nodes).toEqual([]);
    // counts and totals describe the whole listed set, whatever is picked
    expect({ total, you }).toEqual({ total: 4, you: 1 });
    // "waiting" merges the review and waiting states
    expect(counts.review).toEqual({ waiting: 4, changes: 0, approved: 0 });
    expect(counts.ci).toEqual({ conflict: 1, failing: 0, passing: 3 });
  });

  it("multi-pick: OR within a group, AND across groups, empty group = no filter", () => {
    const all = [
      pr({ number: 1, mergeable: false }),
      pr({ number: 2, ci: "failing" }),
      pr({ number: 3, ci: "pending" }),
      pr({ number: 4, ci: "failing", review: "changes-requested" }),
    ];
    const nums = (pick: PrFilterPick) =>
      prTree("p", all, none, pick, ago).nodes.map((n) => n.row.number);
    expect(nums({ ci: ["conflict", "failing"] })).toEqual(["#1", "#2", "#4"]);
    expect(nums({ ci: ["conflict", "failing"], review: ["changes"] })).toEqual(["#4"]);
    expect(nums({ ci: [], review: [] })).toEqual(["#1", "#2", "#3", "#4"]);
  });

  it("the waiting filter covers both review and waiting states", () => {
    const all = [
      pr({ number: 1 }), // mine, no review yet -> review
      pr({ number: 2, bucket: "reviewed", myReview: "commented" }), // someone else's -> waiting
      pr({ number: 3, review: "approved" }),
    ];
    const { nodes, counts } = prTree("p", all, none, { review: ["waiting"] }, ago);
    expect(nodes.map((n) => n.row.number).sort()).toEqual(["#1", "#2"]);
    expect(nodes.map((n) => n.row.review).sort()).toEqual(["review", "waiting"]);
    expect(counts.review.waiting).toBe(2);
  });

  it("mine keeps others' ancestors and descendants of my PRs as muted context", () => {
    const other = { bucket: "to-review", author: "jana" } as const;
    const all = [
      pr({ number: 1, headRef: "a", baseRef: "main", ...other }), // ancestor of mine
      pr({ number: 2, headRef: "b", baseRef: "a" }), // mine
      pr({ number: 3, headRef: "c", baseRef: "b", ...other }), // descendant of mine
      pr({ number: 4, headRef: "d", baseRef: "main", ...other }), // unrelated
    ];
    const { nodes } = prTree("p", all, none, { mine: true }, ago);
    expect(flat(nodes)).toEqual([
      ["#1", 0],
      ["#2", 1],
      ["#3", 2],
    ]);
    expect(nodes[0]?.row.muted).toBe(true);
    expect(nodes[0]?.kids[0]?.row.muted).toBe(false);
    expect(nodes[0]?.kids[0]?.kids[0]?.row.muted).toBe(true);
  });

  it("teams match on reviewTeam; prTeams lists distinct slugs plus extras, sorted", () => {
    const all = [
      pr({ number: 1, reviewTeam: "o/blue" }),
      pr({ number: 2, reviewTeam: "o/red" }),
      pr({ number: 3 }),
      pr({ number: 4, reviewTeam: "o/blue" }),
    ];
    const nums = (teams: string[]) =>
      prTree("p", all, none, { teams }, ago).nodes.map((n) => n.row.number);
    expect(nums(["o/blue"])).toEqual(["#1", "#4"]);
    expect(nums(["o/blue", "o/red"])).toEqual(["#1", "#2", "#4"]);
    expect(prTeams(all, ["o/green"])).toEqual(["o/blue", "o/green", "o/red"]);
    expect(prTeamLabel("o/blue")).toBe("blue");
  });

  it("applies the inbox filters before anything else", () => {
    const { nodes, total } = prTree(
      "prs",
      [pr({ number: 1, projectId: "p1" }), pr({ number: 2, projectId: "p2" })],
      { company: [], team: [], project: ["p2"] },
      {},
      ago,
    );
    expect(nodes.map((n) => n.row.number)).toEqual(["#2"]);
    expect(total).toBe(1);
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
      step: "delivery · coder",
      pct: 0,
      stages: { done: 0, total: 1 },
      issue: "ZB-9",
    });
    expect(b).toMatchObject({
      id: null,
      tone: "blocked",
      pct: null,
      issue: null,
      step: "Delivery · workflow",
    });
  });

  const done = (phaseId: string, attempt = 1, status = "done") => ({
    phaseId,
    runId: `s-${phaseId}-${attempt}`,
    attempt,
    status,
  });
  const phases = (...ids: string[]) => new Map([["delivery", ids]]);

  it("workflow pct = done phases / defined phases", () => {
    const [a] = runRows(
      "runs",
      [run({ currentStage: "coder", stageRuns: [done("architect")] } as Partial<RunView>)],
      phases("architect", "coder", "review", "test"),
    );
    expect(a).toMatchObject({ stages: { done: 1, total: 4 }, pct: 25 });
  });

  it("0 stages -> null", () => {
    const [a] = runRows("runs", [run({ currentStage: null })]);
    expect(a).toMatchObject({ stages: null, pct: null });
  });

  it("all phases done while still running -> 100", () => {
    const [a] = runRows(
      "runs",
      [run({ currentStage: null, stageRuns: [done("a"), done("b")] } as Partial<RunView>)],
      phases("a", "b"),
    );
    expect(a?.pct).toBe(100);
  });

  it("a retried phase counts once", () => {
    const [a] = runRows(
      "runs",
      [
        run({
          currentStage: null,
          stageRuns: [done("coder"), done("review", 1, "error"), done("review", 2)],
        } as Partial<RunView>),
      ],
      phases("coder", "review"),
    );
    expect(a?.stages).toEqual({ done: 2, total: 2 });
  });

  it("single-agent run is indeterminate even with pct", () => {
    const [a] = runRows("runs", [run({ kind: "agent", pct: 40 })]);
    expect(a).toMatchObject({ stages: null, pct: null });
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
