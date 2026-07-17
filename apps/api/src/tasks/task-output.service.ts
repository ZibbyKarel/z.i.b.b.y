import { promises as fs } from "node:fs";
import path from "node:path";
import { Injectable, type OnModuleInit } from "@nestjs/common";
import type { AgentRun, PrOutput, ScheduledTask, TaskOutput } from "@zibby/contracts";
import { ActivityLogService } from "../activity/activity-log.service";
import { ApprovalsService } from "../approvals/approvals.service";
import { DuplicateNoteError, VaultService } from "../memory/vault.service";
import { ProjectsStorageService } from "../projects/projects.storage.service";
import { LoggerService, type ScopedLogger } from "../shared/logging/logger.service";
import { WorkspaceService } from "../workspace/workspace.service";
import { ScheduledTasksStorageService } from "./scheduled-tasks.storage.service";

/**
 * What a terminal output sink delivered, folded into the task outcome by the caller: a
 * `summary` override (the PR note replaces the run's last log line) and/or the
 * structured `pr` result the run detail renders. `null` from {@link
 * TaskOutputService.handleTerminal} means nothing to fold — write the normal outcome.
 */
export interface TaskTerminalDelivery {
  summary?: string;
  pr?: PrOutput;
}

/**
 * The directed-task counterpart of the pipeline `outputs:` sink — what happens to an
 * agent/orchestrator task's finished work, when the operator chose a `pr` or `file`
 * output in the New Task dialog. Deterministic and system-owned (no agent, no tokens).
 *
 * `pr` output is Tier-2 (act-then-report): the PR is opened immediately when the run
 * finishes — no approval gate. The work is committed system-owned (`checkpoint` —
 * `git add -A && commit`, agent-independent), then pushed and `gh pr create`d from the
 * repo dir, and the url + branch line-totals land on the task outcome's `pr`. This is
 * the north-star's "open a PR for a fix" Tier-2 action, not the Tier-3 "PR je brána".
 *
 * The legacy `awaiting-output` gate resolution ({@link resolve}) is retained so any
 * task parked on disk from before this change still resolves; new PR outputs never
 * park.
 */
@Injectable()
export class TaskOutputService implements OnModuleInit {
  private readonly log: ScopedLogger;

  constructor(
    private readonly storage: ScheduledTasksStorageService,
    private readonly workspace: WorkspaceService,
    private readonly vault: VaultService,
    private readonly approvals: ApprovalsService,
    private readonly projects: ProjectsStorageService,
    private readonly activity: ActivityLogService,
    logger: LoggerService,
  ) {
    this.log = logger.child(TaskOutputService.name);
  }

  onModuleInit(): void {
    // Approving the `task-output` gate opens the PR; rejecting leaves the committed
    // branch without one. Either way the task's outcome is written on resolve (it was
    // deliberately withheld at park time). Registered here so the decision is never a
    // silent no-op (the Phase-5 channel-runner lesson).
    this.approvals.register("task-output", {
      resume: (taskId) => this.resolve(taskId, "approved"),
      cancel: (taskId) => void this.resolve(taskId, "rejected"),
    });
  }

