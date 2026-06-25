import { describe, expect, it } from "vitest";
import { parseTranscript } from "./transcript";

/**
 * Golden fixtures lifted verbatim from real run logs under
 * `apps/api/data/{agents,pipelines}/runs/` — drift insurance against the
 * server-side formatter (`claude-stream-format.ts`) and this client re-parser
 * diverging. Each block is a faithful excerpt of a captured transcript.
 */

// apps/api/data/agents/runs/orchestrator_1782227147310_19903.log — a greeting:
// system header, thinking, one agent text line, a dropped rate_limit, footer.
const ORCHESTRATOR = [
  "▶ claude-sonnet-4-6",
  '💭 The user is saying "hi, how are you?" in Czech. This is a casual greeting. …',
  "Ahoj! Jsem v pohodě, díky za optání. Připravený pomoci — co potřebuješ?",
  '{"type":"rate_limit_event","rate_limit_info":{"status":"allowed","resetsAt":1782243600},"uuid":"32a7d49c","session_id":"04dddf30"}',
  "─── done in 5.2s",
].join("\n");

// apps/api/data/agents/runs/backend-developer_1782241877139_15332.log — a Glob
// tool call whose result is a multi-line `⎿` block (folded into one segment).
const TOOL_WITH_RESULT = [
  "● Glob /Users/zibby/Workspace/z.i.b.b.y/apps/api",
  "  ⎿ /Users/zibby/Workspace/z.i.b.b.y/apps/api/src/chat/chat-stream-parser.ts",
  "     /Users/zibby/Workspace/z.i.b.b.y/apps/api/src/chat/chat-events.service.ts",
  "     /Users/zibby/Workspace/z.i.b.b.y/apps/api/src/chat/chat-persona.ts",
].join("\n");

// Tail of backend-developer_…log — agent text containing a markdown `---` rule
// (three ASCII hyphens), then the real box-drawing `─── ` footer. The whole bet
// of "no fenced state machine" rides on these two not colliding.
const HR_THEN_FOOTER = [
  "The flow is clear. Here's the summary:",
  "",
  "---",
  "",
  "**`create_task` flow in the chat MCP:**",
  "",
  "1. **MCP call** → `ChatMcpController.handle()`",
  "─── done in 32.8s",
].join("\n");

// apps/api/data/pipelines/runs/…koder_…log — a rate_limit JSON line sits BETWEEN
// the `● Read` tool call and its `⎿` result. Dropping it must not break folding.
const DROP_BETWEEN_TOOL_AND_RESULT = [
  "● Read /Users/zibby/Workspace/z.i.b.b.y/apps/api/data/.../plan.md",
  '{"type":"rate_limit_event","rate_limit_info":{"status":"allowed"},"uuid":"4790b47e"}',
  "  ⎿ 1\t# Plán — jednoduchá Hello World aplikace",
  "     2\t",
  "     3\t## Zadání",
].join("\n");

describe("parseTranscript", () => {
  it("classifies the scaffolding glyphs and strips them (result kept raw)", () => {
    const segs = parseTranscript(ORCHESTRATOR);

    expect(segs.map((s) => s.kind)).toEqual(["system", "thinking", "text", "footer"]);
    expect(segs[0]).toEqual({ kind: "system", text: "claude-sonnet-4-6" });
    expect(segs[1]).toMatchObject({ kind: "thinking" });
    expect((segs[1] as { text: string }).text).not.toMatch(/^💭/);
    expect(segs[2]).toEqual({
      kind: "text",
      markdown: "Ahoj! Jsem v pohodě, díky za optání. Připravený pomoci — co potřebuješ?",
    });
    expect(segs[3]).toEqual({ kind: "footer", text: "done in 5.2s" });
  });

  it("drops a rate_limit_event JSON line (operator noise)", () => {
    const segs = parseTranscript(ORCHESTRATOR);
    const raw = JSON.stringify(segs);
    expect(raw).not.toContain("rate_limit_event");
    expect(raw).not.toContain("rate_limit_info");
  });

  it("groups a multi-line ⎿ result into a single result segment", () => {
    const segs = parseTranscript(TOOL_WITH_RESULT);

    expect(segs.map((s) => s.kind)).toEqual(["tool", "result"]);
    expect(segs[0]).toEqual({ kind: "tool", text: "Glob /Users/zibby/Workspace/z.i.b.b.y/apps/api" });
    const result = segs[1] as { kind: "result"; text: string };
    expect(result.text).toContain("chat-stream-parser.ts");
    expect(result.text).toContain("chat-events.service.ts");
    expect(result.text).toContain("chat-persona.ts");
    // Raw — the ⎿ glyph and 5-space indentation are preserved (today's look).
    expect(result.text).toContain("⎿");
  });

  it("keeps a markdown `---` rule in text but classifies a box-drawing `─── ` as footer", () => {
    const segs = parseTranscript(HR_THEN_FOOTER);

    const text = segs.find((s) => s.kind === "text") as { markdown: string };
    expect(text.markdown).toContain("---");
    expect(text.markdown).toContain("**`create_task` flow in the chat MCP:**");
    // The list item and the hr live in ONE markdown source string.
    expect(text.markdown).toContain("1. **MCP call**");

    const last = segs[segs.length - 1];
    expect(last).toEqual({ kind: "footer", text: "done in 32.8s" });
  });

  it("drops a rate_limit line between a tool call and its result without breaking folding", () => {
    const segs = parseTranscript(DROP_BETWEEN_TOOL_AND_RESULT);

    expect(segs.map((s) => s.kind)).toEqual(["tool", "result"]);
    const result = segs[1] as { text: string };
    expect(result.text).toContain("# Plán");
    expect(result.text).toContain("## Zadání");
    expect(JSON.stringify(segs)).not.toContain("rate_limit_event");
  });

  it("keeps a ```json fence inside agent text (not dropped as noise)", () => {
    const text = [
      "Here is a config example:",
      "",
      "```json",
      '{ "model": "claude-opus-4-8", "stream": true }',
      "```",
    ].join("\n");

    const segs = parseTranscript(text);
    expect(segs).toHaveLength(1);
    const seg = segs[0] as { kind: "text"; markdown: string };
    expect(seg.kind).toBe("text");
    expect(seg.markdown).toContain("```json");
    expect(seg.markdown).toContain('"model": "claude-opus-4-8"');
  });

  it("keeps inline HTML / angle brackets in agent text", () => {
    const segs = parseTranscript("Wrap it in <Suspense> and a <div> for layout.");
    expect(segs).toEqual([
      { kind: "text", markdown: "Wrap it in <Suspense> and a <div> for layout." },
    ]);
  });

  it("returns no segments for empty input", () => {
    expect(parseTranscript("")).toEqual([]);
    expect(parseTranscript("\n\n")).toEqual([]);
  });
});
