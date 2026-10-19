import type { InboxEpic, InboxPr, InboxRoadmapItem } from "@zibby/contracts";
import { describe, expect, it } from "vitest";
import {
  EMPTY_INBOX_FILTERS,
  NONE_OPTION,
  counterSuffix,
  differsFromSource,
  elapsed,
  groupByEpic,
  groupPrsBySection,
  hiddenCount,
  inboxCounts,
  linkedPrOf,
  normalizeSearch,
  passesFilters,
  prChains,
  splitPrs,
  visibleItems,
  zibbyStatus,
} from "./inbox";

function makeItem(over: Partial<InboxRoadmapItem> = {}): InboxRoadmapItem {
  return {
    id: "i1",
    projectId: "api",
    level: "task",
    name: "Retry webhook deliveries",
    description: "",
    source: { kind: "jira", integrationId: "jira-1", externalId: "1", externalKey: "API-1" },
    attachments: [],
    dependsOn: [],
    dependsOnFromSource: [],
    lifecycle: "todo",
    runs: [],
    syncNotes: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    project: { id: "api", name: "api" },
    hidden: false,
    ...over,
  };
}

function makePr(over: Partial<InboxPr> = {}): InboxPr {
  return {
    source: "github",
    number: 1,
    title: "t",
    url: "https://github.com/acme/api/pull/1",
    repo: "acme/api",
    author: "me",
    createdAt: "2026-01-01T00:00:00.000Z",
    draft: false,
    ci: "passing",
    review: "none",
    mergeable: true,
    bucket: "mine",
    blocker: "awaiting-review",
    section: "waiting",
    projectId: "api",
    ...over,
  };
}

describe("zibbyStatus / differsFromSource", () => {
  it("maps the lifecycle to the four ZIBBY statuses", () => {
    const status = (lifecycle: InboxRoadmapItem["lifecycle"]) => zibbyStatus({ lifecycle });
    expect(status("todo")).toBe("new");
    expect(status("failed")).toBe("waiting");
    expect(status("awaiting-merge")).toBe("waiting");
    expect(status("enqueued")).toBe("running");
    expect(status("running")).toBe("running");
    expect(status("external")).toBe("running");
    expect(status("done")).toBe("done");
  });

  it("flags drift only when ZIBBY is done and the source is not", () => {
    const done = { lifecycle: "done" as const };
    expect(differsFromSource({ ...done, sourceStatus: { name: "In Progress", done: false } })).toBe(
      true,
    );
    expect(differsFromSource({ ...done, sourceStatus: { name: "Done", done: true } })).toBe(false);
    expect(differsFromSource(done)).toBe(false);
    expect(
      differsFromSource({ lifecycle: "todo", sourceStatus: { name: "Open", done: false } }),
    ).toBe(false);
  });
});

describe("visibleItems", () => {
  const items = [
    makeItem({ id: "run", lifecycle: "running", updatedAt: "2026-01-05T00:00:00.000Z" }),
    makeItem({ id: "old-new", lifecycle: "todo", updatedAt: "2026-01-02T00:00:00.000Z" }),
    makeItem({ id: "new-new", lifecycle: "todo", updatedAt: "2026-01-04T00:00:00.000Z" }),
    makeItem({ id: "wait", lifecycle: "failed", updatedAt: "2026-01-03T00:00:00.000Z" }),
    makeItem({ id: "done", lifecycle: "done" }),
    makeItem({ id: "gone", lifecycle: "archived" }),
    makeItem({ id: "hid", lifecycle: "todo", hidden: true }),
  ];
  const base = { filters: EMPTY_INBOX_FILTERS, search: "", showDone: false, showHidden: false };

  it("sorts new → waiting → running, most recent first, and drops done / hidden / archived", () => {
    expect(visibleItems(items, base).map((i) => i.id)).toEqual([
      "new-new",
      "old-new",
      "wait",
      "run",
    ]);
  });

  it("reveals done and hidden items on request but never archived ones", () => {
    const ids = visibleItems(items, { ...base, showDone: true, showHidden: true }).map((i) => i.id);
    expect(ids).toContain("done");
    expect(ids).toContain("hid");
    expect(ids).not.toContain("gone");
  });

  it("searches name, description and key without caring for case or diacritics", () => {
    const list = [
      makeItem({ id: "a", name: "Přihlášení přes Okta" }),
      makeItem({ id: "b", name: "Other", description: "mentions KEŠ here" }),
      makeItem({ id: "c", name: "Nothing", source: { kind: "github", externalKey: "#212" } }),
    ];
    const ids = (search: string) => visibleItems(list, { ...base, search }).map((i) => i.id);
    expect(ids("prihlaseni")).toEqual(["a"]);
    expect(ids("kes")).toEqual(["b"]);
    expect(ids("#212")).toEqual(["c"]);
    expect(normalizeSearch("Žluťoučký")).toBe("zlutoucky");
  });

  it("counts hidden items under the active filters", () => {
    const list = [
      makeItem({ id: "h1", hidden: true }),
      makeItem({ id: "h2", hidden: true, project: { id: "web", name: "web" }, projectId: "web" }),
    ];
    expect(hiddenCount(list, EMPTY_INBOX_FILTERS)).toBe(2);
    expect(hiddenCount(list, { ...EMPTY_INBOX_FILTERS, project: ["web"] })).toBe(1);
  });
});

