import type {
  ChatAbout,
  InboxPrThread,
  InboxRoadmapItem,
  PrThreadOutcome,
  TaskRun,
} from "@zibby/contracts";

/** `ChatAboutSchema` caps (libs/contracts chat.schema.ts). */
const LABEL_MAX = 200;
const DETAILS_MAX = 24_000;

const oneLine = (s: string) => s.replace(/\s+/g, " ").trim();

/** `slice(0, n)` that never leaves half a surrogate pair at the cut. */
function safeSlice(s: string, n: number): string {
  if (s.length <= n) return s;
  const last = s.charCodeAt(n - 1);
  return s.slice(0, last >= 0xd800 && last <= 0xdbff ? n - 1 : n);
}

function build(
  kind: string,
  id: string,
  label: string,
  lines: (string | false | undefined)[],
  body?: string,
  href?: string,
): ChatAbout {
  const head = lines.filter(Boolean).join("\n");
  return {
    kind,
    id: oneLine(id),
    label: safeSlice(oneLine(label), LABEL_MAX),
    ...(href && { href: oneLine(href) }),
    details: safeSlice(body?.trim() ? `${head}\n\n${body}` : head, DETAILS_MAX),
  };
}

/** The chat context for an inbox issue: metadata + its description. */
export function issueChatAbout(item: InboxRoadmapItem, key: string): ChatAbout {
  return build(
    "issue",
    `${item.projectId}/${item.id}`,
    `${key} · ${item.name}`,
    [
      `Issue: ${key} ${oneLine(item.name)}`,
      `Project: ${item.project.name}`,
      `Source: ${item.source.kind}`,
      item.source.url && `URL: ${item.source.url}`,
      item.sourceStatus && `Source status: ${item.sourceStatus.name}`,
      `Lifecycle: ${item.lifecycle}`,
      item.lastFailureReason && `Last failure: ${oneLine(item.lastFailureReason)}`,
      "",
      "Description:",
    ],
    item.description || "(none)",
    item.source.url ?? undefined,
  );
}

/** The chat context for a task run: status + the task's prompt and outcome. */
export function runChatAbout(run: TaskRun): ChatAbout {
  return build(
    "run",
    run.runId,
    `Run · ${run.title || run.taskTitle || run.runId}`,
    [
      `Run: ${run.runId}`,
      `Kind: ${run.kind}`,
      run.owner && `Owner: ${run.owner}`,
      `Status: ${run.status}`,
      run.project && `Project: ${run.project}`,
      `Started: ${run.startedAt}`,
      run.taskId && `Task: ${run.taskId}`,
      run.taskOutcomeSummary && `Outcome: ${oneLine(run.taskOutcomeSummary)}`,
      run.prOutput && `PR: ${run.prOutput.url}`,
      "",
      "Prompt:",
    ],
    run.taskText || run.prompt,
    `/activity/runs/${run.runId}`,
  );
}

/** The chat context for a team KB note: its body. */
export function noteChatAbout(
  note: { id: string; title: string; body: string },
  team: string,
  href: string,
): ChatAbout {
  return build(
    "note",
    `${team}:${note.id}`,
    note.title,
    [`Note: ${oneLine(note.title)}`, `Team: ${team}`, `Path: ${note.id}`, ""],
    note.body,
    href,
  );
}

/** The chat context for a PR review thread: location, state, code context and every comment. */
export function threadChatAbout(
  thread: InboxPrThread,
  opts: { pr?: string; outcome?: PrThreadOutcome } = {},
): ChatAbout {
  const where = thread.line === null ? thread.path : `${thread.path}:${thread.line}`;
  const comments = thread.comments
    .map((c) => `${c.author?.login ?? "unknown"} (${c.createdAt}):\n${c.body}`)
    .join("\n\n");
  return build(
    "thread",
    thread.id,
    `Thread · ${where}`,
    [
      opts.pr && `PR: ${oneLine(opts.pr)}`,
      `File: ${where}`,
      thread.url && `URL: ${thread.url}`,
      `Resolved: ${thread.isResolved ? "yes" : "no"}`,
      `Outdated: ${thread.isOutdated ? "yes" : "no"}`,
      opts.outcome &&
        `ZIBBY outcome: ${opts.outcome.kind}${opts.outcome.note ? ` — ${oneLine(opts.outcome.note)}` : ""}`,
      "",
      "Code context:",
      thread.diffHunk || "(none)",
      "",
      `Comments (${thread.comments.length}):`,
    ],
    comments,
    thread.url,
  );
}

/** The chat context for one finding of a PR review the operator is about to post. */
export function findingChatAbout(
  finding: { path: string; line: number; severity?: string; body: string },
  approvalId: string,
  summary?: string,
): ChatAbout {
  const where = `${finding.path}:${finding.line}`;
  return build(
    "finding",
    `${approvalId}:${where}`,
    `Review finding · ${where}`,
    [
      `File: ${where}`,
      finding.severity && `Severity: ${finding.severity}`,
      "Draft review comment, not yet posted to GitHub.",
      summary?.trim() && `Review summary: ${oneLine(summary)}`,
      "",
      "Comment:",
    ],
    finding.body,
  );
}
