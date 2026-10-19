import { promises as fs } from "node:fs";
import path from "node:path";
import { Injectable, type OnModuleInit } from "@nestjs/common";
import type {
  AgentRun,
  PrOutput,
  PrReviewEvent,
  ScheduledTask,
  TaskOutput,
} from "@zibby/contracts";
import { ActivityLogService } from "../activity/activity-log.service";
import { ApprovalsService } from "../approvals/approvals.service";
import { DuplicateNoteError, VaultService } from "../memory/vault.service";
import { ProjectsStorageService } from "../projects/projects.storage.service";
import { LoggerService, type ScopedLogger } from "../shared/logging/logger.service";
import { WorkspaceService } from "../workspace/workspace.service";
import { ScheduledTasksStorageService } from "./scheduled-tasks.storage.service";

/**
 * Phase 129 P2 — the file a PR-inbox `code-reviewer` run writes its review into, at
 * the root of its working directory. Read at terminal `done` and parked as the
 * Tier-3 `pr-review` approval's body; the agent itself never posts to GitHub.
 */
export const PR_REVIEW_ARTIFACT = "zibby-pr-review.md";
/** GitHub caps a review body at 65 536 chars; keep headroom for the footer. */
const PR_REVIEW_MAX_CHARS = 60_000;
/** todo-11 — the `rebase-resolver` agent's report; its first line is the conflict claim. */
export const PR_REBASE_ARTIFACT = "zibby-pr-rebase.md";
/** The only conflict-free first line of a rebase report. */
const NO_CONFLICTS = /^Conflicts:\s*none\s*$/i;

/** A labelled finding line (item 9: `Critical:` / `Important:` / `Minor:`), tolerating a bullet/numbered list marker or bold. */
const FINDING_LINE = /^[\s>*_-]*(?:\d+[.)][\s>*_-]*)?(?:Critical|Important|Minor)[*_]*:/m;

/**
 * todo-10 — ZIBBY's preselection for the operator's review-type pick: any finding →
 * REQUEST_CHANGES, none → APPROVE. Only a suggestion; nothing posts without the
 * operator's approve, and every approve without a pick posts COMMENT.
 */
