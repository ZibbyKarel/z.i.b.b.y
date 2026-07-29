import { Injectable, Optional } from "@nestjs/common";
import { LoggerService, type ScopedLogger } from "../shared/logging/logger.service";
import { ZibbyPrLocator } from "./zibby-pr.locator";

const GITHUB_API = "https://api.github.com";

/**
 * PR number out of a GitHub *API* url. Deliberately looser than the locator's
 * `prNumberFromUrl` (which reads html `/pull/<n>` urls): a comment payload points
 * at `/pulls/<n>` for inline comments and `/issues/<n>` for conversation comments —
 * on a PR, the issue number IS the PR number.
 */
function prNumberFromApiUrl(url: string): number | null {
  const match = /\/(?:pulls?|issues)\/(\d+)(?:$|[/?#])/.exec(url);
  if (!match?.[1]) return null;
  const parsed = Number.parseInt(match[1], 10);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

/** Lowercased, with a trailing GitHub App `[bot]` suffix stripped, for comparison. */
function normalizeLogin(login: string): string {
  return login.toLowerCase().replace(/\[bot\]$/, "");
}

/** Case- and `[bot]`-suffix-insensitive: a login is ZIBBY's own regardless of how GitHub renders it. */
function isSelfAuthored(author: string, selfLogin: string | undefined): boolean {
  if (!selfLogin) return false;
  return normalizeLogin(author) === normalizeLogin(selfLogin);
}

/** Never feed more than this many comments to one nightly pass; the rest carry over. */
export const MAX_COMMENTS_PER_PASS = 60;

/** `/pulls/{n}/reviews` has no repo-wide `since`, so it is bounded by PR count instead. */
export const MAX_REVIEW_PRS = 20;

/** One review comment, source-namespaced and already attributed to its PR. */
export interface FetchedComment {
  commentId: string;
  prNumber: number;
  prUrl: string;
  commentUrl: string;
  author: string;
  at: string;
  body: string;
}

export interface FetchNewInput {
  projectId: string;
  repo: string;
  token: string;
  /** The login whose comments are ZIBBY's own — never learn from your own replies. */
  selfLogin?: string;
  cursor?: string;
}

export interface FetchNewResult {
  comments: FetchedComment[];
  /**
   * Endpoint identifiers (`"pulls/comments"`, `"issues/comments"`, or
   * `"pulls/<n>/reviews"`) whose GitHub read failed this pass. A failed endpoint's
   * comment window is UNKNOWN, not empty — the caller must not advance its cursor
   * past a window it never actually saw, or a persistently failing endpoint would
   * silently and permanently skip every comment that would have landed there.
   */
  failedEndpoints: string[];
}

/** Tolerant shapes — GitHub payloads are read defensively, never schema-parsed. */
interface RawComment {
  id?: number;
  body?: string;
  user?: { login?: string };
  created_at?: string;
  submitted_at?: string;
  html_url?: string;
  pull_request_url?: string;
  issue_url?: string;
}

/**
 * Reads new review comments on the project's ZIBBY-opened PRs. Two repo-wide
 * `since` queries cover inline and conversation comments in one call each; review
 * BODIES have no `since` variant, so they are fetched per PR (bounded by
 * {@link MAX_REVIEW_PRS}) and filtered locally against the cursor.
 *
 * Fail-soft per endpoint: one failing read is logged (at `warn` — this runs
 * unattended, so a persistent failure must be loud) and skipped, the rest of the
 * batch still lands. The failure itself is not swallowed: it comes back in
 * {@link FetchNewResult.failedEndpoints} so the caller can decide whether it is
 * still safe to advance its cursor.
 */
@Injectable()
export class ReviewCommentFetcher {
  private readonly fetchImpl: typeof fetch;
  private readonly log: ScopedLogger;

  constructor(
    private readonly locator: ZibbyPrLocator,
    logger: LoggerService,
    @Optional() fetchImpl?: typeof fetch,
  ) {
    this.fetchImpl = fetchImpl ?? fetch;
    this.log = logger.child(ReviewCommentFetcher.name);
  }

  async fetchNew(input: FetchNewInput): Promise<FetchNewResult> {
    const numbers = await this.locator.numbersFor(input.projectId);
    if (numbers.length === 0) return { comments: [], failedEndpoints: [] };
    const own = new Set(numbers);

    const since = input.cursor
      ? `?since=${encodeURIComponent(input.cursor)}&per_page=100`
      : "?per_page=100";
    const collected: FetchedComment[] = [];
    const failedEndpoints: string[] = [];

    for (const [pathSuffix, prefix, endpoint] of [
      [`/pulls/comments${since}`, "rc", "pulls/comments"],
      [`/issues/comments${since}`, "ic", "issues/comments"],
    ] as const) {
      const { items, failed } = await this.get(
        `${GITHUB_API}/repos/${input.repo}${pathSuffix}`,
        input.token,
        endpoint,
      );
      if (failed) failedEndpoints.push(endpoint);
      for (const item of items) {
        const prNumber = prNumberFromApiUrl(item.pull_request_url ?? item.issue_url ?? "");
        const mapped = this.toComment(item, prefix, prNumber, input);
        if (mapped && own.has(mapped.prNumber)) collected.push(mapped);
      }
    }

    for (const number of numbers.slice(0, MAX_REVIEW_PRS)) {
      const endpoint = `pulls/${number}/reviews`;
      // `per_page=100` for the same reason the two repo-wide calls above carry it:
      // GitHub's default page is 30, and this endpoint has no `since` to narrow
      // the window, so on a long-lived PR the 31st-and-older review body would
      // never be readable — permanently invisible, not merely deferred.
      const { items, failed } = await this.get(
        `${GITHUB_API}/repos/${input.repo}/pulls/${number}/reviews?per_page=100`,
        input.token,
        endpoint,
      );
      if (failed) failedEndpoints.push(endpoint);
      for (const item of items) {
        const mapped = this.toComment(item, "rv", number, input);
        // `/reviews` ignores `since` — apply the cursor here instead.
        if (mapped && (!input.cursor || mapped.at > input.cursor)) collected.push(mapped);
      }
    }

    collected.sort((a, b) =>
      a.at === b.at ? a.commentId.localeCompare(b.commentId) : a.at.localeCompare(b.at),
    );
    if (collected.length > MAX_COMMENTS_PER_PASS) {
      this.log.info("review comments capped for this pass — remainder carries over", {
        projectId: input.projectId,
        fetched: collected.length,
        kept: MAX_COMMENTS_PER_PASS,
      });
    }
    return { comments: collected.slice(0, MAX_COMMENTS_PER_PASS), failedEndpoints };
  }

  private toComment(
    item: RawComment,
    prefix: "rc" | "ic" | "rv",
    prNumber: number | null,
    input: FetchNewInput,
  ): FetchedComment | null {
    const body = item.body?.trim();
    const author = item.user?.login;
    const at = item.submitted_at ?? item.created_at;
    if (item.id === undefined || !body || !author || !at || prNumber === null) return null;
    if (isSelfAuthored(author, input.selfLogin)) return null;
    // A malformed timestamp must drop this one comment, not throw and discard the
    // whole pass — `toISOString()` on an invalid Date raises `RangeError`.
    const parsed = new Date(at);
    if (Number.isNaN(parsed.getTime())) return null;
    return {
      commentId: `${prefix}-${item.id}`,
      prNumber,
      prUrl: `https://github.com/${input.repo}/pull/${prNumber}`,
      commentUrl: item.html_url ?? `https://github.com/${input.repo}/pull/${prNumber}`,
      author,
      at: parsed.toISOString(),
      body,
    };
  }

  private async get(
    url: string,
    token: string,
    endpoint: string,
  ): Promise<{ items: RawComment[]; failed: boolean }> {
    try {
      const res = await this.fetchImpl(url, {
        headers: { authorization: `Bearer ${token}`, accept: "application/vnd.github+json" },
      });
      if (!res.ok) {
        this.log.warn("review comment fetch failed", { url, endpoint, status: res.status });
        return { items: [], failed: true };
      }
      const body: unknown = await res.json();
      if (!Array.isArray(body)) {
        this.log.warn("review comment payload was not an array — treated as empty", {
          url,
          endpoint,
        });
        return { items: [], failed: false };
      }
      // Defensive: a `null`/non-object array element must be filtered, not crash
      // the field reads in `toComment` (GitHub payloads are never schema-parsed). A
      // malformed element is permanently malformed — marking the ENDPOINT failed
      // over it would wedge the cursor forever on one bad comment, which is worse
      // than losing that one comment. So this is warned, not `failed: true`.
      const items = body.filter(
        (element): element is RawComment => typeof element === "object" && element !== null,
      );
      if (items.length < body.length) {
        this.log.warn("dropped malformed comment payload elements", {
          url,
          endpoint,
          dropped: body.length - items.length,
        });
      }
      return { items, failed: false };
    } catch (err) {
      this.log.warn("review comment fetch threw", { url, endpoint, error: String(err) });
      return { items: [], failed: true };
    }
  }
}
