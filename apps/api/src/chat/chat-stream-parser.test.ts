import { describe, expect, it } from "vitest";
import { parseChatStreamLine } from "./chat-stream-parser";

/**
 * Lines are the real CLI 2.1.186 shapes captured during the engine spike
 * (`--output-format stream-json --include-partial-messages`).
 */
describe("parseChatStreamLine", () => {
  it("captures the session id from the init event", () => {
    const line = JSON.stringify({ type: "system", subtype: "init", session_id: "sess-1" });
    expect(parseChatStreamLine(line)).toEqual([{ type: "session", sessionId: "sess-1" }]);
  });

  it("forwards visible text deltas", () => {
    const line = JSON.stringify({
      type: "stream_event",
      event: { type: "content_block_delta", index: 1, delta: { type: "text_delta", text: "Ahoj" } },
    });
    expect(parseChatStreamLine(line)).toEqual([{ type: "delta", text: "Ahoj" }]);
  });

  it("ignores thinking (signature) deltas — only visible text streams", () => {
    const line = JSON.stringify({
      type: "stream_event",
      event: { type: "content_block_delta", index: 0, delta: { type: "signature_delta", signature: "x" } },
    });
    expect(parseChatStreamLine(line)).toEqual([]);
  });

  it("ignores block start/stop framing", () => {
    const start = JSON.stringify({
      type: "stream_event",
      event: { type: "content_block_start", index: 1, content_block: { type: "text", text: "" } },
    });
    expect(parseChatStreamLine(start)).toEqual([]);
  });

  it("emits a tool event for each tool_use block in an assistant message", () => {
    const line = JSON.stringify({
      type: "assistant",
      message: {
        content: [
          { type: "text", text: "už spouštím" },
          { type: "tool_use", name: "mcp__zibby__create_task", input: { text: "postav X" } },
        ],
      },
    });
    expect(parseChatStreamLine(line)).toEqual([
      { type: "tool", name: "mcp__zibby__create_task", input: { text: "postav X" } },
    ]);
  });

  it("does not double-emit assistant text (already streamed as deltas)", () => {
    const line = JSON.stringify({
      type: "assistant",
      message: { content: [{ type: "text", text: "celá odpověď" }] },
    });
    expect(parseChatStreamLine(line)).toEqual([]);
  });

  it("emits done with the final result text", () => {
    const line = JSON.stringify({ type: "result", subtype: "success", is_error: false, result: "hotovo" });
    expect(parseChatStreamLine(line)).toEqual([{ type: "done", text: "hotovo" }]);
  });

  it("emits error on a failed result", () => {
    const line = JSON.stringify({ type: "result", is_error: true, result: "Not logged in" });
    expect(parseChatStreamLine(line)).toEqual([{ type: "error", message: "Not logged in" }]);
  });

  it("tolerates blank and malformed lines", () => {
    expect(parseChatStreamLine("")).toEqual([]);
    expect(parseChatStreamLine("   ")).toEqual([]);
    expect(parseChatStreamLine("not json")).toEqual([]);
    expect(parseChatStreamLine("42")).toEqual([]);
  });
});
