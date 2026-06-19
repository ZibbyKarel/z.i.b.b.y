import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { AgentRun, ScheduledTask, TaskOutput, Workspace } from "@zibby/contracts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DuplicateNoteError } from "../memory/vault.service";
import { ScheduledTasksStorageService } from "./scheduled-tasks.storage.service";
import { TaskOutputService } from "./task-output.service";

/**
 * The directed-task output gate: an agent/orchestrator task's `file`/`pr` sink. The
 * pipeline route reuses the pipeline runner's own gate (covered there); this is the
 * scheduler-layer counterpart for runs that have no durable park of their own.
 */
describe("TaskOutputService", () => {
  let dir: string;
  let storage: ScheduledTasksStorageService;
  let workspace: {
    checkpoint: ReturnType<typeof vi.fn>;
    commitLog: ReturnType<typeof vi.fn>;
    diffstat: ReturnType<typeof vi.fn>;
    openPr: ReturnType<typeof vi.fn>;
  };
  let vault: { createNote: ReturnType<typeof vi.fn>; updateNote: ReturnType<typeof vi.fn> };
  let approvals: { register: ReturnType<typeof vi.fn>; requestApproval: ReturnType<typeof vi.fn> };
  let projects: { get: ReturnType<typeof vi.fn> };
  let service: TaskOutputService;

  const fakeLogger = {
    child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
  };

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(tmpdir(), "zibby-task-output-"));
    storage = new ScheduledTasksStorageService(path.join(dir, "tasks"));
    await storage.onModuleInit();
    workspace = {
      checkpoint: vi.fn(async () => ({ sha: "abc1234" })),
      commitLog: vi.fn(async () => "abc1234 do the work"),
      diffstat: vi.fn(async () => "1 file changed, 2 insertions(+)"),
      openPr: vi.fn(async () => ({ url: "https://example/pr/1" })),
    };
    vault = { createNote: vi.fn(async () => ({})), updateNote: vi.fn(async () => ({})) };
    approvals = { register: vi.fn(), requestApproval: vi.fn(async () => ({ id: "appr_1" })) };
    projects = { get: vi.fn(async () => ({ id: "p1", name: "Repo", path: "/repo" })) };

    service = new TaskOutputService(
      storage,
      workspace as never,
      vault as never,
      approvals as never,
      projects as never,
      { record: vi.fn() } as never,
      fakeLogger as never,
    );
    service.onModuleInit();
  });

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
  });

  const WS: Workspace = { branch: "zibby/run-1-writer", path: "", baseRef: "HEAD" };

  function run(workspacePath: string | null): AgentRun {
    return {
      runId: "run_1",
      kind: undefined as never,
      agentId: "writer",
      title: "",
      prompt: "",
      project: "",
      files: [],
      status: "done",
      startedAt: new Date().toISOString(),
      ...(workspacePath !== null ? { workspace: { ...WS, path: workspacePath } } : {}),
    } as AgentRun;
  }

  async function seed(output: TaskOutput, projectId = "p1"): Promise<ScheduledTask> {
    return storage.createDispatched(
      "task_1",
      { text: "do it", output },
      "run_1",
      { kind: "agent", id: "writer", name: "Writer" },
      Date.now(),
      projectId,
    );
  }

  it("registers the task-output approval runner on init", () => {
    expect(approvals.register).toHaveBeenCalledWith("task-output", expect.anything());
  });

  it("inherit (no output) and void never run a sink", async () => {
    const inherit = await storage.createDispatched(
      "t_inherit",
      { text: "x" },
      "run_1",
      { kind: "agent", id: "writer", name: "Writer" },
      Date.now(),
    );
    expect(await service.handleTerminal(inherit, run("/wt"), "done")).toBe(false);

    const voided = await seed({ type: "void" });
    expect(await service.handleTerminal(voided, run("/wt"), "done")).toBe(false);
    expect(approvals.requestApproval).not.toHaveBeenCalled();
    expect(vault.createNote).not.toHaveBeenCalled();
  });

  it("file → vault writes a knowledge note (and updates on duplicate)", async () => {
    const task = await seed({ type: "file", dest: "vault", to: "reports/x.md" });
    const parked = await service.handleTerminal(task, run("/wt"), "the summary");
    expect(parked).toBe(false); // Tier-1, no gate
    expect(vault.createNote).toHaveBeenCalledWith(
      expect.objectContaining({ id: "reports/x.md", tier: "knowledge" }),
    );

    vault.createNote.mockRejectedValueOnce(new DuplicateNoteError("reports/x.md"));
    await service.handleTerminal(task, run("/wt"), "the summary");
    expect(vault.updateNote).toHaveBeenCalledWith(
      "reports/x.md",
      expect.objectContaining({ body: expect.any(String) }),
    );
  });

  it("file → project writes into the run worktree", async () => {
    const wt = path.join(dir, "wt");
    await fs.mkdir(wt, { recursive: true });
    const task = await seed({ type: "file", dest: "project", to: "out/result.md" });
    const parked = await service.handleTerminal(task, run(wt), "summary body");
    expect(parked).toBe(false);
    const written = await fs.readFile(path.join(wt, "out/result.md"), "utf8");
    expect(written).toContain("summary body");
  });

  it("pr parks behind a task-output approval after committing the branch", async () => {
    const task = await seed({ type: "pr" });
    const parked = await service.handleTerminal(task, run("/wt"), "did the work");
    expect(parked).toBe(true);
    expect(workspace.checkpoint).toHaveBeenCalled(); // system-owned commit (commit ≠ push)
    expect(workspace.openPr).not.toHaveBeenCalled(); // never before approval
    expect(approvals.requestApproval).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "task-output",
        runId: "task_1",
        action: "pr.open",
        risk: "medium",
      }),
    );
    const stored = await storage.get("task_1");
    expect(stored.status).toBe("awaiting-output");
    expect(stored.pendingOutput).toMatchObject({
      branch: "zibby/run-1-writer",
      repoPath: "/repo",
      approvalId: "appr_1",
    });
    expect(stored.outcome).toBeUndefined(); // outcome withheld until the gate resolves
  });

  it("pr is a soft no-op when the branch has no commits", async () => {
    workspace.commitLog.mockResolvedValueOnce("");
    const task = await seed({ type: "pr" });
    const parked = await service.handleTerminal(task, run("/wt"), "nothing committed");
    expect(parked).toBe(false);
    expect(approvals.requestApproval).not.toHaveBeenCalled();
    expect((await storage.get("task_1")).status).toBe("dispatched");
  });

  it("pr is a soft no-op when the run has no worktree", async () => {
    const task = await seed({ type: "pr" });
    expect(await service.handleTerminal(task, run(null), "no worktree")).toBe(false);
    expect(approvals.requestApproval).not.toHaveBeenCalled();
  });

  it("resolve(approved) opens the PR from the repo + branch, then finishes done", async () => {
    await seed({ type: "pr" });
    await storage.markAwaitingOutput("task_1", {
      branch: "zibby/run-1-writer",
      repoPath: "/repo",
      approvalId: "appr_1",
      title: "Ship it",
      body: "body text",
    });
    await service.resolve("task_1", "approved");
    expect(workspace.openPr).toHaveBeenCalledWith({
      cwd: "/repo",
      branch: "zibby/run-1-writer",
      title: "Ship it",
      body: "body text",
    });
    const stored = await storage.get("task_1");
    expect(stored.status).toBe("dispatched");
    expect(stored.pendingOutput).toBeUndefined();
    expect(stored.outcome?.status).toBe("done");
    expect(stored.outcome?.summary).toContain("https://example/pr/1");
  });

  it("resolve(rejected) leaves the branch without a PR but still finishes done", async () => {
    await seed({ type: "pr" });
    await storage.markAwaitingOutput("task_1", {
      branch: "zibby/run-1-writer",
      repoPath: "/repo",
      approvalId: "appr_1",
      title: "Ship it",
      body: "body text",
    });
    await service.resolve("task_1", "rejected");
    expect(workspace.openPr).not.toHaveBeenCalled();
    const stored = await storage.get("task_1");
    expect(stored.status).toBe("dispatched");
    expect(stored.outcome?.status).toBe("done");
  });

  it("resolve is a no-op for a task not awaiting output", async () => {
    await seed({ type: "pr" }); // status dispatched, not awaiting-output
    await service.resolve("task_1", "approved");
    expect(workspace.openPr).not.toHaveBeenCalled();
  });
});
