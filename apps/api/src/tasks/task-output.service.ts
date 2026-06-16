import { promises as fs } from "node:fs"
import path from "node:path"
import { Injectable, type OnModuleInit } from "@nestjs/common"
import type { AgentRun, ScheduledTask, TaskOutput } from "@zibby/contracts"
import { ActivityLogService } from "../activity/activity-log.service"
import { ApprovalsService } from "../approvals/approvals.service"
import { DuplicateNoteError, VaultService } from "../memory/vault.service"
import { ProjectsStorageService } from "../projects/projects.storage.service"
import { LoggerService, type ScopedLogger } from "../shared/logging/logger.service"
import { WorkspaceService } from "../workspace/workspace.service"
import { ScheduledTasksStorageService } from "./scheduled-tasks.storage.service"

/**
 * The directed-task counterpart of the pipeline `outputs:` gate — what happens to an
 * agent/orchestrator task's finished work, when the operator chose a `pr` or `file`
 * output in the New Task dialog. Deterministic and system-owned (no agent, no
 * tokens); the output side of "PR je brána".
 *
 * It lives at the task layer on purpose: the durable substrate the gate needs already
 * exists here. The {@link ScheduledTask} record is persisted per-id and rehydrated on
 * boot, approvals are durable on disk, and the run already finished — so a task parked
 * at the PR gate (`status: "awaiting-output"`) survives a restart for free, with no
 * reconstruct code. Agent runs have no durable post-run park of their own; this is why
 * the gate is NOT in the runner.
 *
 * commit ≠ push. The work is committed at terminal-`done` while the worktree is
 * provably alive (`checkpoint` — system-owned `git add -A && commit`, agent
 * independent). Only the branch name + repo dir are captured onto `pendingOutput`; the
 * push + `gh pr create` run at approval time from the repo dir, against a branch ref
 * that outlives a reaped worktree.
 */
@Injectable()
export class TaskOutputService implements OnModuleInit {
  private readonly log: ScopedLogger

  constructor(
    private readonly storage: ScheduledTasksStorageService,
    private readonly workspace: WorkspaceService,
    private readonly vault: VaultService,
    private readonly approvals: ApprovalsService,
    private readonly projects: ProjectsStorageService,
    private readonly activity: ActivityLogService,
    logger: LoggerService,
  ) {
    this.log = logger.child(TaskOutputService.name)
  }

  onModuleInit(): void {
    // Approving the `task-output` gate opens the PR; rejecting leaves the committed
    // branch without one. Either way the task's outcome is written on resolve (it was
    // deliberately withheld at park time). Registered here so the decision is never a
    // silent no-op (the Phase-5 channel-runner lesson).
    this.approvals.register("task-output", {
      resume: (taskId) => this.resolve(taskId, "approved"),
      cancel: (taskId) => void this.resolve(taskId, "rejected"),
    })
  }

