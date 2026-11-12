// ZibbyOS approval gate for `opencode run` (the opencode sibling of the Claude
// PreToolUse hook). opencode loads this directory as a V2 plugin (`plugins: [dir]`
// in the run's OPENCODE_CONFIG file) inside its own process; it inherits the run's env.
//
// Enforcement has three halves (verified against opencode 2.0.12):
//  1. The run's config sets `permissions: ask *` and the run is spawned WITHOUT
//     `--auto`, so a tool call nobody approves is auto-rejected. If this plugin fails
//     to load, every tool is refused (fail closed). The config also DENIES `execute`
//     (Code Mode), `question` and every tool the agent's `tools` list lacks — a denied
//     tool is removed from the model's toolset.
//  2. `tool.hook("execute.before")` is default-DENY: only the tools below are let
//     through. Mapped tools are translated into the Claude PreToolUse event shape and
//     run through the EXISTING `claude-approval-hook.mjs` — the same classifier,
//     ownership ledger, free zone and intent-request/decision protocol RunnerCore
//     watches. A deny (or any error) throws, which blocks the tool and hands the
//     message to the model. Anything unknown (`execute`, `opencode_*`, `browser_*`,
//     …) throws.
//  3. Only then does `permission.hook("evaluate")` grant the call (it runs after
//     execute.before). It never upgrades a `deny`.
//
// Env (set by the command builder / RunnerCore): ZIBBY_GATE_NODE (node binary),
// ZIBBY_GATE_HOOK (absolute hook path), ZIBBY_GATE_DEADLINE_S, ZIBBY_GATE_CWD (the
// run's spawn dir — paths are judged against it, never against opencode's own cwd),
// ZIBBY_GATE_LOG (decision log RunnerCore copies into the run log), ZIBBY_MCP_SERVERS
// and ZIBBY_DENY_TOOLS (comma lists), ZIBBY_SHELL_PREFIXES (JSON array; set when the
// agent only has `Bash(<prefix>:*)`), plus the hook's own ZIBBY_INTENT_DIR /
// ZIBBY_FREE_DIRS.

import { spawn } from "node:child_process";
import { appendFileSync, utimesSync } from "node:fs";
import path from "node:path";

/** Permission actions never granted: interactive questions and code-mode `execute`. */
const DENIED_ACTIONS = new Set(["question", "execute"]);

/**
 * Known tools that only read or track state — allowed without the hook. `skill` is NOT
 * here: it loads the operator's global `~/.claude/skills` into the run (denied).
 */
const UNGATED = new Set(["webfetch", "websearch", "todowrite", "todoread", "todo"]);

/** MCP server ids that would shadow opencode's built-in tool namespaces. */
const RESERVED_MCP_IDS = new Set(["opencode", "browser"]);

/** CLIs that would start a fresh, ungated agent session. */
const NESTED_AGENTS = new Set(["opencode", "claude"]);
/** Wrappers whose argument is still the command that runs. */
const WRAPPERS = new Set(["env", "sudo", "nohup", "exec", "xargs", "command", "time", "nice"]);

