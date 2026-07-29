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
 * Fail-soft per endpoint: one failing read is logged and skipped, the rest of the
 * batch still lands. The caller decides whether to advance the cursor.
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

  async fetchNew(input: FetchNewInput): Promise<FetchedComment[]> {
    const numbers = await this.locator.numbersFor(input.projectId);
    if (numbers.length === 0) return [];
    const own = new Set(numbers);

    const since = input.cursor
      ? `?since=${encodeURIComponent(input.cursor)}&per_page=100`
      : "?per_page=100";
    const collected: FetchedComment[] = [];

    for (const [pathSuffix, prefix] of [
      [`/pulls/comments${since}`, "rc"],
      [`/issues/comments${since}`, "ic"],
    ] as const) {
      const raw = await this.get(`${GITHUB_API}/repos/${input.repo}${pathSuffix}`, input.token);
      for (const item of raw) {
        const prNumber = prNumberFromApiUrl(item.pull_request_url ?? item.issue_url ?? "");
        const mapped = this.toComment(item, prefix, prNumber, input);
        if (mapped && own.has(mapped.prNumber)) collected.push(mapped);
      }
    }

    for (const number of numbers.slice(0, MAX_REVIEW_PRS)) {
      const raw = await this.get(
        `${GITHUB_API}/repos/${input.repo}/pulls/${number}/reviews`,
        input.token,
      );
      for (const item of raw) {
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
    return collected.slice(0, MAX_COMMENTS_PER_PASS);
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
    if (input.selfLogin && author === input.selfLogin) return null;
    return {
      commentId: `${prefix}-${item.id}`,
      prNumber,
      prUrl: `https://github.com/${input.repo}/pull/${prNumber}`,
      commentUrl: item.html_url ?? `https://github.com/${input.repo}/pull/${prNumber}`,
      author,
      at: new Date(at).toISOString(),
      body,
    };
  }

  private async get(url: string, token: string): Promise<RawComment[]> {
    try {
      const res = await this.fetchImpl(url, {
        headers: { authorization: `Bearer ${token}`, accept: "application/vnd.github+json" },
      });
      if (!res.ok) {
        this.log.debug("review comment fetch failed", { url, status: res.status });
        return [];
      }
      const body: unknown = await res.json();
      return Array.isArray(body) ? (body as RawComment[]) : [];
    } catch (err) {
      this.log.debug("review comment fetch threw", { url, error: String(err) });
      return [];
    }
  }
}
