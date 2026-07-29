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

function jsonFetch(body: unknown, status = 200): typeof fetch {
  return vi.fn(
    async () =>
      new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
      }),
  ) as unknown as typeof fetch;
}

describe("JiraChannelAdapter", () => {
  it("normalizes issues, derives a jira-<KEY> id, and advances the cursor", async () => {
    const fetchImpl = jsonFetch({
      issues: [
        {
          key: "BUG-1",
          fields: {
            summary: "Login crashes",
            updated: "2026-06-17T09:00:00.000Z",
            reporter: { displayName: "Dana" },
          },
        },
        {
          key: "BUG-2",
          fields: {
            summary: "Slow search",
            updated: "2026-06-17T10:00:00.000Z",
            reporter: { displayName: "Eli" },
          },
        },
      ],
    });
    const adapter = new JiraChannelAdapter(fetchImpl);
    const { items, cursor } = await adapter.poll(jira, { token: "tok" }, undefined);
    expect(items.map((i) => i.id)).toEqual(["jira-BUG-1", "jira-BUG-2"]);
    expect(items[0]!.externalRef).toMatchObject({ channel: "BUG", messageId: "BUG-1" });
    expect(items[0]!.text).toContain("Login crashes");
    expect(items[0]!.from).toBe("Dana");
    expect(cursor).toBe("2026-06-17T10:00:00.000Z");
    // Basic auth header from email:token.
    const init = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock
      .calls[0]![1] as RequestInit;
    const auth = (init.headers as Record<string, string>).authorization;
    expect(auth).toBe(`Basic ${Buffer.from("me@acme.com:tok").toString("base64")}`);
  });

  it("adds an `updated >=` JQL clause once a cursor exists", async () => {
    const fetchImpl = jsonFetch({ issues: [] });
    const adapter = new JiraChannelAdapter(fetchImpl);
    await adapter.poll(jira, { token: "tok" }, "2026-06-17T10:00:00.000Z");
    const url = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0]![0] as string;
    // URLSearchParams encodes spaces as `+`; normalise before asserting the JQL clause.
    expect(decodeURIComponent(url).replace(/\+/g, " ")).toContain("updated >=");
  });

  it("polls the /search/jql endpoint, not the removed /rest/api/3/search", async () => {
    const fetchImpl = jsonFetch({ issues: [] });
    const adapter = new JiraChannelAdapter(fetchImpl);
    await adapter.poll(jira, { token: "tok" }, undefined);
    const url = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0]![0] as string;
    expect(new URL(url).pathname).toBe("/rest/api/3/search/jql");
  });

  it("surfaces a 429 rather than swallowing it", async () => {
    const adapter = new JiraChannelAdapter(jsonFetch({}, 429));
    await expect(adapter.poll(jira, { token: "tok" }, undefined)).rejects.toThrow(/rate limited/);
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