describe("passesFilters", () => {
  const scope = { projectId: "api", companyId: "acme", teamId: undefined };
  it("is AND across dimensions and OR within one", () => {
    expect(passesFilters(EMPTY_INBOX_FILTERS, scope)).toBe(true);
    expect(passesFilters({ company: ["acme", "x"], team: [], project: [] }, scope)).toBe(true);
    expect(passesFilters({ company: ["acme"], team: [], project: ["web"] }, scope)).toBe(false);
  });

  it("matches the __none option against a missing company / team", () => {
    expect(passesFilters({ ...EMPTY_INBOX_FILTERS, team: [NONE_OPTION] }, scope)).toBe(true);
    expect(passesFilters({ ...EMPTY_INBOX_FILTERS, company: [NONE_OPTION] }, scope)).toBe(false);
    expect(
      passesFilters(
        { ...EMPTY_INBOX_FILTERS, company: [NONE_OPTION] },
        { projectId: "p", companyId: undefined },
      ),
    ).toBe(true);
  });
});

describe("groupByEpic", () => {
  const epics: InboxEpic[] = [
    { id: "e1", projectId: "api", title: "Webhooks", source: "jira", done: 7, total: 12 },
    { id: "e2", projectId: "api", title: "Offline", source: "jira", done: 1, total: 4 },
    { id: "e3", projectId: "api", title: "Empty epic", source: "jira", done: 0, total: 1 },
  ];

  it("orders epics by best child, nests children, puts 'No epic' last and omits empty epics", () => {
    const sorted = visibleItems(
      [
        makeItem({ id: "r", lifecycle: "running", parentId: "e1" }),
        makeItem({ id: "n", lifecycle: "todo", parentId: "e2" }),
        makeItem({ id: "w", lifecycle: "failed", parentId: "e1" }),
        makeItem({ id: "loose", lifecycle: "todo" }),
        makeItem({ id: "orphan", lifecycle: "running", parentId: "unknown-epic" }),
      ],
      { filters: EMPTY_INBOX_FILTERS, search: "", showDone: false, showHidden: false },
    );
    const groups = groupByEpic(sorted, epics);
    expect(groups.map((g) => g.epic?.id ?? null)).toEqual(["e2", "e1", null]);
    expect(groups[1]?.children.map((c) => c.id)).toEqual(["w", "r"]);
    expect(groups[2]?.children.map((c) => c.id)).toEqual(["loose", "orphan"]);
  });

  it("produces no 'No epic' group when every item has an epic", () => {
    const groups = groupByEpic([makeItem({ parentId: "e1" })], epics);
    expect(groups.map((g) => g.epic?.id)).toEqual(["e1"]);
  });
});

describe("pull requests", () => {
  it("sorts by blocker order, then oldest first, split by bucket", () => {
    const prs = [
      makePr({ number: 1, blocker: "ready-to-merge" }),
      makePr({ number: 2, blocker: "ci-failing", createdAt: "2026-01-03T00:00:00.000Z" }),
      makePr({ number: 3, blocker: "ci-failing", createdAt: "2026-01-02T00:00:00.000Z" }),
      makePr({ number: 4, bucket: "to-review", blocker: "awaiting-review" }),
    ];
    const { mine, toReview } = splitPrs(prs, EMPTY_INBOX_FILTERS);
    expect(mine.map((p) => p.number)).toEqual([3, 2, 1]);
    expect(toReview.map((p) => p.number)).toEqual([4]);
  });

  it("groups by server-computed section, every section present, sorted within", () => {
    const groups = groupPrsBySection(
      [
        makePr({ number: 1, section: "ready-to-merge" }),
        makePr({ number: 2, section: "needs-action", blocker: "ci-failing" }),
        makePr({ number: 3, section: "needs-action", blocker: "merge-conflict" }),
        makePr({ number: 4, bucket: "to-review", section: "needs-team-review" }),
      ],
      EMPTY_INBOX_FILTERS,
    );
    expect(Object.keys(groups)).toEqual([
      "needs-your-review",
      "needs-team-review",
      "waiting",
      "needs-action",
      "ready-to-merge",
    ]);
    expect(groups["needs-action"].map((p) => p.number)).toEqual([2, 3]);
    expect(groups["needs-your-review"]).toEqual([]);
    expect(groups["needs-team-review"].map((p) => p.number)).toEqual([4]);
  });

  it("applies the shared filters", () => {
    const prs = [makePr({ number: 1 }), makePr({ number: 2, projectId: "web" })];
    expect(splitPrs(prs, { ...EMPTY_INBOX_FILTERS, project: ["web"] }).mine).toHaveLength(1);
  });

  it("prefers the synced linkedPr, else the latest run that opened a PR", () => {
    expect(linkedPrOf(makeItem())).toBeNull();
    const run = (taskId: string, startedAt: string, n?: number) => ({
      taskId,
      startedAt,
      outcome: "done" as const,
      ...(n ? { prNumber: n, prUrl: `https://github.com/acme/api/pull/${n}` } : {}),
    });
    expect(
      linkedPrOf(
        makeItem({
          runs: [run("a", "2026-01-01T00:00:00.000Z", 5), run("b", "2026-01-02T00:00:00.000Z", 6)],
        }),
      )?.number,
    ).toBe(6);
    expect(
      linkedPrOf(
        makeItem({
          linkedPr: { number: 9, url: "https://github.com/acme/api/pull/9", title: "x" },
        }),
      )?.number,
    ).toBe(9);
  });
});

