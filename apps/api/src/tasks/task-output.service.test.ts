import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { AgentRun, ScheduledTask, TaskOutput, Workspace } from "@zibby/contracts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DuplicateNoteError } from "../memory/vault.service";
import { ScheduledTasksStorageService } from "./scheduled-tasks.storage.service";
import { PR_REVIEW_ARTIFACT, TaskOutputService, suggestReviewEvent } from "./task-output.service";

/**
 * The directed-task output gate: an agent/orchestrator task's `file`/`pr` sink. The
 * workflow route reuses the workflow runner's own gate (covered there); this is the
 * scheduler-layer counterpart for runs that have no durable park of their own.
 */
describe("TaskOutputService", () => {
  let dir: string;
  let storage: ScheduledTasksStorageService;
  let workspace: {
    checkpoint: ReturnType<typeof vi.fn>;
    commitLog: ReturnType<typeof vi.fn>;
    diffstat: ReturnType<typeof vi.fn>;
    diffStats: ReturnType<typeof vi.fn>;
    openPr: ReturnType<typeof vi.fn>;
  };
  let vault: { createNote: ReturnType<typeof vi.fn>; updateNote: ReturnType<typeof vi.fn> };
  let approvals: {
    register: ReturnType<typeof vi.fn>;
    requestApproval: ReturnType<typeof vi.fn>;
    approve: ReturnType<typeof vi.fn>;
  };
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
      diffStats: vi.fn(async () => ({ additions: 2, deletions: 0 })),
      openPr: vi.fn(async () => ({ url: "https://example/pr/1" })),
    };
    vault = { createNote: vi.fn(async () => ({})), updateNote: vi.fn(async () => ({})) };
    approvals = {
      register: vi.fn(),
      requestApproval: vi.fn(async () => ({ id: "appr_1" })),
      approve: vi.fn(async () => ({})),
    };
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
    } as unknown as AgentRun;
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
    expect(await service.handleTerminal(inherit, run("/wt"), "done")).toBeNull();

    const voided = await seed({ type: "void" });
    expect(await service.handleTerminal(voided, run("/wt"), "done")).toBeNull();
    expect(approvals.requestApproval).not.toHaveBeenCalled();
    expect(vault.createNote).not.toHaveBeenCalled();
  });

  it("file → vault writes a knowledge note (and updates on duplicate)", async () => {
    const task = await seed({ type: "file", dest: "vault", to: "reports/x.md" });
    const delivered = await service.handleTerminal(task, run("/wt"), "the summary");
    expect(delivered).toBeNull(); // Tier-1, delivered inline, no augmented outcome
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
    const delivered = await service.handleTerminal(task, run(wt), "summary body");
    expect(delivered).toBeNull();
    const written = await fs.readFile(path.join(wt, "out/result.md"), "utf8");
    expect(written).toContain("summary body");
  });

  it("pr opens the PR immediately after committing the branch (Tier-2, no gate)", async () => {
    const task = await seed({ type: "pr" });
    const delivery = await service.handleTerminal(task, run("/wt"), "did the work");
    expect(workspace.checkpoint).toHaveBeenCalled(); // system-owned commit (commit ≠ push)
    expect(workspace.openPr).toHaveBeenCalledWith({
      cwd: "/repo", // pushed from the repo dir, not the worktree
      branch: "zibby/run-1-writer",
      title: "did the work",
      body: "did the work",
      draft: false, // NS2 F0b — no prOpenMode on the seeded project → ready (default)
    });
    expect(approvals.requestApproval).not.toHaveBeenCalled(); // no gate anymore
    expect(delivery).toMatchObject({
      summary: "PR otevřen: https://example/pr/1",
      pr: { url: "https://example/pr/1", additions: 2, deletions: 0 },
    });
    const stored = await storage.get("task_1");
    expect(stored.status).toBe("dispatched"); // never parks at awaiting-output
  });

  it("pr threads the project's prOpenMode: draft into openPr (NS2 F0b)", async () => {
    projects.get.mockResolvedValueOnce({
      id: "p1",
      name: "Repo",
      path: "/repo",
      prOpenMode: "draft",
    });
    const task = await seed({ type: "pr" });
    await service.handleTerminal(task, run("/wt"), "did the work");
    expect(workspace.openPr).toHaveBeenCalledWith(
      expect.objectContaining({ cwd: "/repo", draft: true }),
    );
  });

  it("pr push failure is soft — a note-only delivery, no structured pr", async () => {
    workspace.openPr.mockResolvedValueOnce(null);
    const task = await seed({ type: "pr" });
    const delivery = await service.handleTerminal(task, run("/wt"), "did the work");
    expect(delivery?.pr).toBeUndefined();
    expect(delivery?.summary).toContain("selhal");
  });

  it("pr is a soft no-op when the branch has no commits", async () => {
    workspace.commitLog.mockResolvedValueOnce("");
    const task = await seed({ type: "pr" });
    const delivery = await service.handleTerminal(task, run("/wt"), "nothing committed");
    expect(delivery).toBeNull();
    expect(workspace.openPr).not.toHaveBeenCalled();
    expect((await storage.get("task_1")).status).toBe("dispatched");
  });

  it("pr is a soft no-op when the run has no worktree", async () => {
    const task = await seed({ type: "pr" });
    expect(await service.handleTerminal(task, run(null), "no worktree")).toBeNull();
    expect(workspace.openPr).not.toHaveBeenCalled();
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

  describe("suggestReviewEvent (todo-10)", () => {
    it.each([
      ["Critical: null deref at a.ts:3", "REQUEST_CHANGES"],
      ["Looks solid overall.\n\nMinor: rename x at b.ts:9", "REQUEST_CHANGES"],
      ["- **Important:** missing await at c.ts:1", "REQUEST_CHANGES"],
      ["**Critical**: leaks the token", "REQUEST_CHANGES"],
      ["No findings — looks good to merge.", "APPROVE"],
      ["No critical issues found.", "APPROVE"],
      ["Uses the Minor: label convention mid-line only.", "APPROVE"],
      ["", "APPROVE"],
    ])("%j → %s", (body, expected) => {
      expect(suggestReviewEvent(body)).toBe(expected);
    });
  });

  describe("pr review (Phase 129 P2)", () => {
    async function seedReview(): Promise<ScheduledTask> {
      const task = await storage.createDispatched(
        "t_review",
        { text: "review it" },
        "run_1",
        { kind: "agent", id: "code-reviewer", name: "code-reviewer" },
        Date.now(),
        "p1",
      );
      return storage.setPrReview(task.id, () => ({
        repo: "acme/app",
        number: 7,
        url: "https://github.com/acme/app/pull/7",
        state: "running",
      }));
    }
    const runIn = (cwd: string) => ({ ...run(null), cwd }) as AgentRun;

    it("parkPrReview parks raw text handed in by a caller (the workflow path)", async () => {
      const task = await seedReview();
      const delivered = await service.parkPrReview(task, "\n## Review\n\nnull deref at b.ts:9\n");
      expect(delivered.summary).toMatch(/acme\/app#7/);
      expect(approvals.requestApproval).toHaveBeenCalledWith(
        expect.objectContaining({ runId: "t_review", kind: "pr-review" }),
      );
      expect((await storage.get("t_review")).prReview).toMatchObject({
        state: "awaiting-approval",
        body: "## Review\n\nnull deref at b.ts:9",
      });
    });

    it("parkPrReview signed off at the workflow gate approves (posts) it right away", async () => {
      const task = await seedReview();
      const delivered = await service.parkPrReview(task, "bug at a.ts:3", "comment");
      expect(approvals.requestApproval).toHaveBeenCalledWith(
        expect.objectContaining({
          kind: "pr-review",
          detail: expect.stringContaining('approved at workflow gate "comment"'),
        }),
      );
      expect(approvals.approve).toHaveBeenCalledWith("appr_1", {});
      expect(delivered.summary).toMatch(/odesláno/);
    });

    it("parkPrReview stamps the suggested review event on the approval (todo-10)", async () => {
      const task = await seedReview();
      await service.parkPrReview(task, "Critical: bug at a.ts:3");
      expect(approvals.requestApproval).toHaveBeenCalledWith(
        expect.objectContaining({ kind: "pr-review", suggestedReviewEvent: "REQUEST_CHANGES" }),
      );
    });

    it("parkPrReview signed off at the gate posts with the operator's gate pick (todo-10)", async () => {
      const task = await seedReview();
      await service.parkPrReview(task, "bug at a.ts:3", "comment", "APPROVE");
      expect(approvals.requestApproval).toHaveBeenCalledWith(
        expect.objectContaining({ detail: expect.stringContaining("(APPROVE)") }),
      );
      expect(approvals.approve).toHaveBeenCalledWith("appr_1", { reviewEvent: "APPROVE" });
    });

    it("parkPrReview without a gate sign-off leaves the approval pending", async () => {
      const task = await seedReview();
      await service.parkPrReview(task, "bug at a.ts:3");
      expect(approvals.approve).not.toHaveBeenCalled();
    });

    it("parkPrReview with blank text parks nothing and fails the review", async () => {
      const task = await seedReview();
      const delivered = await service.parkPrReview(task, "  \n");
      expect(delivered.summary).toMatch(PR_REVIEW_ARTIFACT);
      expect(approvals.requestApproval).not.toHaveBeenCalled();
      expect((await storage.get("t_review")).prReview?.state).toBe("failed");
    });

    it("parks the review artifact as a pr-review approval", async () => {
      const task = await seedReview();
      const cwd = path.join(dir, "wt");
      await fs.mkdir(cwd, { recursive: true });
      await fs.writeFile(path.join(cwd, PR_REVIEW_ARTIFACT), "## Review\n\nLooks off at a.ts:3\n");
      const delivered = await service.handleTerminal(task, runIn(cwd), "done");
      expect(delivered?.summary).toMatch(/acme\/app#7/);
      expect(approvals.requestApproval).toHaveBeenCalledWith(
        expect.objectContaining({
          runId: "t_review",
          kind: "pr-review",
          sourceUrl: "https://github.com/acme/app/pull/7",
          detail: expect.stringContaining("Looks off at a.ts:3"),
        }),
      );
      expect((await storage.get("t_review")).prReview).toMatchObject({
        state: "awaiting-approval",
        approvalId: "appr_1",
        body: "## Review\n\nLooks off at a.ts:3",
      });
    });

    it("no artifact → no approval, review failed", async () => {
      const task = await seedReview();
      const delivered = await service.handleTerminal(task, runIn(path.join(dir, "empty")), "x");
      expect(delivered?.summary).toMatch(PR_REVIEW_ARTIFACT);
      expect(approvals.requestApproval).not.toHaveBeenCalled();
      expect((await storage.get("t_review")).prReview?.state).toBe("failed");
    });
  });
});
