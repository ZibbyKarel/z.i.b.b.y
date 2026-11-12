import { describe, expect, it } from "vitest";
import {
  OPENCODE_CHAT_GATE_PLUGIN,
  buildOpencodeChatConfig,
  opencodeChatArgs,
  opencodeChatEnv,
  parseOpencodeChatLine,
  toOpencodeMcpServer,
} from "./chat-opencode";
// @ts-expect-error — plain .mjs plugin, no types
import plugin, { isMountedMcpTool } from "./opencode-chat-gate/index.mjs";

describe("buildOpencodeChatConfig (A25)", () => {
  it("denies everything, allows only the mounted servers' tools, then the extra denials", () => {
    const { config, serverIds } = buildOpencodeChatConfig(
      "PROMPT",
      {
        zibby: {
          type: "http",
          url: "http://x/api/chat/mcp",
          headers: { Authorization: "Bearer t" },
        },
        plugin_playwright_playwright: { command: "npx", args: ["@playwright/mcp"] },
        opencode: { type: "http", url: "http://shadow" },
        "bad.id": { type: "http", url: "http://y" },
      },
      ["zibby_create_task"],
    );
    expect(serverIds).toEqual(["zibby", "plugin_playwright_playwright"]);
    expect(config).toEqual({
      agents: { zibby: { mode: "primary", system: "PROMPT" } },
      permissions: [
        { action: "*", resource: "*", effect: "deny" },
        { action: "zibby_*", resource: "*", effect: "allow" },
        { action: "plugin_playwright_playwright_*", resource: "*", effect: "allow" },
        { action: "zibby_create_task", resource: "*", effect: "deny" },
      ],
      plugins: [OPENCODE_CHAT_GATE_PLUGIN],
      mcp: {
        servers: {
          zibby: {
            type: "remote",
            url: "http://x/api/chat/mcp",
            headers: { Authorization: "Bearer t" },
            oauth: false,
            codemode: false,
          },
          plugin_playwright_playwright: {
            type: "local",
            command: ["npx", "@playwright/mcp"],
            codemode: false,
          },
        },
      },
    });
  });

  it("maps stdio env to environment", () => {
    expect(toOpencodeMcpServer({ type: "stdio", command: "serena", env: { A: "1" } })).toEqual({
      type: "local",
      command: ["serena"],
      environment: { A: "1" },
      codemode: false,
    });
  });
});

describe("opencodeChatArgs / opencodeChatEnv", () => {
  it("resumes with --session and never passes --auto", () => {
    expect(opencodeChatArgs("opencode/big-pickle", "ses_1", "ahoj")).toEqual([
      "run",
      "--standalone",
      "--format",
      "json",
      "-m",
      "opencode/big-pickle",
      "--agent",
      "zibby",
      "--session",
      "ses_1",
      "--",
      "ahoj",
    ]);
    expect(opencodeChatArgs("m", null, "x")).not.toContain("--session");
  });

  it("drops inherited OPENCODE_* and pins PWD", () => {
    process.env.OPENCODE_PERMISSION = "allow";
    try {
      const env = opencodeChatEnv("/tmp/c.json", "/repo", ["zibby", "zibby-kb"]);
      expect(env.OPENCODE_PERMISSION).toBeUndefined();
      expect(env).toMatchObject({
        OPENCODE_CONFIG: "/tmp/c.json",
        OPENCODE_DISABLE_PROJECT_CONFIG: "1",
        PWD: "/repo",
        ZIBBY_CHAT_MCP_SERVERS: "zibby,zibby-kb",
        ZIBBY_CHAT_DENY_TOOLS: "",
      });
    } finally {
      delete process.env.OPENCODE_PERMISSION;
    }
  });
});

