import { mkdtempSync, readFileSync, statSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import plugin, {
  gateCall,
  runHook,
  startsNestedAgent,
  toClaudeEvents,
  toolsRunning,
  // @ts-expect-error -- a plain .mjs runtime asset (loaded by opencode), no types
} from "./index.mjs";

interface ClaudeEvent {
  tool_name: string;
  tool_input: Record<string, unknown>;
  cwd: string;
}
const events = toClaudeEvents as (
  tool: string,
  input: unknown,
  cwd: string,
  mcp?: string[],
) => ClaudeEvent[];
const gate = gateCall as (
  tool: string,
  input: unknown,
  env: Record<string, string>,
) => Promise<string | null>;
const hook = runHook as (event: unknown, env: Record<string, string>) => Promise<string | null>;

describe("opencode gate plugin → Claude PreToolUse events", () => {
  it("maps a shell call, resolving its workdir against the run's cwd", () => {
    expect(events("shell", { command: "rm old-build.log", workdir: "/w" }, "/spawn")).toEqual([
      { tool_name: "Bash", tool_input: { command: "rm old-build.log" }, cwd: "/w" },
    ]);
    // A relative workdir / a moved-session `directory` is judged where it really lands.
    expect(events("shell", { command: "ls", workdir: "sub" }, "/spawn")[0]?.cwd).toBe("/spawn/sub");
    expect(events("shell", { command: "ls", directory: "/elsewhere" }, "/spawn")[0]?.cwd).toBe(
      "/elsewhere",
    );
  });

  it("maps file tools onto Write / Edit / Read / Grep", () => {
    expect(events("write", { path: "/a", content: "x" }, "/c")[0]).toMatchObject({
      tool_name: "Write",
      tool_input: { file_path: "/a", content: "x" },
    });
    expect(events("edit", { path: "/a", oldString: "o", newString: "n" }, "/c")[0]).toMatchObject({
      tool_name: "Edit",
      tool_input: { file_path: "/a", new_string: "n" },
    });
    expect(events("read", { path: "/a" }, "/c")[0]?.tool_name).toBe("Read");
    expect(events("grep", { pattern: "x", path: "/a" }, "/c")[0]?.tool_name).toBe("Grep");
  });

  it("splits a patch into one event per touched file; a delete is gated like rm", () => {
    const patchText = [
      "*** Begin Patch",
      "*** Add File: new.ts",
      "+x",
      "*** Update File: a.ts",
      "*** Move to: b.ts",
      "*** Delete File: gone.ts",
      "*** End Patch",
    ].join("\n");
    expect(events("patch", { patchText }, "/c").map((e) => [e.tool_name, e.tool_input])).toEqual([
      ["Write", { file_path: "new.ts", content: "" }],
      ["Edit", { file_path: "a.ts", new_string: "" }],
      ["Write", { file_path: "b.ts", content: "" }],
      ["Bash", { command: 'rm -- "gone.ts"' }],
    ]);
  });

  it("refuses a patch it can't parse instead of guessing", () => {
    expect(() => events("patch", { patchText: "garbage" }, "/c")).toThrow(/names no file/);
  });

  it("routes delegation, the operator question and the run's MCP tools through the hook", () => {
    expect(events("task", { agent: "coder", prompt: "go" }, "/c")[0]).toMatchObject({
      tool_name: "Task",
      tool_input: { subagent_type: "coder", prompt: "go" },
    });
    expect(events("zibby-run_ask_operator", { question: "ok?" }, "/c")[0]?.tool_name).toBe(
      "mcp__zibby-run__ask_operator",
    );
    expect(events("ctx7_query", { q: 1 }, "/c", ["ctx7"])[0]?.tool_name).toBe("mcp__ctx7__query");
    expect(events("webfetch", { url: "https://x" }, "/c")).toEqual([]);
  });

  it("denies by default: execute, skill, opencode_*, browser_* and anything unknown", () => {
    for (const tool of ["execute", "skill", "opencode_session_move", "browser_click", "whatever"]) {
      expect(() => events(tool, {}, "/c")).toThrow(/not allowed/);
    }
    expect(() => events("ctx7_query", {}, "/c", [])).toThrow(/not allowed/); // not this run's server
    // A server named like opencode's own namespaces never turns them into MCP calls.
    expect(() => events("browser_click", {}, "/c", ["browser"])).toThrow(/not allowed/);
    expect(() => events("opencode_session_move", {}, "/c", ["opencode"])).toThrow(/not allowed/);
  });
});

describe("gateCall / runHook", () => {
  const dir = mkdtempSync(join(tmpdir(), "oc-gate-"));
  const script = (name: string, body: string) => {
    const file = join(dir, name);
    writeFileSync(file, body);
    return file;
  };
  const env = (hookFile: string, extra: Record<string, string> = {}) => ({
    ZIBBY_GATE_NODE: process.execPath,
    ZIBBY_GATE_HOOK: hookFile,
    ZIBBY_GATE_CWD: dir,
    PATH: process.env.PATH ?? "",
    ...extra,
  });
  const allow = script(
    "allow.mjs",
    'process.stdout.write(JSON.stringify({hookSpecificOutput:{permissionDecision:"allow"}}))',
  );
  const deny = script(
    "deny.mjs",
    'process.stdout.write(JSON.stringify({hookSpecificOutput:{permissionDecision:"deny",permissionDecisionReason:"nope"}}))',
  );
  const empty = script("empty.mjs", "");
  const crash = script("crash.mjs", "process.exit(3)");
  const garbage = script("garbage.mjs", 'process.stdout.write("{not json")');
  const ev = { tool_name: "Bash", tool_input: { command: "rm x" }, cwd: dir };

  it("maps every hook outcome; anything but allow / empty denies", async () => {
    expect(await hook(ev, env(allow))).toBeNull();
    expect(await hook(ev, env(empty))).toBeNull(); // not gated
    expect(await hook(ev, env(deny))).toBe("nope");
    expect(await hook(ev, env(crash))).toBe("ZibbyOS gate exited with 3.");
    expect(await hook(ev, env(garbage))).toMatch(/unreadable/);
    expect(await hook(ev, { ZIBBY_GATE_CWD: dir })).toMatch(/not configured/);
  });

  it("denies without a run cwd, for the agent's denied tools and for unknown tools", async () => {
    expect(await gate("shell", { command: "ls" }, { ...env(allow), ZIBBY_GATE_CWD: "" })).toMatch(
      /not configured/,
    );
    expect(
      await gate("shell", { command: "ls" }, env(allow, { ZIBBY_DENY_TOOLS: "write,shell" })),
    ).toMatch(/not allowed to use "shell"/);
    expect(await gate("execute", { code: "x" }, env(allow))).toMatch(/not allowed/);
    expect(await gate("shell", { command: "ls" }, env(allow))).toBeNull();
  });

  it("holds a Bash(<prefix>:*)-only agent to plain commands with that prefix", async () => {
    const only = env(allow, { ZIBBY_SHELL_PREFIXES: '["git"]' });
    expect(await gate("shell", { command: "git status" }, only)).toBeNull();
    expect(await gate("shell", { command: "git status; rm -rf /" }, only)).toMatch(/only run/);
    expect(await gate("shell", { command: "rm x" }, only)).toMatch(/only run/);
  });

  it("holds a git prefix to git itself: no -c / --config-env / --exec-path / ! aliases", async () => {
    const only = env(allow, { ZIBBY_SHELL_PREFIXES: '["git"]' });
    expect(await gate("shell", { command: "git log -1 --oneline" }, only)).toBeNull();
    for (const command of [
      "git -c alias.zz='!touch p3' zz",
      "git -c core.pager='touch p5' log -1",
      "git --config-env=core.pager=X log",
      "git --exec-path=/tmp/x status",
      "git zz!",
    ]) {
      expect(await gate("shell", { command }, only)).toMatch(/only run/);
    }
  });

  it("denies a nested opencode / claude session, whatever the shell prefixes", async () => {
    for (const command of [
      "opencode run hi",
      "/opt/bin/claude -p x",
      "ls && claude -p x",
      "echo x | xargs opencode run",
      "FOO=1 env BAR=2 nohup opencode run x",
      "sudo -E claude",
      "true; exec claude",
    ]) {
      expect(await gate("shell", { command }, env(allow))).toMatch(/nested opencode/);
    }
    expect(startsNestedAgent("echo claude && cat opencode.json")).toBe(false);
    expect(startsNestedAgent("sh -c 'claude -p x'")).toBe(false); // documented ceiling
  });

  it("logs every decision to ZIBBY_GATE_LOG", async () => {
    const log = join(dir, "gate.log");
    await gate("shell", { command: "rm x" }, env(deny, { ZIBBY_GATE_LOG: log }));
    await gate("read", { path: "/a" }, env(allow, { ZIBBY_GATE_LOG: log }));
    expect(readFileSync(log, "utf8").split("\n")).toEqual([
      "⛨ gate shell rm x → denied: nope",
      "⛨ gate read /a → allowed",
      "",
    ]);
  });
});

describe("plugin: in-flight tools keep the gate log fresh", () => {
  const dir = mkdtempSync(join(tmpdir(), "oc-beat-"));
  const log = join(dir, "gate.log");
  const allow = join(dir, "allow.mjs");
  writeFileSync(
    allow,
    'process.stdout.write(JSON.stringify({hookSpecificOutput:{permissionDecision:"allow"}}))',
  );
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  type Hook = (event: Record<string, unknown>) => unknown;
  async function setup() {
    const hooks: Record<string, Hook> = {};
    const reg = (prefix: string) => ({
      hook: (name: string, fn: Hook) => {
        hooks[`${prefix}.${name}`] = fn;
      },
    });
    await (plugin as { setup(ctx: unknown): Promise<void> }).setup({
      permission: reg("permission"),
      tool: reg("tool"),
    });
    return hooks as Record<"tool.execute.before" | "tool.execute.after", Hook>;
  }

  it("counts allowed calls only, decrements on success and error, touches the log meanwhile", async () => {
    vi.stubEnv("ZIBBY_GATE_NODE", process.execPath);
    vi.stubEnv("ZIBBY_GATE_HOOK", allow);
    vi.stubEnv("ZIBBY_GATE_CWD", dir);
    vi.stubEnv("ZIBBY_GATE_LOG", log);
    vi.stubEnv("ZIBBY_DENY_TOOLS", "write");
    const hooks = await setup();

    await expect(
      hooks["tool.execute.before"]({ id: "a", tool: "write", input: {} }) as Promise<void>,
    ).rejects.toThrow(/Blocked by the ZibbyOS gate/);
    expect(toolsRunning()).toBe(0); // a blocked call never counts

    vi.useFakeTimers();
    await hooks["tool.execute.before"]({ id: "b", tool: "shell", input: { command: "sleep 1" } });
    await hooks["tool.execute.before"]({ id: "c", tool: "read", input: { path: "/a" } });
    expect(toolsRunning()).toBe(2);
    utimesSync(log, 0, 0);
    vi.advanceTimersByTime(30_000);
    expect(statSync(log).mtimeMs).toBeGreaterThan(0);

    hooks["tool.execute.after"]({ id: "b", tool: "shell", status: "error" });
    hooks["tool.execute.after"]({ id: "c", tool: "read", status: "completed" });
    hooks["tool.execute.after"]({ id: "c", tool: "read", status: "completed" }); // twice: no-op
    expect(toolsRunning()).toBe(0);
    utimesSync(log, 0, 0);
    vi.advanceTimersByTime(60_000);
    expect(statSync(log).mtimeMs).toBe(0); // idle again: no heartbeat
  });
});
