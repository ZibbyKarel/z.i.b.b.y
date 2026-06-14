import type { DashboardApproval } from "../approvals/approval";
import type { RunView } from "../runs/run";

/** A run is "finished" for announce purposes when it reached a terminal outcome. */
const FINISHED: ReadonlySet<string> = new Set(["done", "error"]);

/** The slice of {@link useVoiceData} the spoken briefing reads. */
export interface BriefingInput {
  approvals: Pick<DashboardApproval, "skill">[];
  liveRuns: Pick<RunView, "runId">[];
  recent: Pick<RunView, "runId" | "owner" | "status">[];
}

/** The deterministic facts a spoken briefing is assembled from (template-first). */
export interface BriefingFacts {
  /** Currently running agents. */
  agents: number;
  /** Pending approvals awaiting the operator. */
  approvals: number;
  /** The most prominent pending approval's actor, for a one-line callout. */
  topApprovalSkill?: string;
  /** Recently completed runs (terminal `done`). */
  done: number;
  /** Recently failed runs (terminal `failed`). */
  failed: number;
  /** True when nothing is running, pending, or recently finished — "all quiet". */
  quiet: boolean;
}

/**
 * Reduce the live HUD data to the handful of counts a spoken briefing needs. Pure
 * and deterministic — the screen turns these into a localized sentence, so there is
 * no claude call in the browser (template-first, like the Phase 6 written briefing).
 */
export function summarizeBriefing(data: BriefingInput): BriefingFacts {
  const done = data.recent.filter((r) => r.status === "done").length;
  const failed = data.recent.filter((r) => r.status === "error").length;
  const agents = data.liveRuns.length;
  const approvals = data.approvals.length;
  return {
    agents,
    approvals,
    topApprovalSkill: data.approvals[0]?.skill,
    done,
    failed,
    quiet: agents === 0 && approvals === 0 && done === 0 && failed === 0,
  };
}

/** A run that just reached a terminal outcome and has not been announced yet. */
export interface FinishedRun {
  runId: string;
  owner: string;
  status: "done" | "error";
}

/**
 * The terminal runs in `recent` whose ids are not in `announced` — the new
 * completions to read aloud since the last check. Pure, so the announce effect can
 * be unit-tested without a clock or React.
 */
export function pickNewlyFinished(
  announced: ReadonlySet<string>,
  recent: Pick<RunView, "runId" | "owner" | "status">[],
): FinishedRun[] {
  return recent
    .filter((r) => FINISHED.has(r.status) && !announced.has(r.runId))
    .map((r) => ({
      runId: r.runId,
      owner: r.owner,
      status: r.status as "done" | "error",
    }));
}
