import type { Integration, Project } from "@zibby/contracts";
import { Subject } from "rxjs";
import { describe, expect, it } from "vitest";
import { InboxService, blockerOf, ciState, reviewState, sectionOf } from "./inbox.service";

describe("PR classification", () => {
  it("reviewState: latest non-COMMENTED review per reviewer, changes-requested beats approved", () => {
    expect(reviewState([])).toBe("none");
    expect(reviewState([{ user: { login: "a" }, state: "COMMENTED" }])).toBe("none");
    expect(
      reviewState([
        { user: { login: "a" }, state: "CHANGES_REQUESTED" },
        { user: { login: "a" }, state: "COMMENTED" },
        { user: { login: "a" }, state: "APPROVED" },
      ]),
    ).toBe("approved");
    expect(
      reviewState([
        { user: { login: "a" }, state: "APPROVED" },
        { user: { login: "b" }, state: "CHANGES_REQUESTED" },
      ]),
    ).toBe("changes-requested");
  });

  it("ciState: failing > pending > passing, none = unknown", () => {
    expect(ciState([])).toBe("unknown");
    expect(
      ciState([
        { status: "completed", conclusion: "success" },
        { status: "completed", conclusion: "skipped" },
      ]),
    ).toBe("passing");
    expect(
      ciState([
        { status: "in_progress", conclusion: null },
        { status: "completed", conclusion: "success" },
      ]),
    ).toBe("pending");
    expect(
      ciState([
        { status: "in_progress", conclusion: null },
        { status: "completed", conclusion: "timed_out" },
      ]),
    ).toBe("failing");
    expect(ciState([{ status: "completed", conclusion: "action_required" }])).toBe("unknown");
  });

  it("blockerOf: ci > changes requested > conflict > ready > awaiting", () => {
    expect(blockerOf({ ci: "failing", review: "changes-requested", mergeable: false })).toBe(
      "ci-failing",
    );
    expect(blockerOf({ ci: "passing", review: "changes-requested", mergeable: false })).toBe(
      "changes-requested",
    );
    expect(blockerOf({ ci: "passing", review: "approved", mergeable: false })).toBe(
      "merge-conflict",
    );
    expect(blockerOf({ ci: "passing", review: "approved", mergeable: null })).toBe(
      "ready-to-merge",
    );
    expect(blockerOf({ ci: "pending", review: "approved", mergeable: true })).toBe(
      "awaiting-review",
    );
  });
});

describe("sectionOf", () => {
  const mine = {
    bucket: "mine" as const,
    ci: "passing" as const,
    review: "approved" as const,
    mergeable: true as boolean | null,
    draft: false,
  };

  it("review requests: direct vs team only", () => {
    expect(sectionOf({ ...mine, bucket: "to-review", reviewReason: "direct" })).toBe(
      "needs-your-review",
    );
    expect(sectionOf({ ...mine, bucket: "to-review", reviewReason: "team" })).toBe(
      "needs-team-review",
    );
  });

  it("mine: ready only when approved + passing + not conflicting + not draft", () => {
    expect(sectionOf(mine)).toBe("ready-to-merge");
    expect(sectionOf({ ...mine, mergeable: null })).toBe("ready-to-merge");
    expect(sectionOf({ ...mine, draft: true })).toBe("needs-action");
    expect(sectionOf({ ...mine, ci: "failing" })).toBe("needs-action");
    expect(sectionOf({ ...mine, review: "changes-requested" })).toBe("needs-action");
    expect(sectionOf({ ...mine, mergeable: false })).toBe("needs-action");
    expect(sectionOf({ ...mine, ci: "pending" })).toBe("waiting");
    expect(sectionOf({ ...mine, review: "none" })).toBe("waiting");
    expect(sectionOf({ ...mine, ci: "unknown" })).toBe("ready-to-merge"); // repo without CI
  });
});

