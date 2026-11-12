import { MAX_RESULT_CHARS, MAX_RESULT_LINES, isRecord, truncate } from "./claude-stream-format";

/**
 * The opencode sibling of {@link formatClaudeStreamLine}: flattens one line of
 * `opencode run --format json` (JSONL `{type, timestamp, sessionID, part}`) into the
 * same readable log shape — model text as-is, `● tool …` calls, `⎿` results. A line
 * that isn't a known event is returned verbatim (pass-through, like the Claude one).
 */
export function formatOpencodeStreamLine(raw: string): string | null {
  const event = parseEvent(raw);
  if (!event) return raw;
  const part = isRecord(event.part) ? event.part : {};
  switch (event.type) {
    case "step_start":
    case "step_finish":
      return null; // bookkeeping; cost is read by extractOpencodeCost
    case "text":
      return typeof part.text === "string" && part.text.trim() ? part.text : null;
    case "reasoning":
      return typeof part.text === "string" && part.text.trim() ? `💭 ${truncate(part.text)}` : null;
    case "tool_use":
      return renderTool(part);
    case "error": {
      const err = isRecord(event.error) ? event.error : {};
      return `⚠ opencode error: ${String(err.message ?? err.type ?? "unknown")}`;
    }
    default:
      return raw;
  }
}

/** A `tool_use` event arrives finished: render the call and its result together. */
function renderTool(part: Record<string, unknown>): string {
  const tool = typeof part.tool === "string" ? part.tool : "tool";
  const state = isRecord(part.state) ? part.state : {};
  const input = isRecord(state.input) ? state.input : {};
  const target = input.path ?? input.filePath ?? input.pattern;
  const call =
    tool === "shell" && typeof input.command === "string"
      ? `● Shell$ ${input.command}`
      : typeof target === "string"
        ? `● ${tool} ${target}`
        : `● ${tool} ${truncate(JSON.stringify(input))}`;
  const failed = state.status === "error";
  const body = failed ? String(state.error ?? "") : String(state.output ?? "");
  if (!body.trim()) return call;
  const result = truncate(body.trimEnd(), MAX_RESULT_CHARS, MAX_RESULT_LINES)
    .split("\n")
    .map((line, i) => (i === 0 ? `  ${failed ? "⎿ ⚠ " : "⎿ "}${line}` : `     ${line}`))
    .join("\n");
  return `${call}\n${result}`;
}

/** Cost of one `step_finish` line (A9: a run's cost is their sum), else `null`. */
export function extractOpencodeCost(raw: string): number | null {
  if (!raw.includes('"step_finish"')) return null;
  const event = parseEvent(raw);
  if (event?.type !== "step_finish" || !isRecord(event.part)) return null;
  return typeof event.part.cost === "number" ? event.part.cost : null;
}

/** The `sessionID` every opencode event carries (resume = `--session <id>`), else `null`. */
export function extractOpencodeSessionId(raw: string): string | null {
  if (!raw.includes('"sessionID"')) return null;
  const event = parseEvent(raw);
  return typeof event?.sessionID === "string" ? event.sessionID : null;
}

function parseEvent(raw: string): Record<string, unknown> | null {
  const line = raw.trim();
  if (!line.startsWith("{")) return null;
  try {
    const event: unknown = JSON.parse(line);
    return isRecord(event) && typeof event.type === "string" ? event : null;
  } catch {
    return null;
  }
}
