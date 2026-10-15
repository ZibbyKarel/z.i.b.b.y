import type { Integration, Project } from "@zibby/contracts";
import { describe, expect, it } from "vitest";
import { InboxService, blockerOf, ciState, reviewState } from "./inbox.service";

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

  function build() {
    const calls: string[] = [];
    const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
    const fetchImpl = (async (url: string | URL) => {
      const u = new URL(String(url));
      calls.push(u.pathname);
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
          created_at: "2026-10-01T10:00:00Z",
          user: { login: n === 3 ? "me" : "alice" },
          head: { sha: `sha${n}` },
        });
      }
      if (u.pathname.endsWith("/reviews")) {
        return json(
          u.pathname.includes("/pulls/3/") ? [{ user: { login: "bob" }, state: "APPROVED" }] : [],
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

    const service = new InboxService(
      { list: async () => [project] } as never,
      { resolveIntegrations: async () => [github] } as never,
      { read: async () => ({ token: "tok" }) } as never,
      {} as never,
      {} as never,
      {} as never,
      fetchImpl,
    );
    return { service, calls };
  }

  it("buckets direct / team / mine PRs and derives ci, review and blocker", async () => {
    const { service, calls } = build();
    const result = await service.listPrs();
    expect(result.errors).toEqual([]);
    const byNumber = Object.fromEntries(result.prs.map((p) => [p.number, p]));
    // #1 is both direct and team -> direct wins.
    expect(byNumber[1]).toMatchObject({
      bucket: "to-review",
      reviewReason: "direct",
      ci: "failing",
      blocker: "ci-failing",
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
    });
    // #3 is mine AND review-requested -> mine, never "to review".
    expect(byNumber[3]).toMatchObject({
      bucket: "mine",
      draft: true,
      review: "approved",
      ci: "passing",
      blocker: "ready-to-merge",
      createdAt: "2026-10-01T10:00:00.000Z",
    });
    expect(byNumber[3]?.reviewReason).toBeUndefined();
    expect(result.prs).toHaveLength(3);

    // Second call within 30 s is served from the cache.
    const before = calls.length;
    await service.listPrs();
    expect(calls.length).toBe(before);
  });
});
