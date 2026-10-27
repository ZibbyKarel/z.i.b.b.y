import type { ChatAbout, InboxPr, InboxPrDiff } from "@zibby/contracts";
import { diffFiles } from "../bridge/state/diffFiles";

/** How much of the unified diff the chat gets (the schema allows 24 000 for all of `details`). */
export const PR_CHAT_DIFF_MAX = 12_000;
const LABEL_MAX = 200;
/** Keeps the file list (plus the diff) inside the schema's `details` cap. */
const FILES_MAX = 80;

const oneLine = (s: string) => s.replace(/\s+/g, " ").trim();

/** The chat context for a PR: metadata + per-file stats + a bounded diff. Review threads are skipped. */
export function prChatAbout(
  pr: InboxPr,
  opts: { baseLabel?: string; diff?: InboxPrDiff } = {},
): ChatAbout {
  const base = opts.baseLabel ?? pr.baseRef ?? "?";
  const lines = [
    `Repository: ${pr.repo}`,
    `PR: #${pr.number} ${oneLine(pr.title)}`,
    `URL: ${pr.url}`,
    `Author: ${pr.author}`,
    `Bucket: ${pr.bucket}`,
    `Branch: ${pr.headRef ?? "?"} → ${base}`,
    `Draft: ${pr.draft ? "yes" : "no"}`,
    `CI: ${pr.ci}`,
    `Review: ${pr.review}`,
    `Mergeable: ${pr.mergeable === null ? "unknown" : pr.mergeable ? "yes" : "no"}`,
    `Blocker: ${pr.blocker}`,
    `Section: ${pr.section}`,
    ...(pr.codeReview ? [`ZIBBY code review: ${pr.codeReview.state}`] : []),
    `Project: ${pr.projectId}`,
  ];
  if (opts.diff) {
    const files = diffFiles(opts.diff.diff);
    lines.push("", `Files changed (${files.length}):`);
    for (const f of files.slice(0, FILES_MAX)) lines.push(`${f.path} +${f.added} −${f.removed}`);
    if (files.length > FILES_MAX) lines.push(`… and ${files.length - FILES_MAX} more`);
    const cut = opts.diff.diff.length > PR_CHAT_DIFF_MAX;
    lines.push("", "Diff:", opts.diff.diff.slice(0, PR_CHAT_DIFF_MAX));
    if (cut || opts.diff.truncated) lines.push("[diff truncated]");
  }
  return {
    kind: "pr",
    id: pr.url,
    href: pr.url,
    label: oneLine(`PR #${pr.number} · ${pr.title}`).slice(0, LABEL_MAX),
    details: lines.join("\n"),
  };
}
