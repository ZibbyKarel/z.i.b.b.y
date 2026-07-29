import { describe, expect, it, vi } from "vitest";
import { ReviewCommentFetcher } from "./review-comment.fetcher";

type Route = { match: RegExp; body: unknown };

/** A dispatching fetch stub: first matching route wins, unmatched → empty array. */
function fetchStub(routes: Route[]) {
  return vi.fn(async (input: string | URL) => {
    const url = String(input);
    const route = routes.find((r) => r.match.test(url));
    return new Response(JSON.stringify(route?.body ?? []), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  });
}

function makeLogger() {
  const warn = vi.fn();
  const debug = vi.fn();
  const logger = {
    child: () => ({ info: vi.fn(), warn, debug, error: vi.fn() }),
  };
  return { logger, warn, debug };
}

function makeFetcher(routes: Route[], numbers: number[] = [7]) {
  const { logger, warn, debug } = makeLogger();
  const locator = { numbersFor: vi.fn(async () => numbers) };
  const fetchImpl = fetchStub(routes);
  const fetcher = new ReviewCommentFetcher(locator as never, logger as never, fetchImpl as never);
  return { fetcher, fetchImpl, warn, debug };
}

/** Ascending, unique, non-wrapping minute timestamps — avoids the `i % 60` collision trap. */
function atMinutes(i: number): string {
  return new Date(Date.parse("2026-07-29T09:00:00.000Z") + i * 60_000).toISOString();
}

const INLINE = {
  id: 111,
  body: "primitivy patří do design systemu",
  user: { login: "kolega" },
  created_at: "2026-07-29T09:00:00Z",
  html_url: "https://github.com/acme/app/pull/7#discussion_r111",
  pull_request_url: "https://api.github.com/repos/acme/app/pulls/7",
};

const CONVERSATION = {
  id: 222,
  body: "prosím přidej test",
  user: { login: "kolega" },
  created_at: "2026-07-29T09:30:00Z",
  html_url: "https://github.com/acme/app/pull/7#issuecomment-222",
  issue_url: "https://api.github.com/repos/acme/app/issues/7",
};

const REVIEW = {
  id: 333,
  body: "celkově fajn, ale chybí testy",
  user: { login: "kolega" },
  submitted_at: "2026-07-29T09:45:00Z",
  html_url: "https://github.com/acme/app/pull/7#pullrequestreview-333",
};

const BASE = { projectId: "acme", repo: "acme/app", token: "ghp_x" };

describe("ReviewCommentFetcher", () => {
  it("namespaces ids by source and returns comments oldest-first", async () => {
    const { fetcher } = makeFetcher([
      { match: /\/pulls\/comments/, body: [INLINE] },
      { match: /\/issues\/comments/, body: [CONVERSATION] },
      { match: /\/pulls\/7\/reviews/, body: [REVIEW] },
    ]);

    const { comments } = await fetcher.fetchNew(BASE);

    expect(comments.map((c) => c.commentId)).toEqual(["rc-111", "ic-222", "rv-333"]);
    expect(comments[0]?.prNumber).toBe(7);
    expect(comments[0]?.prUrl).toBe("https://github.com/acme/app/pull/7");
  });

  it("keeps only comments on PRs ZIBBY opened", async () => {
    const { fetcher } = makeFetcher(
      [
        {
          match: /\/pulls\/comments/,
          body: [
            INLINE,
            {
              ...INLINE,
              id: 999,
              pull_request_url: "https://api.github.com/repos/acme/app/pulls/8",
            },
          ],
        },
      ],
      [7],
    );

    const { comments } = await fetcher.fetchNew(BASE);

    expect(comments.map((c) => c.commentId)).toEqual(["rc-111"]);
  });

  it("drops comments authored by ZIBBY itself", async () => {
    const { fetcher } = makeFetcher([
      { match: /\/pulls\/comments/, body: [{ ...INLINE, user: { login: "zibby-bot" } }] },
    ]);

    const { comments } = await fetcher.fetchNew({ ...BASE, selfLogin: "zibby-bot" });
    expect(comments).toEqual([]);
  });

  it("drops ZIBBY's own comments regardless of login case or a trailing [bot] suffix", async () => {
    const { fetcher } = makeFetcher([
      {
        match: /\/pulls\/comments/,
        body: [
          { ...INLINE, id: 1, user: { login: "Zibby-Bot" } },
          { ...INLINE, id: 2, user: { login: "zibby-bot[bot]" } },
          { ...INLINE, id: 3, user: { login: "ZIBBY-BOT[BOT]" } },
        ],
      },
    ]);

    const { comments } = await fetcher.fetchNew({ ...BASE, selfLogin: "zibby-bot" });
    expect(comments).toEqual([]);
  });

  it("passes the cursor as `since` and filters review bodies locally", async () => {
    const { fetcher, fetchImpl } = makeFetcher([
      {
        match: /\/pulls\/7\/reviews/,
        body: [REVIEW, { ...REVIEW, id: 334, submitted_at: "2026-07-01T00:00:00Z" }],
      },
    ]);

    const { comments } = await fetcher.fetchNew({ ...BASE, cursor: "2026-07-29T09:40:00.000Z" });

    expect(comments.map((c) => c.commentId)).toEqual(["rv-333"]);
    expect(String(fetchImpl.mock.calls[0]?.[0])).toContain("since=2026-07-29T09%3A40%3A00.000Z");
  });

  it("skips a review with an empty body", async () => {
    const { fetcher } = makeFetcher([
      { match: /\/pulls\/7\/reviews/, body: [{ ...REVIEW, body: "" }] },
    ]);

    const { comments } = await fetcher.fetchNew(BASE);
    expect(comments).toEqual([]);
  });

  it("drops a comment with a malformed timestamp instead of failing the whole pass", async () => {
    const { fetcher } = makeFetcher([
      {
        match: /\/pulls\/comments/,
        body: [{ ...INLINE, id: 500, created_at: "not-a-real-date" }, INLINE],
      },
    ]);

    const { comments } = await fetcher.fetchNew(BASE);

    expect(comments.map((c) => c.commentId)).toEqual(["rc-111"]);
  });

  it("skips a null element in a raw comments array instead of throwing", async () => {
    const { fetcher } = makeFetcher([{ match: /\/pulls\/comments/, body: [null, INLINE] }]);

    const { comments } = await fetcher.fetchNew(BASE);

    expect(comments.map((c) => c.commentId)).toEqual(["rc-111"]);
  });

  it("sorts ascending by `at` even when the API returns them out of order", async () => {
    const { fetcher } = makeFetcher([
      {
        match: /\/pulls\/comments/,
        body: [
          { ...INLINE, id: 3, created_at: atMinutes(30) },
          { ...INLINE, id: 1, created_at: atMinutes(0) },
          { ...INLINE, id: 2, created_at: atMinutes(15) },
        ],
      },
    ]);

    const { comments } = await fetcher.fetchNew(BASE);

    expect(comments.map((c) => c.commentId)).toEqual(["rc-1", "rc-2", "rc-3"]);
  });

  it("returns what it has, and reports which endpoint failed, when one endpoint errors", async () => {
    const { logger, warn, debug } = makeLogger();
    const locator = { numbersFor: vi.fn(async () => [7]) };
    const fetchImpl = vi.fn(async (input: string | URL) => {
      const url = String(input);
      if (url.includes("/issues/comments")) return new Response("nope", { status: 500 });
      if (url.includes("/pulls/comments")) {
        return new Response(JSON.stringify([INLINE]), { status: 200 });
      }
      return new Response("[]", { status: 200 });
    });
    const fetcher = new ReviewCommentFetcher(locator as never, logger as never, fetchImpl as never);

    const { comments, failedEndpoints } = await fetcher.fetchNew(BASE);

    expect(comments.map((c) => c.commentId)).toEqual(["rc-111"]);
    expect(failedEndpoints).toEqual(["issues/comments"]);
    expect(warn).toHaveBeenCalled();
    expect(debug).not.toHaveBeenCalled();
  });

  it("caps the batch at MAX_COMMENTS_PER_PASS, keeping the TRUE oldest 60 (not just the first 60 fetched)", async () => {
    const many = Array.from({ length: 70 }, (_, i) => ({
      ...INLINE,
      id: 1000 + i,
      created_at: atMinutes(i),
    }));
    // Fetched newest-first: a naive "keep the first N fetched" cap would keep the
    // WRONG 60 (the newest ones) instead of the true oldest 60.
    const { fetcher } = makeFetcher([{ match: /\/pulls\/comments/, body: [...many].reverse() }]);

    const { comments } = await fetcher.fetchNew(BASE);

    expect(comments).toHaveLength(60);
    expect(comments.map((c) => c.commentId)).toEqual(
      many.slice(0, 60).map((item) => `rc-${item.id}`),
    );
  });
});
