// ZibbyOS chat gate for `opencode run` (A25, widened by A33). A chat turn has no
// RunnerCore approval protocol (no intent-request watcher, no approval card, a 120 s
// turn), so it cannot wait for a decision the way the run gate plugin does. It is
// FAIL-FAST instead, judging every call with the run gate's own classifier
// (`claude-approval-hook.mjs`, imported — never spawned, since the spawned hook waits):
//
//  - `shell` / `bash`: a command the classifier does not gate runs; a gated one (push,
//    rm, mv, overwrite, publish, `gh pr create`, …), a nested `opencode` / `claude`, or
//    anything touching the operator-only surface is REFUSED at once with a message that
//    tells the model to delegate it via `create_task` (which goes through the run gate).
//  - `read` / `grep` / `glob` / `list`: run, unless the path is the operator token dir.
//  - MCP tools of the mounted servers (`ZIBBY_CHAT_MCP_SERVERS`, comma list): ZibbyOS's
//    own `zibby` / `zibby-kb` run; an operator server's call runs only when A28's
//    `classifyMcp` reads it as `mcp.read` — any write is refused with the same delegate
//    message.
//  - everything else (write, edit, patch, `execute`, `question`, `skill`, `task`, web,
//    `opencode_*`, …) is refused. Tools named in `ZIBBY_CHAT_DENY_TOOLS` (e.g.
//    `zibby_create_task` in an `@agent` turn) are refused too.
//
// The turn's config also sets `permissions: deny *` with allow rules for exactly these
// tools (and the turn runs without `--auto`), so if this plugin fails to load the
// risky calls are not judged — but write/edit/execute stay denied by the config.

import path from "node:path";
import {
  classifyEvent,
  pathTouchesOperatorOnly,
  touchesOperatorOnly,
} from "../../runner/claude-approval-hook.mjs";
import { startsNestedAgent, toClaudeEvents } from "../../runner/opencode-gate-plugin/index.mjs";

/** MCP server ids that would shadow opencode's built-in tool namespaces. */
const RESERVED_MCP_IDS = new Set(["opencode", "browser"]);

/** ZibbyOS's own servers — their tools are the chat's own surface, never classified. */
const OWN_MCP_IDS = new Set(["zibby", "zibby-kb"]);

/** Built-in tools a chat turn may use (judged per call below). */
export const CHAT_BUILTIN_TOOLS = ["shell", "bash", "read", "grep", "glob", "list"];

export const CHAT_DENY_REASON =
  "in the ZibbyOS chat only the shell, file reads and the mounted MCP tools are allowed — no file writes, edits or code execution.";

export const CHAT_DELEGATE_REASON =
  "this needs the operator's approval, which the chat cannot ask for. Do not retry or work around it — hand the work off with the zibby create_task tool (a task asks the operator through the real gate), or tell the operator what you would run.";

const list = (v) =>
  String(v ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s && !RESERVED_MCP_IDS.has(s));

const prefixesOf = (id) => [`${id}_`, `${id.replace(/[^a-zA-Z0-9_-]/g, "_")}_`];

/** The mounted server `tool` (opencode names MCP tools `<server>_<tool>`) belongs to, or null. */
function mountedServerOf(tool, env) {
  const name = String(tool ?? "");
  // Longest id first, so `zibby-kb_x` is never read as a `zibby` tool.
  const ids = list(env.ZIBBY_CHAT_MCP_SERVERS).sort((a, b) => b.length - a.length);
  return (
    ids.find((id) =>
      prefixesOf(id).some((prefix) => name.startsWith(prefix) && name.length > prefix.length),
    ) ?? null
  );
}

/** Whether `tool` belongs to a mounted server. */
export function isMountedMcpTool(tool, env = process.env) {
  return mountedServerOf(tool, env) !== null;
}

/** Whether the chat turn may use `tool` at all (its input is judged by {@link chatGateReason}). */
export function isAllowedChatTool(tool, env = process.env) {
  const name = String(tool ?? "");
  if (list(env.ZIBBY_CHAT_DENY_TOOLS).includes(name)) return false;
  return CHAT_BUILTIN_TOOLS.includes(name) || isMountedMcpTool(name, env);
}

/** A call reaching the operator-only surface (approval API, operator token dir). */
function touchesOperator(e) {
  const i = e.tool_input ?? {};
  if (e.tool_name === "Bash") return touchesOperatorOnly(i.command);
  return (
    pathTouchesOperatorOnly(i.file_path, e.cwd) ||
    pathTouchesOperatorOnly(i.path, e.cwd) ||
    touchesOperatorOnly(i.pattern)
  );
}

/** Decide one call → `null` (run it) or the reason it is refused. Never waits. */
export function chatGateReason(tool, input, env = process.env) {
  const name = String(tool ?? "");
  if (!isAllowedChatTool(name, env)) return CHAT_DENY_REASON;
  const server = mountedServerOf(name, env);
  if (server && OWN_MCP_IDS.has(server)) return null;
  const cwd = path.resolve(env.PWD || process.cwd());
  let events;
  try {
    events = toClaudeEvents(name, input, cwd, server ? [server] : []);
  } catch (e) {
    return e?.message ?? CHAT_DENY_REASON;
  }
  for (const e of events) {
    if (touchesOperator(e)) {
      return "approvals are decided by the operator only — the chat cannot call the approvals API or read the operator token.";
    }
    if (e.tool_name === "Bash" && startsNestedAgent(e.tool_input?.command)) {
      return `a nested opencode / claude session is not allowed — ${CHAT_DELEGATE_REASON}`;
    }
    let request;
    try {
      request = classifyEvent(e);
    } catch {
      // Fail closed: a call the classifier chokes on is not run from the chat.
      request = { action: "unclassified" };
    }
    if (request && request.action !== "mcp.read") {
      return `"${request.action}" — ${CHAT_DELEGATE_REASON}`;
    }
  }
  return null;
}

const plugin = {
  id: "zibby-chat-gate",
  async setup(ctx) {
    await ctx.permission.hook("evaluate", (event) => {
      if (event.effect === "deny") return; // a config deny always stands
      event.effect = isAllowedChatTool(event.action) ? "allow" : "deny";
    });
    await ctx.tool.hook("execute.before", (event) => {
      const reason = chatGateReason(event.tool, event.input);
      if (reason) throw new Error(`Blocked by the ZibbyOS gate: ${reason}`);
    });
  },
};

export default plugin;
