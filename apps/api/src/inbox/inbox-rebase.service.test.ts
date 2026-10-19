import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Integration, Project } from "@zibby/contracts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NoGithubLinkError, ProjectNotFoundError } from "../projects/projects.errors";
import { ScheduledTasksStorageService } from "../tasks/scheduled-tasks.storage.service";
import { InboxRebaseService, RebaseRefusedError } from "./inbox-rebase.service";
import { ReviewRepoMismatchError } from "./inbox-review.service";

const PROJECT: Project = { id: "acme", name: "Acme", path: "~/acme" };
const GITHUB = {
  id: "gh",
  config: { kind: "github", repo: "acme/app", username: "me" },
} as unknown as Integration;

describe("InboxRebaseService", () => {
  let dir: string;
  let storage: ScheduledTasksStorageService;
  let createTask: ReturnType<typeof vi.fn>;
  let register: ReturnType<typeof vi.fn>;
  let dropPrsCache: ReturnType<typeof vi.fn>;
  let pushRebased: ReturnType<typeof vi.fn>;
  let pull: Record<string, unknown>;
  let integrations: Integration[];
  let service: InboxRebaseService;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(tmpdir(), "zibby-inbox-rebase-"));
    storage = new ScheduledTasksStorageService(path.join(dir, "tasks"));
    await storage.onModuleInit();
    integrations = [GITHUB];
    pull = {
      state: "open",
      mergeable: true,
      head: { ref: "feat", sha: "sha1", repo: { full_name: "acme/app" } },
      base: { ref: "main", repo: { full_name: "acme/app", default_branch: "main" } },
    };
    const target = { kind: "workflow", id: "pr-rebase", name: "pr-rebase" } as const;
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
    pushRebased = vi.fn(async () => "newsha");
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify(pull), { status: 200 }));
    service = new InboxRebaseService(
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
      { pushRebased } as never,
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

  it("registers the pr-rebase approval runner", () => {
    expect(register).toHaveBeenCalledWith("pr-rebase", expect.anything());
  });

  it("start creates a pr-rebase workflow task and stamps the GitHub refs", async () => {
    expect(await start()).toEqual({ taskId: "task_b1" });
    const [input, , trustedProjectId, target, background] = createTask.mock.calls[0] ?? [];
    expect(trustedProjectId).toBe("acme");
    expect(target).toMatchObject({ kind: "workflow", id: "pr-rebase" });
    expect(background).toBe(false);
    expect(input.title).toBe("Rebase: acme/app#7 Fix it");
    expect(input.text).toContain("git checkout --detach sha1");
    expect(input.text).toContain("git rebase origin/main");
    expect(input.text).toContain("Conflicts: none");
    expect(input.text).toMatch(/Do NOT push/);
    expect(input.text).toContain('PR title: "Fix it"');
    expect((await storage.get("task_b1")).prRebase).toEqual({
      repo: "acme/app",
      number: 7,
      url: "https://github.com/acme/app/pull/7",
      head: "feat",
      base: "main",
      headSha: "sha1",
      conflictAtStart: false,
      state: "running",
    });
  });

  it("the brief's first-line rule matches the rebase-resolver report contract", async () => {
    await start();
    const text: string = createTask.mock.calls[0]?.[0].text ?? "";
    expect(text).toContain("`Conflicts: aborted` followed by the reason");
    expect(text).toContain("`Conflicts: none, checks failed`");
    expect(text).toMatch(/`Conflicts: none` ONLY for a complete, conflict-free rebase/);
  });

  it("refuses a second start while a rebase of the same PR is in flight (422)", async () => {
    await start();
    await expect(start()).rejects.toThrow(/already running/);
    await storage.setPrRebase("task_b1", (c) => (c ? { ...c, state: "awaiting-approval" } : c));
    await expect(start()).rejects.toThrow(RebaseRefusedError);
    expect(createTask).toHaveBeenCalledOnce();
    // Another PR is not blocked.
    await service.start({ projectId: "acme", repo: "acme/app", number: 8 });
    expect(createTask).toHaveBeenCalledTimes(2);
  });

  it.each([
    [
      "a finished rebase",
      async () =>
        storage.setPrRebase("task_b1", (c) => (c ? { ...c, state: "pushed" as const } : c)),
    ],
    ["a dead running one", async () => storage.markFailed("task_b1", "boom")],
  ])("allows a new start after %s", async (_name, settle) => {
    await start();
    await settle();
    expect(await start()).toEqual({ taskId: "task_b2" });
  });

  it.each([false, null])("mergeable %j at the click → conflictAtStart", async (mergeable) => {
    pull.mergeable = mergeable;
    await start();
    expect((await storage.get("task_b1")).prRebase?.conflictAtStart).toBe(true);
  });

  it.each([
    ["a fork head", { head: { ref: "feat", sha: "s", repo: { full_name: "evil/app" } } }, /fork/],
    ["a deleted head repo", { head: { ref: "feat", sha: "s", repo: null } }, /fork/],
    ["a closed PR", { state: "closed" }, /not an open PR/],
    [
      "a head that is the default branch",
      {
        head: { ref: "main", sha: "s", repo: { full_name: "acme/app" } },
        base: { ref: "release", repo: { full_name: "acme/app", default_branch: "main" } },
      },
      /base or default branch/,
    ],
  ])("refuses %s with a clear 422 reason", async (_name, over, reason) => {
    Object.assign(pull, over);
    await expect(start()).rejects.toThrow(RebaseRefusedError);
    await expect(start()).rejects.toThrow(reason);
    expect(createTask).not.toHaveBeenCalled();
  });

  it("refuses an unknown project, a foreign repo and a missing link", async () => {
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
  });

  async function parked(): Promise<void> {
    await start();
    await storage.setPrRebase("task_b1", (c) =>
      c
        ? {
            ...c,
            state: "awaiting-approval",
            report: "Conflicts: 1 files",
            worktree: "/wt",
            approvalId: "a1",
          }
        : c,
    );
  }

  it("approve pushes from the run's worktree with the clicked sha as lease", async () => {
    await parked();
    await service.push("task_b1");
    expect(pushRebased).toHaveBeenCalledWith({
      cwd: "/wt",
      head: "feat",
      base: "main",
      expectedSha: "sha1",
      allowRewrittenCommits: true,
    });
    expect((await storage.get("task_b1")).prRebase).toMatchObject({
      state: "pushed",
      note: "newsha",
    });
    expect(dropPrsCache).toHaveBeenCalledOnce();
  });

  it("approve passes the verified rebasedSha to pushRebased", async () => {
    await parked();
    await storage.setPrRebase("task_b1", (c) => (c ? { ...c, rebasedSha: "f".repeat(40) } : c));
    await service.push("task_b1");
    expect(pushRebased).toHaveBeenCalledWith(
      expect.objectContaining({ rebasedSha: "f".repeat(40) }),
    );
  });

  it("a refused push marks the rebase failed with git's reason and throws", async () => {
    await parked();
    pushRebased.mockRejectedValueOnce(new Error("stale info"));
    await expect(service.push("task_b1")).rejects.toThrow(/stale info/);
    expect((await storage.get("task_b1")).prRebase).toMatchObject({
      state: "failed",
      note: "stale info",
    });
  });

  it("a clean (on-the-spot) approval forbids rewritten commits", async () => {
    await start();
    await storage.setPrRebase("task_b1", (c) =>
      c
        ? {
            ...c,
            state: "awaiting-approval",
            report: "Conflicts: none\nok",
            worktree: "/wt",
            approvalId: "a1",
          }
        : c,
    );
    await service.push("task_b1");
    expect(pushRebased).toHaveBeenCalledWith(
      expect.objectContaining({ allowRewrittenCommits: false }),
    );
  });

  it("approve with nothing parked pushes nothing and leaves it running", async () => {
    await start();
    await service.push("task_b1");
    expect(pushRebased).not.toHaveBeenCalled();
    expect((await storage.get("task_b1")).prRebase?.state).toBe("running");
  });

  it("reject discards", async () => {
    await parked();
    await service.discard("task_b1");
    expect((await storage.get("task_b1")).prRebase?.state).toBe("discarded");
    expect(pushRebased).not.toHaveBeenCalled();
  });

  it("a second push after the claim does not push again nor overwrite pushed", async () => {
    await parked();
    let release: (sha: string) => void = () => undefined;
    pushRebased.mockImplementationOnce(() => new Promise<string>((r) => (release = r)));
    const first = service.push("task_b1");
    await vi.waitFor(() => expect(pushRebased).toHaveBeenCalledOnce());
    await service.push("task_b1"); // in flight: state is the claim, no-op
    release("newsha");
    await first;
    await service.push("task_b1"); // after pushed: no-op
    expect(pushRebased).toHaveBeenCalledOnce();
    expect((await storage.get("task_b1")).prRebase).toMatchObject({
      state: "pushed",
      note: "newsha",
    });
  });

  it.each(["running", "pushed", "discarded", "failed"] as const)(
    "a stray approve on a %s rebase leaves it untouched",
    async (state) => {
      await start();
      await storage.setPrRebase("task_b1", (c) => (c ? { ...c, state, worktree: "/wt" } : c));
      await service.push("task_b1");
      expect(pushRebased).not.toHaveBeenCalled();
      expect((await storage.get("task_b1")).prRebase?.state).toBe(state);
    },
  );

  it.each(["running", "pushed", "failed"] as const)(
    "reject on a %s rebase is a no-op",
    async (state) => {
      await start();
      await storage.setPrRebase("task_b1", (c) => (c ? { ...c, state } : c));
      await service.discard("task_b1");
      expect((await storage.get("task_b1")).prRebase?.state).toBe(state);
    },
  );

  it.each([
    ["head", { head: { ref: "--upload-pack=x", sha: "s", repo: { full_name: "acme/app" } } }],
    ["head", { head: { ref: "fe at", sha: "s", repo: { full_name: "acme/app" } } }],
    ["base", { base: { ref: "-x", repo: { full_name: "acme/app", default_branch: "main" } } }],
  ])("refuses an unsafe %s branch name", async (_n, over) => {
    Object.assign(pull, over);
    await expect(start()).rejects.toThrow(RebaseRefusedError);
    expect(createTask).not.toHaveBeenCalled();
  });
});
