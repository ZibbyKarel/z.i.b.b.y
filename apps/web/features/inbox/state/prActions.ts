import type {
  InboxPr,
  PrAddressCommentsState,
  PrFixCiState,
  PrRebaseState,
  PrReviewState,
} from "@zibby/contracts";

export type Run =
  | { kind: "review"; taskId: string; state: PrReviewState; auto?: true | undefined }
  | { kind: "rebase"; taskId: string; state: PrRebaseState; auto?: undefined }
  | { kind: "address"; taskId: string; state: PrAddressCommentsState; auto?: true | undefined }
  | { kind: "fix-ci"; taskId: string; state: PrFixCiState; auto?: undefined };

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
/** Write actions (fix / rebase / fix-CI / merge) are for my own PRs; colleagues' PRs get review only. */
export const isMine = (pr: InboxPr) => pr.bucket === "mine";
export const isFix = (pr: InboxPr) =>
  !isReview(pr) &&
  isMine(pr) &&
  pr.headRef !== undefined &&
  hasThreadsToAddress(pr) &&
  !handled(pr, pr.addressComments);
/** todo-11 — offered on my outdated PR (conflicting or behind its base), alongside Address. */
export const isRebase = (pr: InboxPr) =>
  isMine(pr) && (pr.mergeable === false || pr.behind === true);
/** Offered on my PR with failing checks (never a fork head); independent of Address/Rebase. */
export const isFixCi = (pr: InboxPr) =>
  isMine(pr) && pr.ci === "failing" && pr.headRef !== undefined && !handled(pr, pr.fixCi);
export const isMerge = (pr: InboxPr) => isMine(pr) && pr.section === "ready-to-merge";

/** The PR's ZIBBY runs, address → fix-ci → rebase → review (the order the label prefers). */
export function runsOf(pr: InboxPr): Run[] {
  const runs: Run[] = [];
  if (pr.addressComments) runs.push({ kind: "address", ...pr.addressComments });
  if (pr.fixCi) runs.push({ kind: "fix-ci", ...pr.fixCi });
  if (pr.rebase) runs.push({ kind: "rebase", ...pr.rebase });
  if (pr.codeReview) runs.push({ kind: "review", ...pr.codeReview });
  return runs;
}
export const inFlight = (r: Run) => r.state === "running" || r.state === "awaiting-approval";

/** Whether `PrActions` renders anything for this PR. */
export const hasPrActions = (pr: InboxPr) =>
  isReview(pr) ||
  isFix(pr) ||
  isFixCi(pr) ||
  isRebase(pr) ||
  isMerge(pr) ||
  runsOf(pr).some((r) => inFlight(r) || r.state === "failed");
