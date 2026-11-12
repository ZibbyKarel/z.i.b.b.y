import * as path from "node:path";
import { agentBaseEnv } from "../shared/agent-env";
import type { ChatStreamEvent } from "./chat-stream-parser";

/** The gate plugin an opencode chat turn loads (A25): default-deny, mounted MCP tools only. */
export const OPENCODE_CHAT_GATE_PLUGIN = path.resolve(__dirname, "opencode-chat-gate");

/** The opencode agent id the chat's system prompt is defined under. */
const OPENCODE_CHAT_AGENT = "zibby";

/** opencode names an MCP tool `<server>_<tool>`; ids outside this set can't be matched safely. */
const OPENCODE_MCP_ID = /^[A-Za-z0-9_-]+$/;

/** Server ids that would shadow opencode's own `opencode_*` / `browser_*` tools. */
const RESERVED_IDS = new Set(["opencode", "browser"]);

/**
 * Appended to the system prompt on opencode, so the model tells the operator why it has
 * no shell instead of pretending (A25).
 */
export const OPENCODE_CHAT_NOTE =
  "Běžíš na enginu opencode. Máš jen nástroje MCP serverů zibby a zibby-kb. Shell, práci " +
  "se soubory, operátorovy vlastní MCP servery ani konektory claude.ai (Slack, Jira, …) tu " +
  "nemáš — když je operátor potřebuje, řekni mu, že v chatu vyžadují engine Claude.";

/** A Claude `mcpServers` entry → opencode's `mcp.servers` shape (stdio → local, http/sse → remote). */
export function toOpencodeMcpServer(config: Record<string, unknown>): Record<string, unknown> {
  if (typeof config.url === "string" && config.type !== "stdio") {
    return {
      type: "remote",
      url: config.url,
      ...(config.headers ? { headers: config.headers } : {}),
      oauth: false,
      codemode: false,
    };
  }
  return {
    type: "local",
    command: [config.command, ...(Array.isArray(config.args) ? config.args : [])],
    ...(config.env ? { environment: config.env } : {}),
    codemode: false,
  };
}

/** The mounted server ids an opencode turn can use (reserved / unmatchable ids dropped). */
export function opencodeChatServerIds(servers: Record<string, unknown>): string[] {
  return Object.keys(servers).filter((id) => OPENCODE_MCP_ID.test(id) && !RESERVED_IDS.has(id));
}

/**
 * The per-turn opencode config (written 0600 by the caller, passed as `OPENCODE_CONFIG`):
 * the chat prompt as the `zibby` agent, the turn's MCP servers, and A25's fail-closed
 * permissions — deny everything, allow only `<server>_*` of the mounted servers (verified
 * on 2.2.7: the denied built-ins disappear from the toolset; `skill` stays listed and the
 * plugin refuses it). The turn runs without `--auto`.
 */
export function buildOpencodeChatConfig(
  system: string,
  mcpServers: Record<string, Record<string, unknown>>,
  /** Mounted MCP tools (`<server>_<tool>`) still denied — rules match last-wins (verified). */
  denyTools: readonly string[] = [],
): { config: Record<string, unknown>; serverIds: string[] } {
  const serverIds = opencodeChatServerIds(mcpServers);
  const servers = Object.fromEntries(
    serverIds.map((id) => [id, toOpencodeMcpServer(mcpServers[id] ?? {})]),
  );
  return {
    serverIds,
    config: {
      agents: { [OPENCODE_CHAT_AGENT]: { mode: "primary", system } },
      permissions: [
        { action: "*", resource: "*", effect: "deny" },
        ...serverIds.map((id) => ({ action: `${id}_*`, resource: "*", effect: "allow" })),
        ...denyTools.map((action) => ({ action, resource: "*", effect: "deny" })),
      ],
      plugins: [OPENCODE_CHAT_GATE_PLUGIN],
      ...(serverIds.length ? { mcp: { servers } } : {}),
    },
  };
}

/** `opencode run` argv for one chat turn. `--standalone` is mandatory (per-run config). */
export function opencodeChatArgs(model: string, sessionId: string | null, text: string): string[] {
  return [
    "run",
    "--standalone",
    "--format",
    "json",
    "-m",
    model,
    "--agent",
    OPENCODE_CHAT_AGENT,
    ...(sessionId ? ["--session", sessionId] : []),
    "--",
    text,
  ];
}

/**
 * The env of an opencode chat turn: no inherited `OPENCODE_*` (only ours), project config
 * off, `PWD` pinned to the spawn dir (opencode takes its project dir from `$PWD`), and the
 * mounted server ids for the gate plugin.
 */
export function opencodeChatEnv(
  configFile: string,
  cwd: string,
  serverIds: readonly string[],
): NodeJS.ProcessEnv {
  const env = agentBaseEnv();
  for (const key of Object.keys(env)) if (key.startsWith("OPENCODE_")) delete env[key];
  const claudePath = process.env.OPENCODE_CLAUDE_PATH ?? process.env.CLAUDE_BIN;
  return {
    ...env,
    OPENCODE_CONFIG: configFile,
    OPENCODE_DISABLE_PROJECT_CONFIG: "1",
    PWD: cwd,
    ZIBBY_CHAT_MCP_SERVERS: serverIds.join(","),
    ...(claudePath ? { OPENCODE_CLAUDE_PATH: claudePath } : {}),
  };
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;

/**
 * One `opencode run --format json` line → chat stream events. Text arrives as whole parts
 * (`block: true`), not token deltas. A `tool_use` arrives finished; its `<server>_<tool>`
 * name is mapped to Claude's `mcp__<server>__<tool>` for a mounted server, and a blocked
 * or failed call carries `failed: true`. There is no `result` line: the turn ends on exit.
 */
export function parseOpencodeChatLine(
  line: string,
  serverIds: readonly string[] = [],
): ChatStreamEvent[] {
  let event: unknown;
  try {
    event = JSON.parse(line.trim());
  } catch {
    return [];
  }
  if (!isRecord(event)) return [];
  const out: ChatStreamEvent[] = [];
  if (typeof event.sessionID === "string")
    out.push({ type: "session", sessionId: event.sessionID });
  const part = isRecord(event.part) ? event.part : {};
  if (event.type === "text" && typeof part.text === "string" && part.text.trim()) {
    out.push({ type: "delta", text: part.text, block: true });
  } else if (event.type === "tool_use" && typeof part.tool === "string") {
    const state = isRecord(part.state) ? part.state : {};
    const server = [...serverIds]
      .sort((a, b) => b.length - a.length)
      .find((id) => (part.tool as string).startsWith(`${id}_`));
    out.push({
      type: "tool",
      name: server ? `mcp__${server}__${part.tool.slice(server.length + 1)}` : part.tool,
      input: state.input ?? null,
      id: typeof part.id === "string" ? part.id : "",
      ...(state.status === "error" ? { failed: true } : {}),
    });
  } else if (event.type === "error") {
    const err = isRecord(event.error) ? event.error : {};
    out.push({ type: "error", message: `opencode: ${String(err.message ?? err.type ?? "error")}` });
  }
  return out;
}
