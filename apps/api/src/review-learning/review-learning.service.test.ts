import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { Project } from "@zibby/contracts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FetchedComment } from "./review-comment.fetcher";
import { ReviewLearningService } from "./review-learning.service";
import { ReviewRulesStore } from "./review-rules.store";

const NOW = new Date("2026-07-30T03:00:00.000Z");

function comment(over: Partial<FetchedComment> = {}): FetchedComment {
  return {
    commentId: "rc-1",
    prNumber: 7,
    prUrl: "https://github.com/acme/app/pull/7",
    commentUrl: "https://github.com/acme/app/pull/7#discussion_r1",
    author: "kolega",
    at: "2026-07-29T09:00:00.000Z",
    body: "patří do design systemu",
    ...over,
  };
}

describe("ReviewLearningService", () => {
  let dir: string;
  let store: ReviewRulesStore;

  const project = { id: "acme", name: "Acme" } as Project;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "review-learn-"));
    store = new ReviewRulesStore(dir);
  });

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  function makeService(opts: {
    comments: FetchedComment[];
    failedEndpoints?: string[];
    observations: Array<{
      commentId: string;
      slug: string;
      rule: string;
      scopeHint: "project" | "global";
    }>;
    projects?: Project[];
    token?: { repo: string; token: string } | null;
    /** Makes `resolveLink` throw for this one project id, to prove `learn()` fails open. */
    rejectProjectId?: string;
  }) {
    const logger = {
      child: () => ({ info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() }),
    };
    const fetcher = {
      fetchNew: vi.fn(async () => ({
        comments: opts.comments,
        failedEndpoints: opts.failedEndpoints ?? [],
      })),
    };
    const distiller = { distill: vi.fn(async () => opts.observations) };
    const flow = { propose: vi.fn(async (_projectId: string, _rule: unknown) => {}) };
    const service = new ReviewLearningService(
      { list: async () => opts.projects ?? [project] } as never,
      { resolveIntegrations: async () => [] } as never,
      { read: async () => ({ token: "ghp_x" }) } as never,
      fetcher as never,
      distiller as never,
      store,
      flow as never,
      logger as never,
      async (_resolved: unknown, _credentials: unknown, forProject: Project) => {
        if (opts.rejectProjectId && forProject.id === opts.rejectProjectId) {
          throw new Error(`resolveLink boom: ${forProject.id}`);
        }
        return opts.token === undefined ? { repo: "acme/app", token: "ghp_x" } : opts.token;
      },
    );
    return { service, fetcher, distiller, flow };
  }

  it("files an observation and advances the cursor to the newest comment", async () => {
    const { service } = makeService({
      comments: [comment()],
      observations: [
        {
          commentId: "rc-1",
          slug: "no-local-primitives",
          rule: "Ber primitivy z DS.",
          scopeHint: "project",
        },
      ],
    });

    const result = await service.learn(NOW);

    expect(result.observations).toBe(1);
    expect(result.proposed).toBe(0);
    expect(await store.cursor("acme")).toBe("2026-07-29T09:00:00.000Z");
    expect((await store.list("acme"))[0]?.status).toBe("observed");
  });

  it("proposes exactly once when a rule reaches its second occurrence", async () => {
    const { service, flow } = makeService({
      comments: [comment(), comment({ commentId: "rc-2", at: "2026-07-29T10:00:00.000Z" })],
      observations: [
        {
          commentId: "rc-1",
          slug: "no-local-primitives",
          rule: "Ber primitivy z DS.",
          scopeHint: "project",
        },
        {
          commentId: "rc-2",
          slug: "no-local-primitives",
          rule: "Ber primitivy z DS.",
          scopeHint: "project",
        },
      ],
    });

    const result = await service.learn(NOW);

    expect(result.proposed).toBe(1);
    expect(flow.propose).toHaveBeenCalledTimes(1);
    expect(flow.propose.mock.calls[0]?.[0]).toBe("acme");
    // Law 4 keystone: a rule distilled from an outsider's PR comment stops at
    // "proposed" — it never becomes "active" on its own. Only the operator's
    // approval (ReviewRuleFlowService.resume, exercised elsewhere) can do that.
    expect((await store.list("acme"))[0]?.status).toBe("proposed");
  });

  it("does not advance the cursor when the distiller returns nothing for a non-empty batch", async () => {
    const { service } = makeService({ comments: [comment()], observations: [] });

    await service.learn(NOW);

    expect(await store.cursor("acme")).toBeUndefined();
  });

  it("holds the cursor but still records observations when an endpoint failed", async () => {
    const { service } = makeService({
      comments: [comment()],
      failedEndpoints: ["pulls/comments"],
      observations: [
        {
          commentId: "rc-1",
          slug: "no-local-primitives",
          rule: "Ber primitivy z DS.",
          scopeHint: "project",
        },
      ],
    });

    const result = await service.learn(NOW);

    expect(result.observations).toBe(1);
    expect(await store.cursor("acme")).toBeUndefined();
    expect((await store.list("acme"))[0]?.status).toBe("observed");
  });

  it("skips a project with no GitHub link", async () => {
    const { service, fetcher } = makeService({ comments: [], observations: [], token: null });

    const result = await service.learn(NOW);

    expect(result).toEqual({ observations: 0, proposed: 0 });
    expect(fetcher.fetchNew).not.toHaveBeenCalled();
  });

  it("keeps going when one project throws", async () => {
    const { service } = makeService({
      comments: [comment()],
      observations: [
        {
          commentId: "rc-1",
          slug: "no-local-primitives",
          rule: "Ber primitivy z DS.",
          scopeHint: "project",
        },
      ],
      projects: [{ id: "broken", name: "Broken" } as Project, project],
      rejectProjectId: "broken",
    });

    const result = await service.learn(NOW);

    // The first project's resolveLink actually rejects; only the second project
    // ("acme") is expected to have gone through end to end.
    expect(result.observations).toBe(1);
    expect((await store.list("acme")).length).toBeGreaterThan(0);
    expect(await store.list("broken")).toHaveLength(0);
  });

  it("caps a stored occurrence's excerpt at EXCERPT_LIMIT and keeps it a prefix of the body", async () => {
    const longBody = "x".repeat(450);
    const { service } = makeService({
      comments: [comment({ body: longBody })],
      observations: [
        {
          commentId: "rc-1",
          slug: "no-local-primitives",
          rule: "Ber primitivy z DS.",
          scopeHint: "project",
        },
      ],
    });

    await service.learn(NOW);

    const excerpt = (await store.list("acme"))[0]?.occurrences[0]?.excerpt;
    expect(excerpt).toHaveLength(400);
    expect(longBody.startsWith(excerpt ?? "")).toBe(true);
  });
});
