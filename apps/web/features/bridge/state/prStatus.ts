import type { InboxPr } from "@zibby/contracts";
import { prAncestors } from "../../inbox/inbox";

/** Tone vocabulary of the reference `TS()` — `draft` is the neutral `--line2` stripe. */
export type PrTone = "work" | "think" | "block" | "err" | "done" | "idle" | "draft";

export type PrStatusKey =
  | "reviewRequested"
  | "draft"
  | "ciFailing"
  | "mergeConflict"
  | "changesRequested"
  | "checksRunning"
  | "approved"
  | "awaitingReview"
  | "reviewedApproved"
  | "reviewedChangesRequested"
  | "reviewedCommented";

const STATUS: Record<PrStatusKey, { tone: PrTone; label: string }> = {
  reviewRequested: { tone: "think", label: "REVIEW REQUESTED" },
  draft: { tone: "draft", label: "DRAFT" },
  ciFailing: { tone: "err", label: "CI FAILING" },
  mergeConflict: { tone: "err", label: "MERGE CONFLICT" },
  changesRequested: { tone: "block", label: "CHANGES REQUESTED" },
  checksRunning: { tone: "think", label: "CHECKS RUNNING" },
  approved: { tone: "done", label: "APPROVED" },
  awaitingReview: { tone: "idle", label: "AWAITING REVIEW" },
  reviewedApproved: { tone: "done", label: "YOU APPROVED" },
  reviewedChangesRequested: { tone: "block", label: "YOU REQUESTED CHANGES" },
  reviewedCommented: { tone: "idle", label: "YOU COMMENTED" },
};

/**
 * Port of the reference `TS()` precedence onto `InboxPr`:
 * review requested -> draft -> CI failing -> changes requested -> checks running ->
 * approved -> awaiting review. Field mapping:
 * - `p.need === 'REVIEW' && !needDone` -> `bucket === "to-review"` and not yet `ready-to-merge`
 *   (same rule as `prState` in inbox.ts; the server drops a request once you reviewed).
 * - `review === 'draft'` -> `draft`; failing checks -> `ci === "failing"`;
 *   `review === 'changes'` -> `review === "changes-requested"`; `running` -> `ci === "pending"`;
 *   `review === 'approved'` -> `review === "approved"`.
 * - `merged`: the inbox only lists OPEN PRs, so MERGED never occurs and has no branch here.
 * - Extra (not in the reference): a merge conflict (`blocker === "merge-conflict"` or
 *   `mergeable === false`) reads as an error right after CI failing — it blocks merging too.
 */
export function prStatusKey(pr: InboxPr): PrStatusKey {
  if (pr.bucket === "to-review" && pr.blocker !== "ready-to-merge") return "reviewRequested";
  if (pr.draft) return "draft";
  if (pr.bucket === "reviewed") {
    if (pr.myReview === "approved") return "reviewedApproved";
    return pr.myReview === "changes-requested" ? "reviewedChangesRequested" : "reviewedCommented";
  }
  if (pr.ci === "failing") return "ciFailing";
  if (pr.blocker === "merge-conflict" || pr.mergeable === false) return "mergeConflict";
  if (pr.review === "changes-requested") return "changesRequested";
  if (pr.ci === "pending") return "checksRunning";
  if (pr.review === "approved") return "approved";
  return "awaitingReview";
}

export function prStatus(pr: InboxPr): { tone: PrTone; label: string } {
  return STATUS[prStatusKey(pr)];
}

/** Ancestors of `pr` through `baseRef === other.headRef` in the same repo, root (bottom) first. */
export function prStack(pr: InboxPr, all: InboxPr[]): InboxPr[] {
  return prAncestors(pr, all);
}
