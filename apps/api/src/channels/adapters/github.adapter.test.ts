import type { Integration } from "@zibby/contracts";
import { describe, expect, it, vi } from "vitest";
import { GitHubChannelAdapter } from "./github.adapter";

const gh: Integration = {
  id: "acme-gh",
  kind: "github",
  projectId: "acme-app",
  enabled: true,
  config: { kind: "github", repo: "acme/app", streams: ["issues", "pulls"], username: "octocat" },
  status: "disconnected",
  hasCredentials: true,
};

function jsonFetch(body: unknown, status = 200): typeof fetch {
  return vi.fn(
    async () =>
      new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
      }),
  ) as unknown as typeof fetch;
}

describe("GitHubChannelAdapter", () => {
  it("normalizes issues + PRs with distinct ids and advances the cursor", async () => {
    // `gh` carries a `username` (required by the contract), so poll() takes the
    // Search API path — same mentions/assignee query answered identically here,
    // deduped by issue number down to these 2 items.
    const fetchImpl = jsonFetch({
      items: [
        {
          number: 1,
          title: "Crash on login",
          body: "stack trace",
          updated_at: "2026-06-17T09:00:00.000Z",
          user: { login: "dana" },
        },
        {
          number: 2,
          title: "Add caching",
          updated_at: "2026-06-17T10:00:00.000Z",
          user: { login: "eli" },
          pull_request: { url: "x" },
        },
      ],
    });
    const adapter = new GitHubChannelAdapter(fetchImpl);
    const { items, cursor } = await adapter.poll(gh, { token: "ghp" }, "2026-06-17T08:00:00.000Z");
    expect(items.map((i) => i.id)).toEqual(["gh-acme-app-issue-1", "gh-acme-app-pr-2"]);
    expect(items[0]!.externalRef).toMatchObject({ channel: "acme/app", messageId: "1" });
    expect(items[0]!.from).toBe("dana");
    expect(items[0]!.url).toBe("https://github.com/acme/app/issues/1");
    expect(items[1]!.url).toBe("https://github.com/acme/app/pull/2");
    expect(cursor).toBe("2026-06-17T10:00:00.000Z");
  });

  it("first poll (no persisted cursor) seeds the cursor to now and ingests nothing", async () => {
    const fetchImpl = vi.fn();
    const adapter = new GitHubChannelAdapter(fetchImpl as unknown as typeof fetch);
    const before = Date.now();
    const { items, cursor } = await adapter.poll(gh, { token: "ghp" }, undefined);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(items).toEqual([]);
    expect(cursor).toBeDefined();
    expect(new Date(cursor!).getTime()).toBeGreaterThanOrEqual(before);
  });

  it("respects the streams filter (issues only drops PRs)", async () => {
    const issuesOnly: Integration = {
      ...gh,
      config: { kind: "github", repo: "acme/app", streams: ["issues"], username: "octocat" },
    };
    const fetchImpl = jsonFetch({
      items: [
        {
          number: 1,
          title: "issue",
          updated_at: "2026-06-17T09:00:00.000Z",
          user: { login: "dana" },
        },
        {
          number: 2,
          title: "pr",
          updated_at: "2026-06-17T10:00:00.000Z",
          user: { login: "eli" },
          pull_request: {},
        },
      ],
    });
    const adapter = new GitHubChannelAdapter(fetchImpl);
    const { items } = await adapter.poll(issuesOnly, { token: "ghp" }, "2026-06-17T08:00:00.000Z");
    expect(items.map((i) => i.id)).toEqual(["gh-acme-app-issue-1"]);
  });

  it("embeds the cursor as `updated:>=` in the search query and surfaces a 403/429 rate limit", async () => {
    // `gh` now always carries a `username`, so the cursor travels through the Search
    // API's `updated:>=` query qualifier rather than the listAll endpoint's `since=`
    // param (that path is unreachable for a validly-typed config).
    const fetchImpl = jsonFetch({ items: [] });
    const adapter = new GitHubChannelAdapter(fetchImpl);
    await adapter.poll(gh, { token: "ghp" }, "2026-06-17T10:00:00.000Z");
    const url = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0]![0] as string;
    expect(decodeURIComponent(url)).toContain("updated:>=2026-06-17T10");
    const limited = new GitHubChannelAdapter(jsonFetch([], 403));
    await expect(limited.poll(gh, { token: "ghp" }, "2026-06-17T08:00:00.000Z")).rejects.toThrow(
      /rate limited/,
    );
  });

  it("searches mentions AND assignee as two queries, unioned — the operator's scope rule", async () => {
    const mine: Integration = {
      ...gh,
      config: { kind: "github", repo: "acme/app", streams: ["issues", "pulls"], username: "karel" },
    };
    const calls: string[] = [];
    const fetchImpl = vi.fn(async (url: string) => {
      const decoded = decodeURIComponent(url);
      calls.push(decoded);
      // Each qualifier answers with a different item, so the union is observable.
      const items = decoded.includes("assignee:karel")
        ? [
            {
              number: 2,
              title: "assigned",
              updated_at: "2026-06-17T11:00:00.000Z",
              user: { login: "eli" },
            },
          ]
        : [
            {
              number: 1,
              title: "mentioned",
              updated_at: "2026-06-17T09:00:00.000Z",
              user: { login: "dana" },
            },
          ];
      return new Response(JSON.stringify({ items }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as unknown as typeof fetch;

    const adapter = new GitHubChannelAdapter(fetchImpl);
    const { items, cursor } = await adapter.poll(
      mine,
      { token: "ghp" },
      "2026-06-17T08:00:00.000Z",
    );

    // Two searches, not one combined query: GitHub ANDs qualifiers, so
    // `mentions:karel assignee:karel` would return the intersection, not the union.
    expect(calls.length).toBe(2);
    expect(calls.every((c) => c.includes("/search/issues"))).toBe(true);
    expect(calls.some((c) => c.includes("mentions:karel"))).toBe(true);
    expect(calls.some((c) => c.includes("assignee:karel"))).toBe(true);
    expect(calls.every((c) => c.includes("is:open"))).toBe(true);
    expect(items.map((i) => i.id)).toEqual(["gh-acme-app-issue-1", "gh-acme-app-issue-2"]);
    expect(cursor).toBe("2026-06-17T11:00:00.000Z");
  });

  it("an item that is both mentioned and assigned ingests exactly once", async () => {
    const both = {
      number: 7,
      title: "mine twice over",
      updated_at: "2026-06-17T09:00:00.000Z",
      user: { login: "dana" },
    };
    const adapter = new GitHubChannelAdapter(jsonFetch({ items: [both] }));
    const { items } = await adapter.poll(gh, { token: "ghp" }, "2026-06-17T08:00:00.000Z");
    expect(items.map((i) => i.id)).toEqual(["gh-acme-app-issue-7"]);
  });

  describe("ZIBBY-opened PRs (ctx.zibbyPrNumbers, phase-126a)", () => {
    /** Mentions search returns nothing by default; only the direct issue reads matter here. */
    function fetchImplFor(
      issuesByNumber: Record<number, { updated_at: string; state?: string; title?: string } | 404>,
    ): typeof fetch {
      return vi.fn(async (url: string) => {
        if (url.includes("/search/issues")) {
          return new Response(JSON.stringify({ items: [] }), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }
        const match = /\/issues\/(\d+)$/.exec(url);
        const number = match ? Number(match[1]) : NaN;
        const entry = issuesByNumber[number];
        if (entry === 404 || entry === undefined) {
          return new Response("not found", { status: 404 });
        }
        return new Response(JSON.stringify({ number, state: "open", pull_request: {}, ...entry }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }) as unknown as typeof fetch;
    }

    it("fetches each number in ctx.zibbyPrNumbers via GET /repos/{repo}/issues/{n}", async () => {
      const fetchImpl = fetchImplFor({
        7: { updated_at: "2026-06-17T09:00:00.000Z" },
        9: { updated_at: "2026-06-17T10:00:00.000Z" },
      });
      const adapter = new GitHubChannelAdapter(fetchImpl);
      const { items } = await adapter.poll(gh, { token: "ghp" }, "2026-06-17T08:00:00.000Z", {
        zibbyPrNumbers: [7, 9],
      });
      const calls = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls.map(
        (c) => c[0] as string,
      );
      expect(calls).toContain("https://api.github.com/repos/acme/app/issues/7");
      expect(calls).toContain("https://api.github.com/repos/acme/app/issues/9");
      expect(items.map((i) => i.id).sort()).toEqual(["gh-acme-app-pr-7", "gh-acme-app-pr-9"]);
    });

    it("does not ingest a ZIBBY PR whose updated_at is older than the cursor", async () => {
      const fetchImpl = fetchImplFor({ 7: { updated_at: "2026-06-17T07:00:00.000Z" } });
      const adapter = new GitHubChannelAdapter(fetchImpl);
      const { items } = await adapter.poll(gh, { token: "ghp" }, "2026-06-17T08:00:00.000Z", {
        zibbyPrNumbers: [7],
      });
      expect(items).toEqual([]);
    });

    it("ingests a ZIBBY PR that also appears in the mentions search exactly once (dedupe by number)", async () => {
      const fetchImpl = vi.fn(async (url: string) => {
        if (url.includes("/search/issues")) {
          return new Response(
            JSON.stringify({
              items: [{ number: 7, title: "dup", updated_at: "2026-06-17T09:00:00.000Z" }],
            }),
            { status: 200, headers: { "content-type": "application/json" } },
          );
        }
        return new Response(
          JSON.stringify({ number: 7, state: "open", updated_at: "2026-06-17T09:00:00.000Z" }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }) as unknown as typeof fetch;
      const adapter = new GitHubChannelAdapter(fetchImpl);
      const { items } = await adapter.poll(gh, { token: "ghp" }, "2026-06-17T08:00:00.000Z", {
        zibbyPrNumbers: [7],
      });
      expect(items.map((i) => i.id)).toEqual(["gh-acme-app-issue-7"]);
    });

    it("a 404 on one ZIBBY PR number does not fail the poll — the rest still ingest", async () => {
      const fetchImpl = fetchImplFor({
        7: 404,
        9: { updated_at: "2026-06-17T10:00:00.000Z" },
      });
      const adapter = new GitHubChannelAdapter(fetchImpl);
      const { items } = await adapter.poll(gh, { token: "ghp" }, "2026-06-17T08:00:00.000Z", {
        zibbyPrNumbers: [7, 9],
      });
      expect(items.map((i) => i.id)).toEqual(["gh-acme-app-pr-9"]);
    });

    it("a closed ZIBBY PR is not ingested (kept consistent with the mentions search's is:open)", async () => {
      const fetchImpl = fetchImplFor({
        7: { updated_at: "2026-06-17T10:00:00.000Z", state: "closed" },
      });
      const adapter = new GitHubChannelAdapter(fetchImpl);
      const { items } = await adapter.poll(gh, { token: "ghp" }, "2026-06-17T08:00:00.000Z", {
        zibbyPrNumbers: [7],
      });
      expect(items).toEqual([]);
    });

    it("ctx omitted entirely behaves as mentions-only, no crash (pins the optionality)", async () => {
      const fetchImpl = jsonFetch({ items: [] });
      const adapter = new GitHubChannelAdapter(fetchImpl);
      const { items } = await adapter.poll(gh, { token: "ghp" }, "2026-06-17T08:00:00.000Z");
      expect(items).toEqual([]);
    });
  });

  it("test maps /user to a TestResult", async () => {
    const ok = new GitHubChannelAdapter(jsonFetch({ login: "dana" }));
    expect(await ok.test(gh, { token: "ghp" })).toEqual({
      ok: true,
      detail: "authenticated as dana",
    });
  });

  it("send posts a comment to the issue/PR", async () => {
    const fetchImpl = jsonFetch({});
    const adapter = new GitHubChannelAdapter(fetchImpl);
    const item = {
      id: "gh-acme-app-issue-1",
      integrationId: "acme-gh",
      kind: "github" as const,
      externalRef: { channel: "acme/app", messageId: "1" },
      receivedAt: "2026-06-17T00:00:00.000Z",
      text: "x",
      raw: {},
      state: "triaged" as const,
    };
    await adapter.send(gh, { token: "ghp" }, item, "on it");
    const url = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0]![0] as string;
    expect(url).toContain("/repos/acme/app/issues/1/comments");
  });

  describe("team scope (includeTeams)", () => {
    const withTeams: Integration = {
      ...gh,
      config: {
        ...(gh.config as Extract<Integration["config"], { kind: "github" }>),
        includeTeams: true,
      },
    };
    const json = (body: unknown, status = 200) =>
      new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
      });

    function teamFetch(teams: unknown, teamsStatus = 200) {
      const calls: string[] = [];
      const impl = vi.fn(async (url: string) => {
        const decoded = decodeURIComponent(url);
        calls.push(decoded);
        if (decoded.includes("/user/teams")) return json(teams, teamsStatus);
        if (decoded.includes("team-review-requested:acme/core"))
          return json({
            items: [
              {
                number: 11,
                title: "review me",
                updated_at: "2026-06-17T12:00:00.000Z",
                pull_request: {},
              },
            ],
          });
        if (decoded.includes("team:acme/core"))
          return json({
            items: [
              { number: 12, title: "@acme/core ping", updated_at: "2026-06-17T13:00:00.000Z" },
            ],
          });
        return json({
          items: [{ number: 1, title: "mentioned", updated_at: "2026-06-17T09:00:00.000Z" }],
        });
      }) as unknown as typeof fetch;
      return { impl, calls };
    }

    it("adds team-review-requested + team legs for teams in the repo owner's org only", async () => {
      const { impl, calls } = teamFetch([
        { slug: "core", organization: { login: "Acme" } },
        { slug: "other", organization: { login: "elsewhere" } },
      ]);
      const { items, notes } = await new GitHubChannelAdapter(impl).poll(
        withTeams,
        { token: "ghp" },
        "2026-06-17T08:00:00.000Z",
      );
      expect(items.map((i) => i.id)).toEqual([
        "gh-acme-app-issue-1",
        "gh-acme-app-pr-11",
        "gh-acme-app-issue-12",
      ]);
      expect(calls.some((c) => c.includes("elsewhere"))).toBe(false);
      expect(
        calls.filter((c) => c.includes("/search/issues")).every((c) => c.includes("is:open")),
      ).toBe(true);
      expect(notes).toBeUndefined();
    });

    it("falls back to personal-only with a note when /user/teams is forbidden (missing read:org)", async () => {
      const { impl, calls } = teamFetch({ message: "Forbidden" }, 403);
      const { items, notes } = await new GitHubChannelAdapter(impl).poll(
        withTeams,
        { token: "ghp" },
        "2026-06-17T08:00:00.000Z",
      );
      expect(items.map((i) => i.id)).toEqual(["gh-acme-app-issue-1"]);
      expect(calls.some((c) => c.includes("team"))).toBe(true); // only the /user/teams probe
      expect(calls.some((c) => c.includes("mentions:octocat"))).toBe(true);
      expect(calls.filter((c) => c.includes("team:") || c.includes("team-review"))).toEqual([]);
      expect(notes?.[0]).toMatch(/read:org/);
    });

    it("rejects (not cached) when the /user/teams request itself throws", async () => {
      let broken = true;
      const calls: string[] = [];
      const impl = vi.fn(async (url: string) => {
        calls.push(url);
        if (url.includes("/user/teams")) {
          if (broken) throw new Error("ECONNRESET");
          return json([]);
        }
        return json({ items: [] });
      }) as unknown as typeof fetch;
      const adapter = new GitHubChannelAdapter(impl);
      await expect(
        adapter.poll(withTeams, { token: "ghp" }, "2026-06-17T08:00:00.000Z"),
      ).rejects.toThrow(/ECONNRESET/);
      broken = false;
      await adapter.poll(withTeams, { token: "ghp" }, "2026-06-17T08:00:00.000Z");
      expect(calls.filter((c) => c.includes("/user/teams")).length).toBe(2);
    });

    it("rejects on a 5xx from /user/teams", async () => {
      const { impl } = teamFetch({}, 502);
      await expect(
        new GitHubChannelAdapter(impl).poll(
          withTeams,
          { token: "ghp" },
          "2026-06-17T08:00:00.000Z",
        ),
      ).rejects.toThrow(/HTTP 502/);
    });

    it("rejects on a rate-limited 403 (x-ratelimit-remaining: 0)", async () => {
      const impl = vi.fn(async (url: string) =>
        url.includes("/user/teams")
          ? new Response("{}", { status: 403, headers: { "x-ratelimit-remaining": "0" } })
          : json({ items: [] }),
      ) as unknown as typeof fetch;
      await expect(
        new GitHubChannelAdapter(impl).poll(
          withTeams,
          { token: "ghp" },
          "2026-06-17T08:00:00.000Z",
        ),
      ).rejects.toThrow(/rate limited/);
    });

    it("caches team discovery: one /user/teams call and one note across polls", async () => {
      const { impl, calls } = teamFetch({}, 403);
      const adapter = new GitHubChannelAdapter(impl);
      const first = await adapter.poll(withTeams, { token: "ghp" }, "2026-06-17T08:00:00.000Z");
      const second = await adapter.poll(withTeams, { token: "ghp" }, "2026-06-17T08:00:00.000Z");
      expect(calls.filter((c) => c.includes("/user/teams")).length).toBe(1);
      expect(first.notes).toHaveLength(1);
      expect(second.notes).toBeUndefined();
    });

    it("includeTeams absent never calls /user/teams", async () => {
      const { impl, calls } = teamFetch([{ slug: "core", organization: { login: "acme" } }]);
      await new GitHubChannelAdapter(impl).poll(gh, { token: "ghp" }, "2026-06-17T08:00:00.000Z");
      expect(calls.some((c) => c.includes("/user/teams") || c.includes("team"))).toBe(false);
    });
  });
});
