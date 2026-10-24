import { promises as fs } from "node:fs";
import path from "node:path";
import { Injectable, type OnModuleInit } from "@nestjs/common";
import {
  type AgentRun,
  type PrOutput,
  type PrReviewEvent,
  type PrThreadOutcome,
  type PrThreadReply,
  PrThreadReplySchema,
  type ScheduledTask,
  type TaskOutput,
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
/** PR inbox redesign — the address-comments agent's report; its first line is the claim (`Addressed: all` pushes without asking). */
export const PR_ADDRESS_COMMENTS_ARTIFACT = "zibby-pr-address-comments.md";
/** "Fix CI" — the `pr-fix-ci` workflow's report (`Fixed: …` first line). */
export const PR_FIX_CI_ARTIFACT = "zibby-pr-fix-ci.md";
/** PR inbox redesign — `github-commenter`'s thread replies (`PrThreadReply[]` JSON), posted by ZIBBY after the push. */
export const PR_REPLIES_ARTIFACT = "zibby-pr-replies.json";
/** The only conflict-free first line of a rebase report. */
const NO_CONFLICTS = /^Conflicts:\s*none\s*$/i;

/** A pr-rebase run is "clean" (authorised by the Rebase click) when GitHub saw it mergeable AND the report's first line is `Conflicts: none`. */
export function isCleanPrRebase(conflictAtStart: boolean, report: string): boolean {
  return !conflictAtStart && NO_CONFLICTS.test(report.split("\n", 1)[0] ?? "");
}

/** todo-17 — first lines ZIBBY force-pushes on without asking: a clean rebase, or conflicts resolved with green quick checks. */
const AUTO_PUSH = /^Conflicts:\s*(?:none|[1-9]\d*\s+files?)\s*$/i;

/** The Rebase click authorises the push when the report's FIRST line is `Conflicts: none` or `Conflicts: <n> files`; aborted / checks-failed reports wait for the operator. */
export function isAutoPushPrRebase(report: string): boolean {
  return AUTO_PUSH.test(report.split("\n", 1)[0] ?? "");
}

/** PR inbox redesign — `Addressed: all` is the only first line ZIBBY pushes review fixes on without asking. */
const ADDRESSED_ALL = /^Addressed:\s*all\s*$/i;

/** The Address-review-comments click authorises the push only when the report's FIRST line is `Addressed: all`. */
export function isAutoPushAddressComments(report: string): boolean {
  return ADDRESSED_ALL.test(report.split("\n", 1)[0] ?? "");
}

const FIXED_ALL = /^Fixed:\s*all\s*$/i;

/** Only an exact `Fixed: all` first line auto-pushes a CI fix, and only on the operator's own PR. */
export function isAutoPushFixCi(report: string): boolean {
  return FIXED_ALL.test(report.split("\n", 1)[0] ?? "");
}

/**
 * Thread ids the parked `address` report marks fixed: the text from a `thread: <id>` line up to
 * the next `thread:` (or the end) contains `done in`. The reply agent's `resolve` flag alone is
 * never enough to resolve a thread.
 */
export function threadsMarkedDone(report: string | undefined): Set<string> {
  const done = new Set<string>();
  const matches = [...(report ?? "").matchAll(/thread:\s*`?([A-Za-z0-9_-]+)`?/g)];
  matches.forEach((m, i) => {
    const block = (report ?? "").slice(m.index, matches[i + 1]?.index);
    if (m[1] && /done in/i.test(block)) done.add(m[1]);
  });
  return done;
}

/**
 * Per-thread outcome of the address report: each `thread: <id>` block is `done in <shas>`,
 * `skipped: <why>`, `question: <what>` — or, when none matches, an unreadable `skipped`.
 */
export function parseThreadOutcomes(report: string | undefined): PrThreadOutcome[] {
  const text = report ?? "";
  const matches = [...text.matchAll(/thread:\s*`?([A-Za-z0-9_-]+)`?/g)];
  const out: PrThreadOutcome[] = [];
  matches.forEach((m, i) => {
    const block = text.slice(m.index, matches[i + 1]?.index);
    const done = /^[\s>*_-]*done in\s+([0-9a-f]{7,40}(?:\s+and\s+[0-9a-f]{7,40})*)/im.exec(block);
    const skipped = /^[\s>*_-]*skipped:\s*(.+)/im.exec(block);
    const question = /^[\s>*_-]*question:\s*(.+)/im.exec(block);
    const [kind, note] = done
      ? (["done", done[1]] as const)
      : skipped
        ? (["skipped", skipped[1]] as const)
        : question
          ? (["question", question[1]] as const)
          : (["skipped", "unreadable report line"] as const);
    // ponytail: 100 = contract cap on `outcomes`; threads beyond it get no outcome row.
    if (m[1] && out.length < 100) {
      out.push({ threadId: m[1], kind, note: (note ?? "").trim().slice(0, 500) });
    }
  });
  return out;
}

/**
 * PR inbox redesign — `github-commenter`'s reply file → valid, de-duplicated replies (≤ 50).
 * Anything malformed is dropped, never repaired: agent output is data. Which threads may
 * really be answered is decided again at post time against GitHub.
 */
export function parseThreadReplies(raw: string | undefined): PrThreadReply[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw ?? "[]");
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const seen = new Set<string>();
  const out: PrThreadReply[] = [];
  for (const entry of parsed) {
    const r = PrThreadReplySchema.safeParse(entry);
    if (!r.success || seen.has(r.data.threadId)) continue;
    seen.add(r.data.threadId);
    out.push(r.data);
    if (out.length === 50) break;
  }
  return out;
}

