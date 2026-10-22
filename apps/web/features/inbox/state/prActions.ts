import type {
  InboxPr,
  PrAddressCommentsState,
  PrRebaseState,
  PrReviewState,
} from "@zibby/contracts";

export type Run =
  | { kind: "review"; taskId: string; state: PrReviewState }
  | { kind: "rebase"; taskId: string; state: PrRebaseState }
  | { kind: "address"; taskId: string; state: PrAddressCommentsState };

/**
 * ZIBBY's own writes (the review, the push, thread replies, re-requests) bump GitHub's
 * `updated_at` just before `finishedAt` is stamped — this absorbs them plus clock skew.
 * ponytail: a colleague's comment within this window after a run stays hidden until the next change.
 */
export const SETTLE_MS = 60_000;
/** The run succeeded after the PR's last change: nothing new to act on until the PR moves again. */
export const handled = (pr: InboxPr, run?: { finishedAt?: string }) =>
  run?.finishedAt !== undefined &&
  pr.updatedAt !== undefined &&
  Date.parse(pr.updatedAt) <= Date.parse(run.finishedAt) + SETTLE_MS;

export const isReview = (pr: InboxPr) => pr.bucket === "to-review" && !handled(pr, pr.codeReview);
/** Colleagues may review with comments only, so open threads count, not just CHANGES_REQUESTED. */
export const hasThreadsToAddress = (pr: InboxPr) =>
  pr.unresolvedThreads === undefined
    ? pr.blocker === "changes-requested" // unknown count: only a changes-requested PR still offers it
    : pr.unresolvedThreads > 0;
export const isFix = (pr: InboxPr) =>
  !isReview(pr) &&
  pr.bucket === "mine" &&
  pr.headRef !== undefined &&
  hasThreadsToAddress(pr) &&
  !handled(pr, pr.addressComments);
/** todo-11 — offered on any outdated PR (conflicting or behind its base), alongside Review/Address. */
export const isRebase = (pr: InboxPr) => pr.mergeable === false || pr.behind === true;
export const isMerge = (pr: InboxPr) => pr.section === "ready-to-merge";

/** The PR's ZIBBY runs, address → rebase → review (the order the label prefers). */
export function runsOf(pr: InboxPr): Run[] {
  const runs: Run[] = [];
  if (pr.addressComments) runs.push({ kind: "address", ...pr.addressComments });
  if (pr.rebase) runs.push({ kind: "rebase", ...pr.rebase });
  if (pr.codeReview) runs.push({ kind: "review", ...pr.codeReview });
  return runs;
}
export const inFlight = (r: Run) => r.state === "running" || r.state === "awaiting-approval";

/** Whether `PrActions` renders anything for this PR. */
export const hasPrActions = (pr: InboxPr) =>
  isReview(pr) ||
  isFix(pr) ||
  isRebase(pr) ||
  isMerge(pr) ||
  runsOf(pr).some((r) => inFlight(r) || r.state === "failed");