describe("parseOpencodeChatLine", () => {
  const ids = ["zibby", "zibby-kb"];
  it("maps text, session, tools (longest server id first) and errors", () => {
    expect(
      parseOpencodeChatLine(
        JSON.stringify({ type: "text", sessionID: "s", part: { text: "Ahoj" } }),
        ids,
      ),
    ).toEqual([
      { type: "session", sessionId: "s" },
      { type: "delta", text: "Ahoj", block: true },
    ]);
    const tool = (name: string, status = "completed") =>
      parseOpencodeChatLine(
        JSON.stringify({
          type: "tool_use",
          part: { id: "c1", tool: name, state: { status, input: { q: 1 } } },
        }),
        ids,
      );
    expect(tool("zibby-kb_kb_search")).toEqual([
      { type: "tool", name: "mcp__zibby-kb__kb_search", input: { q: 1 }, id: "c1" },
    ]);
    expect(tool("zibby_create_task")[0]).toMatchObject({ name: "mcp__zibby__create_task" });
    expect(tool("shell", "error")[0]).toMatchObject({ name: "shell", failed: true });
    expect(
      parseOpencodeChatLine(JSON.stringify({ type: "error", error: { message: "boom" } })),
    ).toEqual([{ type: "error", message: "opencode: boom" }]);
    expect(parseOpencodeChatLine("not json")).toEqual([]);
    expect(parseOpencodeChatLine(JSON.stringify({ type: "step_finish", part: {} }))).toEqual([]);
  });
});

describe("opencode chat gate plugin", () => {
  const env = { ZIBBY_CHAT_MCP_SERVERS: "zibby,zibby-kb,opencode" };
  it("only lets mounted MCP tools through", async () => {
    expect(isMountedMcpTool("zibby_create_task", env)).toBe(true);
    expect(isMountedMcpTool("zibby-kb_kb_read", env)).toBe(true);
    expect(isMountedMcpTool("zibby_", env)).toBe(false);
    for (const t of [
      "shell",
      "write",
      "edit",
      "read",
      "execute",
      "skill",
      "opencode_session_move",
      "task",
    ]) {
      expect(isMountedMcpTool(t, env)).toBe(false);
    }
  });

  it("execute.before throws and evaluate denies for anything else (default deny)", async () => {
    const hooks: Record<string, (e: Record<string, unknown>) => unknown> = {};
    const reg =
      (name: string) => async (_: string, fn: (e: Record<string, unknown>) => unknown) => {
        hooks[name] = fn;
      };
    process.env.ZIBBY_CHAT_MCP_SERVERS = "zibby";
    try {
      await plugin.setup({ permission: { hook: reg("evaluate") }, tool: { hook: reg("before") } });
      expect(() => hooks.before?.({ tool: "shell", input: { command: "rm -rf /" } })).toThrow(
        /Blocked by the ZibbyOS gate/,
      );
      expect(hooks.before?.({ tool: "zibby_recall_memory", input: {} })).toBeUndefined();
      const ask = { action: "shell", effect: "ask" };
      hooks.evaluate?.(ask);
      expect(ask.effect).toBe("deny");
      const mcp = { action: "zibby_recall_memory", effect: "ask" };
      hooks.evaluate?.(mcp);
      expect(mcp.effect).toBe("allow");
      const denied = { action: "zibby_create_task", effect: "deny" };
      hooks.evaluate?.(denied);
      expect(denied.effect).toBe("deny");
    } finally {
      delete process.env.ZIBBY_CHAT_MCP_SERVERS;
    }
  });

  it("denies a mounted tool named in ZIBBY_CHAT_DENY_TOOLS (an @agent turn's create_task)", async () => {
    const hooks: Record<string, (e: Record<string, unknown>) => unknown> = {};
    const reg =
      (name: string) => async (_: string, fn: (e: Record<string, unknown>) => unknown) => {
        hooks[name] = fn;
      };
    process.env.ZIBBY_CHAT_MCP_SERVERS = "zibby";
    process.env.ZIBBY_CHAT_DENY_TOOLS = "zibby_create_task";
    try {
      await plugin.setup({ permission: { hook: reg("evaluate") }, tool: { hook: reg("before") } });
      expect(() => hooks.before?.({ tool: "zibby_create_task", input: {} })).toThrow(
        /Blocked by the ZibbyOS gate/,
      );
      expect(hooks.before?.({ tool: "zibby_recall_memory", input: {} })).toBeUndefined();
      const ask = { action: "zibby_create_task", effect: "ask" };
      hooks.evaluate?.(ask);
      expect(ask.effect).toBe("deny");
    } finally {
      delete process.env.ZIBBY_CHAT_MCP_SERVERS;
      delete process.env.ZIBBY_CHAT_DENY_TOOLS;
    }
  });
});
