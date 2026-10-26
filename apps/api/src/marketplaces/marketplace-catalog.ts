import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { Marketplace, MarketplaceComponent } from "@zibby/contracts";
import matter from "gray-matter";
import { z } from "zod";
import { fileExists, safeJson } from "../shared/file-storage";

/**
 * Read-only views of Claude Code plugin state on disk: a marketplace's catalog
 * (`.claude-plugin/marketplace.json` + each plugin dir's component inventory)
 * and the user-scope install state (`installed_plugins.json`). Every reader is
 * fail-soft — a missing or malformed file reads as "nothing there".
 */

/** Claude Code's plugins dir (`installed_plugins.json`, `cache/`). Env `CLAUDE_PLUGINS_DIR`. */
export function resolveClaudePluginsDir(): string {
  return process.env.CLAUDE_PLUGINS_DIR ?? path.join(os.homedir(), ".claude", "plugins");
}

export interface PluginComponents {
  skills: MarketplaceComponent[];
  agents: MarketplaceComponent[];
  commands: MarketplaceComponent[];
  hooks: boolean;
  mcpServers: string[];
}

export interface CatalogPlugin extends PluginComponents {
  name: string;
  description?: string;
  version?: string;
  /** Absolute plugin dir inside the marketplace; undefined for a non-local (`{source: "github"}`) plugin. */
  dir?: string;
}

export interface Catalog {
  name: string;
  description?: string;
  plugins: CatalogPlugin[];
}

const MarketplaceJsonSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  metadata: z
    .object({ description: z.string().optional(), pluginRoot: z.string().optional() })
    .optional(),
  plugins: z.array(
    z.object({
      name: z.string().min(1),
      source: z.unknown(),
      description: z.string().optional(),
      version: z.string().optional(),
    }),
  ),
});

const PluginJsonSchema = z.object({
  description: z.string().optional(),
  version: z.string().optional(),
  mcpServers: z.unknown().optional(),
});

const InstalledPluginsSchema = z.object({
  plugins: z.record(
    z.string(),
    z.array(
      z.object({ scope: z.string(), installPath: z.string(), version: z.string().optional() }),
    ),
  ),
});

const EMPTY: PluginComponents = {
  skills: [],
  agents: [],
  commands: [],
  hooks: false,
  mcpServers: [],
};

async function readJson(file: string): Promise<unknown> {
  try {
    return safeJson(await fs.readFile(file, "utf8"));
  } catch {
    return undefined;
  }
}

async function frontmatter(file: string): Promise<Record<string, unknown>> {
  try {
    return matter(await fs.readFile(file, "utf8")).data as Record<string, unknown>;
  } catch {
    return {};
  }
}

const str = (value: unknown): string | undefined => (typeof value === "string" ? value : undefined);

function component(fm: Record<string, unknown>, fallback: string): MarketplaceComponent {
  const description = str(fm.description);
  return { name: str(fm.name) ?? fallback, ...(description ? { description } : {}) };
}

async function entries(dir: string) {
  try {
    return (await fs.readdir(dir, { withFileTypes: true })).sort((a, b) =>
      a.name.localeCompare(b.name),
    );
  } catch {
    return [];
  }
}

async function readSkills(pluginDir: string): Promise<MarketplaceComponent[]> {
  const dir = path.join(pluginDir, "skills");
  const out: MarketplaceComponent[] = [];
  for (const entry of await entries(dir)) {
    const file = path.join(dir, entry.name, "SKILL.md");
    if (await fileExists(file)) out.push(component(await frontmatter(file), entry.name));
  }
  return out;
}

async function readMarkdownDir(dir: string): Promise<MarketplaceComponent[]> {
  const out: MarketplaceComponent[] = [];
  for (const entry of await entries(dir)) {
    if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
    out.push(component(await frontmatter(path.join(dir, entry.name)), entry.name.slice(0, -3)));
  }
  return out;
}

const objectKeys = (value: unknown): string[] =>
  value && typeof value === "object" && !Array.isArray(value) ? Object.keys(value) : [];

