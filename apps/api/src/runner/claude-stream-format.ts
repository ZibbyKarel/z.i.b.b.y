/**
 * Flattens one line of `claude -p --output-format stream-json` output into a single
 * human-readable log line. Runs are spawned with stream-json so the log captures the
 * WHOLE transcript (assistant text, every tool call, tool results, the final
 * summary) — default `-p` text mode prints only the final message, leaving the log
 * looking empty mid-run.
 *
 * stream-json emits one JSON object per line (JSONL): a `system` init, an `assistant`
 * message (text + `tool_use` blocks), a `user` message (carrying `tool_result`
 * blocks), and a closing `result`. We render each into a compact line the existing
 * text log viewer can tail unchanged.
 *
 * Crucially this is a **pass-through on anything that isn't a stream-json event**: a
 * line that isn't JSON, or is JSON without a known stream-json `type`, is returned
 * verbatim. That keeps the demo/test path (bare `PROGRESS n` / `INTENT {json}` lines)
 * and any stray child output intact, so the same formatter is safe to attach to a
 * runner whose children aren't all claude.
 */

/** Hard caps so a noisy tool result (e.g. a huge directory listing) can't flood the log. */
const MAX_RESULT_LINES = 40
const MAX_RESULT_CHARS = 2000
/** Cap for a tool call's inlined input JSON when it has no well-known target key. */
const MAX_INPUT_CHARS = 200

/**
 * Render a single stream-json line for the log, or `null` to omit it entirely (no
 * newline written). Non-event lines are returned unchanged.
 */
export function formatClaudeStreamLine(raw: string): string | null {
  const trimmed = raw.trim()
  if (!trimmed) return raw

  let event: unknown
  try {
    event = JSON.parse(trimmed)
  } catch {
    return raw // not JSON — ordinary output, keep as-is
  }
  if (!isRecord(event) || typeof event.type !== "string") return raw

  switch (event.type) {
    case "system":
      return formatSystem(event)
    case "assistant":
      return formatMessage(event, "assistant")
    case "user":
      return formatMessage(event, "user")
    case "result":
      return formatResult(event)
    default:
      return raw // unknown stream-json type — don't drop it, just pass through
  }
}

/** `system`/init carries the session's model; everything else is housekeeping we drop. */
function formatSystem(event: Record<string, unknown>): string | null {
  if (event.subtype !== "init") return null
  return typeof event.model === "string" ? `▶ ${event.model}` : "▶ session started"
}

/**
 * An `assistant` message renders its text + tool calls; a `user` message renders only
 * the tool results it carries (the opening user turn — our prompt + directive — is
 * skipped so the log doesn't echo it back).
 */
function formatMessage(event: Record<string, unknown>, role: "assistant" | "user"): string | null {
  const message = event.message
  if (!isRecord(message)) return null
  const content = message.content
  const blocks = Array.isArray(content)
    ? content
    : typeof content === "string"
      ? [{ type: "text", text: content }]
      : []

  const out: string[] = []
  for (const block of blocks) {
    if (!isRecord(block)) continue
    const rendered = role === "assistant" ? renderAssistantBlock(block) : renderUserBlock(block)
    if (rendered) out.push(rendered)
  }
  return out.length ? out.join("\n") : null
}

/** Text, extended-thinking, and tool calls from an assistant turn. */
function renderAssistantBlock(block: Record<string, unknown>): string | null {
  switch (block.type) {
    case "text":
      return typeof block.text === "string" && block.text.trim() ? block.text : null
    case "thinking":
      return typeof block.thinking === "string" && block.thinking.trim()
        ? `💭 ${truncate(block.thinking)}`
        : null
    case "tool_use":
      return renderToolUse(block)
    default:
      return null
  }
}

/** A `● Tool …` line: the Bash command, the file path, or a compact input blob. */
function renderToolUse(block: Record<string, unknown>): string | null {
  const name = typeof block.name === "string" ? block.name : "tool"
  const input = isRecord(block.input) ? block.input : {}
  if (name === "Bash" && typeof input.command === "string") {
    return `● Bash$ ${input.command}`
  }
  const target = input.file_path ?? input.path ?? input.pattern
  if (typeof target === "string") return `● ${name} ${target}`
  const keys = Object.keys(input)
  return keys.length ? `● ${name} ${truncate(JSON.stringify(input), MAX_INPUT_CHARS)}` : `● ${name}`
}

/** A `⎿` block echoing a tool's result (only `tool_result` blocks; the rest are dropped). */
function renderUserBlock(block: Record<string, unknown>): string | null {
  if (block.type !== "tool_result") return null
  const body = truncate(extractText(block.content), MAX_RESULT_CHARS, MAX_RESULT_LINES)
  const marker = block.is_error === true ? "⎿ ⚠ " : "⎿ "
  return body
    .split("\n")
    .map((line, i) => (i === 0 ? `  ${marker}${line}` : `     ${line}`))
    .join("\n")
}

/** Closing `result` event → a one-line footer (the final text already streamed above). */
function formatResult(event: Record<string, unknown>): string | null {
  const secs =
    typeof event.duration_ms === "number" ? ` in ${(event.duration_ms / 1000).toFixed(1)}s` : ""
  if (event.subtype && event.subtype !== "success") return `─── ended (${String(event.subtype)})`
  return `─── done${secs}`
}

/** Pull display text out of a tool_result's `content` (string or block array). */
function extractText(content: unknown): string {
  if (typeof content === "string") return content
  if (Array.isArray(content)) {
    return content
      .map((b) => (isRecord(b) && typeof b.text === "string" ? b.text : ""))
      .filter(Boolean)
      .join("\n")
  }
  return ""
}

/** Clamp by both characters and lines, appending a count of what was dropped. */
function truncate(text: string, maxChars = MAX_INPUT_CHARS, maxLines = Number.POSITIVE_INFINITY): string {
  let out = text
  if (out.length > maxChars) out = `${out.slice(0, maxChars)}…`
  const lines = out.split("\n")
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines)
    return `${kept.join("\n")}\n     … (+${lines.length - maxLines} more lines)`
  }
  return out
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}
