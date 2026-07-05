/**
 * Client-side re-parser for a flattened run transcript.
 *
 * The server already flattens `claude -p --output-format stream-json` into a
 * plain-text log (`apps/api/src/runner/claude-stream-format.ts` — the plain log
 * file stays the source of truth). That log is NOT plain prose, though: it is
 * glyph-prefixed scaffolding interleaved with the agent's own markdown text.
 * This re-parses it back into typed segments so the UI can render the agent text
 * as formatted markdown while keeping the scaffolding legible as mono rows.
 *
 * The glyph vocabulary mirrors the formatter (kept deliberately small) and is
 * matched STRICTLY at line-start:
 *
 *   - `▶ `   → system  (model / session header)        [formatSystem]
 *   - `💭 `  → thinking (extended thinking, truncated)  [renderAssistantBlock]
 *   - `● `   → tool     (a tool call)                   [renderToolUse]
 *   - `  ⎿ ` → result   (a tool-result block; 5-space   [renderUserBlock]
 *               continuation lines fold into it)
 *   - `─── ` → footer   (the closing `─── done …` line) [formatResult]
 *   - a `rate_limit_event` JSON line → dropped (operator noise; the formatter
 *               passes these through verbatim).
 *
 * Everything else accumulates into a contiguous `text` (markdown) segment, so a
 * multi-line list or fenced code block reaches the renderer as ONE source
 * string. No fenced-glyph state machine: the glyphs are box-drawing/dot
 * characters that effectively never start a line of prose or code, and result
 * bodies are already mono via their indentation — line-start anchoring suffices.
 */

export type TranscriptSegment =
  | { kind: "text"; markdown: string } // contiguous agent text → markdown
  | { kind: "thinking"; text: string } // 💭 line (glyph stripped)
  | { kind: "tool"; text: string } // ● line (glyph stripped)
  | { kind: "result"; text: string } // ⎿ block (multi-line, grouped; kept raw)
  | { kind: "system"; text: string } // ▶ line (glyph stripped)
  | { kind: "footer"; text: string }; // ─── line (glyph stripped)

/** A `⎿` result continuation line: the formatter indents these with 5 spaces. */
const RESULT_CONTINUATION = /^ {5}/;

/** True for a line the formatter passed through verbatim that is operator noise. */
function isDroppedJsonLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed.startsWith("{")) return false; // cheap guard before JSON.parse
  let value: unknown;
  try {
    value = JSON.parse(trimmed);
  } catch {
    return false;
  }
  return (
    typeof value === "object" &&
    value !== null &&
    ((value as Record<string, unknown>).type === "rate_limit_event" ||
      "rate_limit_info" in (value as Record<string, unknown>))
  );
}

export function parseTranscript(text: string): TranscriptSegment[] {
  const segments: TranscriptSegment[] = [];
  let textBuf: string[] = [];
  let resultBuf: string[] | null = null;

  const flushText = (): void => {
    if (textBuf.length === 0) return;
    // Trim blank leading/trailing LINES only — never the leading whitespace of a
    // real first line (an indented code block would otherwise lose its indent).
    const markdown = textBuf.join("\n").replace(/^\n+|\n+$/g, "");
    textBuf = [];
    if (markdown.trim()) segments.push({ kind: "text", markdown });
  };
  const flushResult = (): void => {
    if (resultBuf && resultBuf.length > 0) {
      segments.push({ kind: "result", text: resultBuf.join("\n") });
    }
    resultBuf = null;
  };

  for (const line of text.split("\n")) {
    // Inside a result block, fold 5-space continuation lines; anything else ends it.
    if (resultBuf) {
      if (RESULT_CONTINUATION.test(line)) {
        resultBuf.push(line);
        continue;
      }
      flushResult();
    }

    if (isDroppedJsonLine(line)) {
      // A rate_limit event marks a message boundary — flush any pending text.
      flushText();
      continue;
    }

    if (line.startsWith("  ⎿")) {
      flushText();
      resultBuf = [line];
      continue;
    }
    if (line.startsWith("▶ ")) {
      flushText();
      segments.push({ kind: "system", text: line.slice(2) });
      continue;
    }
    if (line.startsWith("💭 ")) {
      flushText();
      segments.push({ kind: "thinking", text: line.replace(/^💭 /, "") });
      continue;
    }
    if (line.startsWith("● ")) {
      flushText();
      segments.push({ kind: "tool", text: line.slice(2) });
      continue;
    }
    if (line.startsWith("─── ")) {
      flushText();
      segments.push({ kind: "footer", text: line.slice(4) });
      continue;
    }

    textBuf.push(line);
  }

  flushResult();
  flushText();
  return segments;
}

/**
 * A grouped transcript unit: every {@link TranscriptSegment} passes through
 * unchanged EXCEPT a `tool` segment immediately followed by its `result` — those
 * fold into one `toolCall` group so the UI can render a single collapsible unit
 * (trigger row + optional body) instead of two adjacent segments.
 */
export type TranscriptGroup =
  | TranscriptSegment // everything else, unchanged
  | { kind: "toolCall"; tool: string; result?: string }; // ● + its immediate ⎿, folded

/**
 * Fold `tool` + immediately-following `result` segments into one `toolCall` group.
 * `parseTranscript` itself stays untouched (its output and tests are unaffected) —
 * this is a pure post-processing pass. A `tool` segment not followed by a `result`
 * becomes a `toolCall` with no `result` (a tool call with no output). A `result`
 * with no preceding `tool` (rare) passes through unchanged, as does everything else.
 */
export function groupTranscript(segments: TranscriptSegment[]): TranscriptGroup[] {
  const groups: TranscriptGroup[] = [];
  let i = 0;
  while (i < segments.length) {
    const seg = segments[i];
    if (!seg) break;

    if (seg.kind === "tool") {
      const next = segments[i + 1];
      if (next && next.kind === "result") {
        groups.push({ kind: "toolCall", tool: seg.text, result: next.text });
        i += 2;
        continue;
      }
      groups.push({ kind: "toolCall", tool: seg.text });
      i += 1;
      continue;
    }

    groups.push(seg);
    i += 1;
  }
  return groups;
}
