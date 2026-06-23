import { spawn } from "node:child_process";
import { describe, expect, it } from "vitest";

/**
 * Dispatch-discipline eval (opt-in: `CHAT_EVAL=1`, needs a live api + real `claude`
 * tokens). It documents the contract the `create_task` tool description encodes:
 *
 * - casual conversation ("jak se máš?") must NOT trip a `create_task` tool call; while
 * - an explicit work request ("postav jednoduchou TODO appku …") MUST.
 *
 * Skipped by default — it spawns the real CLI against the MCP server, which costs
 * tokens and assumes the api is already up at `ZIBBY_API_BASE` (default :3333).
 * Run e.g.: `CHAT_EVAL=1 ZIBBY_API_BASE=http://localhost:3399 pnpm --filter api vitest run src/chat/chat-dispatch.eval`.
 */
const BASE = process.env.ZIBBY_API_BASE ?? "http://localhost:3333";

/** Drive one real `claude` turn with the chat tool wiring; resolve the raw stdout. */
function runTurn(message: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const mcp = JSON.stringify({
      mcpServers: { zibby: { type: "http", url: `${BASE}/api/chat/mcp` } },
    });
    const proc = spawn(
      process.env.CLAUDE_BIN ?? "claude",
      [
        "-p",
        message,
        "--setting-sources",
        "",
        "--permission-mode",
        "dontAsk",
        "--allowedTools",
        "mcp__zibby__*",
        "--mcp-config",
        mcp,
        "--output-format",
        "stream-json",
        "--include-partial-messages",
        "--verbose",
        "--model",
        "sonnet",
      ],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
    let out = "";
    proc.stdout.on("data", (c: Buffer) => (out += c.toString()));
    proc.on("error", reject);
    proc.on("close", () => resolve(out));
  });
}

const calledCreateTask = (stdout: string): boolean => stdout.includes("mcp__zibby__create_task");

describe.skipIf(!process.env.CHAT_EVAL)("chat dispatch discipline (eval)", () => {
  it("does NOT dispatch a task for casual conversation", async () => {
    const out = await runTurn("Ahoj, jak se máš?");
    expect(calledCreateTask(out)).toBe(false);
  }, 180_000);

  it("DOES dispatch a task for an explicit work request", async () => {
    const out = await runTurn("Postav jednoduchou TODO appku v projektu Alpha.");
    expect(calledCreateTask(out)).toBe(true);
  }, 180_000);
});
