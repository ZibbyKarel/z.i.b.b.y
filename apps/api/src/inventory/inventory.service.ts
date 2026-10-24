import { type Stats, promises as fs } from "node:fs";
import * as path from "node:path";
import { Inject, Injectable } from "@nestjs/common";
import {
  AGENT_ID_REGEX,
  type InstallSkillResult,
  type InventoryCatalogEntry,
  type InventoryCatalogStatus,
  type InventoryMcpServer,
  type InventoryPlugin,
  type InventorySkill,
  type MachineInventory,
  type Skill,
} from "@zibby/contracts";
import matter from "gray-matter";
import { ActivityLogService } from "../activity/activity-log.service";
import { InvalidSkillIdError } from "../skills/skills.errors";
import { SkillsStorageService } from "../skills/skills.storage.service";
import { ensureDir, safeJson, writeFileAtomic } from "../shared/file-storage/file-utils";
import { CLAUDE_LOCATIONS, type ClaudeLocations } from "./claude-locations";

const DESCRIPTION_MAX = 300;

/** The library skill would be written over a skill ZIBBY did not install. */
export class InventorySkillConflictError extends Error {
  constructor(public readonly skillId: string) {
    super(`A skill named "${skillId}" already exists on this machine and is not managed by ZIBBY`);
    this.name = "InventorySkillConflictError";
  }
}

type Json = Record<string, unknown>;