describe("counters", () => {
  it("counts only actionable items and PRs, ignoring filters", () => {
    const items = [
      makeItem({ id: "1", lifecycle: "todo" }),
      makeItem({ id: "2", lifecycle: "failed" }),
      makeItem({ id: "3", lifecycle: "running" }),
      makeItem({ id: "4", lifecycle: "todo", hidden: true }),
      makeItem({ id: "5", lifecycle: "done" }),
    ];
    const prs = [
      makePr({ bucket: "to-review" }),
      makePr({ bucket: "mine", blocker: "ci-failing" }),
      makePr({ bucket: "mine", blocker: "merge-conflict" }),
      makePr({ bucket: "mine", blocker: "ready-to-merge" }),
      makePr({ bucket: "to-review", blocker: "ci-failing" }),
    ];
    const counts = inboxCounts(items, prs);
    expect(counts).toEqual({ issues: 2, toReview: 2, mineBlocked: 2 });
    expect(counterSuffix("issues", counts)).toBe(" · 02");
    expect(counterSuffix("pull-requests", counts)).toBe(" · 02 · 02");
    expect(counterSuffix("overview", counts)).toBe("");
    expect(counterSuffix("issues", undefined)).toBe("");
  });
});

describe("elapsed", () => {
  const now = Date.parse("2026-01-10T12:00:00.000Z");
  it("buckets into now / min / h / d", () => {
    expect(elapsed("2026-01-10T11:59:40.000Z", now)).toEqual({ unit: "now", n: 0 });
    expect(elapsed("2026-01-10T11:56:00.000Z", now)).toEqual({ unit: "min", n: 4 });
    expect(elapsed("2026-01-10T07:00:00.000Z", now)).toEqual({ unit: "h", n: 5 });
    expect(elapsed("2026-01-08T12:00:00.000Z", now)).toEqual({ unit: "d", n: 2 });
  });
});

describe("prChains", () => {
  const pr = (number: number, over: Partial<InboxPr> = {}): InboxPr => ({
    source: "github",
    number,
    title: `PR ${number}`,
    url: `https://github.com/acme/api/pull/${number}`,
    repo: "acme/api",
    author: "me",
    createdAt: "2026-01-01T00:00:00.000Z",
    draft: false,
    ci: "passing",
    review: "none",
    mergeable: true,
    bucket: "mine",
    blocker: "awaiting-review",
    section: "waiting",
    projectId: "api",
    ...over,
  });

  it("links a PR whose base is another PR's head, one level each way", () => {
    const a = pr(1, { headRef: "feat-a", baseRef: "main" });
    const b = pr(2, { headRef: "feat-b", baseRef: "feat-a" });
    const c = pr(3, { headRef: "feat-c", baseRef: "feat-b" });
    const chains = prChains([a, b, c]);
    expect(chains.get(a.url)).toEqual({ on: [], by: [b] });
    expect(chains.get(b.url)).toEqual({ on: [a], by: [c] });
    expect(chains.get(c.url)).toEqual({ on: [b], by: [] });
  });

  it("never links across repos, without refs, or a PR to itself", () => {
    const a = pr(1, { headRef: "feat-a", baseRef: "main" });
    const otherRepo = pr(2, {
      repo: "acme/web",
      url: "https://github.com/acme/web/pull/2",
      baseRef: "feat-a",
    });
    const noRefs = pr(3); // old payload / fork head: undefined must not match undefined
    const noHead = pr(4, { baseRef: "main" });
    const self = pr(5, { headRef: "loop", baseRef: "loop" });
    expect(prChains([a, otherRepo, noRefs, noHead, self]).size).toBe(0);
  });

  it("lists every child of one parent, and survives a two-PR cycle", () => {
    const a = pr(1, { headRef: "feat-a", baseRef: "main" });
    const b = pr(2, { headRef: "feat-b", baseRef: "feat-a" });
    const c = pr(3, { headRef: "feat-c", baseRef: "feat-a" });
    expect(prChains([a, b, c]).get(a.url)).toEqual({ on: [], by: [b, c] });

    const x = pr(4, { headRef: "y", baseRef: "x" });
    const y = pr(5, { headRef: "x", baseRef: "y" });
    const chains = prChains([x, y]);
    expect(chains.get(x.url)).toEqual({ on: [y], by: [y] });
    expect(chains.get(y.url)).toEqual({ on: [x], by: [x] });
  });
});
