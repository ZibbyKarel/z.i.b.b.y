import { promises as fs } from "node:fs";
import * as path from "node:path";
import { safeJson } from "../shared/file-storage/file-utils";
import type { ClaudeLocations } from "./claude-locations";

/** One of the operator's own MCP servers, as Claude Code's config declares it. */
export interface OperatorMcpServer {
  /** The server name a session sees (`mcp__<id>__<tool>`): the user-scope key, or
   *  `plugin_<plugin>_<server>` for a plugin server (Claude Code's own naming). */
  id: string;
  /** The raw Claude `mcpServers` entry (`type`/`command`/`args`/`env`/`url`/`headers`).
   *  Carries secrets — only ever written to a 0600 file, never logged or returned. */
  config: Record<string, unknown>;
}

type Json = Record<string, unknown>;

const isRecord = (value: unknown): value is Json =>
  typeof value === "object" && value !== null && !Array.isArray(value);

async function readJson(file: string): Promise<unknown> {
  return safeJson(await fs.readFile(file, "utf8").catch(() => "null"));
}

/** Claude Code expands `${CLAUDE_PLUGIN_ROOT}` in a plugin's `.mcp.json`; nothing else sets it. */
function withPluginRoot(value: unknown, root: string): unknown {
  if (typeof value === "string") return value.replaceAll("${CLAUDE_PLUGIN_ROOT}", root);
  if (Array.isArray(value)) return value.map((v) => withPluginRoot(v, root));
  if (isRecord(value)) {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, withPluginRoot(v, root)]));
  }
  return value;
}

/**
 * A23 — the operator's own MCP servers, read from Claude Code's config so a session that
 * runs with `--setting-sources ""` (chat) can still mount them: user scope
 * (`~/.claude.json` → `mcpServers`) plus the `.mcp.json` of every plugin enabled in
 * `~/.claude/settings.json`. A server the operator disabled for `cwd`
 * (`projects[cwd].disabledMcpServers`, by name or `plugin:<plugin>:<server>`) is skipped.
 * Fail-soft like the inventory: a missing or broken source yields nothing.
 */
export async function readOperatorMcpServers(
  loc: ClaudeLocations,
  cwd: string = loc.repoRoot,
): Promise<OperatorMcpServer[]> {
  const [userConfig, installed, settings] = await Promise.all([
    readJson(loc.userConfigFile),
    readJson(path.join(loc.claudeDir, "plugins", "installed_plugins.json")),
    readJson(path.join(loc.claudeDir, "settings.json")),
  ]);
  const cfg = isRecord(userConfig) ? userConfig : {};
  const project = isRecord(cfg.projects) ? cfg.projects[cwd] : undefined;
  const disabled = new Set(
    isRecord(project) && Array.isArray(project.disabledMcpServers)
      ? project.disabledMcpServers.filter((n): n is string => typeof n === "string")
      : [],
  );
  const out: OperatorMcpServer[] = [];
  for (const [name, config] of Object.entries(isRecord(cfg.mcpServers) ? cfg.mcpServers : {})) {
    if (isRecord(config) && !disabled.has(name)) out.push({ id: name, config });
  }

  const enabled =
    isRecord(settings) && isRecord(settings.enabledPlugins) ? settings.enabledPlugins : {};
  const plugins = isRecord(installed) && isRecord(installed.plugins) ? installed.plugins : {};
  for (const [pluginId, installs] of Object.entries(plugins)) {
    if (enabled[pluginId] !== true) continue;
    const first: unknown = Array.isArray(installs) ? installs[0] : undefined;
    const root = isRecord(first) && typeof first.installPath === "string" ? first.installPath : "";
    if (!root) continue;
    const json = await readJson(path.join(root, ".mcp.json"));
    const servers = isRecord(json) ? (isRecord(json.mcpServers) ? json.mcpServers : json) : {};
    const plugin = pluginId.split("@")[0] ?? pluginId;
    for (const [name, config] of Object.entries(servers)) {
      if (!isRecord(config) || disabled.has(`plugin:${plugin}:${name}`)) continue;
      out.push({ id: `plugin_${plugin}_${name}`, config: withPluginRoot(config, root) as Json });
    }
  }
  return out;
}
