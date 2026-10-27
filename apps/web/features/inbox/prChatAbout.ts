import type { ChatAbout, InboxPr, InboxPrDiff } from "@zibby/contracts";
import { diffFiles } from "../bridge/state/diffFiles";

/** How much of the unified diff the chat gets (the schema allows 24 000 for all of `details`). */
export const PR_CHAT_DIFF_MAX = 12_000;
const LABEL_MAX = 200;
/** Keeps the file list (plus the diff) inside the schema's `details` cap. */
const FILES_MAX = 80;

/** `ChatAboutSchema.details` max (libs/contracts chat.schema.ts). */
const DETAILS_MAX = 24_000;
/** Header + file stats budget; the diff gets the rest. */
const HEAD_MAX = 9_000;
const MARKER = "[diff truncated]";

/** `slice(0, n)` that never leaves half a surrogate pair at the cut. */
function safeSlice(s: string, n: number): string {
  if (s.length <= n) return s;
  const last = s.charCodeAt(n - 1);
  return s.slice(0, last >= 0xd800 && last <= 0xdbff ? n - 1 : n);
}

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
    let shown = 0;
    let size = lines.join("\n").length;
    for (const f of files) {
      const line = `${f.path} +${f.added} −${f.removed}`;
      if (shown >= FILES_MAX || size + line.length + 1 > HEAD_MAX) break;
      lines.push(line);
      size += line.length + 1;
      shown++;
    }
    if (files.length > shown) lines.push(`… and ${files.length - shown} more`);
    const head = `${lines.join("\n")}\n\nDiff:\n`;
    // The diff gets whatever the header and stats leave, never more than PR_CHAT_DIFF_MAX.
    const room = Math.min(PR_CHAT_DIFF_MAX, DETAILS_MAX - head.length - MARKER.length - 1);
    const raw = opts.diff.diff;
    const cut = raw.length > room;
    const body = cut ? safeSlice(raw, room) : raw;
    return build(pr, head + body + (cut || opts.diff.truncated ? `\n${MARKER}` : ""));
  }
  return build(pr, lines.join("\n"));
}

function build(pr: InboxPr, details: string): ChatAbout {
  return {
    kind: "pr",
    id: pr.url,
    href: pr.url,
    label: safeSlice(oneLine(`PR #${pr.number} · ${pr.title}`), LABEL_MAX),
    details,
  };
}
