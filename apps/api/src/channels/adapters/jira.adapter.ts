import type {
  ChannelItem,
  CredentialsInput,
  ExternalRef,
  Integration,
  TestResult,
} from "@zibby/contracts";
import type { ChannelAdapter, InboundMessage, PollResult } from "./adapter";

interface JiraIssue {
  key?: string;
  fields?: {
    summary?: string;
    updated?: string;
    reporter?: { displayName?: string; emailAddress?: string };
    description?: unknown;
  };
}

interface SearchResponse {
  issues?: JiraIssue[];
  errorMessages?: string[];
}

/** API token from the closed credentials union (Jira Cloud Basic `email:token`). */
function tokenOf(creds: CredentialsInput): string | null {
  return "token" in creds ? creds.token : null;
}

/**
 * Jira adapter over plain `fetch` (Node 20+ global). Polls the REST `search` API with
 * a JQL that selects issues updated since the cursor (the operator's `jql` or a
 * `project = KEY` default), normalizes each to an {@link InboundMessage} with a
 * deterministic `jira-<KEY>` id, and advances the cursor to the newest `updated` seen.
 * Auth is Basic `base64(email:apiToken)` — the email is non-secret config, the token
 * is the credential. No method sleeps on a rate limit; a failure surfaces to the
 * watcher (which retries with backoff, M8).
 */
export class JiraChannelAdapter implements ChannelAdapter {
  readonly kind = "jira" as const;

  constructor(private readonly fetchImpl: typeof fetch = fetch) {}

  private authHeader(creds: CredentialsInput, email: string): string {
    const token = tokenOf(creds);
    if (!token) throw new Error("no jira api token configured");
    return `Basic ${Buffer.from(`${email}:${token}`).toString("base64")}`;
  }

  async test(integration: Integration, creds: CredentialsInput): Promise<TestResult> {
    if (integration.config.kind !== "jira") return { ok: false, detail: "not a jira integration" };
    if (!tokenOf(creds)) return { ok: false, detail: "no jira api token configured" };
    try {
      const res = await this.fetchImpl(`${integration.config.baseUrl}/rest/api/3/myself`, {
        headers: {
          authorization: this.authHeader(creds, integration.config.email),
          accept: "application/json",
        },
      });
      if (!res.ok) return { ok: false, detail: `jira /myself: HTTP ${res.status}` };
      const body = (await res.json()) as { displayName?: string };
      return {
        ok: true,
        detail: `authenticated${body.displayName ? ` as ${body.displayName}` : ""}`,
      };
    } catch (err) {
      return { ok: false, detail: (err as Error).message };
    }
  }

  async poll(
    integration: Integration,
    creds: CredentialsInput,
    cursor: string | undefined,
  ): Promise<PollResult> {
    if (integration.config.kind !== "jira") throw new Error("not a jira integration");
    const { baseUrl, email, projectKey, jql } = integration.config;
    const base = jql ?? (projectKey ? `project = ${projectKey}` : "order by updated DESC");
    // Narrow to issues changed since the cursor (Jira JQL minute precision).
    const clause = cursor ? `(${base}) AND updated >= "${toJqlTime(cursor)}"` : base;
    const params = new URLSearchParams({
      jql: clause,
      maxResults: "50",
      fields: "summary,updated,reporter,description",
    });
    // `/search/jql` — the legacy `/rest/api/3/search` was removed by Atlassian
    // (May 2025, CHANGE-2046) and answers 410 Gone; the `issues`/`errorMessages`
    // response shape is unchanged and one page of 50 is enough for a heartbeat
    // poll narrowed by `updated >=`, so no cursor pagination is needed here.
    const res = await this.fetchImpl(`${baseUrl}/rest/api/3/search/jql?${params}`, {
      headers: { authorization: this.authHeader(creds, email), accept: "application/json" },
    });
    if (res.status === 429)
      throw new Error(`jira rate limited (retry_after ${res.headers.get("retry-after") ?? "?"})`);
    const body = (await res.json()) as SearchResponse;
    if (!res.ok)
      throw new Error(`jira search: ${body.errorMessages?.join("; ") ?? `HTTP ${res.status}`}`);

    const items: InboundMessage[] = [];
    let newest = cursor;
    for (const issue of body.issues ?? []) {
      if (!issue.key) continue;
      const updated = issue.fields?.updated ?? new Date(0).toISOString();
      const ref: ExternalRef = { channel: projectKey ?? baseUrl, messageId: issue.key };
      items.push({
        id: `jira-${issue.key}`,
        externalRef: ref,
        from: issue.fields?.reporter?.displayName ?? issue.fields?.reporter?.emailAddress,
        receivedAt: new Date(updated).toISOString(),
        text: `[${issue.key}] ${issue.fields?.summary ?? ""}`.trim(),
        raw: issue,
        url: `${baseUrl}/browse/${issue.key}`,
      });
      if (newest === undefined || updated > newest) newest = updated;
    }
    return { items, cursor: newest };
  }

  /**
   * Create a Jira issue (the finished-day "creates a Jira task"). Outbound write —
   * the caller MUST gate this behind an approval (the `jira.create_issue` floor); the
   * adapter only performs the authenticated POST. Returns the new issue key.
   */
  async createIssue(
    integration: Integration,
    creds: CredentialsInput,
    fields: { summary: string; description?: string; projectKey?: string },
  ): Promise<string> {
    if (integration.config.kind !== "jira") throw new Error("not a jira integration");
    const projectKey = fields.projectKey ?? integration.config.projectKey;
    if (!projectKey) throw new Error("jira create needs a projectKey (config or argument)");
    const body = {
      fields: {
        project: { key: projectKey },
        issuetype: { name: "Task" },
        summary: fields.summary,
        ...(fields.description
          ? {
              description: {
                type: "doc",
                version: 1,
                content: [
                  { type: "paragraph", content: [{ type: "text", text: fields.description }] },
                ],
              },
            }
          : {}),
      },
    };
    const res = await this.fetchImpl(`${integration.config.baseUrl}/rest/api/3/issue`, {
      method: "POST",
      headers: {
        authorization: this.authHeader(creds, integration.config.email),
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`jira create issue: HTTP ${res.status}`);
    const created = (await res.json()) as { key?: string };
    if (!created.key) throw new Error("jira create issue: no key returned");
    return created.key;
  }

  async send(
    integration: Integration,
    creds: CredentialsInput,
    item: ChannelItem,
    text: string,
  ): Promise<void> {
    if (integration.config.kind !== "jira") throw new Error("not a jira integration");
    const key = item.externalRef.messageId;
    if (!key) throw new Error("jira item has no issue key");
    const res = await this.fetchImpl(
      `${integration.config.baseUrl}/rest/api/3/issue/${key}/comment`,
      {
        method: "POST",
        headers: {
          authorization: this.authHeader(creds, integration.config.email),
          "content-type": "application/json",
        },
        body: JSON.stringify({
          body: {
            type: "doc",
            version: 1,
            content: [{ type: "paragraph", content: [{ type: "text", text }] }],
          },
        }),
      },
    );
    if (!res.ok) throw new Error(`jira comment: HTTP ${res.status}`);
  }
}

/** Render an ISO instant as Jira JQL's `yyyy-MM-dd HH:mm` (minute precision, no tz). */
function toJqlTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toISOString().slice(0, 16).replace("T", " ");
}
