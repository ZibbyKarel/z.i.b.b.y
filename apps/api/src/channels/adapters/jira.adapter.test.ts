import type { Integration } from "@zibby/contracts";
import { describe, expect, it, vi } from "vitest";
import { JiraChannelAdapter } from "./jira.adapter";

const jira: Integration = {
  id: "acme-jira",
  kind: "jira",
  projectId: "acme-app",
  enabled: true,
  config: {
    kind: "jira",
    baseUrl: "https://acme.atlassian.net",
    email: "me@acme.com",
    projectKey: "BUG",
  },
  status: "disconnected",
  hasCredentials: true,
};

const ME = "acct-operator";
const CURSOR = "2026-06-17T08:00:00.000Z";

function jsonFetch(body: unknown, status = 200): typeof fetch {
  return vi.fn(
    async () =>
      new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
      }),
  ) as unknown as typeof fetch;
}

/**
 * A fetch that answers `/myself` with the operator's accountId and every
 * `/search/jql` with `searchBody` — the shape every scoped poll test needs, since
 * poll() now resolves "me" before it searches.
 */
function pollFetch(searchBody: unknown, status = 200): typeof fetch {
  return vi.fn(async (url: string) => {
    const body = url.includes("/myself") ? { accountId: ME } : searchBody;
    return new Response(JSON.stringify(body), {
      status: url.includes("/myself") ? 200 : status,
      headers: { "content-type": "application/json" },
    });
  }) as unknown as typeof fetch;
}

/** An ADF document whose only content is an @-mention of `accountId`. */
function adfMention(accountId: string): unknown {
  return {
    type: "doc",
    version: 1,
    content: [
      {
        type: "paragraph",
        content: [{ type: "mention", attrs: { id: accountId, text: "@Someone" } }],
      },
    ],
  };
}