/** A plugin dir's component inventory: skills, agents, commands, hooks, MCP server names. */
export async function readPluginComponents(pluginDir: string): Promise<PluginComponents> {
  const pluginJson = PluginJsonSchema.safeParse(
    await readJson(path.join(pluginDir, ".claude-plugin", "plugin.json")),
  );
  const mcpJson = await readJson(path.join(pluginDir, ".mcp.json"));
  const mcpRoot =
    mcpJson && typeof mcpJson === "object" && "mcpServers" in mcpJson
      ? mcpJson.mcpServers
      : mcpJson;
  const mcpServers = new Set([
    ...objectKeys(mcpRoot),
    ...objectKeys(pluginJson.success ? pluginJson.data.mcpServers : undefined),
  ]);
  return {
    skills: await readSkills(pluginDir),
    agents: await readMarkdownDir(path.join(pluginDir, "agents")),
    commands: await readMarkdownDir(path.join(pluginDir, "commands")),
    hooks: await fileExists(path.join(pluginDir, "hooks", "hooks.json")),
    mcpServers: [...mcpServers],
  };
}

/** `child` is `root` or inside it (lexically). */
export function isInside(child: string, root: string): boolean {
  const rel = path.relative(path.resolve(root), path.resolve(child));
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

/**
 * A marketplace's catalog from `<dir>/.claude-plugin/marketplace.json`, or null
 * when there is none. A plugin whose `source` is not a relative path string (or
 * points outside the marketplace) is listed with empty components and no `dir`.
 */
export async function readCatalog(marketplaceDir: string): Promise<Catalog | null> {
  const parsed = MarketplaceJsonSchema.safeParse(
    await readJson(path.join(marketplaceDir, ".claude-plugin", "marketplace.json")),
  );
  if (!parsed.success) return null;
  const { name, description, metadata, plugins } = parsed.data;
  const pluginRoot = path.resolve(marketplaceDir, metadata?.pluginRoot ?? ".");
  const out: CatalogPlugin[] = [];
  for (const entry of plugins) {
    const dir =
      typeof entry.source === "string" ? path.resolve(pluginRoot, entry.source) : undefined;
    if (!dir || !isInside(dir, marketplaceDir)) {
      out.push({
        name: entry.name,
        description: entry.description,
        version: entry.version,
        ...EMPTY,
      });
      continue;
    }
    const pluginJson = PluginJsonSchema.safeParse(
      await readJson(path.join(dir, ".claude-plugin", "plugin.json")),
    );
    const meta = pluginJson.success ? pluginJson.data : {};
    out.push({
      name: entry.name,
      description: entry.description ?? meta.description,
      version: entry.version ?? meta.version,
      dir,
      ...(await readPluginComponents(dir)),
    });
  }
  const desc = description ?? metadata?.description;
  return { name, ...(desc ? { description: desc } : {}), plugins: out };
}

export interface InstalledPlugin {
  installPath: string;
  version?: string;
}

/** User-scope installs keyed `"<plugin>@<marketplace>"` from `installed_plugins.json`. */
export async function readInstalledPlugins(
  pluginsDir: string,
): Promise<Map<string, InstalledPlugin>> {
  const parsed = InstalledPluginsSchema.safeParse(
    await readJson(path.join(pluginsDir, "installed_plugins.json")),
  );
  const out = new Map<string, InstalledPlugin>();
  if (!parsed.success) return out;
  for (const [key, installs] of Object.entries(parsed.data.plugins)) {
    const user = installs.find((i) => i.scope === "user");
    if (user) out.set(key, { installPath: user.installPath, version: user.version });
  }
  return out;
}

/** Split `"<plugin>@<marketplace>"` on its last `@`. */
export function splitPluginKey(key: string): { plugin: string; marketplace: string } {
  const at = key.lastIndexOf("@");
  return { plugin: key.slice(0, at), marketplace: key.slice(at + 1) };
}

/** installPaths of every user-scope plugin installed from one of `records`. */
export async function managedPluginDirs(
  records: readonly Marketplace[],
  pluginsDir: string,
): Promise<string[]> {
  if (records.length === 0) return [];
  const ids = new Set(records.map((r) => r.id));
  const installed = await readInstalledPlugins(pluginsDir);
  return [...installed]
    .filter(([key]) => ids.has(splitPluginKey(key).marketplace))
    .map(([, install]) => install.installPath);
}