function isRecord(value: unknown): value is Json {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function readJson(file: string): Promise<unknown> {
  try {
    return safeJson(await fs.readFile(file, "utf8"));
  } catch {
    return null;
  }
}

/**
 * The SKILL.md ZIBBY writes for a library skill. Values are JSON-quoted (valid
 * YAML double-quoted scalars) so a colon or newline in a name can't break the
 * frontmatter. Also what "installed" is compared against.
 */
export function renderInstalledSkill(skill: Skill): string {
  // Claude Code skill names are lowercase letters/digits/hyphens — the id, not the display name.
  const description = skill.desc ?? skill.name ?? skill.id;
  return [
    "---",
    `name: ${JSON.stringify(skill.id)}`,
    `description: ${JSON.stringify(description)}`,
    "managed-by: zibby",
    "---",
    "",
    skill.instructions,
    "",
  ].join("\n");
}

function parseFrontmatter(raw: string): Json {
  try {
    const data: unknown = matter(raw).data;
    return isRecord(data) ? data : {};
  } catch {
    return {};
  }
}

function isManaged(raw: string): boolean {
  return parseFrontmatter(raw)["managed-by"] === "zibby";
}

/**
 * Turn an `mcpServers` object into inventory rows. Reads ONLY `type`, `command`
 * and `url`: `args`, `env` and `headers` carry secrets and are never touched.
 */
function mcpRows(
  servers: unknown,
  scope: InventoryMcpServer["scope"],
  plugin?: string,
): InventoryMcpServer[] {
  if (!isRecord(servers)) return [];
  const rows: InventoryMcpServer[] = [];
  for (const [name, cfg] of Object.entries(servers)) {
    if (!isRecord(cfg)) continue;
    const type = cfg.type;
    const command = typeof cfg.command === "string" ? cfg.command : undefined;
    const url = typeof cfg.url === "string" ? cfg.url : undefined;
    let transport: InventoryMcpServer["transport"] = "unknown";
    if (type === "http" || type === "sse" || type === "stdio") transport = type;
    else if (type === undefined && command) transport = "stdio";
    let target: string | undefined;
    if (transport === "stdio" && command) {
      // `command` may hold a whole command line: take only the first token, so
      // arguments (which can carry secrets) never reach the response.
      const first = command.trim().split(/\s+/)[0] ?? "";
      const base = first.split(/[\\/]/).pop() ?? "";
      target = base && !base.includes("=") ? base : undefined;
    } else if ((transport === "http" || transport === "sse") && url) {
      try {
        const origin = new URL(url).origin;
        target = origin === "null" ? undefined : origin;
      } catch {
        target = undefined;
      }
    }
    rows.push({
      name,
      scope,
      transport,
      ...(target ? { target } : {}),
      ...(plugin ? { plugin } : {}),
    });
  }
  return rows;
}

async function scanSkillDirs(
  dir: string,
  source: InventorySkill["source"],
  plugin?: string,
): Promise<InventorySkill[]> {
  let entries: string[];
  try {
    entries = (await fs.readdir(dir)).sort();
  } catch {
    return [];
  }
  const out: InventorySkill[] = [];
  for (const entry of entries) {
    try {
      // stat (not lstat): a symlinked skill dir is followed.
      if (!(await fs.stat(path.join(dir, entry))).isDirectory()) continue;
      const raw = await fs.readFile(path.join(dir, entry, "SKILL.md"), "utf8");
      const fm = parseFrontmatter(raw);
      const name = typeof fm.name === "string" && fm.name.trim() ? fm.name.trim() : entry;
      const description = typeof fm.description === "string" ? fm.description : undefined;
      out.push({
        id: entry,
        name,
        ...(description ? { description: description.slice(0, DESCRIPTION_MAX) } : {}),
        source,
        ...(plugin ? { plugin } : {}),
        zibbyManaged: fm["managed-by"] === "zibby",
      });
    } catch {
      // No SKILL.md / unreadable — not a skill; keep scanning the rest.
    }
  }
  return out;
}

/** A plugin's `.mcp.json` is either `{ mcpServers: {…} }` or the bare server map. */
async function pluginMcp(installPath: string): Promise<unknown> {
  const json = await readJson(path.join(installPath, ".mcp.json"));
  if (!isRecord(json)) return {};
  return isRecord(json.mcpServers) ? json.mcpServers : json;
}

/**
 * Read-only scan of the operator's Claude Code installation (MCP servers,
 * skills, plugins) plus install of ZIBBY library skills into
 * `<claudeDir>/skills/<id>/`. Every reader is fail-soft: a missing or broken
 * source yields an empty list for that source, never an error.
 */
@Injectable()
export class InventoryService {
  constructor(
    @Inject(CLAUDE_LOCATIONS) private readonly loc: ClaudeLocations,
    private readonly skills: SkillsStorageService,
    private readonly activity: ActivityLogService,
  ) {}

  async getInventory(): Promise<MachineInventory> {
    const [userConfig, projectMcp, plugins, userSkills, catalog] = await Promise.all([
      readJson(this.loc.userConfigFile),
      readJson(path.join(this.loc.repoRoot, ".mcp.json")),
      this.scanPlugins(),
      scanSkillDirs(path.join(this.loc.claudeDir, "skills"), "user"),
      this.catalog().catch((): InventoryCatalogEntry[] => []),
    ]);
    const cfg = isRecord(userConfig) ? userConfig : {};
    const projects = isRecord(cfg.projects) ? cfg.projects : {};
    const local = projects[this.loc.repoRoot];
    const mcp = [
      ...mcpRows(cfg.mcpServers, "user"),
      ...mcpRows(isRecord(local) ? local.mcpServers : undefined, "local"),
      ...mcpRows(isRecord(projectMcp) ? projectMcp.mcpServers : undefined, "project"),
      ...plugins.flatMap((p) => p.mcp),
    ];
    return {
      mcp,
      skills: [...userSkills, ...plugins.flatMap((p) => p.skills)],
      plugins: plugins.map((p) => p.plugin),
      catalog,
    };
  }

  async installSkill(skillId: string): Promise<InstallSkillResult> {
    if (!AGENT_ID_REGEX.test(skillId)) throw new InvalidSkillIdError(skillId);
    const skill = await this.skills.get(skillId);
    const skillsRoot = path.resolve(this.loc.claudeDir, "skills");
    const dir = path.resolve(skillsRoot, skill.id);
    if (path.dirname(dir) !== skillsRoot) throw new InvalidSkillIdError(skillId);
    const file = path.join(dir, "SKILL.md");

    // lstat, never stat: a symlinked skill dir / SKILL.md (dangling or not) is not
    // ours — refuse rather than write through it.
    const dirStat = await this.lstatOrNull(dir);
    if (dirStat && (dirStat.isSymbolicLink() || !dirStat.isDirectory())) {
      throw new InventorySkillConflictError(skill.id);
    }
    const fileStat = await this.lstatOrNull(file);
    if (fileStat?.isSymbolicLink()) throw new InventorySkillConflictError(skill.id);
    const existing = await this.readSkillFile(dir);
    if (existing !== null && !isManaged(existing)) {
      throw new InventorySkillConflictError(skill.id);
    }
    if (existing === null && dirStat) {
      // A directory with no (readable) SKILL.md is not ours either.
      throw new InventorySkillConflictError(skill.id);
    }
    await ensureDir(dir);
    await writeFileAtomic(file, renderInstalledSkill(skill));
    await this.activity.record({
      kind: "skill-installed",
      summary: `Installed ZIBBY skill "${skill.id}" into Claude Code`,
      refs: { itemId: skill.id },
    });
    return { skillId: skill.id, status: "installed" };
  }

  private async lstatOrNull(target: string): Promise<Stats | null> {
    try {
      return await fs.lstat(target);
    } catch {
      return null;
    }
  }

  private async readSkillFile(dir: string): Promise<string | null> {
    try {
      return await fs.readFile(path.join(dir, "SKILL.md"), "utf8");
    } catch {
      return null;
    }
  }

  private async catalog(): Promise<InventoryCatalogEntry[]> {
    const library = await this.skills.list();
    const entries: InventoryCatalogEntry[] = [];
    for (const skill of library) {
      const dir = path.join(this.loc.claudeDir, "skills", skill.id);
      const raw = await this.readSkillFile(dir);
      let status: InventoryCatalogStatus;
      if (raw === null) {
        status = (await this.lstatOrNull(dir)) ? "conflict" : "not-installed";
      } else if (!isManaged(raw) || (await this.lstatOrNull(dir))?.isSymbolicLink()) {
        status = "conflict";
      } else {
        status = raw === renderInstalledSkill(skill) ? "installed" : "outdated";
      }
      entries.push({
        skillId: skill.id,
        name: skill.name ?? skill.id,
        ...(skill.desc ? { desc: skill.desc } : {}),
        status,
      });
    }
    return entries;
  }

  private async scanPlugins(): Promise<
    { plugin: InventoryPlugin; skills: InventorySkill[]; mcp: InventoryMcpServer[] }[]
  > {
    const installed = await readJson(
      path.join(this.loc.claudeDir, "plugins", "installed_plugins.json"),
    );
    const settings = await readJson(path.join(this.loc.claudeDir, "settings.json"));
    const plugins = isRecord(installed) && isRecord(installed.plugins) ? installed.plugins : {};
    const enabledMap =
      isRecord(settings) && isRecord(settings.enabledPlugins) ? settings.enabledPlugins : {};
    const result: Awaited<ReturnType<InventoryService["scanPlugins"]>> = [];
    for (const [id, installs] of Object.entries(plugins)) {
      const first: unknown = Array.isArray(installs) ? installs[0] : undefined;
      const install = isRecord(first) ? first : {};
      const installPath = typeof install.installPath === "string" ? install.installPath : undefined;
      let skills: InventorySkill[] = [];
      let mcp: InventoryMcpServer[] = [];
      if (installPath) {
        try {
          skills = await scanSkillDirs(path.join(installPath, "skills"), "plugin", id);
          mcp = mcpRows(await pluginMcp(installPath), "plugin", id);
        } catch {
          // One broken plugin must not hide the others.
        }
      }
      result.push({
        plugin: {
          id,
          ...(typeof install.version === "string" ? { version: install.version } : {}),
          ...(typeof install.scope === "string" ? { scope: install.scope } : {}),
          enabled: enabledMap[id] === true,
          skillCount: skills.length,
          mcpCount: mcp.length,
        },
        skills,
        mcp,
      });
    }
    return result;
  }
}
