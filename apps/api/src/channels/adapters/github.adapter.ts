import type {
  ChannelItem,
  CredentialsInput,
  ExternalRef,
  Integration,
  TestResult,
} from "@zibby/contracts";
import type { ChannelAdapter, InboundMessage, PollContext, PollResult } from "./adapter";

const GITHUB_API = "https://api.github.com";

interface GitHubIssue {
  number?: number;
  title?: string;
  body?: string | null;
  updated_at?: string;
  state?: string;
  user?: { login?: string };
  pull_request?: unknown;
}

/** PAT from the closed credentials union (null if absent). */
function tokenOf(creds: CredentialsInput): string | null {
  return "token" in creds ? creds.token : null;
}

/**
 * GitHub adapter over plain `fetch` (Node 20+ global). Polls `/repos/{repo}/issues`
 * (the API returns issues *and* PRs; the `pull_request` field distinguishes them) with
 * `since` = the cursor, normalizes each to an {@link InboundMessage} with a
 * deterministic `gh-<repo>-<issue|pr>-<number>` id, and advances the cursor to the
 * newest `updated_at`. `streams` filters issues vs pulls. When `config.username` is
 * set, polling narrows to exactly three sets: items that explicitly mention the
 * operator, items assigned to them (both via the Search API, {@link searchScoped}),
 * and PRs ZIBBY itself opened for this project, fetched directly by number
 * ({@link fetchZibbyPrs}) from the numbers the watcher resolves into
 * `ctx.zibbyPrNumbers`. The `assignee:` half is there by the operator's explicit
 * later instruction — phase-126a had dropped it on the reasoning that "assigned to
 * me at work" ≠ "concerns ZIBBY"
 * (`docs/plans/phase-126a-github-question-scope.md`), which the operator has since
 * overruled: an issue assigned to them is theirs to see. No fourth set exists —
 * nothing outside this union may be ingested. A fresh integration (no
 * persisted cursor) seeds the cursor to "now" and ingests nothing on that first poll —
 * every later poll fetches only what changed since the last sync, never a full
 * backfill (same contract as the email adapter). No method sleeps on a rate limit; a
 * failure surfaces to the watcher (M8 retry/backoff).
 */
export class GitHubChannelAdapter implements ChannelAdapter {
  readonly kind = "github" as const;

  constructor(private readonly fetchImpl: typeof fetch = fetch) {}

  private headers(creds: CredentialsInput): Record<string, string> {
    const token = tokenOf(creds);
    if (!token) throw new Error("no github token configured");
    return { authorization: `Bearer ${token}`, accept: "application/vnd.github+json" };
  }

  async test(_integration: Integration, creds: CredentialsInput): Promise<TestResult> {
    if (!tokenOf(creds)) return { ok: false, detail: "no github token configured" };
    try {
      const res = await this.fetchImpl(`${GITHUB_API}/user`, { headers: this.headers(creds) });
      if (!res.ok) return { ok: false, detail: `github /user: HTTP ${res.status}` };
      const body = (await res.json()) as { login?: string };
      return { ok: true, detail: `authenticated${body.login ? ` as ${body.login}` : ""}` };
    } catch (err) {
      return { ok: false, detail: (err as Error).message };
    }
  }

  /** Every open issue/PR in the repo, via `/repos/{repo}/issues?since=`. */
  private async listAll(
    repo: string,
    cursor: string | undefined,
    creds: CredentialsInput,
  ): Promise<GitHubIssue[]> {
    const params = new URLSearchParams({
      state: "open",
      sort: "updated",
      direction: "asc",
      per_page: "50",
    });
    if (cursor) params.set("since", cursor);
    const res = await this.fetchImpl(`${GITHUB_API}/repos/${repo}/issues?${params}`, {
      headers: this.headers(creds),
    });
    if (res.status === 429 || res.status === 403) {
      throw new Error(`github rate limited (HTTP ${res.status})`);
    }
    if (!res.ok) throw new Error(`github issues: HTTP ${res.status}`);
    return (await res.json()) as GitHubIssue[];
  }

  /**
   * One Search API (`/search/issues`) pass for a single scope qualifier —
   * `mentions:<user>` or `assignee:<user>`. Two separate searches rather than one
   * query because GitHub search ANDs its qualifiers: `mentions:X assignee:X` would
   * return only the items that are BOTH, where the operator's rule is a union.
   * `updated:>=cursor` stands in for the issues endpoint's `since` (Search has no
   * such param); items ship in the same shape as `/repos/{repo}/issues`,
   * distinguished the same way via `pull_request`.
   */
  private async searchScoped(
    repo: string,
    qualifier: string,
    cursor: string | undefined,
    creds: CredentialsInput,
  ): Promise<GitHubIssue[]> {
    const since = cursor ? ` updated:>=${cursor}` : "";
    const q = `repo:${repo} is:open ${qualifier}${since}`;
    const params = new URLSearchParams({ q, sort: "updated", order: "asc", per_page: "50" });
    const res = await this.fetchImpl(`${GITHUB_API}/search/issues?${params}`, {
      headers: this.headers(creds),
    });
    if (res.status === 429 || res.status === 403) {
      throw new Error(`github rate limited (HTTP ${res.status})`);
    }
    if (!res.ok) throw new Error(`github issues: HTTP ${res.status}`);
    const body = (await res.json()) as { items?: GitHubIssue[] };
    return body.items ?? [];
  }