  /**
   * Called when an agent/orchestrator task's run reaches terminal `done`. Returns
   * `true` when it PARKED the task at the PR gate — the caller must then NOT write the
   * normal outcome (the gate resolution writes it). Returns `false` when there was
   * nothing to gate (no chosen output, `void`, a `file` delivered inline, or a `pr`
   * that degraded to a soft no-op) and the caller should write the outcome as usual.
   * Never throws — a sink failure must not strand the task's terminal write-back.
   */
  async handleTerminal(task: ScheduledTask, run: AgentRun, summary: string): Promise<boolean> {
    const output = task.output
    // Absent = inherit (agent/orchestrator inherit "no terminal delivery"); `void` =
    // explicit suppression. Both fall through to the normal outcome write-back.
    if (!output || output.type === "void") return false
    try {
      if (output.type === "file") {
        await this.deliverFile(task, run, output, summary)
        return false // Tier-1, delivered now; the normal outcome still follows
      }
      return await this.parkOnPr(task, run, summary)
    } catch (error) {
      this.log.warn("task output sink failed (soft) — writing outcome as usual", {
        taskId: task.id,
        err: error instanceof Error ? error.message : String(error),
      })
      return false
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
    const content = summary.trim() ? `${summary}\n` : ""
    if (output.dest === "vault") {
      await this.vault
        .createNote({ id: output.to, tier: "knowledge", body: content })
        .catch(async (error) => {
          if (error instanceof DuplicateNoteError) {
            await this.vault.updateNote(output.to, { body: content }).catch(() => {})
            return
          }
          throw error
        })
      this.log.info("task file output delivered to vault", { taskId: task.id, to: output.to })
      return
    }
    // dest: project — write into the run's worktree (rides its zibby/* branch). No
    // worktree (non-git / projectless run) → nowhere safe to write; soft-skip.
    const base = run.workspace?.path
    if (!base) {
      this.log.warn("project file output skipped — run has no worktree", { taskId: task.id, to: output.to })
      return
    }
    const dest = resolveInside(base, output.to)
    if (!dest) {
      this.log.warn("project file output skipped — path escapes the worktree", { taskId: task.id, to: output.to })
      return
    }
    await fs.mkdir(path.dirname(dest), { recursive: true })
    await fs.writeFile(dest, content, "utf8")
    this.log.info("task file output delivered to project", { taskId: task.id, to: output.to })
  }

  /**
   * Commit the run's branch and park the task at the PR gate. Returns `true` (parked)
   * once the `task-output` approval exists; `false` when there is nothing to open a PR
   * for (no worktree, or no commits on the branch) — a soft no-op, not a crash.
   */
  private async parkOnPr(task: ScheduledTask, run: AgentRun, summary: string): Promise<boolean> {
    const ws = run.workspace
    if (!ws) {
      this.log.warn("pr output skipped — run has no git worktree", { taskId: task.id })
      return false
    }
    // System-owned commit of whatever the agent left uncommitted — so the PR is never
    // empty because a lone agent edited files without committing (commit ≠ push).
    await this.workspace.checkpoint({ worktreePath: ws.path, phaseId: "task-output", summary })
    const commits = await this.workspace.commitLog({ worktreePath: ws.path, baseRef: ws.baseRef })
    if (!commits.trim()) {
      this.log.info("pr output skipped — no commits on the branch to open a PR for", { taskId: task.id })
      return false
    }

    // Push at approval time from the repo dir (the branch ref outlives a reaped
    // worktree). Prefer the registered project's path; fall back to the worktree.
    const project = task.projectId
      ? await this.projects.get(task.projectId).catch(() => null)
      : null
    const repoPath = project?.path ?? ws.path

    const diffstat = await this.workspace.diffstat({ worktreePath: ws.path, baseRef: ws.baseRef })
    const title = (task.title?.trim() || firstLine(summary) || ws.branch).slice(0, 120)
    const body = [summary.trim(), diffstat.trim()].filter(Boolean).join("\n\n")

    const approval = await this.approvals.requestApproval({
      runId: task.id,
      kind: "task-output",
      skill: "zibby",
      action: "pr.open",
      detail: `Otevřít PR z ${ws.branch}${title ? ` — ${title}` : ""}`,
      risk: "medium",
    })
    await this.storage.markAwaitingOutput(task.id, {
      branch: ws.branch,
      repoPath,
      approvalId: approval.id,
      title,
      body,
    })
    this.log.info("task parked at PR output gate", { taskId: task.id, branch: ws.branch })
    return true
  }

  /**
   * Resolve the PR gate after the operator decided. On approve: the gated push +
   * `gh pr create`. Either way: drop `awaiting-output` → `dispatched`, clear
   * `pendingOutput`, and write the task's (withheld) terminal outcome. Idempotent and
   * never throws — a re-fired decision or a missing record is a no-op.
   */
  async resolve(taskId: string, decision: "approved" | "rejected"): Promise<void> {
    try {
      const task = await this.storage.get(taskId).catch(() => null)
      if (!task || task.status !== "awaiting-output" || !task.pendingOutput) return
      const po = task.pendingOutput

      let note: string
      if (decision === "approved") {
        const result = await this.workspace.openPr({
          cwd: po.repoPath,
          branch: po.branch,
          title: po.title,
          body: po.body,
        })
        note = result
          ? `PR otevřen: ${result.url}`
          : "PR push selhal (soft) — práce je commitnutá na branchi a bezpečná"
      } else {
        note = "PR zamítnut — práce zůstala na branchi bez PR"
      }

      await this.storage.resolveOutput(taskId)
      const updated = await this.storage.writeOutcome(taskId, {
        status: "done",
        summary: note,
        finishedAt: new Date().toISOString(),
      })
      this.log.info("task output gate resolved", { taskId, decision })
      void this.activity.record({
        kind: "task-outcome",
        summary: `task done: ${note}`,
        refs: {
          taskId,
          status: "done",
          ...(updated.runRef ? { runRef: updated.runRef } : {}),
          ...(updated.projectId ? { projectId: updated.projectId } : {}),
        },
      })
    } catch (error) {
      this.log.error("task output resolve failed", {
        taskId,
        err: error instanceof Error ? error.message : String(error),
      })
    }
  }
}

/** First non-empty line of a blob, trimmed — a fallback PR title. */
function firstLine(text: string): string {
  return text.split(/\r?\n/).map((l) => l.trim()).find(Boolean) ?? ""
}

/** Join `rel` under `base`, returning null if it escapes (path-traversal guard). */
function resolveInside(base: string, rel: string): string | null {
  const resolved = path.resolve(base, rel)
  const prefix = path.resolve(base) + path.sep
  return resolved === path.resolve(base) || resolved.startsWith(prefix) ? resolved : null
}
