// ZibbyOS chat gate for `opencode run` (A25). A chat turn has no RunnerCore approval
// protocol (no intent-request watcher, no approval card), so it cannot use the run
// gate plugin's ask path. Instead this plugin is DEFAULT-DENY and lets through only
// the MCP tools of the servers the turn mounted (`ZIBBY_CHAT_MCP_SERVERS`, comma list):
// no shell, no file read/write/edit/patch, no `execute`, `question`, `skill`, `task`,
// web or `opencode_*` tool. Mounted tools named in `ZIBBY_CHAT_DENY_TOOLS` (comma list,
// e.g. `zibby_create_task` in an `@agent` turn) are refused too. The turn's config also
// sets `permissions: deny *` with the same allow/deny rules (and the turn runs without
// `--auto`), so if this plugin fails to load every tool is still refused.

/** MCP server ids that would shadow opencode's built-in tool namespaces. */
const RESERVED_MCP_IDS = new Set(["opencode", "browser"]);

export const CHAT_DENY_REASON =
  "in the ZibbyOS chat on opencode only the mounted MCP tools are allowed — shell and file tools need the Claude engine.";

const list = (v) =>
  String(v ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s && !RESERVED_MCP_IDS.has(s));

/** Whether `tool` (opencode names MCP tools `<server>_<tool>`) belongs to a mounted server. */
export function isMountedMcpTool(tool, env = process.env) {
  const name = String(tool ?? "");
  return list(env.ZIBBY_CHAT_MCP_SERVERS).some((id) =>
    [`${id}_`, `${id.replace(/[^a-zA-Z0-9_-]/g, "_")}_`].some(
      (prefix) => name.startsWith(prefix) && name.length > prefix.length,
    ),
  );
}

/** Whether the chat turn may run `tool`: a mounted MCP tool not on the per-turn deny list. */
export function isAllowedChatTool(tool, env = process.env) {
  return isMountedMcpTool(tool, env) && !list(env.ZIBBY_CHAT_DENY_TOOLS).includes(String(tool));
}

const plugin = {
  id: "zibby-chat-gate",
  async setup(ctx) {
    await ctx.permission.hook("evaluate", (event) => {
      if (event.effect === "deny") return; // a config deny always stands
      event.effect = isAllowedChatTool(event.action) ? "allow" : "deny";
    });
    await ctx.tool.hook("execute.before", (event) => {
      if (!isAllowedChatTool(event.tool)) {
        throw new Error(`Blocked by the ZibbyOS gate: ${CHAT_DENY_REASON}`);
      }
    });
  },
};

export default plugin;
