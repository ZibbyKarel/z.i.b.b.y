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

  it("uses the Search API for mentions ONLY when username is configured — no assignee query (phase-126a)", async () => {
    const mine: Integration = {
      ...gh,
      config: { kind: "github", repo: "acme/app", streams: ["issues", "pulls"], username: "karel" },
    };
    const calls: string[] = [];
    const fetchImpl = vi.fn(async (url: string) => {
      calls.push(decodeURIComponent(url));
      const items = [
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

    // Only one search is issued (the old two-query union is gone).
    expect(calls.length).toBe(1);
    expect(calls[0]).toContain("/search/issues");
    expect(calls[0]).toContain("mentions:karel");
    expect(calls[0]).not.toContain("assignee");
    expect(items.map((i) => i.id)).toEqual(["gh-acme-app-issue-1"]);
    expect(cursor).toBe("2026-06-17T09:00:00.000Z");
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
});