  /**
   * Called when an agent/orchestrator task's run reaches terminal `done`. Runs the
   * chosen output sink and returns a {@link TaskTerminalDelivery} the caller folds into
   * the outcome it writes: a `summary` override (the PR note) and/or the structured
   * `pr` result. Returns `null` when there was nothing to deliver — no chosen output,
   * `void`, a `file` written inline, or a `pr` that degraded to a soft no-op — and the
   * caller writes the normal outcome. Never throws; a sink failure must not strand the
   * task's terminal write-back.
   */
  async handleTerminal(
    task: ScheduledTask,
    run: AgentRun,
    summary: string,
  ): Promise<TaskTerminalDelivery | null> {
    const output = task.output;
    // Absent = inherit (agent/orchestrator inherit "no terminal delivery"); `void` =
    // explicit suppression. Both fall through to the normal outcome write-back.
    if (!output || output.type === "void") return null;
    try {
      if (output.type === "file") {
        await this.deliverFile(task, run, output, summary);
        return null; // Tier-1, delivered inline; the normal outcome still follows
      }
      return await this.openPrNow(task, run, summary);
    } catch (error) {
      this.log.warn("task output sink failed (soft) — writing outcome as usual", {
        taskId: task.id,
        err: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /** Write the run summary to the chosen file — a vault note or a path in the worktree. */
  private async deliverFile(
    task: ScheduledTask,
    run: AgentRun,
    output: Extract<TaskOutput, { type: "file" }>,
    summary: string,
  ): Promise<void> {
    // A task carries no `from` artifact (unlike a pipeline handoff), so the content is
    // the run's summary — the most faithful thing available without an agent contract.
    const content = summary.trim() ? `${summary}\n` : "";
    if (output.dest === "vault") {
      await this.vault
        .createNote({ id: output.to, tier: "knowledge", body: content })
        .catch(async (error) => {
          if (error instanceof DuplicateNoteError) {
            await this.vault.updateNote(output.to, { body: content }).catch(() => {});
            return;
          }
          throw error;
        });
      this.log.info("task file output delivered to vault", { taskId: task.id, to: output.to });
      return;
    }
    // dest: project — write into the run's worktree (rides its zibby/* branch). No
    // worktree (non-git / projectless run) → nowhere safe to write; soft-skip.
    const base = run.workspace?.path;
    if (!base) {
      this.log.warn("project file output skipped — run has no worktree", {
        taskId: task.id,
        to: output.to,
      });
      return;
    }
    const dest = resolveInside(base, output.to);
    if (!dest) {
      this.log.warn("project file output skipped — path escapes the worktree", {
        taskId: task.id,
        to: output.to,
      });
      return;
    }
    await fs.mkdir(path.dirname(dest), { recursive: true });
    await fs.writeFile(dest, content, "utf8");
    this.log.info("task file output delivered to project", { taskId: task.id, to: output.to });
  }

  /**
   * Commit the run's branch and open the PR immediately (Tier-2 — no gate). Returns the
   * {@link TaskTerminalDelivery} (the PR note + structured `pr` result) on success, and
   * `null` when there is nothing to open a PR for (no worktree, or no commits on the
   * branch) — a soft no-op, not a crash. A failed push is also soft: the work is
   * committed on the branch and safe, so it returns a note-only delivery.
   */
  private async openPrNow(
    task: ScheduledTask,
    run: AgentRun,
    summary: string,
  ): Promise<TaskTerminalDelivery | null> {
    const ws = run.workspace;
    if (!ws) {
      this.log.warn("pr output skipped — run has no git worktree", { taskId: task.id });
      return null;
    }
    // System-owned commit of whatever the agent left uncommitted — so the PR is never
    // empty because a lone agent edited files without committing (commit ≠ push).
    await this.workspace.checkpoint({ worktreePath: ws.path, phaseId: "task-output", summary });
    const commits = await this.workspace.commitLog({ worktreePath: ws.path, baseRef: ws.baseRef });
    if (!commits.trim()) {
      this.log.info("pr output skipped — no commits on the branch to open a PR for", {
        taskId: task.id,
      });
      return null;
    }

    // Push from the repo dir (the branch ref outlives a reaped worktree). Prefer the
    // registered project's path; fall back to the worktree.
    const project = task.projectId
      ? await this.projects.get(task.projectId).catch(() => null)
      : null;
    const repoPath = project?.path ?? ws.path;

    const stats = await this.workspace.diffStats({ worktreePath: ws.path, baseRef: ws.baseRef });
    const title = (task.title?.trim() || firstLine(summary) || ws.branch).slice(0, 120);

    const result = await this.workspace.openPr({
      cwd: repoPath,
      branch: ws.branch,
      title,
      body: summary.trim(),
      // NS2 F0b — per-project draft PR mode; absent/`"ready"` keeps today's behavior.
      draft: project?.prOpenMode === "draft",
    });
    if (!result) {
      this.log.warn("pr output push failed (soft) — work is committed on the branch and safe", {
        taskId: task.id,
        branch: ws.branch,
      });
      return { summary: "PR push selhal (soft) — práce je commitnutá na branchi a bezpečná" };
    }
    this.log.info("task PR opened", { taskId: task.id, branch: ws.branch, url: result.url });
    return {
      summary: `PR otevřen: ${result.url}`,
      pr: { url: result.url, additions: stats.additions, deletions: stats.deletions },
    };
  }

  /**
   * Resolve the PR gate after the operator decided. On approve: the gated push +
   * `gh pr create`. Either way: drop `awaiting-output` → `dispatched`, clear
   * `pendingOutput`, and write the task's (withheld) terminal outcome. Idempotent and
   * never throws — a re-fired decision or a missing record is a no-op.
   */
  async resolve(taskId: string, decision: "approved" | "rejected"): Promise<void> {
    try {
      const task = await this.storage.get(taskId).catch(() => null);
      if (!task || task.status !== "awaiting-output" || !task.pendingOutput) return;
      const po = task.pendingOutput;

      let note: string;
      if (decision === "approved") {
        // Legacy gated-resolve path (pre-Tier-2-unify parked approval) — no
        // project available here (only `pendingOutput`'s repoPath/branch survive
        // the park), so `prOpenMode` can't be resolved; stays `"ready"` (NS2 F0b
        // out of scope for this path).
        const result = await this.workspace.openPr({
          cwd: po.repoPath,
          branch: po.branch,
          title: po.title,
          body: po.body,
        });
        note = result
          ? `PR otevřen: ${result.url}`
          : "PR push selhal (soft) — práce je commitnutá na branchi a bezpečná";
      } else {
        note = "PR zamítnut — práce zůstala na branchi bez PR";
      }

      await this.storage.resolveOutput(taskId);
      const updated = await this.storage.writeOutcome(taskId, {
        status: "done",
        summary: note,
        finishedAt: new Date().toISOString(),
      });
      this.log.info("task output gate resolved", { taskId, decision });
      void this.activity.record({
        kind: "task-outcome",
        summary: `task done: ${note}`,
        refs: {
          taskId,
          status: "done",
          ...(updated.runRef ? { runRef: updated.runRef } : {}),
          ...(updated.projectId ? { projectId: updated.projectId } : {}),
        },
      });
    } catch (error) {
      this.log.error("task output resolve failed", {
        taskId,
        err: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

/** First non-empty line of a blob, trimmed — a fallback PR title. */
function firstLine(text: string): string {
  return (
    text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .find(Boolean) ?? ""
  );
}

/** Join `rel` under `base`, returning null if it escapes (path-traversal guard). */
function resolveInside(base: string, rel: string): string | null {
  const resolved = path.resolve(base, rel);
  const prefix = path.resolve(base) + path.sep;
  return resolved === path.resolve(base) || resolved.startsWith(prefix) ? resolved : null;
}