/** A labelled finding line (item 9: `Critical:` / `Important:` / `Minor:`), tolerating a bullet/numbered list marker or bold. */
const FINDING_LINE = /^[\s>*_-]*(?:\d+[.)][\s>*_-]*)?(?:Critical|Important|Minor)[*_]*:/m;

/** todo-22 — a finding in the inline-comment format: `### path:line (Critical|Important|Minor)`. */
const FINDING_HEADING = /^###\s.*\((?:Critical|Important|Minor)\)\s*$/im;

/**
 * todo-10 — ZIBBY's preselection for the operator's review-type pick: any finding →
 * REQUEST_CHANGES, none → APPROVE. Only a suggestion; nothing posts without the
 * operator's approve, and every approve without a pick posts COMMENT.
 */
export function suggestReviewEvent(body: string): PrReviewEvent {
  return FINDING_LINE.test(body) || FINDING_HEADING.test(body) ? "REQUEST_CHANGES" : "APPROVE";
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
   * ("Force-push rebased branch"). The operator's Rebase click already authorised the
   * push for a `Conflicts: none` report and for resolved conflicts whose quick checks
   * passed (`Conflicts: <n> files`, todo-17), so that approval is approved on the spot
   * (its runner, `InboxRebaseService`, pushes) — the same "already signed off" path as
   * {@link parkPrReview}'s gate sign-off. It stays pending (Tier 3, risk high) for
   * `aborted`, `checks failed` or any other first line; risk is `medium` only for
   * {@link isCleanPrRebase}. No report or no worktree → `failed`, nothing pushed.
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
    const clean = isCleanPrRebase(rebase.conflictAtStart, report);
    const autoPush = isAutoPushPrRebase(report);
    // The report is the agent's claim; this is what the worktree really holds.
    const facts = await this.workspace
      .rebaseFacts({ cwd: worktree, base: rebase.base, headSha: rebase.headSha })
      .catch((error: unknown) => (error instanceof Error ? error.message : String(error)));
    const verified =
      typeof facts === "string"
        ? `could not read the worktree: ${facts}`
        : [
            `HEAD ${facts.sha}`,
            "",
            `git log --oneline origin/${rebase.base}..HEAD:`,
            facts.log || "(nothing)",
            "",
            `git diff --stat ${rebase.headSha} HEAD:`,
            facts.stat || "(no changes)",
          ].join("\n");
    const rebasedSha = typeof facts === "string" ? undefined : facts.sha;
    const approval = await this.approvals.requestApproval({
      runId: task.id,
      kind: "pr-rebase",
      skill: "rebase-resolver",
      action: "git.force_push",
      detail: `Force-push ${rebase.head} rebased onto ${rebase.base} — ${ref}${
        clean
          ? " (no conflicts, authorised by the Rebase click)"
          : autoPush
            ? " (conflicts resolved, quick checks green — authorised by the Rebase click)"
            : ""
      }\n\n${report}\n\n## Verified by ZIBBY\n\n${verified}`,
      risk: clean ? "medium" : "high",
      sourceUrl: rebase.url,
    });
    await this.storage.setPrRebase(task.id, (c) =>
      c
        ? {
            ...c,
            state: "awaiting-approval",
            report,
            worktree,
            ...(rebasedSha ? { rebasedSha } : {}),
            approvalId: approval.id,
          }
        : c,
    );
    if (!autoPush) {
      return { summary: `Rebase ${ref}: force-push čeká na schválení` };
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
    if (!pushed) return { summary: `Rebase ${ref}: force-push selhal` };
    return {
      summary: clean
        ? `Rebase ${ref} force-pushnut`
        : `Rebase ${ref}: konflikty vyřešeny a force-pushnuto`,
    };
  }

  /**
   * PR inbox redesign — a finished `pr-address-comments` run: record its report as a
   * `pr-address-comments` approval ("Push review fixes"). `Addressed: all` was authorised by
   * the click (Tier-2: fast-forward commits onto the operator's own PR only request review), so
   * it is approved on the spot and the runner (`InboxAddressCommentsService`) pushes; any other
   * first line stays pending (Tier-3, risk high). todo-16: a run the PR automation started
   * (`prAddressComments.auto`) had no click, so even `Addressed: all` stays pending. The `github-commenter` thread replies
   * (`rawReplies`, parsed by {@link parseThreadReplies}) ride on the same approval — same tier as
   * the push, posted by the runner only after it. The worktree HEAD ZIBBY reads here is stored
   * as `fixedSha` — the only sha the runner pushes. No report / no worktree / an unreadable
   * worktree / no new commits → `failed`, nothing pushed.
   */
  async parkPrAddressComments(
    task: ScheduledTask,
    raw: string,
    worktree?: string,
    rawReplies?: string,
  ): Promise<TaskTerminalDelivery> {
    const fix = task.prAddressComments;
    if (!fix) return {};
    const report = raw.trim().slice(0, PR_REVIEW_MAX_CHARS);
    const ref = `${fix.repo}#${fix.number}`;
    const fail = async (note: string): Promise<TaskTerminalDelivery> => {
      await this.storage.setPrAddressComments(task.id, (c) =>
        c ? { ...c, state: "failed", note } : c,
      );
      this.log.warn("pr address-comments: nothing to push", { taskId: task.id, ref, note });
      return { summary: `Review komentáře ${ref}: ${note} — nic nepushnuto` };
    };
    if (!report) return fail(`no ${PR_ADDRESS_COMMENTS_ARTIFACT}`);
    if (!worktree) return fail("no worktree");
    // The report is the agent's claim; this is what the worktree really holds.
    const facts = await this.workspace
      .rebaseFacts({ cwd: worktree, base: fix.base, headSha: fix.headSha })
      .catch((error: unknown) => (error instanceof Error ? error.message : String(error)));
    if (typeof facts === "string") {
      return fail(`could not read the worktree: ${facts}`.slice(0, 300));
    }
    const replies = parseThreadReplies(rawReplies);
    const outcomes = parseThreadOutcomes(report);
    if (facts.sha === fix.headSha) {
      // No new commits: only drafted replies are worth the operator's attention (empty drafts are not).
      if (!replies.some((r) => r.body.trim())) return fail("no new commits");
      const approval = await this.approvals.requestApproval({
        runId: task.id,
        kind: "pr-address-comments",
        skill: "fullstack-developer",
        action: "github.pr.comment",
        detail: `Post review replies — ${ref}\n\n${report}\n\n## Replies ZIBBY will post\n\n${replies
          .filter((r) => r.body.trim())
          .map((r) => `${r.threadId}: ${r.body}`)
          .join("\n")}`,
        risk: "high",
        sourceUrl: fix.url,
      });
      await this.storage.setPrAddressComments(task.id, (c) =>
        c
          ? {
              ...c,
              state: "awaiting-approval",
              report,
              worktree,
              approvalId: approval.id,
              replies,
              ...(outcomes.length ? { outcomes } : {}),
            }
          : c,
      );
      return { summary: `Review komentáře ${ref}: odpovědi čekají na schválení` };
    }
    // A `question` always keeps the gate, whatever the first line claims. todo-16: so does an
    // auto-started run — nobody clicked, so nothing authorised the push (Tier 3).
    const autoPush =
      !fix.auto &&
      isAutoPushAddressComments(report) &&
      !outcomes.some((o) => o.kind === "question");
    const done = threadsMarkedDone(report);
    const repliesBlock = replies.length
      ? `\n\n## Replies ZIBBY will post after the push\n\n${replies
          .map(
            (r) =>
              `${r.threadId}${r.resolve && done.has(r.threadId) ? " (resolve)" : ""}: ${r.body}`,
          )
          .join("\n")}`
      : "";
    const resolving = replies.some((r) => r.resolve && done.has(r.threadId));
    const followUpBlock = `${repliesBlock}\n\nThen ${resolving ? "resolves the threads marked (resolve) and " : ""}re-requests review from everyone whose latest review is "Changes requested".`;
    const approval = await this.approvals.requestApproval({
      runId: task.id,
      kind: "pr-address-comments",
      skill: "fullstack-developer",
      action: "git.push",
      detail: `Push review fixes onto ${fix.head} — ${ref}${
        autoPush
          ? " (all comments addressed, checks green — authorised by the click)"
          : fix.auto
            ? " (started automatically — the push waits for your approval)"
            : ""
      }\n\n${report}${followUpBlock}\n\n## Verified by ZIBBY\n\nHEAD ${facts.sha}\n\ngit diff --stat ${fix.headSha} HEAD:\n${facts.stat || "(no changes)"}`,
      risk: autoPush ? "medium" : "high",
      sourceUrl: fix.url,
    });
    await this.storage.setPrAddressComments(task.id, (c) =>
      c
        ? {
            ...c,
            state: "awaiting-approval",
            report,
            worktree,
            fixedSha: facts.sha,
            approvalId: approval.id,
            ...(replies.length ? { replies } : {}),
            ...(outcomes.length ? { outcomes } : {}),
          }
        : c,
    );
    if (!autoPush) return { summary: `Review komentáře ${ref}: push oprav čeká na schválení` };
    // A failed push already marks the task `failed` with git's reason (the runner).
    const pushed = await this.approvals.approve(approval.id).then(
      () => true,
      (error: unknown) => {
        this.log.warn("pr address-comments push after the click failed", {
          taskId: task.id,
          err: error instanceof Error ? error.message : String(error),
        });
        return false;
      },
    );
    if (!pushed) return { summary: `Review komentáře ${ref}: push selhal` };
    // The runner posted replies / resolved threads / re-requested review right after the push.
    const after = await this.storage
      .get(task.id)
      .then((t) => t.prAddressComments)
      .catch(() => undefined);
    const parts = ["opravy pushnuty"];
    if (replies.length) parts.push(`odpovědi ve vláknech ${after?.replied ?? 0}/${replies.length}`);
    if (after?.resolved) parts.push(`vyřešená vlákna ${after.resolved}`);
    if (after?.reviewersRequested?.length) {
      parts.push(`review znovu vyžádáno od ${after.reviewersRequested.join(", ")}`);
    }
    if (after?.followUpNote) parts.push(`follow-up: ${after.followUpNote.slice(0, 120)}`);
    return { summary: `Review komentáře ${ref}: ${parts.join(", ")}` };
  }

  /**
   * "Fix CI" — a finished `pr-fix-ci` run: record its report as a `pr-fix-ci` approval. `Fixed: all`
   * on the operator's own PR was authorised by the click (Tier-2) and is approved on the spot; every
   * other first line, or a colleague's PR, stays pending (Tier-3, risk high). `fixedSha` is the
   * worktree HEAD ZIBBY reads here, the only sha the runner pushes. No report / worktree / new
   * commits → `failed`, nothing pushed.
   */
  async parkPrFixCi(
    task: ScheduledTask,
    raw: string,
    worktree?: string,
  ): Promise<TaskTerminalDelivery> {
    const fix = task.prFixCi;
    if (!fix) return {};
    const report = raw.trim().slice(0, PR_REVIEW_MAX_CHARS);
    const ref = `${fix.repo}#${fix.number}`;
    const fail = async (note: string): Promise<TaskTerminalDelivery> => {
      await this.storage.setPrFixCi(task.id, (c) => (c ? { ...c, state: "failed", note } : c));
      this.log.warn("pr fix-ci: nothing to push", { taskId: task.id, ref, note });
      return { summary: `Oprava CI ${ref}: ${note} — nic nepushnuto` };
    };
    if (!report) return fail(`no ${PR_FIX_CI_ARTIFACT}`);
    if (!worktree) return fail("no worktree");
    const facts = await this.workspace
      .rebaseFacts({ cwd: worktree, base: fix.base, headSha: fix.headSha })
      .catch((error: unknown) => (error instanceof Error ? error.message : String(error)));
    if (typeof facts === "string") {
      return fail(`could not read the worktree: ${facts}`.slice(0, 300));
    }
    if (facts.sha === fix.headSha) {
      return fail(`no new commits — ${report.split("\n", 1)[0] ?? ""}`.slice(0, 300));
    }
    const autoPush = isAutoPushFixCi(report) && fix.ownPr === true;
    const approval = await this.approvals.requestApproval({
      runId: task.id,
      kind: "pr-fix-ci",
      skill: "fullstack-developer",
      action: "git.push",
      detail: `Push CI fix onto ${fix.head} — ${ref}${
        autoPush ? " (all failing checks fixed, re-run green — authorised by the click)" : ""
      }\n\n${report}\n\n## Verified by ZIBBY\n\nHEAD ${facts.sha}\n\ngit diff --stat ${fix.headSha} HEAD:\n${facts.stat || "(no changes)"}`,
      risk: autoPush ? "medium" : "high",
      sourceUrl: fix.url,
    });
    await this.storage.setPrFixCi(task.id, (c) =>
      c
        ? {
            ...c,
            state: "awaiting-approval",
            report,
            worktree,
            fixedSha: facts.sha,
            approvalId: approval.id,
          }
        : c,
    );
    if (!autoPush) return { summary: `Oprava CI ${ref}: push opravy čeká na schválení` };
    // A failed push already marks the task `failed` with git's reason (the runner).
    const pushed = await this.approvals.approve(approval.id).then(
      () => true,
      (error: unknown) => {
        this.log.warn("pr fix-ci push after the click failed", {
          taskId: task.id,
          err: error instanceof Error ? error.message : String(error),
        });
        return false;
      },
    );
    return { summary: `Oprava CI ${ref}: ${pushed ? "oprava pushnuta" : "push selhal"}` };
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
      pr: {
        url: result.url,
        additions: stats.additions,
        deletions: stats.deletions,
        ...(stats.files ? { files: stats.files } : {}),
      },
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
