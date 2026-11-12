import type { Integration, Project } from "@zibby/contracts";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProjectNotFoundError } from "../projects/projects.errors";
import {
  GithubThreadsError,
  InboxPrThreadsService,
  ThreadNotOnPrError,
} from "./inbox-pr-threads.service";

const PROJECT: Project = { id: "acme", name: "Acme", path: "~/acme" };
const GITHUB = {
  id: "gh",
  config: { kind: "github", repo: "acme/app", username: "me" },
} as unknown as Integration;

const node = (id: string, resolved = false) => ({
  id,
  isResolved: resolved,
  isOutdated: false,
  path: "src/a.ts",
  line: 4,
  startLine: null,
  comments: {
    nodes: [
      {
        id: "C1",
        author: { login: "rev", avatarUrl: "http://a/1" },
        createdAt: "2026-10-22T10:00:00Z",
        body: "fix this",
        diffHunk: "@@ -1 +1 @@\n-a\n+b",
      },
      { id: "C2", author: null, createdAt: "2026-10-22T11:00:00Z", body: "ok", diffHunk: "other" },
    ],
  },
});

const gqlResponse = (data: unknown) => new Response(JSON.stringify({ data }));

describe("InboxPrThreadsService", () => {
  let fetchImpl: ReturnType<typeof vi.fn>;
  let nodes: ReturnType<typeof node>[];
  let service: InboxPrThreadsService;
  let record: ReturnType<typeof vi.fn>;
  let dropPrsCache: ReturnType<typeof vi.fn>;
  const bodies = () =>
    fetchImpl.mock.calls.map(
      (c) => JSON.parse((c[1] as { body: string }).body) as { query: string },
    );

  beforeEach(() => {
    record = vi.fn(async () => undefined);
    dropPrsCache = vi.fn();
    nodes = [node("PRRT_1")];
    fetchImpl = vi.fn(async (_url: string, init: { body: string }) => {
      const { query } = JSON.parse(init.body) as { query: string };
      if (query.includes("reviewThreads")) {
        return gqlResponse({ repository: { pullRequest: { reviewThreads: { nodes } } } });
      }
      return gqlResponse({});
    });
    service = new InboxPrThreadsService(
      {
        get: async (id: string) => {
          if (id !== PROJECT.id) throw new ProjectNotFoundError(id);
          return PROJECT;
        },
      } as never,
      { resolveIntegrations: async () => [GITHUB] } as never,
      { read: async () => ({ token: "tok" }) } as never,
      { dropPrsCache } as never,
      undefined,
      { record } as never,
      fetchImpl as unknown as typeof fetch,
    );
  });

  it("list maps GraphQL nodes to InboxPrThread (diffHunk from the first comment)", async () => {
    expect(await service.list("acme", 7)).toEqual([
      {
        id: "PRRT_1",
        isResolved: false,
        isOutdated: false,
        path: "src/a.ts",
        line: 4,
        startLine: null,
        diffHunk: "@@ -1 +1 @@\n-a\n+b",
        comments: [
          {
            id: "C1",
            author: { login: "rev", avatarUrl: "http://a/1" },
            createdAt: "2026-10-22T10:00:00Z",
            body: "fix this",
          },
          { id: "C2", author: null, createdAt: "2026-10-22T11:00:00Z", body: "ok" },
        ],
      },
    ]);
    const [url, init] = fetchImpl.mock.calls[0] as [string, { headers: Record<string, string> }];
    expect(url).toBe("https://api.github.com/graphql");
    expect(init.headers.authorization).toBe("Bearer tok");
  });

  it("reply resolves first, then posts the reply, when both are requested", async () => {
    await service.reply("acme", 7, "PRRT_1", { body: "done", resolve: true });
    const queries = bodies().map((b) => b.query);
    const add = queries.findIndex((q) => q.includes("addPullRequestReviewThreadReply"));
    const resolve = queries.findIndex((q) => q.includes("resolveReviewThread"));
    expect(add).toBeGreaterThan(-1);
    expect(resolve).toBeGreaterThan(-1);
    expect(add).toBeGreaterThan(resolve);
    expect(queries.at(-1)).toContain("reviewThreads"); // fresh re-read
  });

  it("a failed resolve posts no reply, so a retry cannot duplicate it", async () => {
    fetchImpl.mockImplementation(async (_url: string, init: { body: string }) => {
      const { query } = JSON.parse(init.body) as { query: string };
      if (query.includes("resolveReviewThread")) return new Response("boom", { status: 502 });
      return gqlResponse({ repository: { pullRequest: { reviewThreads: { nodes } } } });
    });
    await expect(
      service.reply("acme", 7, "PRRT_1", { body: "done", resolve: true }),
    ).rejects.toThrow();
    expect(bodies().some((b) => b.query.includes("addPullRequestReviewThreadReply"))).toBe(false);
    expect(record).not.toHaveBeenCalled();
    expect(dropPrsCache).not.toHaveBeenCalled();
  });

  it("reply drops the PR cache so open-thread counts refresh", async () => {
    await service.reply("acme", 7, "PRRT_1", { body: "done", resolve: true });
    expect(dropPrsCache).toHaveBeenCalledTimes(1);
  });

  it("reply records an activity entry", async () => {
    await service.reply("acme", 7, "PRRT_1", { body: "done" });
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "channel-reply", summary: "replied on acme/app#7" }),
    );
  });

  it("reply with only resolve posts no comment", async () => {
    await service.reply("acme", 7, "PRRT_1", { resolve: true });
    const queries = bodies().map((b) => b.query);
    expect(queries.some((q) => q.includes("addPullRequestReviewThreadReply"))).toBe(false);
    expect(queries.some((q) => q.includes("resolveReviewThread"))).toBe(true);
  });

  it("refuses a thread id that is not on this PR", async () => {
    await expect(service.reply("acme", 7, "PRRT_other", { body: "x" })).rejects.toBeInstanceOf(
      ThreadNotOnPrError,
    );
    expect(bodies().every((b) => b.query.includes("reviewThreads"))).toBe(true);
  });

  it("maps a GraphQL error to GithubThreadsError", async () => {
    fetchImpl.mockResolvedValueOnce(
      new Response(JSON.stringify({ errors: [{ message: "boom" }] })),
    );
    await expect(service.list("acme", 7)).rejects.toBeInstanceOf(GithubThreadsError);
  });

  it("maps an HTTP 401 to GithubThreadsError with that status", async () => {
    fetchImpl.mockResolvedValueOnce(new Response("{}", { status: 401 }));
    await expect(service.list("acme", 7)).rejects.toMatchObject({ status: 401 });
  });

  describe("submitReview", () => {
    const call = () =>
      fetchImpl.mock.calls[0] as [string, RequestInit & { headers: Record<string, string> }];

    it("posts the event and body to the reviews endpoint", async () => {
      fetchImpl.mockResolvedValueOnce(new Response(JSON.stringify({ id: 99 })));
      expect(
        await service.submitReview("acme", 7, { event: "REQUEST_CHANGES", body: "fix it" }),
      ).toEqual({ id: 99 });
      const [url, init] = call();
      expect(url).toBe("https://api.github.com/repos/acme/app/pulls/7/reviews");
      expect(init.method).toBe("POST");
      expect(init.headers.authorization).toBe("Bearer tok");
      expect(JSON.parse(init.body as string)).toEqual({ event: "REQUEST_CHANGES", body: "fix it" });
      expect(record).toHaveBeenCalledTimes(1);
      expect(dropPrsCache).toHaveBeenCalledTimes(1);
    });

    it("omits an empty body on approve", async () => {
      fetchImpl.mockResolvedValueOnce(new Response(JSON.stringify({ id: 1 })));
      await service.submitReview("acme", 7, { event: "APPROVE" });
      expect(JSON.parse(call()[1].body as string)).toEqual({ event: "APPROVE" });
    });

    it("surfaces GitHub's refusal", async () => {
      fetchImpl.mockResolvedValueOnce(
        new Response(JSON.stringify({ message: "Can not approve your own pull request" }), {
          status: 422,
        }),
      );
      const err = await service.submitReview("acme", 7, { event: "APPROVE" }).catch((e) => e);
      expect(err).toBeInstanceOf(GithubThreadsError);
      expect(err.status).toBe(422);
      expect(err.message).toBe(
        "GitHub review failed: HTTP 422: Can not approve your own pull request",
      );
      expect(record).not.toHaveBeenCalled();
      expect(dropPrsCache).not.toHaveBeenCalled();
    });

    it("404s an unknown project", async () => {
      await expect(service.submitReview("nope", 7, { event: "APPROVE" })).rejects.toBeInstanceOf(
        ProjectNotFoundError,
      );
      expect(fetchImpl).not.toHaveBeenCalled();
    });
  });

  describe("reviewers", () => {
    const prNode = {
      author: { login: "me" },
      files: { nodes: [{ path: "src/a.ts" }] },
      reviewRequests: {
        nodes: [
          { requestedReviewer: { __typename: "Team", slug: "web", name: "Web" } },
          { requestedReviewer: { __typename: "User", login: "bob" } },
        ],
      },
      reviews: {
        nodes: [
          {
            author: { login: "ann" },
            state: "CHANGES_REQUESTED",
            comments: { totalCount: 2 },
            onBehalfOf: { nodes: [] },
          },
        ],
      },
      baseRef: { target: { gh: null, root: { object: { text: "*.ts @acme/web" } }, docs: null } },
    };

    const reviewersFetch = (orgOk: boolean) =>
      vi.fn(async (url: string, init: { body: string }) => {
        if (url.endsWith("/requested_reviewers")) return new Response("{}", { status: 201 });
        const { query } = JSON.parse(init.body) as { query: string };
        if (query.includes("organization")) {
          return orgOk
            ? gqlResponse({
                organization: {
                  teams: {
                    nodes: [{ slug: "web", name: "Web", members: { nodes: [{ login: "ann" }] } }],
                  },
                },
              })
            : new Response(JSON.stringify({ errors: [{ message: "read:org" }] }));
        }
        return gqlResponse({ repository: { pullRequest: prNode } });
      });

    const withFetch = (f: ReturnType<typeof vi.fn>) =>
      new InboxPrThreadsService(
        { get: async () => PROJECT } as never,
        { resolveIntegrations: async () => [GITHUB] } as never,
        { read: async () => ({ token: "tok" }) } as never,
        { dropPrsCache } as never,
        undefined,
        { record } as never,
        f as unknown as typeof fetch,
      );

    it("maps the PR into a team tree with CODEOWNER flag and nested members", async () => {
      expect(await withFetch(reviewersFetch(true)).reviewers("acme", 7)).toEqual({
        teams: [
          {
            slug: "web",
            name: "Web",
            codeOwner: true,
            requested: true,
            members: [{ login: "ann", state: "changesRequested", commented: true }],
          },
        ],
        users: [{ login: "bob", state: "pending", commented: false }],
      });
    });

    it("tolerates a failing org-teams query (no read:org) — people stay top-level", async () => {
      const tree = await withFetch(reviewersFetch(false)).reviewers("acme", 7);
      expect(tree.teams[0]?.members).toEqual([]);
      expect(tree.users.map((u) => u.login)).toEqual(["bob", "ann"]);
    });

    it("degrades on a token without read:org: keeps the partial data GitHub returns", async () => {
      const f = vi.fn(async (_url: string, init: { body: string }) => {
        const { query } = JSON.parse(init.body) as { query: string };
        if (query.includes("organization")) return new Response("{}", { status: 403 });
        return new Response(
          JSON.stringify({
            data: {
              repository: {
                pullRequest: {
                  ...prNode,
                  reviewRequests: {
                    nodes: [{ requestedReviewer: null }, prNode.reviewRequests.nodes[1]],
                  },
                  reviews: {
                    nodes: [{ ...prNode.reviews.nodes[0], onBehalfOf: null }],
                  },
                },
              },
            },
            errors: [{ type: "INSUFFICIENT_SCOPES", message: "needs read:org" }],
          }),
        );
      });
      const tree = await withFetch(f).reviewers("acme", 7);
      expect(tree.users.map((u) => u.login)).toEqual(["bob", "ann"]);
      expect(tree.teams.map((t) => t.slug)).toEqual(["web"]); // CODEOWNERS still names it
    });

    it("tolerates NOT_FOUND for the CODEOWNERS spots the repo doesn't use", async () => {
      const f = vi.fn(async (_url: string, init: { body: string }) => {
        const { query } = JSON.parse(init.body) as { query: string };
        if (query.includes("organization")) return new Response("{}", { status: 403 });
        return new Response(
          JSON.stringify({
            data: { repository: { pullRequest: prNode } },
            errors: ["gh", "docs"].map((alias) => ({
              type: "NOT_FOUND",
              path: ["repository", "pullRequest", "baseRef", "target", alias],
              message: `Could not resolve file for path '${alias}'.`,
            })),
          }),
        );
      });
      const tree = await withFetch(f).reviewers("acme", 7);
      expect(tree.teams.map((t) => t.slug)).toEqual(["web"]);
    });

    it("other GraphQL errors still fail the read", async () => {
      const f = vi.fn(
        async () =>
          new Response(
            JSON.stringify({ data: null, errors: [{ type: "NOT_FOUND", message: "x" }] }),
          ),
      );
      await expect(withFetch(f).reviewers("acme", 7)).rejects.toBeInstanceOf(GithubThreadsError);
    });

    it("requestReview still succeeds when the re-read after the POST fails", async () => {
      const f = vi.fn(async (url: string) =>
        url.endsWith("/requested_reviewers")
          ? new Response("{}", { status: 201 })
          : new Response("boom", { status: 500 }),
      );
      expect(await withFetch(f).requestReview("acme", 7, "ann")).toEqual({
        teams: [],
        users: [{ login: "ann", state: "pending", commented: false }],
      });
      expect(record).toHaveBeenCalledOnce();
    });

    it("asks for the newest 100 reviews", async () => {
      const f = reviewersFetch(true);
      await withFetch(f).reviewers("acme", 7);
      const q = (JSON.parse((f.mock.calls[0]?.[1] as { body: string }).body) as { query: string })
        .query;
      expect(q).toContain("reviews(last:100)");
    });

    it("requestReview posts the login to GitHub, records activity and returns the tree", async () => {
      const f = reviewersFetch(true);
      const tree = await withFetch(f).requestReview("acme", 7, "ann");
      const post = f.mock.calls.find((c) => String(c[0]).endsWith("/requested_reviewers"));
      expect(post?.[0]).toBe("https://api.github.com/repos/acme/app/pulls/7/requested_reviewers");
      expect(JSON.parse((post?.[1] as { body: string }).body)).toEqual({ reviewers: ["ann"] });
      expect(record).toHaveBeenCalledOnce();
      expect(dropPrsCache).toHaveBeenCalledOnce();
      expect(tree.teams).toHaveLength(1);
    });

    it("surfaces a GitHub refusal of the review request", async () => {
      const f = vi.fn(
        async () => new Response(JSON.stringify({ message: "nope" }), { status: 422 }),
      );
      const err = await withFetch(f)
        .requestReview("acme", 7, "ann")
        .catch((e) => e);
      expect(err).toBeInstanceOf(GithubThreadsError);
      expect(err.status).toBe(422);
      expect(record).not.toHaveBeenCalled();
    });
  });
});
