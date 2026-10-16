import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Integration, Project } from "@zibby/contracts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NoGithubLinkError, ProjectNotFoundError } from "../projects/projects.errors";
import { ScheduledTasksStorageService } from "../tasks/scheduled-tasks.storage.service";
import { InboxReviewService, ReviewRepoMismatchError } from "./inbox-review.service";

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

  it("start creates a task with the explicit code-reviewer target + trustedProjectId", async () => {
    const result = await service.start({
      projectId: "acme",
      repo: "Acme/App",
      number: 7,
      title: "Fix it",
    });
    expect(result).toEqual({ taskId: "task_r1" });
    const [input, , trustedProjectId, target, background] = createTask.mock.calls[0] ?? [];
    expect(trustedProjectId).toBe("acme");
    expect(target).toMatchObject({ kind: "agent", id: "code-reviewer" });
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
    expect((await storage.get("task_r1")).prReview?.state).toBe("posted");
    expect(dropPrsCache).toHaveBeenCalledOnce();
  });

  it("a GitHub failure marks the review failed and throws", async () => {
    await parked();
    fetchImpl.mockResolvedValueOnce(new Response("{}", { status: 422 }));
    await expect(service.post("task_r1")).rejects.toThrow(/HTTP 422/);
    expect((await storage.get("task_r1")).prReview).toMatchObject({ state: "failed" });
  });

  it("approve with nothing parked posts nothing; reject discards", async () => {
    await service.start({ projectId: "acme", repo: "acme/app", number: 7 });
    await service.post("task_r1");
    expect(fetchImpl).not.toHaveBeenCalled();
    await service.discard("task_r1");
    expect((await storage.get("task_r1")).prReview?.state).toBe("discarded");
  });
});
