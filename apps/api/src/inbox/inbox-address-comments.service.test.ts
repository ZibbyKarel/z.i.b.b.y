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
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify(pull), { status: 200 }));
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
});