describe("InboxService.listPrs", () => {
  const project: Project = {
    id: "acme",
    name: "Acme",
    path: "~/acme",
    companyId: "co",
    teamId: "tm",
  };
  const github = {
    id: "gh",
    config: { kind: "github", repo: "Acme/app", username: "me" },
  } as unknown as Integration;

  function build(
    tasks: unknown[] = [],
    opts: { changesRequested?: boolean; graphqlThreads?: unknown[]; graphqlStatus?: number } = {},
  ) {
    const calls: string[] = [];
    const graphqlThreads = opts.graphqlThreads ?? [{ isResolved: true }, { isResolved: false }];
    const merged: (() => void)[] = [];
    const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
    const fetchImpl = (async (url: string | URL) => {
      const u = new URL(String(url));
      calls.push(u.pathname);
      if (u.pathname === "/graphql") {
        calls.push("graphql");
        return json(
          {
            data: {
              repository: { pullRequest: { reviewThreads: { nodes: graphqlThreads } } },
            },
          },
          opts.graphqlStatus ?? 200,
        );
      }
      const q = u.searchParams.get("q") ?? "";
      if (u.pathname === "/user/teams") {
        return json([
          { slug: "core", organization: { login: "acme" } },
          { slug: "other", organization: { login: "elsewhere" } },
        ]);
      }
      if (u.pathname === "/search/issues") {
        if (q.includes("author:@me")) return json({ items: [{ number: 3 }] });
        if (q.includes("user-review-requested:@me"))
          return json({ items: [{ number: 1 }, { number: 3 }] });
        if (q.includes("team-review-requested:acme/core"))
          return json({ items: [{ number: 1 }, { number: 2 }] });
        throw new Error(`unexpected search ${q}`);
      }
      const pull = u.pathname.match(/^\/repos\/Acme\/app\/pulls\/(\d+)$/);
      if (pull) {
        const n = Number(pull[1]);
        return json({
          number: n,
          title: `PR ${n}`,
          html_url: `https://github.com/Acme/app/pull/${n}`,
          draft: n === 3,
          mergeable: n === 2 ? false : true,
          mergeable_state: n === 3 ? "behind" : "clean",
          created_at: "2026-10-01T10:00:00Z",
          user: { login: n === 3 ? "me" : "alice" },
          head: {
            sha: `sha${n}`,
            ref: `feat-${n}`,
            // #2 comes from a fork: its head branch must not take part in stacking.
            repo: { full_name: n === 2 ? "someone/app" : "acme/APP" },
          },
          base: { ref: n === 3 ? "feat-1" : "main" },
        });
      }
      if (u.pathname.endsWith("/reviews")) {
        return json(
          u.pathname.includes("/pulls/3/")
            ? [
                {
                  user: { login: "bob" },
                  state: opts.changesRequested ? "CHANGES_REQUESTED" : "APPROVED",
                },
              ]
            : [],
        );
      }
      if (u.pathname.includes("/check-runs")) {
        return json({
          check_runs: u.pathname.includes("sha1")
            ? [{ status: "completed", conclusion: "failure" }]
            : [{ status: "completed", conclusion: "success" }],
        });
      }
      throw new Error(`unhandled ${u.pathname}`);
    }) as unknown as typeof fetch;

    const activity = new Subject<{ kind: string }>();
    const service = new InboxService(
      { list: async () => [project] } as never,
      { resolveIntegrations: async () => [github] } as never,
      { read: async () => ({ token: "tok" }) } as never,
      {} as never,
      {} as never,
      {} as never,
      { list: async () => tasks } as never,
      {
        onMerged: (fn: () => void) => {
          merged.push(fn);
        },
      } as never,
      { stream: () => activity.asObservable() } as never,
      fetchImpl,
    );
    return { service, calls, merged, activity };
  }

  it("an inbox-refresh activity kind clears the 30 s cache; other kinds don't", async () => {
    const { service, calls, activity } = build();
    service.onModuleInit();
    await service.listPrs();
    const before = calls.length;
    activity.next({ kind: "task-created" });
    await service.listPrs();
    expect(calls.length).toBe(before);
    activity.next({ kind: "task-outcome" });
    await service.listPrs();
    expect(calls.length).toBeGreaterThan(before);
  });

  it("attaches the latest rebase per PR; a dead running rebase reads failed", async () => {
    const rebase = (number: number, state: string) => ({
      repo: "acme/app",
      number,
      url: "u",
      head: "feat",
      base: "main",
      headSha: "s",
      conflictAtStart: false,
      state,
    });
    const { service } = build([
      {
        id: "r1",
        createdAt: "2026-10-01T00:00:00Z",
        status: "dispatched",
        prRebase: rebase(3, "pushed"),
      },
      {
        id: "r2",
        createdAt: "2026-10-02T00:00:00Z",
        status: "dispatched",
        prRebase: rebase(3, "awaiting-approval"),
      },
      {
        id: "r3",
        createdAt: "2026-10-02T00:00:00Z",
        status: "cancelled",
        prRebase: rebase(2, "running"),
      },
      {
        id: "r4",
        createdAt: "2026-10-02T00:00:00Z",
        status: "dispatched",
        outcome: { status: "error" },
        prRebase: rebase(1, "running"),
      },
      {
        // The push claim: the run finished fine, the approval runner is pushing.
        id: "r5",
        createdAt: "2026-10-03T00:00:00Z",
        status: "done",
        outcome: { status: "done" },
        prRebase: rebase(3, "running"),
      },
    ]);
    const byNumber = Object.fromEntries((await service.listPrs()).prs.map((p) => [p.number, p]));
    expect(byNumber[3]?.rebase).toEqual({ taskId: "r5", state: "running" });
    expect(byNumber[2]?.rebase).toEqual({ taskId: "r3", state: "failed" });
    expect(byNumber[1]?.rebase).toEqual({ taskId: "r4", state: "failed" });
    expect(byNumber[3]?.codeReview).toBeUndefined();
  });

  it("attaches the latest address-comments task per PR; a dead running one reads failed", async () => {
    const fix = (number: number, state: string) => ({
      repo: "acme/app",
      number,
      url: "u",
      head: "feat",
      base: "main",
      headSha: "s",
      state,
    });
    const { service } = build([
      {
        id: "a1",
        createdAt: "2026-10-02T00:00:00Z",
        status: "dispatched",
        prAddressComments: fix(3, "running"),
      },
      {
        id: "a2",
        createdAt: "2026-10-02T00:00:00Z",
        status: "failed",
        prAddressComments: fix(2, "running"),
      },
    ]);
    const byNumber = Object.fromEntries((await service.listPrs()).prs.map((p) => [p.number, p]));
    expect(byNumber[3]?.addressComments).toEqual({ taskId: "a1", state: "running" });
    expect(byNumber[2]?.addressComments).toEqual({ taskId: "a2", state: "failed" });
    expect(byNumber[3]?.rebase).toBeUndefined();
  });

  it("buckets direct / team / mine PRs and derives ci, review and blocker", async () => {
    const { service, calls } = build();
    const result = await service.listPrs();
    expect(result.errors).toEqual([]);
    const byNumber = Object.fromEntries(result.prs.map((p) => [p.number, p]));
    expect(byNumber[3]?.behind).toBe(true);
    expect(byNumber[1]?.behind).toBeUndefined();
    // todo-13 — head/base refs for stacking; repo match is case-insensitive, forks get no head.
    expect(byNumber[1]).toMatchObject({ headRef: "feat-1", baseRef: "main" });
    expect(byNumber[3]).toMatchObject({ headRef: "feat-3", baseRef: "feat-1" });
    expect(byNumber[2]?.headRef).toBeUndefined();
    expect(byNumber[2]?.baseRef).toBe("main");
    // #1 is both direct and team -> direct wins.
    expect(byNumber[1]).toMatchObject({
      bucket: "to-review",
      reviewReason: "direct",
      ci: "failing",
      blocker: "ci-failing",
      section: "needs-your-review",
      author: "alice",
      projectId: "acme",
      companyId: "co",
      teamId: "tm",
    });
    expect(byNumber[1]?.reviewTeam).toBeUndefined();
    expect(byNumber[2]).toMatchObject({
      bucket: "to-review",
      reviewReason: "team",
      reviewTeam: "acme/core",
      ci: "passing",
      mergeable: false,
      blocker: "merge-conflict",
      section: "needs-team-review",
    });
    // #3 is mine AND review-requested -> mine, never "to review".
    expect(byNumber[3]).toMatchObject({
      bucket: "mine",
      draft: true,
      review: "approved",
      ci: "passing",
      blocker: "ready-to-merge",
      section: "needs-action", // draft
      createdAt: "2026-10-01T10:00:00.000Z",
    });
    expect(byNumber[3]?.reviewReason).toBeUndefined();
    expect(result.prs).toHaveLength(3);

    // Second call within 30 s is served from the cache.
    const before = calls.length;
    await service.listPrs();
    expect(calls.length).toBe(before);
  });

  it("a merge clears the 30 s cache", async () => {
    const { service, calls, merged } = build();
    service.onModuleInit();
    await service.listPrs();
    const before = calls.length;
    for (const fn of merged) fn();
    await service.listPrs();
    expect(calls.length).toBeGreaterThan(before);
  });

  it("attaches the latest code review per PR; a dead running review reads failed", async () => {
    const task = (id: string, createdAt: string, extra: object) => ({
      id,
      createdAt,
      status: "dispatched",
      ...extra,
    });
    const { service } = build([
      task("t1", "2026-10-01T00:00:00Z", {
        prReview: { repo: "Acme/app", number: 1, url: "u", state: "posted" },
      }),
      task("t2", "2026-10-02T00:00:00Z", {
        prReview: { repo: "acme/app", number: 1, url: "u", state: "awaiting-approval" },
      }),
      task("t3", "2026-10-02T00:00:00Z", {
        outcome: { status: "error", summary: "", finishedAt: "2026-10-02T00:00:00Z" },
        prReview: { repo: "Acme/app", number: 2, url: "u", state: "running" },
      }),
      task("t4", "2026-10-02T00:00:00Z", {}),
    ]);
    const byNumber = Object.fromEntries((await service.listPrs()).prs.map((p) => [p.number, p]));
    expect(byNumber[1]?.codeReview).toEqual({ taskId: "t2", state: "awaiting-approval" });
    expect(byNumber[2]?.codeReview).toEqual({ taskId: "t3", state: "failed" });
    expect(byNumber[3]?.codeReview).toBeUndefined();
  });

  it("counts unresolved review threads only on my changes-requested PRs", async () => {
    const { service, calls } = build([], { changesRequested: true });
    const byNumber = Object.fromEntries((await service.listPrs()).prs.map((p) => [p.number, p]));
    expect(calls.filter((c) => c === "graphql")).toHaveLength(1);
    expect(byNumber[3]?.unresolvedThreads).toBe(1);
    expect(byNumber[1]?.unresolvedThreads).toBeUndefined();
    expect(byNumber[2]?.unresolvedThreads).toBeUndefined();
  });

  it("0 unresolved threads -> unresolvedThreads 0", async () => {
    const { service } = build([], {
      changesRequested: true,
      graphqlThreads: [{ isResolved: true }],
    });
    const pr3 = (await service.listPrs()).prs.find((p) => p.number === 3);
    expect(pr3?.unresolvedThreads).toBe(0);
  });

  it("a failed thread read omits unresolvedThreads and keeps the PR", async () => {
    const { service, calls } = build([], { changesRequested: true, graphqlStatus: 502 });
    const pr3 = (await service.listPrs()).prs.find((p) => p.number === 3);
    expect(calls.filter((c) => c === "graphql")).toHaveLength(1);
    expect(pr3).toBeDefined();
    expect(pr3?.unresolvedThreads).toBeUndefined();
  });

  it("does not read threads when my PR is not changes-requested", async () => {
    const { service, calls } = build();
    await service.listPrs();
    expect(calls.filter((c) => c === "graphql")).toHaveLength(0);
  });
});
