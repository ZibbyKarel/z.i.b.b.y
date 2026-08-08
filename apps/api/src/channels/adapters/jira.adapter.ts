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
    assignee?: { accountId?: string } | null;
    description?: unknown;
    comment?: unknown;
  };
}

interface SearchResponse {
  issues?: JiraIssue[];
  errorMessages?: string[];
}

/** The fields the poll needs: display data plus the two scope inputs (assignee, mentions). */
const POLL_FIELDS = "summary,updated,reporter,description,assignee,comment";

/**
 * Every accountId that appears as an ADF `mention` node anywhere in `node`.
 *
 * This is the ONLY way to answer "does this issue @-mention the operator": Jira
 * Cloud does not index mentions in the text index, so no JQL can express it —
 * probed against the live site, `text ~ "<display name>"`, `text ~ "<accountId>"`
 * and `text ~ "accountid:<id>"` all return 0 for an issue whose ADF provably
 * carries that person's mention node, while `text ~ "<an ordinary word>"` returns
 * plenty (so the operator itself works — mentions simply aren't in the index).
 * Hence the scope is enforced client-side over a cursor-narrowed page.
 */
function mentionedAccountIds(node: unknown, found: Set<string>): Set<string> {
  if (Array.isArray(node)) {
    for (const child of node) mentionedAccountIds(child, found);
  } else if (node !== null && typeof node === "object") {
    const record = node as Record<string, unknown>;
    if (record.type === "mention") {
      const id = (record.attrs as { id?: unknown } | undefined)?.id;
      if (typeof id === "string") found.add(id);
    }
    for (const child of Object.values(record)) mentionedAccountIds(child, found);
  }
  return found;
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
 *
 * **Scope — only issues that concern the operator.** Two changes bound what this
 * adapter can ever ingest, because `project = KEY` alone pulled the project's whole
 * backlog into the inbox (115 issues, each of which grew a boilerplate draft reply):
 *
 * 1. A fresh integration (no persisted cursor) seeds the cursor to "now" and ingests
 *    nothing on that first poll — the same "initial sync = now" contract the email and
 *    GitHub adapters already hold. No poll can ever backfill history.
 * 2. Every later poll fetches only the `updated >= cursor` delta and then keeps ONLY
 *    the issues the operator is the assignee of, or is @-mentioned in
 *    ({@link mentionedAccountIds}). Everything else is dropped before it becomes a
 *    {@link ChannelItem}. The assignee half could be pushed into the JQL; the mention
 *    half provably cannot, so both are applied in one place client-side rather than
 *    split across two mechanisms that could drift.
 *
 * The identity that "me" resolves to is the token's own account (`/myself`), cached
 * per adapter instance — not `config.email`, so a mention still matches when the
 * Atlassian account's primary address differs from the configured login.
 */
export class JiraChannelAdapter implements ChannelAdapter {
  readonly kind = "jira" as const;
  /** `baseUrl` → the token owner's accountId; one `/myself` read per site per process. */
  private readonly accountIdCache = new Map<string, string>();

  constructor(private readonly fetchImpl: typeof fetch = fetch) {}

  /**
   * The accountId the credential authenticates as — the "me" both scope rules test
   * against. Cached: it cannot change for a given token, and a poll that re-read it
   * every tick would double this adapter's request count for a constant.
   */
  private async myAccountId(integration: Integration, creds: CredentialsInput): Promise<string> {
    if (integration.config.kind !== "jira") throw new Error("not a jira integration");
    const { baseUrl, email } = integration.config;
    const cached = this.accountIdCache.get(baseUrl);
    if (cached) return cached;
    const res = await this.fetchImpl(`${baseUrl}/rest/api/3/myself`, {
      headers: { authorization: this.authHeader(creds, email), accept: "application/json" },
    });
    if (!res.ok) throw new Error(`jira /myself: HTTP ${res.status}`);
    const body = (await res.json()) as { accountId?: string };
    if (!body.accountId) throw new Error("jira /myself: no accountId returned");
    this.accountIdCache.set(baseUrl, body.accountId);
    return body.accountId;
  }

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

    // First enable (no persisted cursor): seed it to "now" and ingest nothing, so a
    // fresh integration never backfills the project's whole issue history. No fetch
    // happens on this pass; the next tick has a real cursor and polls only the delta.
    if (cursor === undefined) {
      return { items: [], cursor: new Date().toISOString() };
    }

    const me = await this.myAccountId(integration, creds);
    // The operator's own `jql` still narrows further, but it can no longer widen the
    // scope: the assignee/mention filter below applies to whatever this returns.
    // A trailing ORDER BY is stripped before the clause is parenthesised — `(… ORDER
    // BY x) AND …` is not valid JQL.
    const narrowing = (jql ?? (projectKey ? `project = ${projectKey}` : ""))
      .replace(/\s+order\s+by\s+.*$/i, "")
      .trim();
    // Narrow to issues changed since the cursor (Jira JQL minute precision).
    const updatedClause = `updated >= "${toJqlTime(cursor)}"`;
    const clause = narrowing ? `(${narrowing}) AND ${updatedClause}` : updatedClause;
    const params = new URLSearchParams({
      jql: clause,
      maxResults: "50",
      fields: POLL_FIELDS,
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
      // The cursor advances over EVERY issue in the delta, in scope or not — an
      // out-of-scope issue is dropped, not deferred, so leaving the cursor behind it
      // would re-fetch (and re-drop) the same page on every tick, forever.
      if (newest === undefined || updated > newest) newest = updated;
      const assigneeId = issue.fields?.assignee?.accountId;
      const inScope =
        assigneeId === me || mentionedAccountIds(issue.fields ?? {}, new Set()).has(me);
      if (!inScope) continue;
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
