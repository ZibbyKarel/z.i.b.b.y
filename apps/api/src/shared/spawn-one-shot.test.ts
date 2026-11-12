import { EventEmitter } from "node:events";
import { existsSync, readFileSync, statSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:child_process", () => ({ spawn: vi.fn() }));

import { spawn } from "node:child_process";
import { parseOpencodeOneShot, spawnOneShot } from "./spawn-one-shot";

const spawnMock = vi.mocked(spawn);

interface FakeChild extends EventEmitter {
  stdout: EventEmitter;
  stderr: EventEmitter;
  kill: ReturnType<typeof vi.fn>;
}

interface Seen {
  command: string;
  args: string[];
  cwd?: string;
  env: NodeJS.ProcessEnv;
  config?: Record<string, unknown>;
  configMode?: number;
}

/** The next spawn answers `stdout` and exits `code`; records argv/env and the config file. */
function nextSpawn(stdout: string, code = 0): Seen {
  const seen = {} as Seen;
  spawnMock.mockImplementationOnce(((
    command: string,
    args: string[],
    o: { cwd?: string; env: NodeJS.ProcessEnv },
  ) => {
    Object.assign(seen, { command, args, cwd: o.cwd, env: o.env });
    const file = o.env.OPENCODE_CONFIG;
    if (file && existsSync(file)) {
      seen.config = JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>;
      seen.configMode = statSync(file).mode & 0o777;
    }
    const child = new EventEmitter() as FakeChild;
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.kill = vi.fn();
    setImmediate(() => {
      child.stdout.emit("data", Buffer.from(stdout));
      child.emit("exit", code);
    });
    return child;
  }) as unknown as typeof spawn);
  return seen;
}

const ev = (type: string, part: Record<string, unknown> = {}, extra = {}) =>
  JSON.stringify({ type, sessionID: "ses_1", part, ...extra });
const okStream = [
  ev("step_start"),
  ev("text", { text: "Let me look." }),
  ev("tool_use", { tool: "read" }),
  ev("step_finish", { cost: 0.01 }),
  ev("step_start"),
  ev("text", { text: '{"title":' }),
  ev("text", { text: '"hi"}' }),
  ev("step_finish", { cost: 0.02 }),
].join("\n");

const opencodeConfig = {
  aiEngine: "opencode" as const,
  opencodeModel: "claude-agent/sonnet",
  opencodeTierModels: { haiku: "claude-agent/haiku" },
};

describe("spawnOneShot", () => {
  beforeEach(() => {
    spawnMock.mockReset();
    process.env.OPENCODE_BIN = "/fake/opencode";
    process.env.OPENCODE_LEAK = "x";
  });
  afterEach(() => {
    delete process.env.OPENCODE_BIN;
    delete process.env.OPENCODE_LEAK;
  });

  it("is the old native claude call on the claude engine", async () => {
    const seen = nextSpawn('{"result":"ok"}');
    const out = await spawnOneShot({
      tier: "haiku",
      prompt: "P",
      timeoutMs: 1000,
      label: "router",
      config: undefined,
      claudeArgs: ["--effort", "high"],
    });
    expect(out).toBe('{"result":"ok"}');
    expect(seen.command).toBe(process.env.CLAUDE_BIN ?? "claude");
    expect(seen.args).toEqual([
      "--setting-sources",
      "",
      "-p",
      "P",
      "--output-format",
      "json",
      "--model",
      "haiku",
      "--effort",
      "high",
    ]);
  });

  it("runs opencode with the tier's model, a deny-all config and the claude envelope", async () => {
    const seen = nextSpawn(okStream);
    const out = await spawnOneShot({
      tier: "haiku",
      prompt: "P",
      timeoutMs: 1000,
      label: "namer",
      config: opencodeConfig,
      claudeArgs: ["--ignored-on-opencode"],
    });
    // Last step's text only; cost summed over every step_finish.
    expect(JSON.parse(out)).toEqual({
      result: '{"title":"hi"}',
      total_cost_usd: 0.03,
      session_id: "ses_1",
    });
    expect(seen.command).toBe("/fake/opencode");
    expect(seen.args).toEqual([
      "run",
      "--standalone",
      "--archived",
      "--format",
      "json",
      "-m",
      "claude-agent/haiku",
      "--agent",
      "zibby-oneshot",
      "--",
      "P",
    ]);
    expect(seen.configMode).toBe(0o600);
    expect(seen.config?.permissions).toEqual([
      { action: "*", resource: "*", effect: "deny" },
      { action: "external_directory", resource: "*", effect: "deny" },
    ]);
    expect(seen.config).not.toHaveProperty("plugins");
    expect(seen.env.OPENCODE_DISABLE_PROJECT_CONFIG).toBe("1");
    expect(seen.env.OPENCODE_LEAK).toBeUndefined();
    expect(seen.env.PWD).toBe(seen.cwd);
    // The temp config is gone after the call.
    expect(existsSync(seen.env.OPENCODE_CONFIG ?? "")).toBe(false);
  });

  it("read-cwd: read tools only, outside paths denied, gate plugin on, PWD = the repo", async () => {
    const seen = nextSpawn(okStream);
    await spawnOneShot({
      tier: "sonnet",
      prompt: "P",
      timeoutMs: 1000,
      label: "reply-researcher",
      config: opencodeConfig,
      tools: "read-cwd",
      cwd: "/repo",
    });
    expect(seen.args).toContain("claude-agent/haiku"); // sonnet unmapped → nearest lower tier (A20)
    expect(seen.cwd).toBe("/repo");
    expect(seen.env.PWD).toBe("/repo");
    expect(seen.env.ZIBBY_GATE_CWD).toBe("/repo");
    const perms = seen.config?.permissions as Array<{ action: string; effect: string }>;
    expect(perms.filter((p) => p.effect === "allow").map((p) => p.action)).toEqual([
      "read",
      "list",
      "glob",
      "grep",
    ]);
    expect(perms.at(-1)).toMatchObject({ action: "external_directory", effect: "deny" });
    expect(seen.config?.plugins).toHaveLength(1);
    expect(seen.env.ZIBBY_DENY_TOOLS?.split(",")).toEqual(
      expect.arrayContaining(["shell", "bash", "write", "edit", "webfetch", "skill", "execute"]),
    );
    expect(seen.env.ZIBBY_DENY_TOOLS?.split(",")).not.toContain("read");
  });

  it("read-guarded forks a session and allows outside reads", async () => {
    const seen = nextSpawn(okStream);
    await spawnOneShot({
      tier: "opus",
      prompt: "P",
      timeoutMs: 1000,
      label: "advisor",
      config: opencodeConfig,
      engine: "opencode",
      tools: "read-guarded",
      forkSession: "ses_src",
      cwd: "/wt",
    });
    expect(seen.args.join(" ")).toContain("--session ses_src --fork -- P");
    const perms = seen.config?.permissions as Array<{ action: string; effect: string }>;
    expect(perms.at(-1)).toMatchObject({ action: "external_directory", effect: "allow" });
  });

  it("rejects on an error event, a non-zero exit and empty text", async () => {
    const base = {
      tier: "haiku" as const,
      prompt: "P",
      timeoutMs: 1000,
      label: "t",
      config: opencodeConfig,
    };
    nextSpawn(ev("error", {}, { error: { name: "X", data: { message: "model not found" } } }));
    await expect(spawnOneShot(base)).rejects.toThrow("opencode error: model not found");
    nextSpawn(okStream, 1);
    await expect(spawnOneShot(base)).rejects.toThrow("opencode exited 1");
    nextSpawn([ev("step_start"), ev("step_finish", { cost: 0 })].join("\n"));
    await expect(spawnOneShot(base)).rejects.toThrow("no text");
  });

  it("refuses to reach a real opencode from vitest without OPENCODE_BIN", async () => {
    delete process.env.OPENCODE_BIN;
    await expect(
      spawnOneShot({
        tier: "haiku",
        prompt: "P",
        timeoutMs: 1000,
        label: "t",
        config: opencodeConfig,
      }),
    ).rejects.toThrow("needs OPENCODE_BIN");
    expect(spawnMock).not.toHaveBeenCalled();
  });

  it("rejects when no model is mapped", async () => {
    await expect(
      spawnOneShot({
        tier: "haiku",
        prompt: "P",
        timeoutMs: 1000,
        label: "t",
        config: { aiEngine: "opencode", opencodeModel: "" },
      }),
    ).rejects.toThrow("no opencode model");
  });
});

describe("parseOpencodeOneShot", () => {
  it("skips non-JSON lines", () => {
    expect(parseOpencodeOneShot(`noise\n${ev("text", { text: "a" })}`, "t").result).toBe("a");
  });
});
