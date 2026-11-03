export type FindingSeverity = "Critical" | "Important" | "Minor";

export interface ReviewFinding {
  path: string;
  line: number;
  startLine?: number;
  severity?: FindingSeverity;
  body: string;
}

// ponytail: mirrors apps/api/src/inbox/pr-review-doc.ts (`### path:line (Severity)`), which the
// API uses to post the same comments; the web can't import the API, so keep the two in step.
const HEADING = /^###\s+`?([^\s`:]+):(\d+)(?:-(\d+))?`?(?:\s*\((Critical|Important|Minor)\))?\s*$/i;

const SEVERITIES: readonly FindingSeverity[] = ["Critical", "Important", "Minor"];

/** A `comment`-phase review document split into its summary and the per-line findings. */
export function parseReviewDoc(doc: string): { summary: string; findings: ReviewFinding[] } {
  const summary: string[] = [];
  const findings: ReviewFinding[] = [];
  let current: { head: RegExpMatchArray; lines: string[] } | null = null;
  const flush = () => {
    if (!current) return;
    const body = current.lines.join("\n").trim();
    const [, path = "", a = "0", b, sev] = current.head;
    const first = Number(a);
    const last = b ? Number(b) : first;
    if (body && first > 0) {
      const severity = SEVERITIES.find((s) => s.toLowerCase() === sev?.toLowerCase());
      findings.push({
        path,
        line: Math.max(first, last),
        ...(last > first && { startLine: first }),
        ...(severity && { severity }),
        body,
      });
    }
    current = null;
  };
  let inFence = false;
  for (const line of doc.split("\n")) {
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
  return { summary: summary.join("\n").trim(), findings };
}

/**
 * The hunk of `path` in a unified `diff` that contains new-side line `line`, cut after that
 * line — the shape `snippetDiff` expects (`@@` header + lines, the last one is the commented
 * line). Null when the line is not part of the diff (a finding on untouched code).
 */
export function findingHunk(diff: string, path: string, line: number): string | null {
  let inFile = false;
  let header: string | null = null;
  let lines: string[] = [];
  let next = 0;
  for (const raw of diff.split("\n")) {
    if (raw.startsWith("diff --git ")) {
      inFile = raw.endsWith(` b/${path}`);
      header = null;
    } else if (!inFile) {
      continue;
    } else if (raw.startsWith("@@")) {
      const m = /^@@ -\d+(?:,\d+)? \+(\d+)/.exec(raw);
      header = raw;
      lines = [];
      next = Number(m?.[1] ?? 0);
    } else if (header && !raw.startsWith("\\") && !raw.startsWith("--- ")) {
      if (raw.startsWith("-")) {
        lines.push(raw);
        continue;
      }
      lines.push(raw);
      if (next === line) return [header, ...lines].join("\n");
      next++;
    }
  }
  return null;
}

/** The review document back from its (possibly edited) parts — the inverse of {@link parseReviewDoc}. */
export function serializeReviewDoc(summary: string, findings: ReviewFinding[]): string {
  const blocks = findings.map((f) => {
    const range = f.startLine ? `${f.startLine}-${f.line}` : `${f.line}`;
    return `### ${f.path}:${range}${f.severity ? ` (${f.severity})` : ""}\n${f.body.trim()}`;
  });
  return [summary.trim(), ...blocks].filter(Boolean).join("\n\n");
}

/** GitHub's "Files changed" link to one line of a file: `…/files#diff-<sha256(path)>R<line>`. */
export async function prFileLineUrl(prUrl: string, path: string, line: number): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(path));
  const hash = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${prUrl}/files#diff-${hash}R${line}`;
}
