import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Integration, Project } from "@zibby/contracts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NoGithubLinkError, ProjectNotFoundError } from "../projects/projects.errors";
import { ScheduledTasksStorageService } from "../tasks/scheduled-tasks.storage.service";
import {
  InboxReviewService,
  ReviewRepoMismatchError,
  reviewTaskText,
} from "./inbox-review.service";

const PROJECT: Project = { id: "acme", name: "Acme", path: "~/acme" };
const GITHUB = {
  id: "gh",
  config: { kind: "github", repo: "acme/app", username: "me" },
} as unknown as Integration;

describe("InboxReviewService", () => {
  let dir: string;
  let storage: ScheduledTasksStorageService;
  let createTask: ReturnType<typeof vi.fn>;
  let register: ReturnType<typeof vi.fn>;
  let dropPrsCache: ReturnType<typeof vi.fn>;
  let fetchImpl: ReturnType<typeof vi.fn>;
  let integrations: Integration[];
  let service: InboxReviewService;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(tmpdir(), "zibby-inbox-review-"));
    storage = new ScheduledTasksStorageService(path.join(dir, "tasks"));
    await storage.onModuleInit();
    integrations = [GITHUB];
    createTask = vi.fn(async (input: { text: string }, _now: number, projectId: string) => ({
      outcome: "dispatched",
      runRef: "run_1",
      target: { kind: "agent", id: "code-reviewer", name: "code-reviewer" },
      task: await storage.createDispatched(
        "task_r1",
        input,
        "run_1",
        { kind: "agent", id: "code-reviewer", name: "code-reviewer" },
        Date.now(),
        projectId,
      ),
    }));
    register = vi.fn();
    dropPrsCache = vi.fn();
    fetchImpl = vi.fn(async () => new Response("{}", { status: 200 }));
    service = new InboxReviewService(
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
      undefined,
      fetchImpl as unknown as typeof fetch,
    );
    service.onModuleInit();
  });

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
  });

  it("registers the pr-review approval runner", () => {
    expect(register).toHaveBeenCalledWith("pr-review", expect.anything());
  });

  it("start creates a task with the explicit pr-review-quick target + trustedProjectId", async () => {
    const result = await service.start({
      projectId: "acme",
      repo: "Acme/App",
      number: 7,
      title: "Fix it",
    });
    expect(result).toEqual({ taskId: "task_r1" });
    const [input, , trustedProjectId, target, background] = createTask.mock.calls[0] ?? [];
    expect(trustedProjectId).toBe("acme");
    expect(target).toMatchObject({ kind: "workflow", id: "pr-review-quick" });
    expect(background).toBe(false);
    expect(input.title).toBe("Code review: acme/app#7 Fix it");
    expect(input.text).toContain("gh pr diff 7 --repo acme/app");
    expect(input.text).toContain("zibby-pr-review.md");
    expect(input.text).toMatch(/Do NOT post anything to GitHub/);
    expect((await storage.get("task_r1")).prReview).toEqual({
      repo: "acme/app",
      number: 7,
      url: "https://github.com/acme/app/pull/7",
      state: "running",
    });
  });

  it.each([
    ["quick", "pr-review-quick"],
    ["thorough", "pr-review-thorough"],
    ["tested", "pr-review-tested"],
    ["browser", "pr-review-browser"],
  ] as const)(
    "level %s starts the %s workflow with a per-phase brief",
    async (level, workflowId) => {
      await service.start({
        projectId: "acme",
        repo: "acme/app",
        number: 7,
        title: "Fix it",
        level,
      });
      const [input, , trustedProjectId, target, background] = createTask.mock.calls[0] ?? [];
      expect(trustedProjectId).toBe("acme");
      expect(target).toMatchObject({ kind: "workflow", id: workflowId });
      expect(background).toBe(false);
      expect(input.title).toBe(
        level === "quick"
          ? "Code review: acme/app#7 Fix it"
          : `Code review (${level}): acme/app#7 Fix it`,
      );
      expect(input.text).toContain("gh pr checkout 7 --repo acme/app --detach");
      expect(input.text).toContain("## Phase `aggregate`");
      expect(input.text).toContain("## Phase `comment`");
      expect(input.text).toContain("context/input.md");
      expect(input.text).toMatch(/Do NOT post anything to GitHub/);
      expect(input.text).toContain('PR title: "Fix it"');
      expect((await storage.get("task_r1")).prReview?.state).toBe("running");
    },
  );

  it("level browser briefs the browser phase and saves screenshots to the run", async () => {
    await service.start({ projectId: "acme", repo: "acme/app", number: 7, level: "browser" });
    const [input] = createTask.mock.calls[0] ?? [];
    expect(input.text).toContain("## Phase `browser`");
    expect(input.text).toContain("$ZIBBY_RUN_DIR/screenshots/");
  });

  it("asks every reviewing phase for findings sorted Critical → Important → Minor", () => {
    const text = reviewTaskText("acme/app", 7, "https://github.com/acme/app/pull/7", "Fix it");
    expect(text).toContain(
      "List findings sorted by severity, most critical first, each labelled `Critical`, `Important` or `Minor`",
    );
    expect(text).toContain("Keep every verified finding, in severity order");
    expect(text).toContain("`### <path>:<line> (<Critical|Important|Minor>)`");
  });

  it("start refuses an unknown project, a missing link and a foreign repo", async () => {
    await expect(service.start({ projectId: "nope", repo: "acme/app", number: 1 })).rejects.toThrow(
      ProjectNotFoundError,
    );
    await expect(service.start({ projectId: "acme", repo: "evil/app", number: 1 })).rejects.toThrow(
      ReviewRepoMismatchError,
    );
    integrations = [];
    await expect(service.start({ projectId: "acme", repo: "acme/app", number: 1 })).rejects.toThrow(
      NoGithubLinkError,
    );
    expect(createTask).not.toHaveBeenCalled();
  });

  async function parked(): Promise<void> {
    await service.start({ projectId: "acme", repo: "acme/app", number: 7 });
    fetchImpl.mockClear(); // drop start's PR head read
    await storage.setPrReview("task_r1", (c) =>
      c ? { ...c, state: "awaiting-approval", body: "LGTM-ish", approvalId: "a1" } : c,
    );
  }

  it("approve posts the body as a COMMENT review with the project token", async () => {
    await parked();
    await service.post("task_r1");
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://api.github.com/repos/acme/app/pulls/7/reviews",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ body: "LGTM-ish", event: "COMMENT" }),
        headers: expect.objectContaining({ authorization: "Bearer tok" }),
      }),
    );
    expect((await storage.get("task_r1")).prReview).toMatchObject({
      state: "posted",
      finishedAt: expect.any(String),
    });
    expect(dropPrsCache).toHaveBeenCalledOnce();
  });

  it("todo-10: posts the operator-picked event; the runner passes it from the approval", async () => {
    await parked();
    await service.post("task_r1", "REQUEST_CHANGES");
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://api.github.com/repos/acme/app/pulls/7/reviews",
      expect.objectContaining({
        body: JSON.stringify({ body: "LGTM-ish", event: "REQUEST_CHANGES" }),
      }),
    );
  });

  it("a GitHub failure marks the review failed and throws", async () => {
    await parked();
    fetchImpl.mockResolvedValueOnce(new Response("{}", { status: 422 }));
    await expect(service.post("task_r1", "APPROVE")).rejects.toThrow(/HTTP 422/);
    expect((await storage.get("task_r1")).prReview).toMatchObject({ state: "failed" });
  });

  it("todo-10: a GitHub rejection's reason lands in the review note", async () => {
    await parked();
    fetchImpl.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          message: "Unprocessable Entity",
          errors: ["Can not approve your own pull request"],
        }),
        { status: 422 },
      ),
    );
    await expect(service.post("task_r1", "APPROVE")).rejects.toThrow(/HTTP 422/);
    const note = (await storage.get("task_r1")).prReview?.note;
    expect(note).toContain("Unprocessable Entity");
    expect(note).toContain("Can not approve your own pull request");
  });

  async function parkBody(body: string): Promise<void> {
    await service.start({ projectId: "acme", repo: "acme/app", number: 7 });
    fetchImpl.mockClear(); // drop start's PR head read
    await storage.setPrReview("task_r1", (c) =>
      c ? { ...c, state: "awaiting-approval", body, approvalId: "a1" } : c,
    );
  }
  const sentBody = (call = 0): Record<string, unknown> =>
    JSON.parse((fetchImpl.mock.calls[call]?.[1] as { body: string }).body);

  it("todo-22: findings go inline, the summary is the review body", async () => {
    await parkBody("Sum.\n\n### src/a.ts:42 (Important)\nCan we drop this?");
    await service.post("task_r1");
    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(sentBody()).toEqual({
      body: "Sum.",
      event: "COMMENT",
      comments: [{ path: "src/a.ts", line: 42, side: "RIGHT", body: "Can we drop this?" }],
    });
    expect((await storage.get("task_r1")).prReview?.state).toBe("posted");
  });

  it("todo-22: a range block sets start_line/start_side", async () => {
    await parkBody("Sum.\n\n### a.ts:2-4 (Minor)\nNit.");
    await service.post("task_r1");
    expect(sentBody().comments).toEqual([
      { path: "a.ts", start_line: 2, start_side: "RIGHT", line: 4, side: "RIGHT", body: "Nit." },
    ]);
  });

  it("todo-22: a rejected inline review is re-posted once as one body, with a note", async () => {
    await parkBody("Sum.\n\n### src/a.ts:42 (Important)\nCan we drop this?");
    fetchImpl.mockResolvedValueOnce(new Response("{}", { status: 422 }));
    await service.post("task_r1");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const second = sentBody(1);
    expect(second).toEqual({
      body: "Sum.\n\n`src/a.ts:42` Can we drop this?",
      event: "COMMENT",
    });
    expect(second).not.toHaveProperty("comments");
    const review = (await storage.get("task_r1")).prReview;
    expect(review?.state).toBe("posted");
    expect(review?.note).toMatch(/inline comments rejected/);
  });

  it("todo-22: both attempts rejected → failed and throws", async () => {
    await parkBody("Sum.\n\n### src/a.ts:42 (Important)\nCan we drop this?");
    fetchImpl
      .mockResolvedValueOnce(new Response("{}", { status: 422 }))
      .mockResolvedValueOnce(new Response("{}", { status: 422 }));
    await expect(service.post("task_r1")).rejects.toThrow(/HTTP 422/);
    expect((await storage.get("task_r1")).prReview?.state).toBe("failed");
  });

  it("todo-22: a body without blocks sends no comments key", async () => {
    await parkBody("Just a summary.");
    await service.post("task_r1");
    expect(sentBody()).toEqual({ body: "Just a summary.", event: "COMMENT" });
  });

  it("todo-22: start pins the PR head sha; post sends it as commit_id, also on the fold retry", async () => {
    const sha = "a".repeat(40);
    fetchImpl.mockResolvedValueOnce(
      new Response(JSON.stringify({ head: { sha } }), { status: 200 }),
    );
    await service.start({ projectId: "acme", repo: "acme/app", number: 7 });
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://api.github.com/repos/acme/app/pulls/7",
      expect.objectContaining({
        headers: expect.objectContaining({ authorization: "Bearer tok" }),
      }),
    );
    expect((await storage.get("task_r1")).prReview?.headSha).toBe(sha);
    const [input] = createTask.mock.calls[0] ?? [];
    expect(input.text).toContain(`git checkout --detach ${sha}`);
    expect(input.text).toContain("`aaaaaaa`");
    await storage.setPrReview("task_r1", (c) =>
      c
        ? {
            ...c,
            state: "awaiting-approval",
            body: "Sum.\n\n### a.ts:1 (Minor)\nx",
            approvalId: "a1",
          }
        : c,
    );
    fetchImpl.mockClear();
    fetchImpl.mockResolvedValueOnce(new Response("{}", { status: 422 }));
    await service.post("task_r1");
    expect(sentBody(0).commit_id).toBe(sha);
    expect(sentBody(1).commit_id).toBe(sha);
  });

  it("todo-22: a failed PR head read starts the review without headSha", async () => {
    fetchImpl.mockResolvedValueOnce(new Response("{}", { status: 404 }));
    await service.start({ projectId: "acme", repo: "acme/app", number: 7 });
    expect((await storage.get("task_r1")).prReview).not.toHaveProperty("headSha");
    const [input] = createTask.mock.calls[0] ?? [];
    expect(input.text).not.toContain("git checkout --detach");
    fetchImpl.mockClear();
    await storage.setPrReview("task_r1", (c) =>
      c ? { ...c, state: "awaiting-approval", body: "Sum.", approvalId: "a1" } : c,
    );
    await service.post("task_r1");
    expect(sentBody()).not.toHaveProperty("commit_id");
  });

  it("approve with nothing parked posts nothing; reject discards", async () => {
    await service.start({ projectId: "acme", repo: "acme/app", number: 7 });
    fetchImpl.mockClear();
    await service.post("task_r1");
    expect(fetchImpl).not.toHaveBeenCalled();
    await service.discard("task_r1");
    expect((await storage.get("task_r1")).prReview?.state).toBe("discarded");
  });
});
