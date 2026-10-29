import type { ChatAbout, InboxRoadmapItem, TaskRun } from "@zibby/contracts";

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
