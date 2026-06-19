import { describe, expect, it } from "vitest";
import { formatClaudeStreamLine } from "./claude-stream-format";

/** Build one stream-json line as the CLI emits it (compact JSON, one event per line). */
function line(event: unknown): string {
  return JSON.stringify(event);
}

describe("formatClaudeStreamLine", () => {
  it("passes a non-JSON line through unchanged (demo PROGRESS / plain output)", () => {
    expect(formatClaudeStreamLine("PROGRESS 50")).toBe("PROGRESS 50");
    expect(formatClaudeStreamLine("just some text")).toBe("just some text");
  });

  it("passes a bare INTENT control line through unchanged", () => {
    // `INTENT {json}` is the demo/test gate signal — it must survive verbatim so the
    // runner's raw-line INTENT parser still fires.
    const intent = 'INTENT {"action":"payment"}';
    expect(formatClaudeStreamLine(intent)).toBe(intent);
  });

  it("passes malformed JSON and JSON without a known type through unchanged", () => {
    expect(formatClaudeStreamLine("{not json")).toBe("{not json");
    expect(formatClaudeStreamLine('{"foo":"bar"}')).toBe('{"foo":"bar"}');
  });

  it("renders an assistant text block as its text", () => {
    const out = formatClaudeStreamLine(
      line({
        type: "assistant",
        message: { content: [{ type: "text", text: "Scanning /tmp/x" }] },
      }),
    );
    expect(out).toBe("Scanning /tmp/x");
  });

  it("renders a Bash tool call with its command", () => {
    const out = formatClaudeStreamLine(
      line({
        type: "assistant",
        message: {
          content: [{ type: "tool_use", name: "Bash", input: { command: "rm -rf .DS_Store" } }],
        },
      }),
    );
    expect(out).toBe("● Bash$ rm -rf .DS_Store");
  });

  it("renders a file tool call with its path", () => {
    const out = formatClaudeStreamLine(
      line({
        type: "assistant",
        message: {
          content: [{ type: "tool_use", name: "Read", input: { file_path: "/tmp/a.txt" } }],
        },
      }),
    );
    expect(out).toBe("● Read /tmp/a.txt");
  });

  it("joins multiple blocks (text + tool call) from one assistant turn", () => {
    const out = formatClaudeStreamLine(
      line({
        type: "assistant",
        message: {
          content: [
            { type: "text", text: "Removing junk" },
            { type: "tool_use", name: "Bash", input: { command: "rm x" } },
          ],
        },
      }),
    );
    expect(out).toBe("Removing junk\n● Bash$ rm x");
  });

  it("renders a tool_result from a user message with a ⎿ marker", () => {
    const out = formatClaudeStreamLine(
      line({
        type: "user",
        message: { content: [{ type: "tool_result", content: "deleted 3 files" }] },
      }),
    );
    expect(out).toBe("  ⎿ deleted 3 files");
  });

  it("flags an error tool_result", () => {
    const out = formatClaudeStreamLine(
      line({
        type: "user",
        message: { content: [{ type: "tool_result", content: "no such file", is_error: true }] },
      }),
    );
    expect(out).toBe("  ⎿ ⚠ no such file");
  });

  it("skips the opening user prompt (no tool_result blocks)", () => {
    const out = formatClaudeStreamLine(
      line({ type: "user", message: { content: [{ type: "text", text: "ukliď složku" }] } }),
    );
    expect(out).toBeNull();
  });

  it("renders the closing result as a footer with duration", () => {
    const out = formatClaudeStreamLine(
      line({ type: "result", subtype: "success", duration_ms: 12340, result: "Done." }),
    );
    expect(out).toBe("─── done in 12.3s");
  });

  it("renders a non-success result with its subtype", () => {
    const out = formatClaudeStreamLine(line({ type: "result", subtype: "error_max_turns" }));
    expect(out).toBe("─── ended (error_max_turns)");
  });

  it("renders the system init line with the model", () => {
    const out = formatClaudeStreamLine(
      line({ type: "system", subtype: "init", model: "claude-haiku" }),
    );
    expect(out).toBe("▶ claude-haiku");
  });

  it("drops non-init system events", () => {
    expect(formatClaudeStreamLine(line({ type: "system", subtype: "other" }))).toBeNull();
  });

  it("truncates a very long tool_result by line count", () => {
    const body = Array.from({ length: 60 }, (_, i) => `line ${i}`).join("\n");
    const out = formatClaudeStreamLine(
      line({ type: "user", message: { content: [{ type: "tool_result", content: body }] } }),
    );
    expect(out).toContain("… (+20 more lines)");
  });
});
