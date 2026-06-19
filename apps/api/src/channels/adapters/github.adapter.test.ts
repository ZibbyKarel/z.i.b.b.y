import type { Integration } from "@zibby/contracts";
import { describe, expect, it, vi } from "vitest";
import { GitHubChannelAdapter } from "./github.adapter";

const gh: Integration = {
  id: "acme-gh",
  kind: "github",
  projectId: "acme-app",
  enabled: true,
  config: { kind: "github", repo: "acme/app", streams: ["issues", "pulls"] },
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
    const fetchImpl = jsonFetch([
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
    ]);
    const adapter = new GitHubChannelAdapter(fetchImpl);
    const { items, cursor } = await adapter.poll(gh, { token: "ghp" }, undefined);
    expect(items.map((i) => i.id)).toEqual(["gh-acme-app-issue-1", "gh-acme-app-pr-2"]);
    expect(items[0]!.externalRef).toMatchObject({ channel: "acme/app", messageId: "1" });
    expect(items[0]!.from).toBe("dana");
    expect(cursor).toBe("2026-06-17T10:00:00.000Z");
  });

  it("respects the streams filter (issues only drops PRs)", async () => {
    const issuesOnly: Integration = {
      ...gh,
      config: { kind: "github", repo: "acme/app", streams: ["issues"] },
    };
    const fetchImpl = jsonFetch([
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
    ]);
    const adapter = new GitHubChannelAdapter(fetchImpl);
    const { items } = await adapter.poll(issuesOnly, { token: "ghp" }, undefined);
    expect(items.map((i) => i.id)).toEqual(["gh-acme-app-issue-1"]);
  });

  it("passes the cursor as `since` and surfaces a 403/429 rate limit", async () => {
    const fetchImpl = jsonFetch([]);
    const adapter = new GitHubChannelAdapter(fetchImpl);
    await adapter.poll(gh, { token: "ghp" }, "2026-06-17T10:00:00.000Z");
    const url = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0]![0] as string;
    expect(url).toContain("since=2026-06-17T10");
    const limited = new GitHubChannelAdapter(jsonFetch([], 403));
    await expect(limited.poll(gh, { token: "ghp" }, undefined)).rejects.toThrow(/rate limited/);
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
