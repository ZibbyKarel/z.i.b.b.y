/**
 * Pure parser for the `claude` CLI `--output-format stream-json
 * --include-partial-messages` event stream. Maps one raw JSONL line to zero or
 * more normalized chat events. Kept side-effect-free so it is unit-tested against
 * the real CLI shapes without spawning a process (the engine just feeds it lines).
 *
 * Event shapes (CLI 2.1.186), confirmed by spike:
 *  - {"type":"system","subtype":"init","session_id":"…"}                → session
 *  - {"type":"stream_event","event":{"type":"content_block_delta",
 *       "delta":{"type":"text_delta","text":"…"}}}                      → delta
 *    (thinking blocks emit thinking_delta/signature_delta, tool blocks
 *     input_json_delta — filtering on text_delta yields only visible text)
 *  - {"type":"assistant","message":{"content":[{"type":"tool_use",…}]}} → tool
 *  - {"type":"result","result":"…","is_error":false}                    → done
 *  - {"type":"result","is_error":true}                                  → error
 */

export type ChatStreamEvent =
  | { type: "session"; sessionId: string }
  | { type: "delta"; text: string }
  | { type: "tool"; name: string; input: unknown }
  | { type: "done"; text: string }
  | { type: "error"; message: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function parseChatStreamLine(line: string): ChatStreamEvent[] {
  const trimmed = line.trim();
  if (!trimmed) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return [];
  }
  if (!isRecord(parsed)) return [];

  const type = parsed["type"];

  if (type === "system" && parsed["subtype"] === "init") {
    const sessionId = parsed["session_id"];
    return typeof sessionId === "string" ? [{ type: "session", sessionId }] : [];
  }

  if (type === "stream_event") {
    const event = parsed["event"];
    if (!isRecord(event) || event["type"] !== "content_block_delta") return [];
    const delta = event["delta"];
    if (!isRecord(delta) || delta["type"] !== "text_delta") return [];
    const text = delta["text"];
    return typeof text === "string" && text.length > 0 ? [{ type: "delta", text }] : [];
  }

  if (type === "assistant") {
    const message = parsed["message"];
    if (!isRecord(message)) return [];
    const content = message["content"];
    if (!Array.isArray(content)) return [];
    const tools: ChatStreamEvent[] = [];
    for (const block of content) {
      if (isRecord(block) && block["type"] === "tool_use" && typeof block["name"] === "string") {
        tools.push({ type: "tool", name: block["name"], input: block["input"] ?? null });
      }
    }
    return tools;
  }

  if (type === "result") {
    const result = typeof parsed["result"] === "string" ? (parsed["result"] as string) : "";
    if (parsed["is_error"] === true) {
      return [{ type: "error", message: result || "claude chat turn failed" }];
    }
    return [{ type: "done", text: result }];
  }

  return [];
}
