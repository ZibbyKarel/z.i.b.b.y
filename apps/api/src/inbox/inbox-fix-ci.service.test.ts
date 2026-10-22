import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Integration, Project } from "@zibby/contracts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProjectNotFoundError } from "../projects/projects.errors";
import { ScheduledTasksStorageService } from "../tasks/scheduled-tasks.storage.service";
import { InboxFixCiService } from "./inbox-fix-ci.service";
import { PrRefusedError } from "./inbox-rebase.service";
import { ReviewRepoMismatchError } from "./inbox-review.service";

const PROJECT: Project = { id: "acme", name: "Acme", path: "~/acme" };
const GITHUB = {
  id: "gh",
  config: { kind: "github", repo: "acme/app", username: "Me" },
} as unknown as Integration;

describe("InboxFixCiService", () => {
  let dir: string;
  let storage: ScheduledTasksStorageService;
  let createTask: ReturnType<typeof vi.fn>;
  let pull: Record<string, unknown>;
  let service: InboxFixCiService;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(tmpdir(), "zibby-inbox-fix-ci-"));
    storage = new ScheduledTasksStorageService(path.join(dir, "tasks"));
    await storage.onModuleInit();
    pull = {
      state: "open",
      user: { login: "me" },
      head: { ref: "feat", sha: "sha1", repo: { full_name: "acme/app" } },
      base: { ref: "main", repo: { full_name: "acme/app", default_branch: "main" } },
    };
    const target = { kind: "workflow", id: "pr-fix-ci", name: "pr-fix-ci" } as const;
    createTask = vi.fn(async (input: { text: string }, _now: number, projectId: string) => ({
      outcome: "dispatched",
      runRef: "run_1",
      target,
      task: await storage.createDispatched(
        `task_c${createTask.mock.calls.length}`,
        input,
        "run_1",
        target,
        Date.now(),
        projectId,
      ),
    }));
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify(pull), { status: 200 }));
    service = new InboxFixCiService(
      {
        get: async (id: string) => {
          if (id !== PROJECT.id) throw new ProjectNotFoundError(id);
          return PROJECT;
        },
      } as never,
      { resolveIntegrations: async () => [GITHUB] } as never,
      { read: async () => ({ token: "tok" }) } as never,
      { createTask } as never,
      storage,
      {} as never,
      {} as never,
      {} as never,
      undefined,
      fetchImpl as unknown as typeof fetch,
    );
  });

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
  });

  const start = () =>
    service.start({ projectId: "acme", repo: "Acme/App", number: 7, title: "Fix it" });

  it("start creates a pr-fix-ci task and stamps the GitHub refs", async () => {
    expect(await start()).toEqual({ taskId: "task_c1" });
    const [input, , projectId, target, background] = createTask.mock.calls[0] ?? [];
    expect(projectId).toBe("acme");
    expect(target).toMatchObject({ kind: "workflow", id: "pr-fix-ci" });
    expect(background).toBe(false);
    expect(input.title).toBe("Fix CI: acme/app#7 Fix it");
    expect((await storage.get("task_c1")).prFixCi).toEqual({
      repo: "acme/app",
      number: 7,
      url: "https://github.com/acme/app/pull/7",
      head: "feat",
      base: "main",
      headSha: "sha1",
      ownPr: true,
      state: "running",
    });
  });

  it("a colleague's PR is stamped ownPr false", async () => {
    pull.user = { login: "alice" };
    await start();
    expect((await storage.get("task_c1")).prFixCi?.ownPr).toBe(false);
  });

  it("refuses while a fix-ci run of the PR is in flight; a dead running one does not block", async () => {
    await start();
    await expect(start()).rejects.toThrow(/fixing CI on acme\/app#7 is already running/);
    expect(createTask).toHaveBeenCalledOnce();
    await storage.writeOutcome("task_c1", {
      status: "error",
      summary: "boom",
      finishedAt: new Date().toISOString(),
    });
    await start();
    expect(createTask).toHaveBeenCalledTimes(2);
  });

  it("refuses a fork head and a foreign repo", async () => {
    Object.assign(pull, { head: { ref: "feat", sha: "sha1", repo: { full_name: "evil/app" } } });
    await expect(start()).rejects.toThrow(PrRefusedError);
    await expect(
      service.start({ projectId: "acme", repo: "other/app", number: 7 }),
    ).rejects.toThrow(ReviewRepoMismatchError);
    await expect(service.start({ projectId: "nope", repo: "acme/app", number: 7 })).rejects.toThrow(
      ProjectNotFoundError,
    );
    expect(createTask).not.toHaveBeenCalled();
  });

  it("the brief checks out the clicked sha, reads failing checks via gh and never pushes", async () => {
    await start();
    const text = createTask.mock.calls[0]?.[0].text as string;
    expect(text).toContain("git checkout -B zibby-fix sha1");
    expect(text).toContain("gh pr checks 7 --repo acme/app");
    expect(text).toContain("--log-failed");
    expect(text).toContain("Fixed: all");
    expect(text).toContain("Fixed: not code");
    expect(text).toContain("Never weaken a check");
    expect(text).toContain("Do NOT push");
    expect(text).toContain("gh run rerun");
    expect(text).toContain(JSON.stringify("Fix it"));
  });
});
