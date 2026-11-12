import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  OPENCODE_CHAT_BUILTIN_TOOLS,
  OPENCODE_CHAT_GATE_PLUGIN,
  buildOpencodeChatConfig,
  opencodeChatArgs,
  opencodeChatEnv,
  parseOpencodeChatLine,
  preferGlobalBin,
  toOpencodeMcpServer,
} from "./chat-opencode";
import plugin, {
  CHAT_BUILTIN_TOOLS,
  chatGateReason,
  isMountedMcpTool,
  // @ts-expect-error — plain .mjs plugin, no types
} from "./opencode-chat-gate/index.mjs";

describe("buildOpencodeChatConfig (A25)", () => {
  it("denies everything, allows the shell/read built-ins and the mounted servers' tools, then the extra denials", () => {
    const { config, serverIds } = buildOpencodeChatConfig(
      "PROMPT",
      {
        zibby: {
          type: "http",
          url: "http://x/api/chat/mcp",
          headers: { Authorization: "Bearer t" },
        },
        plugin_playwright_playwright: { command: "npx", args: ["@playwright/mcp@0.0.1"] },
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
        ...["shell", "bash", "read", "grep", "glob", "list"].map((action) => ({
          action,
          resource: "*",
          effect: "allow",
        })),
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
            command: ["npx", "@playwright/mcp@0.0.1"],
            codemode: false,
          },
        },
      },
    });
  });

  it("keeps OAuth on for a header-less remote (A33)", () => {
    expect(toOpencodeMcpServer({ type: "http", url: "https://mcp.figma.com/mcp" })).toEqual({
      type: "remote",
      url: "https://mcp.figma.com/mcp",
      codemode: false,
    });
  });

  it("allows exactly the built-ins the gate plugin judges", () => {
    expect(OPENCODE_CHAT_BUILTIN_TOOLS).toEqual(CHAT_BUILTIN_TOOLS);
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
        /Blocked by the ZibbyOS gate: .*create_task/,
      );
      expect(() => hooks.before?.({ tool: "write", input: { filePath: "a" } })).toThrow(
        /Blocked by the ZibbyOS gate/,
      );
      expect(hooks.before?.({ tool: "shell", input: { command: "git status" } })).toBeUndefined();
      expect(hooks.before?.({ tool: "zibby_recall_memory", input: {} })).toBeUndefined();
      const ask = { action: "write", effect: "ask" };
      hooks.evaluate?.(ask);
      expect(ask.effect).toBe("deny");
      const shell = { action: "shell", effect: "ask" };
      hooks.evaluate?.(shell);
      expect(shell.effect).toBe("allow");
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

  describe("chatGateReason (A33 fail-fast)", () => {
    const env = {
      ZIBBY_CHAT_MCP_SERVERS: "zibby,zibby-kb,plugin_context7_context7,atlassian",
      PWD: "/repo",
    };
    const reason = (tool: string, input: unknown) => chatGateReason(tool, input, env);

    it("runs unclassified shell commands and file reads", () => {
      expect(reason("shell", { command: "git status" })).toBeNull();
      expect(reason("shell", { command: "ls -la && git log --oneline -5" })).toBeNull();
      expect(reason("read", { filePath: "/repo/README.md" })).toBeNull();
      expect(reason("grep", { pattern: "foo", path: "/repo" })).toBeNull();
    });

    it("refuses classified shell commands with the delegate message", () => {
      for (const command of ["git push origin main", "rm -rf build", "npm publish"]) {
        expect(reason("shell", { command })).toMatch(/create_task/);
      }
      expect(reason("shell", { command: "claude -p hi" })).toMatch(/nested/);
    });

    it("refuses the operator-only surface", () => {
      expect(reason("read", { filePath: "~/.config/zibby/operator-token" })).toMatch(/operator/);
      expect(reason("shell", { command: "cat ~/.config/zibby/operator-token" })).toMatch(
        /operator/,
      );
    });

    it("operator MCP: reads run, writes are refused; own servers always run", () => {
      expect(reason("plugin_context7_context7_query-docs", { q: "x" })).toBeNull();
      expect(reason("atlassian_getJiraIssue", { issueIdOrKey: "A-1" })).toBeNull();
      expect(reason("atlassian_createJiraIssue", {})).toMatch(/create_task/);
      expect(reason("zibby_create_task", {})).toBeNull();
      expect(reason("zibby-kb_kb_write", {})).toBeNull();
    });

    it("refuses write/edit/execute/web and unmounted tools", () => {
      for (const tool of ["write", "edit", "patch", "execute", "webfetch", "skill", "task"]) {
        expect(reason(tool, {})).toMatch(/only the shell/);
      }
      expect(reason("serena_find_symbol", {})).toMatch(/only the shell/);
    });
  });
});

describe("preferGlobalBin", () => {
  const root = mkdtempSync(join(tmpdir(), "npmroot-"));
  mkdirSync(join(root, "@scope/pkg"), { recursive: true });
  writeFileSync(
    join(root, "@scope/pkg/package.json"),
    JSON.stringify({ bin: { "pkg-mcp": "cli.js" } }),
  );
  writeFileSync(join(root, "@scope/pkg/cli.js"), "");
  const bin = join(root, "@scope/pkg/cli.js");

  it("rewrites unversioned and @latest, handling -y and keeping other args", () => {
    expect(preferGlobalBin("npx", ["@scope/pkg"], root)).toEqual([bin]);
    expect(preferGlobalBin("npx", ["-y", "@scope/pkg@latest", "--x"], root)).toEqual([bin, "--x"]);
  });

  it("leaves pinned, uninstalled and non-npx commands alone", () => {
    expect(preferGlobalBin("npx", ["@scope/pkg@0.0.83"], root)).toEqual([
      "npx",
      "@scope/pkg@0.0.83",
    ]);
    expect(preferGlobalBin("npx", ["other"], root)).toEqual(["npx", "other"]);
    expect(preferGlobalBin("serena", ["a"], root)).toEqual(["serena", "a"]);
  });
});
