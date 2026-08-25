import type {
  ChannelItem,
  CredentialsInput,
  ExternalRef,
  Integration,
  TestResult,
} from "@zibby/contracts";
import { adfToText, collectMentionAccountIds } from "../../shared/text/adf-to-text";
import type { ChannelAdapter, InboundMessage, PollResult } from "./adapter";

/** Mirrors `ChannelItemSchema.text`'s `.max(4500)` — exceeding it fails schema-parse. */
const MAX_ITEM_TEXT = 4500;
/** Room reserved for the header lines so description+comment truncation stays safe. */
const TEXT_HEADROOM = 200;

interface JiraUser {
  accountId?: string;
  displayName?: string;
  emailAddress?: string;
}

interface JiraComment {
  id?: string;
  author?: JiraUser;
  body?: unknown;
  created?: string;
  updated?: string;
}

interface JiraIssue {
  key?: string;
  fields?: {
    summary?: string;
    updated?: string;
    reporter?: JiraUser;
    assignee?: JiraUser;
    watches?: { isWatching?: boolean };
    description?: unknown;
    comment?: { total?: number; comments?: JiraComment[] };
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
 * `project = KEY` default), then emits one {@link InboundMessage} per COMMENT that is
 * relevant to the operator rather than one per issue — a comment on an issue the
 * operator owns (assignee, reporter, or watcher), or a comment anywhere that
 * @-mentions them. This is deliberately narrower than "every issue update": polling
 * the whole project produced one inbound item per issue touch, most of which nobody
 * asked the operator anything (see `github.adapter.ts`'s scoped-ingestion precedent).
 * The item id is `jira-<KEY>-c<commentId>` (deterministic per comment) but
 * `externalRef.messageId` stays the ISSUE KEY, since `send()` replies by posting a
 * comment on the issue, not on a comment. Auth is Basic `base64(email:apiToken)` — the
 * email is non-secret config, the token is the credential. No method sleeps on a rate
 * limit; a failure surfaces to the watcher (which retries with backoff, M8).
 */
export class JiraChannelAdapter implements ChannelAdapter {
  readonly kind = "jira" as const;

  constructor(private readonly fetchImpl: typeof fetch = fetch) {}

  /** Memoized operator accountId per baseUrl — ADF mentions carry accountId, not email. */
  private readonly operatorIds = new Map<string, string>();

  /**
   * The accountId of the user the API token belongs to — i.e. the operator.
   * Throws on failure rather than degrading: an unresolved identity would mean
   * "no owner legs, no mention matching", which silently ingests nothing (or,
   * worse, everything). The watcher's retry/backoff (M8) handles the throw.
   */
  private async operatorAccountId(
    integration: Integration,
    creds: CredentialsInput,
  ): Promise<string> {
    if (integration.config.kind !== "jira") throw new Error("not a jira integration");
    const { baseUrl, email } = integration.config;
    const cached = this.operatorIds.get(baseUrl);
    if (cached) return cached;
    const res = await this.fetchImpl(`${baseUrl}/rest/api/3/myself`, {
      headers: { authorization: this.authHeader(creds, email), accept: "application/json" },
    });
    if (!res.ok) throw new Error(`jira /myself: HTTP ${res.status}`);
    const body = (await res.json()) as { accountId?: string };
    if (!body.accountId) throw new Error("jira /myself returned no accountId");
    this.operatorIds.set(baseUrl, body.accountId);
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
    const operator = await this.operatorAccountId(integration, creds);

    // The JQL stays BROAD on purpose. A comment mentioning the operator can sit on
    // an issue they do not own, and this instance's comment index does not work
    // (`comment ~ currentUser()` returns 0 against issues that demonstrably have
    // comments), so the mine-and-mentions scope is applied below, in-process.
    const base = jql ?? (projectKey ? `project = ${projectKey}` : "order by updated DESC");
    // Narrow to issues changed since the cursor (Jira JQL minute precision).
    const clause = cursor ? `(${base}) AND updated >= "${toJqlTime(cursor)}"` : base;
    const params = new URLSearchParams({
      jql: clause,
      maxResults: "50",
      fields: "summary,updated,reporter,assignee,watches,description,comment",
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
      if (newest === undefined || updated > newest) newest = updated;

      const owned = this.isOwned(issue, operator);
      const comments = await this.commentsOf(integration, creds, issue);
      for (const c of comments) {
        if (!c.id) continue;
        // Never reply to yourself.
        if (c.author?.accountId === operator) continue;
        // Mine-and-mentions: a comment on an owned issue is addressed to the
        // operator in practice; on any other issue only an explicit mention is.
        if (!owned && !collectMentionAccountIds(c.body).includes(operator)) continue;
        items.push(this.toItem(integration, issue, c));
      }
    }
    return { items, cursor: newest };
  }

  /** Assignee / reporter / watcher legs of the owner test (Jira `currentUser()`). */
  private isOwned(issue: JiraIssue, operator: string): boolean {
    const f = issue.fields;
    return (
      f?.assignee?.accountId === operator ||
      f?.reporter?.accountId === operator ||
      f?.watches?.isWatching === true
    );
  }

  /**
   * The issue's comments. The inline `fields.comment` page is used as-is when it
   * is complete; when it is partial (`comments.length < total`) we re-fetch that
   * one issue's comments so the newest ones cannot be silently dropped by the
   * inline page being the OLDEST page.
   */
  private async commentsOf(
    integration: Integration,
    creds: CredentialsInput,
    issue: JiraIssue,
  ): Promise<JiraComment[]> {
    if (integration.config.kind !== "jira") return [];
    const inline = issue.fields?.comment;
    const comments = inline?.comments ?? [];
    const total = inline?.total ?? comments.length;
    if (comments.length >= total || !issue.key) return comments;

    const { baseUrl, email } = integration.config;
    const params = new URLSearchParams({
      startAt: String(Math.max(0, total - 50)),
      maxResults: "50",
      orderBy: "created",
    });
    const res = await this.fetchImpl(`${baseUrl}/rest/api/3/issue/${issue.key}/comment?${params}`, {
      headers: { authorization: this.authHeader(creds, email), accept: "application/json" },
    });
    if (!res.ok) return comments; // best-effort: never fail the whole poll for one issue
    const body = (await res.json()) as { comments?: JiraComment[] };
    return body.comments ?? comments;
  }

  /** Build the enriched inbound message for one relevant comment. */
  private toItem(integration: Integration, issue: JiraIssue, c: JiraComment): InboundMessage {
    if (integration.config.kind !== "jira") throw new Error("not a jira integration");
    const { baseUrl, projectKey } = integration.config;
    const key = issue.key as string;
    const author = c.author?.displayName ?? c.author?.emailAddress ?? "unknown";
    const description = adfToText(issue.fields?.description);
    const commentText = adfToText(c.body);

    // The 4500-char contract cap is shared: the comment is what must be answered,
    // so it keeps its budget first and the description takes what is left.
    const budget = MAX_ITEM_TEXT - TEXT_HEADROOM;
    const commentBudget = Math.min(commentText.length, budget);
    const descBudget = Math.max(0, budget - commentBudget);

    const text = [
      `[${key}] ${issue.fields?.summary ?? ""}`.trim(),
      "",
      "Issue description:",
      truncate(description, descBudget),
      "",
      `Comment by ${author}:`,
      truncate(commentText, commentBudget),
    ]
      .join("\n")
      .slice(0, MAX_ITEM_TEXT);

    const ref: ExternalRef = { channel: projectKey ?? baseUrl, messageId: key };
    return {
      id: `jira-${key}-c${c.id}`,
      externalRef: ref,
      from: author,
      receivedAt: new Date(c.created ?? issue.fields?.updated ?? Date.now()).toISOString(),
      text,
      raw: { issue, comment: c },
      url: `${baseUrl}/browse/${key}?focusedCommentId=${c.id}`,
    };
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

/** Hard-cut `text` to `max` chars, marking the cut so the operator knows it happened. */
function truncate(text: string, max: number): string {
  if (max <= 0) return "";
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(0, max - 1))}…`;
}