  /**
   * PRs ZIBBY itself opened for this project. No Search qualifier can answer this
   * (D6 — `author:`/`assignee:` cannot tell a ZIBBY-opened PR from one the operator
   * opened by hand, since both go out under the operator's token), so it stays a
   * direct read. `numbers` comes from `ctx.zibbyPrNumbers`, which
   * `ChannelWatcherService` resolves via `ZibbyPrLocator` before calling `poll()`,
   * and each becomes its own `GET /repos/{repo}/issues/{number}` — the honest
   * implementation for a small, known set of numbers.
   *
   * The list arrives already capped at `MAX_ZIBBY_PR_READS`; the watcher caps it
   * because it owns the scoped logger and a dropped number has to be visible in
   * the record. This adapter deliberately does NOT re-cap or re-log — one owner
   * for the ceiling, so the two cannot silently disagree about it.
   */
  private async fetchZibbyPrs(
    repo: string,
    numbers: readonly number[],
    cursor: string | undefined,
    creds: CredentialsInput,
  ): Promise<GitHubIssue[]> {
    const issues: GitHubIssue[] = [];
    for (const number of numbers) {
      const res = await this.fetchImpl(`${GITHUB_API}/repos/${repo}/issues/${number}`, {
        headers: this.headers(creds),
      });
      // A PR/issue can be deleted between ZibbyPrLocator recording it and this
      // poll — skip it and continue rather than failing the whole poll.
      if (res.status === 404) continue;
      if (res.status === 429 || res.status === 403) {
        throw new Error(`github rate limited (HTTP ${res.status})`);
      }
      if (!res.ok) throw new Error(`github issue ${number}: HTTP ${res.status}`);
      const issue = (await res.json()) as GitHubIssue;
      // Keep both halves of the union consistent: the mentions search is already
      // `is:open`, so a since-closed ZIBBY PR must not sneak back in here.
      if (issue.state !== "open") continue;
      if (cursor !== undefined && (issue.updated_at ?? "") <= cursor) continue;
      issues.push(issue);
    }
    return issues;
  }

  async poll(
    integration: Integration,
    creds: CredentialsInput,
    cursor: string | undefined,
    ctx?: PollContext,
  ): Promise<PollResult> {
    if (integration.config.kind !== "github") throw new Error("not a github integration");
    const { repo, streams, username } = integration.config;

    // First enable (no persisted cursor): seed it to "now" and ingest nothing, so a
    // fresh integration never backfills the repo's full issue/PR history — the same
    // "initial sync = now" contract as the email adapter. No fetch happens on this
    // pass; the next tick has a real cursor and polls only what changed since.
    if (cursor === undefined) {
      return { items: [], cursor: new Date().toISOString() };
    }

    const scoped = username
      ? [
          ...(await this.searchScoped(repo, `mentions:${username}`, cursor, creds)),
          ...(await this.searchScoped(repo, `assignee:${username}`, cursor, creds)),
        ]
      : await this.listAll(repo, cursor, creds);
    const zibbyNumbers = ctx?.zibbyPrNumbers ?? [];
    const zibbyPrs = zibbyNumbers.length
      ? await this.fetchZibbyPrs(repo, zibbyNumbers, cursor, creds)
      : [];

    // Union the three sets, deduping by issue number — an item that is both
    // mentioned-me and assigned-to-me (or a ZIBBY PR that mentions the operator)
    // ingests exactly once.
    const byNumber = new Map<number, GitHubIssue>();
    for (const issue of [...scoped, ...zibbyPrs]) {
      if (issue.number !== undefined) byNumber.set(issue.number, issue);
    }
    const issues = [...byNumber.values()].sort((a, b) =>
      (a.updated_at ?? "").localeCompare(b.updated_at ?? ""),
    );

    const items: InboundMessage[] = [];
    let newest = cursor;
    for (const issue of issues) {
      if (issue.number === undefined) continue;
      const isPr = issue.pull_request !== undefined;
      if (isPr && !streams.includes("pulls")) continue;
      if (!isPr && !streams.includes("issues")) continue;
      const updated = issue.updated_at ?? new Date(0).toISOString();
      const ref: ExternalRef = { channel: repo, messageId: String(issue.number) };
      items.push({
        id: `gh-${repo.replace("/", "-")}-${isPr ? "pr" : "issue"}-${issue.number}`,
        externalRef: ref,
        from: issue.user?.login,
        receivedAt: new Date(updated).toISOString(),
        text: `#${issue.number} ${issue.title ?? ""}${issue.body ? `\n\n${issue.body}` : ""}`.trim(),
        raw: issue,
        url: `https://github.com/${repo}/${isPr ? "pull" : "issues"}/${issue.number}`,
      });
      if (newest === undefined || updated > newest) newest = updated;
    }
    return { items, cursor: newest };
  }

  async send(
    integration: Integration,
    creds: CredentialsInput,
    item: ChannelItem,
    text: string,
  ): Promise<void> {
    if (integration.config.kind !== "github") throw new Error("not a github integration");
    const number = item.externalRef.messageId;
    if (!number) throw new Error("github item has no issue/pr number");
    const res = await this.fetchImpl(
      `${GITHUB_API}/repos/${integration.config.repo}/issues/${number}/comments`,
      {
        method: "POST",
        headers: { ...this.headers(creds), "content-type": "application/json" },
        body: JSON.stringify({ body: text }),
      },
    );
    if (!res.ok) throw new Error(`github comment: HTTP ${res.status}`);
  }
}
