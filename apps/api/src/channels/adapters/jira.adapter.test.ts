import type { Integration } from "@zibby/contracts";
import { describe, expect, it, vi } from "vitest";
import { MAX_INBOUND_CHARS, sanitizeInbound } from "../../shared/text/untrusted-envelope";
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

const OPERATOR = "712020:operator-account-id";
const OTHER = "712020:someone-else";
// A defined cursor well before every fixture's default timestamps (2026-08-25), so
// tests that exercise owner/mention scope aren't ALSO tripped up by the first-poll
// ("no cursor = seed only, ingest nothing") or comment-age filters added below.
const CURSOR = "2026-01-01T00:00:00.000Z";

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
 * Fetch stub for `poll()`: `/myself` always resolves to the operator (poll()
 * resolves its own identity before anything else), any other URL gets `res`/`status`.
 */
function pollFetch(res: unknown, status = 200, onUrl?: (url: string) => void): typeof fetch {
  return vi.fn(async (url: string | URL | Request) => {
    const u = String(url);
    onUrl?.(u);
    if (u.includes("/myself")) {
      return new Response(JSON.stringify({ accountId: OPERATOR, displayName: "Op" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    return new Response(JSON.stringify(res), {
      status,
      headers: { "content-type": "application/json" },
    });
  }) as unknown as typeof fetch;
}

/** Find the fetch call whose URL contains `includes`; throws if none matched. */
function findCall(fetchImpl: typeof fetch, includes: string): [string, RequestInit] {
  const calls = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls as [
    string,
    RequestInit,
  ][];
  const found = calls.find(([url]) => url.includes(includes));
  if (!found) throw new Error(`no fetch call matching "${includes}"`);
  return found;
}

function adfText(text: string) {
  return {
    type: "doc",
    version: 1,
    content: [{ type: "paragraph", content: [{ type: "text", text }] }],
  };
}

function adfMention(accountId: string) {
  return {
    type: "doc",
    version: 1,
    content: [
      { type: "paragraph", content: [{ type: "mention", attrs: { id: accountId, text: "@Op" } }] },
    ],
  };
}

function comment(
  id: string,
  authorId: string,
  body: unknown,
  created = "2026-08-25T10:00:00.000+0200",
) {
  return {
    id,
    author: { accountId: authorId, displayName: `u-${authorId}` },
    body,
    created,
    updated: created,
  };
}

function issue(key: string, over: Record<string, unknown> = {}) {
  return {
    key,
    fields: {
      summary: `sum ${key}`,
      updated: "2026-08-25T10:00:00.000+0200",
      description: adfText(`desc ${key}`),
      reporter: { accountId: OTHER, displayName: "Reporter" },
      assignee: { accountId: OTHER, displayName: "Assignee" },
      watches: { isWatching: false },
      comment: { total: 0, comments: [] },
      ...over,
    },
  };
}

/** Stub fetch for the mine-and-mentions suite: `/myself` → the operator, `/search/jql` → the given issues. */
function stubFor(issues: unknown[], onUrl?: (url: string) => void): typeof fetch {
  return pollFetch({ issues }, 200, onUrl);
}

describe("JiraChannelAdapter", () => {
  it("normalizes a relevant comment into a jira-<KEY>-c<commentId> item and advances the cursor", async () => {
    const fetchImpl = pollFetch({
      issues: [
        issue("BUG-1", {
          summary: "Login crashes",
          updated: "2026-06-17T09:00:00.000Z",
          assignee: { accountId: OPERATOR, displayName: "Op" },
          description: adfText("desc BUG-1"),
          comment: {
            total: 1,
            comments: [
              comment("501", OTHER, adfText("how does X work?"), "2026-06-17T09:30:00.000Z"),
            ],
          },
        }),
        issue("BUG-2", {
          summary: "Slow search",
          updated: "2026-06-17T10:00:00.000Z",
          assignee: { accountId: OPERATOR, displayName: "Op" },
          comment: {
            total: 1,
            comments: [comment("502", OTHER, adfText("still slow"), "2026-06-17T10:00:00.000Z")],
          },
        }),
      ],
    });
    const adapter = new JiraChannelAdapter(fetchImpl);
    // A defined cursor before both comments' `created` — an actual re-poll, not the
    // first-ever poll (which now seeds the cursor and ingests nothing, tested below).
    const { items, cursor } = await adapter.poll(
      jira,
      { token: "tok" },
      "2026-06-17T00:00:00.000Z",
    );
    expect(items.map((i) => i.id)).toEqual(["jira-BUG-1-c501", "jira-BUG-2-c502"]);
    expect(items[0]!.externalRef).toMatchObject({ channel: "BUG", messageId: "BUG-1" });
    expect(items[0]!.text).toContain("Login crashes");
    expect(items[0]!.text).toContain("how does X work?");
    expect(items[0]!.from).toBe(`u-${OTHER}`);
    expect(items[0]!.url).toBe("https://acme.atlassian.net/browse/BUG-1?focusedCommentId=501");
    expect(cursor).toBe("2026-06-17T10:00:00.000Z");
    // Basic auth header from email:token, on the search request.
    const [, init] = findCall(fetchImpl, "/search/jql");
    const auth = (init.headers as Record<string, string>).authorization;
    expect(auth).toBe(`Basic ${Buffer.from("me@acme.com:tok").toString("base64")}`);
  });

  it("adds an `updated >=` JQL clause once a cursor exists", async () => {
    const fetchImpl = pollFetch({ issues: [] });
    const adapter = new JiraChannelAdapter(fetchImpl);
    await adapter.poll(jira, { token: "tok" }, "2026-06-17T10:00:00.000Z");
    const [url] = findCall(fetchImpl, "/search/jql");
    // URLSearchParams encodes spaces as `+`; normalise before asserting the JQL clause.
    expect(decodeURIComponent(url).replace(/\+/g, " ")).toContain("updated >=");
  });

  it("polls the /search/jql endpoint, not the removed /rest/api/3/search", async () => {
    const fetchImpl = pollFetch({ issues: [] });
    const adapter = new JiraChannelAdapter(fetchImpl);
    await adapter.poll(jira, { token: "tok" }, undefined);
    const [url] = findCall(fetchImpl, "/search/jql");
    expect(new URL(url).pathname).toBe("/rest/api/3/search/jql");
  });

  it("surfaces a 429 rather than swallowing it", async () => {
    const adapter = new JiraChannelAdapter(pollFetch({}, 429));
    await expect(adapter.poll(jira, { token: "tok" }, undefined)).rejects.toThrow(/rate limited/);
  });

  it("resolves the operator identity per integration.id, not shared across integrations on the same baseUrl", async () => {
    const integrationA: Integration = { ...jira, id: "int-a" };
    const integrationB: Integration = { ...jira, id: "int-b" };
    let myselfCalls = 0;
    const fetchImpl = (async (url: string | URL | Request) => {
      const u = String(url);
      if (u.includes("/myself")) {
        myselfCalls += 1;
        return new Response(JSON.stringify({ accountId: `acct-${myselfCalls}` }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ issues: [] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as unknown as typeof fetch;
    const adapter = new JiraChannelAdapter(fetchImpl);
    await adapter.poll(integrationA, { token: "tok" }, CURSOR);
    await adapter.poll(integrationB, { token: "tok" }, CURSOR);
    // Two DIFFERENT integrations sharing a baseUrl (and thus their own token/identity)
    // must each resolve their own operator — a cache keyed on baseUrl would answer
    // the second poll from the first integration's cached identity.
    expect(myselfCalls).toBe(2);
  });

  it("ingests nothing on the first poll (no cursor) and seeds the cursor to the newest `updated` seen", async () => {
    const adapter = new JiraChannelAdapter(
      stubFor([
        issue("ABC-16", {
          assignee: { accountId: OPERATOR, displayName: "Op" },
          updated: "2026-08-20T10:05:00.000Z",
          comment: { total: 1, comments: [comment("901", OTHER, adfText("hello"))] },
        }),
      ]),
    );
    // Same "initial sync = now" contract as the email adapter: a fresh integration
    // (no persisted cursor) must not drain every qualifying comment on every matching
    // issue — it only seeds the high-water mark and ingests messages from here on.
    const { items, cursor } = await adapter.poll(jira, { token: "tok" }, undefined);
    expect(items).toEqual([]);
    expect(cursor).toBe("2026-08-20T10:05:00.000Z");
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

describe("JiraChannelAdapter.poll — mine-and-mentions scope", () => {
  it("emits one item per comment on an issue assigned to the operator", async () => {
    const adapter = new JiraChannelAdapter(
      stubFor([
        issue("ABC-1", {
          assignee: { accountId: OPERATOR, displayName: "Op" },
          comment: { total: 1, comments: [comment("501", OTHER, adfText("how does X work?"))] },
        }),
      ]),
    );
    const { items } = await adapter.poll(jira, { token: "tok" }, CURSOR);
    expect(items).toHaveLength(1);
    expect(items[0]?.id).toBe("jira-ABC-1-c501");
    expect(items[0]?.externalRef.messageId).toBe("ABC-1");
    expect(items[0]?.text).toContain("how does X work?");
    expect(items[0]?.text).toContain("desc ABC-1");
  });

  it("emits nothing for an issue with no comments, however it changed", async () => {
    const adapter = new JiraChannelAdapter(
      stubFor([issue("ABC-2", { assignee: { accountId: OPERATOR, displayName: "Op" } })]),
    );
    const { items } = await adapter.poll(jira, { token: "tok" }, CURSOR);
    expect(items).toEqual([]);
  });

  it("skips a comment the operator wrote themselves", async () => {
    const adapter = new JiraChannelAdapter(
      stubFor([
        issue("ABC-3", {
          reporter: { accountId: OPERATOR, displayName: "Op" },
          comment: { total: 1, comments: [comment("502", OPERATOR, adfText("my own note"))] },
        }),
      ]),
    );
    const { items } = await adapter.poll(jira, { token: "tok" }, CURSOR);
    expect(items).toEqual([]);
  });

  it("emits a comment on a NON-owned issue when it mentions the operator", async () => {
    const adapter = new JiraChannelAdapter(
      stubFor([
        issue("ABC-4", {
          comment: { total: 1, comments: [comment("503", OTHER, adfMention(OPERATOR))] },
        }),
      ]),
    );
    const { items } = await adapter.poll(jira, { token: "tok" }, CURSOR);
    expect(items).toHaveLength(1);
    expect(items[0]?.id).toBe("jira-ABC-4-c503");
  });

  it("skips a comment on a non-owned issue with no mention of the operator", async () => {
    const adapter = new JiraChannelAdapter(
      stubFor([
        issue("ABC-5", {
          comment: { total: 1, comments: [comment("504", OTHER, adfMention(OTHER))] },
        }),
      ]),
    );
    const { items } = await adapter.poll(jira, { token: "tok" }, CURSOR);
    expect(items).toEqual([]);
  });

  it("treats watches.isWatching as an owner leg", async () => {
    const adapter = new JiraChannelAdapter(
      stubFor([
        issue("ABC-6", {
          watches: { isWatching: true },
          comment: { total: 1, comments: [comment("505", OTHER, adfText("ping"))] },
        }),
      ]),
    );
    const { items } = await adapter.poll(jira, { token: "tok" }, CURSOR);
    expect(items).toHaveLength(1);
  });

  it("requests the comment and watches fields", async () => {
    const urls: string[] = [];
    const adapter = new JiraChannelAdapter(stubFor([], (u) => urls.push(u)));
    await adapter.poll(jira, { token: "tok" }, CURSOR);
    const search = urls.find((u) => u.includes("/search/jql"));
    expect(search).toContain("comment");
    expect(search).toContain("watches");
  });

  it("re-fetches comments when the inline page is partial", async () => {
    const searchBody = {
      issues: [
        issue("ABC-8", {
          assignee: { accountId: OPERATOR, displayName: "Op" },
          // Inline page carries only the OLDEST comment; total says there are 2.
          comment: { total: 2, comments: [comment("601", OTHER, adfText("first"))] },
        }),
      ],
    };
    const fetchImpl = (async (url: string | URL | Request) => {
      const u = String(url);
      if (u.includes("/myself")) {
        return new Response(JSON.stringify({ accountId: OPERATOR, displayName: "Op" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      if (u.includes("/issue/ABC-8/comment")) {
        return new Response(
          JSON.stringify({
            comments: [
              comment("601", OTHER, adfText("first")),
              comment("602", OTHER, adfText("second")),
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      return new Response(JSON.stringify(searchBody), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as unknown as typeof fetch;
    const adapter = new JiraChannelAdapter(fetchImpl);
    const { items } = await adapter.poll(jira, { token: "tok" }, CURSOR);
    expect(items.map((i) => i.id)).toEqual(["jira-ABC-8-c601", "jira-ABC-8-c602"]);
  });

  it("keeps the inline comment page when a partial re-fetch returns none", async () => {
    const searchBody = {
      issues: [
        issue("ABC-18", {
          assignee: { accountId: OPERATOR, displayName: "Op" },
          comment: { total: 2, comments: [comment("1101", OTHER, adfText("kept"))] },
        }),
      ],
    };
    const fetchImpl = (async (url: string | URL | Request) => {
      const u = String(url);
      if (u.includes("/myself")) {
        return new Response(JSON.stringify({ accountId: OPERATOR, displayName: "Op" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      // A re-fetch that comes back with `{ comments: [] }` (error page, transient
      // glitch, whatever) must not clobber the good inline page with an empty one.
      if (u.includes("/issue/ABC-18/comment")) {
        return new Response(JSON.stringify({ comments: [] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      return new Response(JSON.stringify(searchBody), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as unknown as typeof fetch;
    const adapter = new JiraChannelAdapter(fetchImpl);
    const { items } = await adapter.poll(jira, { token: "tok" }, CURSOR);
    expect(items.map((i) => i.id)).toEqual(["jira-ABC-18-c1101"]);
  });

  it("skips a comment older than the cursor, even when an unrelated issue touch pulled it into the poll window", async () => {
    const adapter = new JiraChannelAdapter(
      stubFor([
        issue("ABC-14", {
          assignee: { accountId: OPERATOR, displayName: "Op" },
          // The issue's `updated` is what pulled it into THIS poll (e.g. a label
          // edit), but the comment itself is old news — already handled or seen.
          updated: "2026-08-20T10:05:00.000Z",
          comment: {
            total: 1,
            comments: [comment("801", OTHER, adfText("old question"), "2026-01-01T00:00:00.000Z")],
          },
        }),
      ]),
    );
    const { items } = await adapter.poll(jira, { token: "tok" }, "2026-08-20T10:00:00.000Z");
    expect(items).toEqual([]);
  });

  it("keeps a comment created within the cursor's minute-precision slack window", async () => {
    const adapter = new JiraChannelAdapter(
      stubFor([
        issue("ABC-15", {
          assignee: { accountId: OPERATOR, displayName: "Op" },
          updated: "2026-08-20T10:05:00.000Z",
          // 60s before the cursor — inside the 2-minute slack, so a false negative
          // here would silently lose a real question forever.
          comment: {
            total: 1,
            comments: [
              comment(
                "802",
                OTHER,
                adfText("just before the boundary"),
                "2026-08-20T09:59:00.000Z",
              ),
            ],
          },
        }),
      ]),
    );
    const { items } = await adapter.poll(jira, { token: "tok" }, "2026-08-20T10:00:00.000Z");
    expect(items).toHaveLength(1);
  });

  it("keeps the comment intact after downstream sanitizeInbound truncation, even with a long description", async () => {
    // Regression for the pile-up this whole plan exists to kill: a long issue
    // description used to sit BEFORE the comment and the adapter budgeted against
    // the looser 4500 schema cap, so `sanitizeInbound`'s real 4000-char, cut-from-
    // the-end cap silently dropped the entire "Comment by …" section downstream.
    const adapter = new JiraChannelAdapter(
      stubFor([
        issue("ABC-17", {
          assignee: { accountId: OPERATOR, displayName: "Op" },
          description: adfText("d".repeat(6000)),
          comment: { total: 1, comments: [comment("1001", OTHER, adfText("how does X work?"))] },
        }),
      ]),
    );
    const { items } = await adapter.poll(jira, { token: "tok" }, CURSOR);
    const sanitized = sanitizeInbound(items[0]!.text);
    expect(sanitized).toContain("how does X work?");
  });

  it("truncates the item text to the MAX_INBOUND_CHARS cap sanitizeInbound will enforce anyway", async () => {
    const adapter = new JiraChannelAdapter(
      stubFor([
        issue("ABC-7", {
          description: adfText("d".repeat(6000)),
          assignee: { accountId: OPERATOR, displayName: "Op" },
          comment: { total: 1, comments: [comment("506", OTHER, adfText("c".repeat(6000)))] },
        }),
      ]),
    );
    const { items } = await adapter.poll(jira, { token: "tok" }, CURSOR);
    expect(items[0]!.text.length).toBeLessThanOrEqual(MAX_INBOUND_CHARS);
  });
});
