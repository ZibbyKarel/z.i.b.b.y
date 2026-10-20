/**
 * todo-22 — the `comment` phase's review document (`zibby-pr-review.md`): a summary on
 * top (the review body), then `### path:line (Severity)` blocks, one inline comment each.
 * The operator approves the document as is; GitHub gets the summary + inline comments
 * without the severity labels. A block whose heading doesn't parse stays in the summary.
 */
export interface PrReviewInlineComment {
  path: string;
  line: number;
  startLine?: number;
  body: string;
}

const HEADING =
  /^###\s+`?([^\s`:]+):(\d+)(?:-(\d+))?`?(?:\s*\((?:Critical|Important|Minor)\))?\s*$/i;

export function parsePrReviewDoc(doc: string): {
  summary: string;
  comments: PrReviewInlineComment[];
} {
  const summary: string[] = [];
  const comments: PrReviewInlineComment[] = [];
  let current: { head: RegExpMatchArray; lines: string[] } | null = null;
  const flush = () => {
    if (!current) return;
    const body = current.lines.join("\n").trim();
    const [, path = "", a = "0", b] = current.head;
    const first = Number(a);
    const last = b ? Number(b) : first;
    if (body && first > 0) {
      comments.push(
        last > first
          ? { path, line: last, startLine: first, body }
          : { path, line: Math.max(first, last), body },
      );
    }
    current = null;
  };
  let inFence = false;
  for (const line of doc.split("\n")) {
    // A `### ` line inside a ``` / ~~~ fence is code, not a heading.
    if (/^\s*(?:```|~~~)/.test(line)) inFence = !inFence;
    const head = inFence ? null : line.match(HEADING);
    if (head) {
      flush();
      current = { head, lines: [] };
    } else if (current && !inFence && /^###\s/.test(line)) {
      flush();
      summary.push(line);
    } else if (current) {
      current.lines.push(line);
    } else {
      summary.push(line);
    }
  }
  flush();
  // ponytail: 100 inline comments max; the rest is folded into the summary.
  const extra = comments.splice(100);
  const text = summary.join("\n").trim();
  return { summary: extra.length ? foldComments(text, extra) : text, comments };
}

/** Inline comments folded back into one review body (GitHub rejected the inline ones). */
export function foldComments(summary: string, comments: PrReviewInlineComment[]): string {
  return [
    summary,
    ...comments.map(
      (c) => `\`${c.path}:${c.startLine ? `${c.startLine}-` : ""}${c.line}\` ${c.body}`,
    ),
  ]
    .filter(Boolean)
    .join("\n\n");
}