/** The URLs a `pollFetch` was called with, decoded (`+` back to spaces for JQL). */
function urlsOf(fetchImpl: typeof fetch): string[] {
  return (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls.map((c) =>
    decodeURIComponent(c[0] as string).replace(/\+/g, " "),
  );
}

describe("JiraChannelAdapter", () => {
  it("normalizes in-scope issues, derives a jira-<KEY> id, and advances the cursor", async () => {
    const fetchImpl = pollFetch({
      issues: [
        {
          key: "BUG-1",
          fields: {
            summary: "Login crashes",
            updated: "2026-06-17T09:00:00.000Z",
            reporter: { displayName: "Dana" },
            assignee: { accountId: ME },
          },
        },
        {
          key: "BUG-2",
          fields: {
            summary: "Slow search",
            updated: "2026-06-17T10:00:00.000Z",
            reporter: { displayName: "Eli" },
            description: adfMention(ME),
          },
        },
      ],
    });
    const adapter = new JiraChannelAdapter(fetchImpl);
    const { items, cursor } = await adapter.poll(jira, { token: "tok" }, CURSOR);
    expect(items.map((i) => i.id)).toEqual(["jira-BUG-1", "jira-BUG-2"]);
    expect(items[0]!.externalRef).toMatchObject({ channel: "BUG", messageId: "BUG-1" });
    expect(items[0]!.text).toContain("Login crashes");
    expect(items[0]!.from).toBe("Dana");
    expect(items[0]!.url).toBe("https://acme.atlassian.net/browse/BUG-1");
    expect(cursor).toBe("2026-06-17T10:00:00.000Z");
    // Basic auth header from email:token.
    const init = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock
      .calls[0]![1] as RequestInit;
    const auth = (init.headers as Record<string, string>).authorization;
    expect(auth).toBe(`Basic ${Buffer.from("me@acme.com:tok").toString("base64")}`);
  });

  it("first poll (no persisted cursor) seeds the cursor to now and ingests nothing", async () => {
    const fetchImpl = vi.fn();
    const adapter = new JiraChannelAdapter(fetchImpl as unknown as typeof fetch);
    const before = Date.now();
    const { items, cursor } = await adapter.poll(jira, { token: "tok" }, undefined);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(items).toEqual([]);
    expect(cursor).toBeDefined();
    expect(new Date(cursor!).getTime()).toBeGreaterThanOrEqual(before);
  });

  it("drops an issue that is neither assigned to nor mentions the operator", async () => {
    const fetchImpl = pollFetch({
      issues: [
        {
          key: "BUG-9",
          fields: {
            summary: "Someone else's work",
            updated: "2026-06-17T09:00:00.000Z",
            assignee: { accountId: "acct-stranger" },
            description: adfMention("acct-stranger"),
          },
        },
      ],
    });
    const adapter = new JiraChannelAdapter(fetchImpl);
    const { items, cursor } = await adapter.poll(jira, { token: "tok" }, CURSOR);
    expect(items).toEqual([]);
    // The cursor still advances past the dropped issue — it is dropped, not deferred,
    // so a stalled cursor would re-fetch and re-drop the same page every tick.
    expect(cursor).toBe("2026-06-17T09:00:00.000Z");
  });

  it("keeps an issue mentioning the operator in a comment, not just the description", async () => {
    const fetchImpl = pollFetch({
      issues: [
        {
          key: "BUG-3",
          fields: {
            summary: "Question for you",
            updated: "2026-06-17T09:00:00.000Z",
            assignee: null,
            comment: { comments: [{ id: "1", body: adfMention(ME) }] },
          },
        },
      ],
    });
    const adapter = new JiraChannelAdapter(fetchImpl);
    const { items } = await adapter.poll(jira, { token: "tok" }, CURSOR);
    expect(items.map((i) => i.id)).toEqual(["jira-BUG-3"]);
  });

  it("requests the assignee and comment fields the scope filter needs", async () => {
    const fetchImpl = pollFetch({ issues: [] });
    const adapter = new JiraChannelAdapter(fetchImpl);
    await adapter.poll(jira, { token: "tok" }, CURSOR);
    const search = urlsOf(fetchImpl).find((u) => u.includes("/search/jql"))!;
    expect(search).toContain("assignee");
    expect(search).toContain("comment");
  });

  it("adds an `updated >=` JQL clause narrowing the poll to the cursor delta", async () => {
    const fetchImpl = pollFetch({ issues: [] });
    const adapter = new JiraChannelAdapter(fetchImpl);
    await adapter.poll(jira, { token: "tok" }, "2026-06-17T10:00:00.000Z");
    const search = urlsOf(fetchImpl).find((u) => u.includes("/search/jql"))!;
    expect(search).toContain('(project = BUG) AND updated >= "2026-06-17 10:00"');
  });

  it("strips a trailing ORDER BY from a custom jql so the AND stays valid JQL", async () => {
    const custom: Integration = {
      ...jira,
      config: {
        kind: "jira",
        baseUrl: "https://acme.atlassian.net",
        email: "me@acme.com",
        jql: "project = BUG AND labels = urgent ORDER BY created DESC",
      },
    };
    const fetchImpl = pollFetch({ issues: [] });
    const adapter = new JiraChannelAdapter(fetchImpl);
    await adapter.poll(custom, { token: "tok" }, CURSOR);
    const search = urlsOf(fetchImpl).find((u) => u.includes("/search/jql"))!;
    expect(search).toContain("(project = BUG AND labels = urgent) AND updated >=");
    expect(search).not.toContain("ORDER BY created");
  });

  it("a custom jql cannot widen the scope — the assignee/mention filter still applies", async () => {
    const custom: Integration = {
      ...jira,
      config: {
        kind: "jira",
        baseUrl: "https://acme.atlassian.net",
        email: "me@acme.com",
        jql: "project = BUG",
      },
    };
    const fetchImpl = pollFetch({
      issues: [
        {
          key: "BUG-9",
          fields: { summary: "not mine", updated: "2026-06-17T09:00:00.000Z", assignee: null },
        },
      ],
    });
    const adapter = new JiraChannelAdapter(fetchImpl);
    const { items } = await adapter.poll(custom, { token: "tok" }, CURSOR);
    expect(items).toEqual([]);
  });

  it("polls the /search/jql endpoint, not the removed /rest/api/3/search", async () => {
    const fetchImpl = pollFetch({ issues: [] });
    const adapter = new JiraChannelAdapter(fetchImpl);
    await adapter.poll(jira, { token: "tok" }, CURSOR);
    const search = urlsOf(fetchImpl).find((u) => u.includes("search"))!;
    expect(new URL(search).pathname).toBe("/rest/api/3/search/jql");
  });

  it("surfaces a 429 rather than swallowing it", async () => {
    const adapter = new JiraChannelAdapter(pollFetch({}, 429));
    await expect(adapter.poll(jira, { token: "tok" }, CURSOR)).rejects.toThrow(/rate limited/);
  });

  it("test maps /myself to a TestResult", async () => {
    const ok = new JiraChannelAdapter(jsonFetch({ displayName: "Dana" }));
    expect(await ok.test(jira, { token: "tok" })).toEqual({
      ok: true,
      detail: "authenticated as Dana",
    });
    const bad = new JiraChannelAdapter(jsonFetch({}, 401));
    expect((await bad.test(jira, { token: "tok" })).ok).toBe(false);
  });

  it("createIssue POSTs to /issue with the project key and returns the new key", async () => {
    const fetchImpl = jsonFetch({ key: "BUG-42" }, 201);
    const adapter = new JiraChannelAdapter(fetchImpl);
    const key = await adapter.createIssue(
      jira,
      { token: "tok" },
      { summary: "New bug", description: "details" },
    );
    expect(key).toBe("BUG-42");
    const [url, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0]! as [
      string,
      RequestInit,
    ];
    expect(url).toContain("/rest/api/3/issue");
    expect(JSON.parse(init.body as string).fields.project.key).toBe("BUG");
    expect(JSON.parse(init.body as string).fields.summary).toBe("New bug");
  });

  it("createIssue throws when no projectKey is available", async () => {
    const noProject: Integration = {
      ...jira,
      config: { kind: "jira", baseUrl: "https://acme.atlassian.net", email: "me@acme.com" },
    };
    const adapter = new JiraChannelAdapter(jsonFetch({}, 201));
    await expect(
      adapter.createIssue(noProject, { token: "tok" }, { summary: "x" }),
    ).rejects.toThrow(/projectKey/);
  });

  it("send posts a comment to the issue", async () => {
    const fetchImpl = jsonFetch({});
    const adapter = new JiraChannelAdapter(fetchImpl);
    const item = {
      id: "jira-BUG-1",
      integrationId: "acme-jira",
      kind: "jira" as const,
      externalRef: { channel: "BUG", messageId: "BUG-1" },
      receivedAt: "2026-06-17T00:00:00.000Z",
      text: "x",
      raw: {},
      state: "triaged" as const,
    };
    await adapter.send(jira, { token: "tok" }, item, "on it");
    const url = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0]![0] as string;
    expect(url).toContain("/rest/api/3/issue/BUG-1/comment");
  });
});