export function suggestReviewEvent(body: string): PrReviewEvent {
  return FINDING_LINE.test(body) ? "REQUEST_CHANGES" : "APPROVE";
}

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
 * The directed-task counterpart of the workflow `outputs:` sink — what happens to an
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
    // Phase 129 P2 — a PR-inbox code review parks its artifact behind a Tier-3 approval.
    if (task.prReview) {
      const file = resolveInside(run.cwd, PR_REVIEW_ARTIFACT);
      const raw = file ? await fs.readFile(file, "utf8").catch(() => "") : "";
      return this.parkPrReview(task, raw).catch((error: unknown) => {
        this.log.warn("pr review park failed (soft)", {
          taskId: task.id,
          err: error instanceof Error ? error.message : String(error),
        });
        return null;
      });
    }
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

  /**
   * Park a finished PR-inbox review's text as a `pr-review` approval ("Post review to
   * GitHub"). Blank → no approval (a reply is concrete or it is not drafted); the
   * review is marked `failed` and the outcome says why. Public because the agent path
   * ({@link handleTerminal}, file at `run.cwd`) and the workflow path
   * (`TaskSchedulerService.writeWorkflowOutcome`, the final phase's `produces` read by
   * the workflow runner — todo-4) read the artifact differently and park identically.
   *
   * `signedOffAtGate` — the workflow's final phase (the `github-commenter` output) was
   * already approved by the operator at its `approval: ask` gate, where notes go back
   * to the phase. That gate WAS the decision on this exact text, so the approval is
   * recorded and approved in one go (the `pr-review` runner posts it) instead of
   * asking twice. `reviewEvent` — the operator's pick at that gate (todo-10); absent → COMMENT.
   */
  async parkPrReview(
    task: ScheduledTask,
    raw: string,
    signedOffAtGate?: string,
    reviewEvent?: PrReviewEvent,
  ): Promise<TaskTerminalDelivery> {
    const review = task.prReview;
    if (!review) return {};
    const body = raw.trim().slice(0, PR_REVIEW_MAX_CHARS);
    const ref = `${review.repo}#${review.number}`;
    if (!body) {
      await this.storage.setPrReview(task.id, (current) =>
        current ? { ...current, state: "failed", note: `no ${PR_REVIEW_ARTIFACT}` } : current,
      );
      this.log.warn("pr review: run left no review artifact — nothing parked", {
        taskId: task.id,
        ref,
      });
      return { summary: `Code review ${ref}: žádný ${PR_REVIEW_ARTIFACT} — nic k odeslání` };
    }
    const approval = await this.approvals.requestApproval({
      runId: task.id,
      kind: "pr-review",
      skill: "code-reviewer",
      action: "github.pr.review",
      detail: `Post review to GitHub — ${ref}${signedOffAtGate ? ` (${reviewEvent ?? "COMMENT"}), approved at workflow gate "${signedOffAtGate}"` : ""}\n\n${body}`,
      risk: "medium",
      sourceUrl: review.url,
      suggestedReviewEvent: suggestReviewEvent(body),
    });
    await this.storage.setPrReview(task.id, (current) =>
      current ? { ...current, state: "awaiting-approval", body, approvalId: approval.id } : current,
    );
    this.log.info("pr review parked for approval", {
      taskId: task.id,
      ref,
      approvalId: approval.id,
    });
    if (signedOffAtGate) {
      // A failed post already marks the review `failed` with the GitHub error.
      const posted = await this.approvals
        .approve(approval.id, reviewEvent ? { reviewEvent } : {})
        .then(
          () => true,
          (error: unknown) => {
            this.log.warn("pr review post after gate sign-off failed", {
              taskId: task.id,
              err: error instanceof Error ? error.message : String(error),
            });
            return false;
          },
        );
      return {
        summary: posted
          ? `Code review ${ref} odesláno na GitHub`
          : `Code review ${ref}: odeslání na GitHub selhalo`,
      };
    }
    return { summary: `Code review ${ref} připraveno — čeká na schválení odeslání na GitHub` };
  }

  /**
   * todo-11 — a finished `pr-rebase` run: record its report as a `pr-rebase` approval
   * ("Force-push rebased branch"). The operator's Rebase click already authorised a
   * conflict-free rebase, so that approval is approved on the spot (its runner,
   * `InboxRebaseService`, pushes) — the same "already signed off" path as
   * {@link parkPrReview}'s gate sign-off. It stays pending (Tier 3) when the report's
   * FIRST line is not exactly `Conflicts: none`, or GitHub did not report the PR as
   * cleanly mergeable at the click — when unsure, the higher tier. No report or no
   * worktree → `failed`, nothing pushed.
   */
  async parkPrRebase(
    task: ScheduledTask,
    raw: string,
    worktree?: string,
  ): Promise<TaskTerminalDelivery> {
    const rebase = task.prRebase;
    if (!rebase) return {};
    const report = raw.trim().slice(0, PR_REVIEW_MAX_CHARS);
    const ref = `${rebase.repo}#${rebase.number}`;
    if (!report || !worktree) {
      const note = report ? "no worktree" : `no ${PR_REBASE_ARTIFACT}`;
      await this.storage.setPrRebase(task.id, (c) => (c ? { ...c, state: "failed", note } : c));
      this.log.warn("pr rebase: nothing to push", { taskId: task.id, ref, note });
      return { summary: `Rebase ${ref}: ${note} — nic nepushnuto` };
    }
    const clean = !rebase.conflictAtStart && NO_CONFLICTS.test(report.split("\n", 1)[0] ?? "");
    const approval = await this.approvals.requestApproval({
      runId: task.id,
      kind: "pr-rebase",
      skill: "rebase-resolver",
      action: "git.force_push",
      detail: `Force-push ${rebase.head} rebased onto ${rebase.base} — ${ref}${clean ? " (no conflicts, authorised by the Rebase click)" : ""}\n\n${report}`,
      risk: clean ? "medium" : "high",
      sourceUrl: rebase.url,
    });
    await this.storage.setPrRebase(task.id, (c) =>
      c ? { ...c, state: "awaiting-approval", report, worktree, approvalId: approval.id } : c,
    );
    if (!clean) {
      return { summary: `Rebase ${ref}: konflikty vyřešeny — force-push čeká na schválení` };
    }
    // A failed push already marks the rebase `failed` with git's reason (the runner).
    const pushed = await this.approvals.approve(approval.id).then(
      () => true,
      (error: unknown) => {
        this.log.warn("pr rebase push after the click failed", {
          taskId: task.id,
          err: error instanceof Error ? error.message : String(error),
        });
        return false;
      },
    );
    return { summary: pushed ? `Rebase ${ref} force-pushnut` : `Rebase ${ref}: force-push selhal` };
  }

  /** Write the run summary to the chosen file — a vault note or a path in the worktree. */
  private async deliverFile(
    task: ScheduledTask,
    run: AgentRun,
    output: Extract<TaskOutput, { type: "file" }>,
    summary: string,
  ): Promise<void> {
    // A task carries no `from` artifact (unlike a workflow handoff), so the content is
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
