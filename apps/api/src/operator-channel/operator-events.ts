import type {
  ActivityEntry,
  Approval,
  OperatorEventKind,
  ScheduledTask,
  WorkflowRun,
} from "@zibby/contracts";

/** The approval action a budget-held task's approval carries (task-scheduler's `SPEND_PAST_CAP`). */
const SPEND_PAST_CAP = "spend-past-cap";

/** Park reasons with no approval behind them — the run waits on a human review, not a decision. */
const NOTIFY_PARK_REASONS = new Set(["retries", "limit"]);

/** The Tier-3 kinds (surface and wait); every other kind is Tier-2 (act, then report). */
const TIER_3 = new Set<OperatorEventKind>([
  "review-finished",
  "approval-waiting",
  "run-parked",
  "budget-cap",
]);

/** An activity entry mapped to something worth telling the operator. */
export interface OperatorEvent {
  kind: OperatorEventKind;
  tier: 2 | 3;
  /** What it is about — the dedupe target (PR url, task/run/approval id). */
  target: string;
  /** The state part of the dedupe key (`kind + target + state`). */
  state: string;
  /** The one-line subject (task title, activity summary). */
  title: string;
  /** Optional short context (the run's outcome summary — never a model call). */
  detail?: string;
  prUrl?: string;
  /** Phase 3 — the task/run (and run branch, when still known) the notification's thread binds to. */
  taskId?: string;
  runId?: string;
  branch?: string;
  /** ZIBBY web path for "Open in ZIBBY" (joined to `publicBaseUrl`). */
  path?: string;
}

/** Read-only lookups the mapping needs to enrich an entry (PR url, park reason). */
export interface OperatorEventLookups {
  task(id: string): Promise<ScheduledTask | null>;
  approval(id: string): Promise<Approval | null>;
  workflowRun(id: string): WorkflowRun | null;
}

const event = (e: Omit<OperatorEvent, "tier">): OperatorEvent => ({
  ...e,
  tier: TIER_3.has(e.kind) ? 3 : 2,
});

const isPrUrl = (url: string | undefined): url is string =>
  !!url && /^https:\/\/github\.com\/[^/]+\/[^/]+\/pull\/\d+/.test(url);

/** PR-inbox tasks report through their own approvals, not a "run completed" line. */
const isPrInboxTask = (t: ScheduledTask): boolean =>
  !!(t.prReview || t.prRebase || t.prAddressComments || t.prFixCi);

/**
 * Map one EXISTING activity entry to an operator event, or `null` — the default for
 * every kind not listed here, which is how Tier-1 (silent) work is never sent. No
 * new emit points: everything rides the activity stream the feed already uses.
 *
 * - `task-outcome` done → `pr-opened` (the task's `pr` output) or `run-completed`
 * - `approval-requested` → `review-finished` (a `pr-review` approval), `budget-cap`
 *   (`spend-past-cap`) or `approval-waiting`
 * - `workflow-parked` (retries/limit only) / `goal-parked` → `run-parked`
 * - `monitor-alert`, `post-merge-outcome` with a fix task → `ci-red` (being fixed)
 * - `briefing-generated` → `briefing`
 */
export async function toOperatorEvent(
  entry: ActivityEntry,
  lookups: OperatorEventLookups,
): Promise<OperatorEvent | null> {
  const { refs } = entry;
  switch (entry.kind) {
    case "task-outcome": {
      if (refs.status !== "done" || !refs.taskId) return null;
      const task = await lookups.task(refs.taskId);
      if (!task || isPrInboxTask(task)) return null;
      const title = task.title || task.text.slice(0, 120);
      const detail = task.outcome?.summary;
      const pr = task.outcome?.pr?.url;
      const path = `/work/tasks/${task.id}`;
      const bind = {
        taskId: task.id,
        ...(task.runRef ? { runId: task.runRef } : {}),
        ...(task.pendingOutput?.branch ? { branch: task.pendingOutput.branch } : {}),
      };
      return pr
        ? event({
            kind: "pr-opened",
            target: pr,
            state: "open",
            title,
            detail,
            prUrl: pr,
            path,
            ...bind,
          })
        : event({
            kind: "run-completed",
            target: task.id,
            state: "done",
            title,
            detail,
            path,
            ...bind,
          });
    }
    case "approval-requested": {
      const path = "/governance/approvals";
      if (!refs.approvalId) {
        // The roadmap gate's routing question rides the kind without an approval record.
        const target = refs.itemId ?? entry.id;
        return event({
          kind: "approval-waiting",
          target,
          state: "pending",
          title: entry.summary,
          path,
        });
      }
      const approval = await lookups.approval(refs.approvalId);
      const target = refs.approvalId;
      if (refs.status === "pr-review") {
        const task = approval ? await lookups.task(approval.runId) : null;
        const prUrl = task?.prReview?.url;
        const title = task?.prReview
          ? `${task.prReview.repo}#${task.prReview.number}`
          : entry.summary;
        return event({
          kind: "review-finished",
          target,
          state: "pending",
          title,
          path,
          ...(isPrUrl(prUrl) ? { prUrl } : {}),
        });
      }
      const kind = refs.action === SPEND_PAST_CAP ? "budget-cap" : "approval-waiting";
      const sourceUrl = approval?.sourceUrl;
      return event({
        kind,
        target,
        state: "pending",
        title: approval?.action ? `${approval.skill}: ${approval.action}` : entry.summary,
        detail: approval?.detail.split("\n")[0],
        path,
        ...(isPrUrl(sourceUrl) ? { prUrl: sourceUrl } : {}),
      });
    }
    case "workflow-parked": {
      if (!refs.runRef) return null;
      const reason = lookups.workflowRun(refs.runRef)?.parkedReason;
      if (!reason || !NOTIFY_PARK_REASONS.has(reason)) return null;
      return event({
        kind: "run-parked",
        target: refs.runRef,
        state: `parked:${reason}`,
        title: entry.summary,
        runId: refs.runRef,
        path: `/activity/runs/${refs.runRef}`,
      });
    }
    case "goal-parked": {
      if (!refs.goalRunId) return null;
      return event({
        kind: "run-parked",
        target: refs.goalRunId,
        state: "parked",
        title: entry.summary,
        runId: refs.goalRunId,
        ...(refs.goalId ? { path: `/work/goals/${refs.goalId}` } : {}),
      });
    }
    case "monitor-alert":
      return event({
        kind: "ci-red",
        target: refs.itemId ?? entry.id,
        state: "fixing",
        title: entry.summary,
        path: "/activity/runs",
      });
    case "post-merge-outcome":
      // Only the red outcome dispatches a fix task (and so rides `taskId`).
      if (!refs.taskId) return null;
      return event({
        kind: "ci-red",
        target: `${refs.projectId ?? ""}/${refs.itemId ?? refs.taskId}`,
        state: "fixing",
        title: entry.summary,
        taskId: refs.taskId,
        path: `/work/tasks/${refs.taskId}`,
      });
    case "briefing-generated":
      return event({
        kind: "briefing",
        target: refs.noteId ?? entry.at.slice(0, 10),
        state: "generated",
        title: entry.summary,
        path: "/dashboard/briefings",
      });
    default:
      return null;
  }
}
