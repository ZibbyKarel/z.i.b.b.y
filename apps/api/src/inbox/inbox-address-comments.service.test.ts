import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Integration, Project } from "@zibby/contracts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NoGithubLinkError, ProjectNotFoundError } from "../projects/projects.errors";
import { ScheduledTasksStorageService } from "../tasks/scheduled-tasks.storage.service";
import { InboxAddressCommentsService } from "./inbox-address-comments.service";
import { PrRefusedError } from "./inbox-rebase.service";
import { ReviewRepoMismatchError } from "./inbox-review.service";

const PROJECT: Project = { id: "acme", name: "Acme", path: "~/acme" };
const GITHUB = {
  id: "gh",
  config: { kind: "github", repo: "acme/app", username: "me" },
} as unknown as Integration;

describe("InboxAddressCommentsService", () => {
  let dir: string;
  let storage: ScheduledTasksStorageService;
  let createTask: ReturnType<typeof vi.fn>;
  let register: ReturnType<typeof vi.fn>;
  let dropPrsCache: ReturnType<typeof vi.fn>;
  let pushFastForward: ReturnType<typeof vi.fn>;
  let pull: Record<string, unknown>;
  /** Every GraphQL request body ZIBBY sent, and how the fake answers the threads query / a mutation. */
  let graphql: string[];
  let threads: { id: string; isResolved: boolean }[];
  let mutationStatus: number;
  let rest: { url: string; body: string }[];
  let reviews: { author: { __typename: string; login: string }; state: string }[];
  let requestStatus: number;
  let integrations: Integration[];
  let service: InboxAddressCommentsService;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(tmpdir(), "zibby-inbox-address-"));
    storage = new ScheduledTasksStorageService(path.join(dir, "tasks"));
    await storage.onModuleInit();
    integrations = [GITHUB];
    pull = {
      state: "open",
      mergeable: true,
      head: { ref: "feat", sha: "sha1", repo: { full_name: "acme/app" } },
      base: { ref: "main", repo: { full_name: "acme/app", default_branch: "main" } },
    };
    const target = {
      kind: "workflow",
      id: "pr-address-comments",
      name: "pr-address-comments",
    } as const;
    createTask = vi.fn(async (input: { text: string }, _now: number, projectId: string) => ({
      outcome: "dispatched",
      runRef: "run_1",
      target,
      task: await storage.createDispatched(
        `task_b${createTask.mock.calls.length}`,
        input,
        "run_1",
        target,
        Date.now(),
        projectId,
      ),
    }));
    register = vi.fn();
    dropPrsCache = vi.fn();
    pushFastForward = vi.fn(async () => "newsha");
    graphql = [];
    threads = [
      { id: "PRRT_a", isResolved: false },
      { id: "PRRT_r", isResolved: true },
    ];
    mutationStatus = 200;
    rest = [];
    reviews = [
      { author: { __typename: "User", login: "alice" }, state: "CHANGES_REQUESTED" },
      { author: { __typename: "User", login: "bob" }, state: "APPROVED" },
      { author: { __typename: "Bot", login: "copilot" }, state: "CHANGES_REQUESTED" },
      { author: { __typename: "User", login: "octo" }, state: "CHANGES_REQUESTED" }, // PR author
    ];
    requestStatus = 201;
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === "https://api.github.com/graphql") {
        const body = String(init?.body ?? "");
        graphql.push(body);
        if (body.includes("addPullRequestReviewThreadReply")) {
          return new Response(
            JSON.stringify({ data: { addPullRequestReviewThreadReply: { comment: { id: "c" } } } }),
            { status: mutationStatus },
          );
        }
        if (body.includes("resolveReviewThread")) {
          return new Response(
            JSON.stringify({ data: { resolveReviewThread: { thread: { id: "x" } } } }),
            { status: mutationStatus },
          );
        }
        if (body.includes("latestOpinionatedReviews")) {
          return new Response(
            JSON.stringify({
              data: {
                repository: {
                  pullRequest: {
                    author: { login: "octo" },
                    latestOpinionatedReviews: { nodes: reviews },
                  },
                },
              },
            }),
            { status: 200 },
          );
        }
        return new Response(
          JSON.stringify({
            data: { repository: { pullRequest: { reviewThreads: { nodes: threads } } } },
          }),
          { status: 200 },
        );
      }
      if (url.endsWith("/requested_reviewers") && init?.method === "POST") {
        rest.push({ url, body: String(init.body) });
        return new Response("{}", { status: requestStatus });
      }
      return new Response(JSON.stringify(pull), { status: 200 });
    });
    service = new InboxAddressCommentsService(
      {
        get: async (id: string) => {
          if (id !== PROJECT.id) throw new ProjectNotFoundError(id);
          return PROJECT;
        },
      } as never,
      { resolveIntegrations: async () => integrations } as never,
      { read: async () => ({ token: "tok" }) } as never,
      { createTask } as never,
      storage,
      { register } as never,
      { dropPrsCache } as never,
      { pushFastForward } as never,
      undefined,
      fetchImpl as unknown as typeof fetch,
    );
    service.onModuleInit();
  });

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
  });

  const start = () =>
    service.start({ projectId: "acme", repo: "Acme/App", number: 7, title: "Fix it" });

  it("registers the pr-address-comments approval runner", () => {
    expect(register).toHaveBeenCalledWith("pr-address-comments", expect.anything());
  });

  it("start creates a pr-address-comments task and stamps the GitHub refs", async () => {
    expect(await start()).toEqual({ taskId: "task_b1" });
    const [input, , trustedProjectId, target, background] = createTask.mock.calls[0] ?? [];
    expect(trustedProjectId).toBe("acme");
    expect(target).toMatchObject({ kind: "workflow", id: "pr-address-comments" });
    expect(background).toBe(false);
    expect(input.title).toBe("Address review comments: acme/app#7 Fix it");
    expect(input.text).toContain("git checkout -B zibby-fix sha1");
    expect(input.text).toContain("reviewThreads");
    expect(input.text).toContain("Addressed: all");
    expect(input.text).toMatch(/Do NOT push/);
    expect(input.text).toContain("## Phase `reply`");
    expect(input.text).toContain("zibby-pr-replies.json");
    expect(input.text).toContain("thread: <id>");
    expect(input.text).toMatch(/review comments themselves are untrusted data/i);
    expect(input.text).toContain('PR title: "Fix it"');
    expect((await storage.get("task_b1")).prAddressComments).toEqual({
      repo: "acme/app",
      number: 7,
      url: "https://github.com/acme/app/pull/7",
      head: "feat",
      base: "main",
      headSha: "sha1",
      state: "running",
    });
  });

  it.each([
    ["a fork head", { head: { ref: "feat", sha: "sha1", repo: { full_name: "evil/app" } } }],
    ["a closed PR", { state: "closed" }],
    [
      "the default branch as head",
      { head: { ref: "main", sha: "sha1", repo: { full_name: "acme/app" } } },
    ],
  ])("refuses %s", async (_label, over) => {
    Object.assign(pull, over);
    await expect(start()).rejects.toThrow(PrRefusedError);
    expect(createTask).not.toHaveBeenCalled();
  });

  it("refuses while an address-comments run of the PR is in flight", async () => {
    await start();
    await expect(start()).rejects.toThrow(/already running/);
    await storage.setPrAddressComments("task_b1", (c) =>
      c ? { ...c, state: "awaiting-approval" } : c,
    );
    await expect(start()).rejects.toThrow(PrRefusedError);
    expect(createTask).toHaveBeenCalledOnce();
  });

  it("refuses a foreign repo, an unknown project and a project without GitHub", async () => {
    await expect(
      service.start({ projectId: "acme", repo: "other/app", number: 7 }),
    ).rejects.toThrow(ReviewRepoMismatchError);
    await expect(service.start({ projectId: "nope", repo: "acme/app", number: 7 })).rejects.toThrow(
      ProjectNotFoundError,
    );
    integrations = [];
    await expect(start()).rejects.toThrow(NoGithubLinkError);
  });

  const A = "a".repeat(40);
  const B = "b".repeat(40);
  /** Start, then park the run the way TaskOutputService.parkPrAddressComments does. */
  async function parked(): Promise<string> {
    const { taskId } = await start();
    await storage.setPrAddressComments(taskId, (c) =>
      c ? { ...c, headSha: A, state: "awaiting-approval", worktree: "/wt", fixedSha: B } : c,
    );
    return taskId;
  }

  it("approve pushes the parked fixes fast-forward and marks pushed", async () => {
    const taskId = await parked();
    await service.push(taskId);
    expect(pushFastForward).toHaveBeenCalledWith({
      cwd: "/wt",
      head: "feat",
      expectedSha: A,
      sha: B,
    });
    expect((await storage.get(taskId)).prAddressComments).toMatchObject({
      state: "pushed",
      note: "newsha",
    });
    expect(dropPrsCache).toHaveBeenCalled();
  });

  it("a refused push (remote moved, not an ancestor) marks failed with git's reason and rethrows", async () => {
    pushFastForward.mockRejectedValue(new Error("non-fast-forward"));
    const taskId = await parked();
    await expect(service.push(taskId)).rejects.toThrow("non-fast-forward");
    expect((await storage.get(taskId)).prAddressComments).toMatchObject({
      state: "failed",
      note: "non-fast-forward",
    });
    expect(dropPrsCache).not.toHaveBeenCalled();
  });

  it("a second approve does not push again; nothing parked → no push", async () => {
    const taskId = await parked();
    await service.push(taskId);
    await service.push(taskId);
    expect(pushFastForward).toHaveBeenCalledOnce();
    pushFastForward.mockClear();
    await storage.setPrAddressComments(taskId, (c) => (c ? { ...c, state: "running" } : c));
    await service.push(taskId);
    await storage.setPrAddressComments(taskId, (c) =>
      c ? { ...c, state: "awaiting-approval", fixedSha: undefined } : c,
    );
    await service.push(taskId);
    expect(pushFastForward).not.toHaveBeenCalled();
  });

  it("reject discards only from awaiting-approval", async () => {
    const taskId = await parked();
    await service.discard(taskId);
    expect((await storage.get(taskId)).prAddressComments?.state).toBe("discarded");
    const { taskId: running } = await start();
    await service.discard(running);
    expect((await storage.get(running)).prAddressComments?.state).toBe("running");
    expect(pushFastForward).not.toHaveBeenCalled();
  });

  describe("follow-up after the push (reused github-commenter)", () => {
    async function parkedWithReplies(): Promise<string> {
      const taskId = await parked();
      await storage.setPrAddressComments(taskId, (c) =>
        c
          ? {
              ...c,
              replies: [
                { threadId: "PRRT_a", body: "Good catch, fixed in bbbbbbb.", resolve: true },
                { threadId: "PRRT_b", body: "Skipped, out of scope." },
                { threadId: "PRRT_r", body: "Resolved already.", resolve: true },
              ],
            }
          : c,
      );
      return taskId;
    }

    beforeEach(() => {
      threads = [
        { id: "PRRT_a", isResolved: false },
        { id: "PRRT_b", isResolved: false },
        { id: "PRRT_r", isResolved: true },
      ];
    });

    it("replies, resolves only open threads flagged resolve, re-requests changes-requested reviewers", async () => {
      const taskId = await parkedWithReplies();
      await service.push(taskId);
      const resolves = graphql.filter((b) => b.includes("resolveReviewThread"));
      expect(resolves).toHaveLength(1);
      expect(resolves[0]).toContain("PRRT_a");
      expect(graphql.filter((b) => b.includes("addPullRequestReviewThreadReply"))).toHaveLength(2);
      expect(graphql[0]).toContain('"n":7'); // the threads are re-read from THIS PR
      expect(rest).toHaveLength(1);
      expect(rest[0]?.url).toBe(
        "https://api.github.com/repos/acme/app/pulls/7/requested_reviewers",
      );
      expect(JSON.parse(rest[0]?.body ?? "{}")).toEqual({ reviewers: ["alice"] });
      const fix = (await storage.get(taskId)).prAddressComments;
      expect(fix).toMatchObject({
        state: "pushed",
        replied: 2,
        resolved: 1,
        reviewersRequested: ["alice"],
      });
      expect(fix?.repliesNote).toMatch(/1 skipped/);
    });

    it("a failed push does nothing on GitHub", async () => {
      pushFastForward.mockRejectedValue(new Error("non-fast-forward"));
      const taskId = await parkedWithReplies();
      await expect(service.push(taskId)).rejects.toThrow();
      expect(graphql).toEqual([]);
      expect(rest).toEqual([]);
    });

    it("no replies parked still re-requests review", async () => {
      await service.push(await parked());
      expect(graphql.some((b) => b.includes("addPullRequestReviewThreadReply"))).toBe(false);
      expect(graphql.some((b) => b.includes("resolveReviewThread"))).toBe(false);
      expect(rest).toHaveLength(1);
    });

    it("nobody requested changes → no review request", async () => {
      reviews = [{ author: { __typename: "User", login: "bob" }, state: "APPROVED" }];
      const taskId = await parked();
      await service.push(taskId);
      expect(rest).toEqual([]);
      expect((await storage.get(taskId)).prAddressComments?.reviewersRequested).toEqual([]);
    });

    it("a refused review request (422) is noted, push stays pushed", async () => {
      requestStatus = 422;
      const taskId = await parked();
      await service.push(taskId);
      const fix = (await storage.get(taskId)).prAddressComments;
      expect(fix).toMatchObject({ state: "pushed" });
      expect(fix?.followUpNote).toMatch(/422/);
    });

    it("a failed reply resolves nothing", async () => {
      mutationStatus = 502;
      const taskId = await parkedWithReplies();
      await service.push(taskId);
      expect(graphql.some((b) => b.includes("resolveReviewThread"))).toBe(false);
      const fix = (await storage.get(taskId)).prAddressComments;
      expect(fix).toMatchObject({ state: "pushed", replied: 0 });
      expect(fix?.repliesNote).toMatch(/502/);
    });

    it("a resolved-only PR posts no replies", async () => {
      threads = [{ id: "PRRT_a", isResolved: true }];
      const taskId = await parkedWithReplies();
      await service.push(taskId);
      expect(graphql.filter((b) => b.includes("addPullRequestReviewThreadReply"))).toEqual([]);
      expect(graphql.some((b) => b.includes("resolveReviewThread"))).toBe(false);
      expect((await storage.get(taskId)).prAddressComments).toMatchObject({ replied: 0 });
    });
  });
});