const list = (v) =>
  String(v ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

/** Blocked tool call (thrown from execute.before). */
class GateDenied extends Error {}

/**
 * opencode tool call → Claude PreToolUse events (several for a multi-file patch);
 * `[]` for a known tool that is not gated. Throws {@link GateDenied} for anything not
 * explicitly known — the default is deny.
 */
export function toClaudeEvents(tool, input, cwd, mcpServers = []) {
  const i = input && typeof input === "object" ? input : {};
  const dir = [i.workdir, i.directory].find((d) => typeof d === "string" && d);
  const at = dir ? path.resolve(cwd, dir) : cwd;
  const file = i.path ?? i.filePath ?? i.file_path;
  const ev = (tool_name, tool_input) => ({ tool_name, tool_input, cwd: at });
  switch (tool) {
    case "shell":
    case "bash":
      return [ev("Bash", { command: String(i.command ?? "") })];
    case "write":
      return [ev("Write", { file_path: file, content: String(i.content ?? "") })];
    case "edit":
      return [
        ev("Edit", { file_path: file, new_string: String(i.newString ?? i.new_string ?? "") }),
      ];
    case "read":
      return [ev("Read", { file_path: file })];
    case "glob":
    case "grep":
      return [ev(tool === "glob" ? "Glob" : "Grep", { path: i.path, pattern: i.pattern })];
    case "list":
    case "ls":
      return [ev("Glob", { path: i.path ?? at, pattern: "*" })];
    case "patch":
    case "apply_patch":
      return patchEvents(String(i.patchText ?? i.patch ?? ""), ev);
    case "task":
    case "subagent":
      return [
        ev("Task", {
          subagent_type: i.agent ?? i.subagent_type ?? i.agentID,
          prompt: i.prompt,
          description: i.description,
        }),
      ];
    default: {
      if (UNGATED.has(tool)) return [];
      if (tool.endsWith("ask_operator")) {
        return [ev("mcp__zibby-run__ask_operator", { question: i.question })];
      }
      // An MCP tool (`<server>_<tool>`) of a server this run was given goes through the
      // hook like a Claude `mcp__<server>__<tool>` call.
      for (const id of mcpServers) {
        // opencode's own `opencode_*` / `browser_*` tools must never pass as MCP calls.
        if (RESERVED_MCP_IDS.has(id)) continue;
        for (const prefix of new Set([`${id}_`, `${id.replace(/[^a-zA-Z0-9_-]/g, "_")}_`])) {
          if (tool.startsWith(prefix)) {
            return [ev(`mcp__${id}__${tool.slice(prefix.length)}`, i)];
          }
        }
      }
      throw new GateDenied(`the tool "${tool}" is not allowed on ZibbyOS runs.`);
    }
  }
}

/** `*** Add|Update|Delete File:` / `*** Move to:` sections → Write / Edit / rm events. */
function patchEvents(text, ev) {
  const out = [];
  for (const m of text.matchAll(/^\*\*\* (Add File|Update File|Delete File|Move to): (.+)$/gm)) {
    const [, kind, p] = m;
    const target = p.trim();
    if (kind === "Delete File")
      out.push(ev("Bash", { command: `rm -- ${JSON.stringify(target)}` }));
    else if (kind === "Update File") out.push(ev("Edit", { file_path: target, new_string: "" }));
    else out.push(ev("Write", { file_path: target, content: "" }));
  }
  // A patch whose targets can't be read can't be judged — refuse it.
  if (!out.length) throw new GateDenied("the patch names no file the gate can check.");
  return out;
}

/** A `Bash(<prefix>:*)`-only agent: one plain command starting with an allowed prefix. */
function shellAllowed(command, prefixes) {
  if (/[;&|`<>\n]|\$\(/.test(command)) return false;
  const c = command.trim();
  if (!prefixes.some((p) => c === p || c.startsWith(`${p} `))) return false;
  // git runs arbitrary commands through config (`-c alias.x='!sh'`, `core.pager`, …).
  if (/^git(\s|$)/.test(c)) {
    return !c
      .split(/\s+/)
      .some((a) => a === "-c" || /^--(config-env|exec-path)\b/.test(a) || a.includes("!"));
  }
  return true;
}

/**
 * Whether a shell command starts `opencode` / `claude` as a command (a segment start,
 * after `env`/`sudo`/`nohup`/`exec`/`xargs`/… or `VAR=x`). Ceiling: a wrapper like
 * `sh -c "…"` or a python script still hides it — the same as on the Claude path.
 */
export function startsNestedAgent(command) {
  for (const segment of String(command).split(/&&|\|\||[;|&\n(`]|\$\(/)) {
    const words = segment.trim().split(/\s+/).filter(Boolean);
    let i = 0;
    while (i < words.length) {
      const w = words[i].replace(/^["']|["']$/g, "");
      if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(w) || w.startsWith("-")) {
        i++;
        continue;
      }
      const base = path.basename(w);
      if (WRAPPERS.has(base)) {
        i++;
        continue;
      }
      if (NESTED_AGENTS.has(base)) return true;
      break;
    }
  }
  return false;
}

/** Run the Claude approval hook on one event → `null` (allowed / not gated) or a deny reason. */
export function runHook(event, env = process.env) {
  const node = env.ZIBBY_GATE_NODE;
  const hook = env.ZIBBY_GATE_HOOK;
  if (!node || !hook) return Promise.resolve("ZibbyOS gate is not configured for this run.");
  return new Promise((resolve) => {
    let out = "";
    const child = spawn(node, [hook, env.ZIBBY_GATE_DEADLINE_S ?? ""], {
      stdio: ["pipe", "pipe", "ignore"],
      env,
    });
    child.stdout.on("data", (d) => (out += d));
    child.on("error", (e) => resolve(`ZibbyOS gate failed to start: ${e.message}`));
    child.on("close", (code) => {
      if (code !== 0) return resolve(`ZibbyOS gate exited with ${code}.`);
      if (!out.trim()) return resolve(null); // not gated
      try {
        const d = JSON.parse(out).hookSpecificOutput;
        resolve(d?.permissionDecision === "allow" ? null : String(d?.permissionDecisionReason));
      } catch {
        resolve("ZibbyOS gate returned an unreadable decision.");
      }
    });
    child.stdin.on("error", () => {}); // a hook that exits before reading stdin
    child.stdin.end(JSON.stringify(event));
  });
}

/**
 * Decide one opencode tool call → `null` (run it) or the deny reason. Every decision
 * is appended to ZIBBY_GATE_LOG (subagent calls never reach the run's JSONL stream).
 */
export async function gateCall(tool, input, env = process.env) {
  let reason = null;
  try {
    const cwd = env.ZIBBY_GATE_CWD;
    if (!cwd) throw new GateDenied("ZibbyOS gate is not configured for this run.");
    if (list(env.ZIBBY_DENY_TOOLS).includes(tool)) {
      throw new GateDenied(`the agent is not allowed to use "${tool}".`);
    }
    const events = toClaudeEvents(tool, input, cwd, list(env.ZIBBY_MCP_SERVERS));
    for (const e of events) {
      if (e.tool_name === "Bash" && startsNestedAgent(e.tool_input.command)) {
        throw new GateDenied("a nested opencode / claude session is not allowed on ZibbyOS runs.");
      }
      if (e.tool_name === "Bash" && env.ZIBBY_SHELL_PREFIXES) {
        const prefixes = JSON.parse(env.ZIBBY_SHELL_PREFIXES);
        if (!shellAllowed(e.tool_input.command, prefixes)) {
          throw new GateDenied(`the agent may only run: ${prefixes.join(", ")}.`);
        }
      }
      reason = await runHook(e, env);
      if (reason) break;
    }
  } catch (e) {
    reason = e instanceof GateDenied ? e.message : `ZibbyOS gate error: ${e?.message ?? e}`;
  }
  logDecision(env.ZIBBY_GATE_LOG, tool, input, reason);
  return reason;
}

function logDecision(file, tool, input, reason) {
  if (!file) return;
  const i = input && typeof input === "object" ? input : {};
  const what = String(i.command ?? i.path ?? i.filePath ?? i.url ?? i.prompt ?? "")
    .replace(/\s+/g, " ")
    .slice(0, 160);
  const line = `⛨ gate ${tool}${what ? ` ${what}` : ""} → ${reason ? `denied: ${reason}` : "allowed"}\n`;
  try {
    appendFileSync(file, line);
  } catch {
    // the log is best-effort; the decision stands
  }
}

// One gated call at a time: the hook protocol has a single intent-request file per
// run, so parallel tool calls are serialised here instead of racing on it.
let queue = Promise.resolve();

// Tools allowed and still running. opencode writes nothing to stdout until a tool
// finishes, so while one runs the gate log's mtime is bumped — RunnerCore's idle
// watchdog reads that as activity (a 15-minute test suite is not a hung run).
const running = new Set();
const HEARTBEAT_MS = 30_000;
let heartbeat;
const callKey = (event) => event.id ?? `${event.messageID}:${event.tool}`;

/** Track one allowed call; the heartbeat runs only while something is in flight. */
export function toolStarted(key, env = process.env) {
  running.add(key);
  if (heartbeat || !env.ZIBBY_GATE_LOG) return;
  heartbeat = setInterval(() => {
    const now = new Date();
    try {
      utimesSync(env.ZIBBY_GATE_LOG, now, now);
    } catch {
      // best-effort
    }
  }, HEARTBEAT_MS);
  heartbeat.unref?.(); // never keeps opencode alive after the session ends
}

export function toolFinished(key) {
  running.delete(key);
  if (running.size || !heartbeat) return;
  clearInterval(heartbeat);
  heartbeat = undefined;
}

/** In-flight tool count (tests). */
export const toolsRunning = () => running.size;

const plugin = {
  id: "zibby-gate",
  async setup(ctx) {
    await ctx.permission.hook("evaluate", (event) => {
      if (event.effect === "deny") return; // a config deny always stands
      event.effect = DENIED_ACTIONS.has(event.action) ? "deny" : "allow";
    });
    await ctx.tool.hook("execute.before", (event) => {
      const run = queue.then(async () => {
        const reason = await gateCall(String(event.tool), event.input);
        // A blocked call is never counted, so it can't leave the heartbeat running.
        if (reason) throw new Error(`Blocked by the ZibbyOS gate: ${reason}`);
        toolStarted(callKey(event));
      });
      queue = run.catch(() => undefined);
      return run;
    });
    await ctx.tool.hook("execute.after", (event) => {
      toolFinished(callKey(event));
    });
  },
};

export default plugin;
