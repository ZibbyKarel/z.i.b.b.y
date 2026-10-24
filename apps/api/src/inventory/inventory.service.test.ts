import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { Skill } from "@zibby/contracts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ActivityLogService } from "../activity/activity-log.service";
import { SkillNotFoundError } from "../skills/skills.errors";
import type { SkillsStorageService } from "../skills/skills.storage.service";
import type { ClaudeLocations } from "./claude-locations";
import {
  InventoryService,
  InventorySkillConflictError,
  renderInstalledSkill,
} from "./inventory.service";

const SECRET_ENV = "SECRET";

async function writeJson(file: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(value), "utf8");
}
async function writeText(file: string, text: string): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, text, "utf8");
}

describe("InventoryService", () => {
  let tmp: string;
  let loc: ClaudeLocations;
  let library: Skill[];
  let record: ReturnType<typeof vi.fn>;
  let service: InventoryService;

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), "inventory-"));
    loc = {
      claudeDir: path.join(tmp, "claude"),
      userConfigFile: path.join(tmp, "claude", ".claude.json"),
      repoRoot: path.join(tmp, "repo"),
    };
    await fs.mkdir(loc.claudeDir, { recursive: true });
    await fs.mkdir(loc.repoRoot, { recursive: true });
    library = [];
    record = vi.fn().mockResolvedValue(undefined);
    const skills = {
      list: async () => library,
      get: async (id: string) => {
        const s = library.find((x) => x.id === id);
        if (!s) throw new SkillNotFoundError(id);
        return s;
      },
    } as unknown as SkillsStorageService;
    service = new InventoryService(loc, skills, { record } as unknown as ActivityLogService);
  });

  afterEach(async () => {
    await fs.rm(tmp, { recursive: true, force: true });
  });

  describe("MCP servers", () => {
    it("reports user/local/project servers with sanitised targets and no secrets", async () => {
      await writeJson(loc.userConfigFile, {
        mcpServers: {
          stdio1: {
            command: "/usr/local/bin/npx",
            args: ["--token=SECRET"],
            env: { API_KEY: SECRET_ENV },
          },
          web: {
            type: "http",
            url: "https://user:pw@mcp.example.com/v1?key=SECRET",
            headers: { Authorization: SECRET_ENV },
          },
        },
        projects: {
          [loc.repoRoot]: {
            mcpServers: { loc1: { type: "sse", url: "https://sse.example.com/x" } },
          },
          "/other": { mcpServers: { nope: { command: "x" } } },
        },
      });
      await writeJson(path.join(loc.repoRoot, ".mcp.json"), {
        mcpServers: { proj1: { type: "stdio", command: "node", args: ["a"] } },
      });

      const inv = await service.getInventory();
      expect(inv.mcp).toEqual(
        expect.arrayContaining([
          { name: "stdio1", scope: "user", transport: "stdio", target: "npx" },
          { name: "web", scope: "user", transport: "http", target: "https://mcp.example.com" },
          { name: "loc1", scope: "local", transport: "sse", target: "https://sse.example.com" },
          { name: "proj1", scope: "project", transport: "stdio", target: "node" },
        ]),
      );
      expect(inv.mcp).toHaveLength(4);
      const json = JSON.stringify(inv);
      expect(json).not.toContain("SECRET");
      expect(json).not.toContain("user:pw");
      expect(json).not.toContain("/v1");
    });

    it("marks an unparsable url as transport http with no target", async () => {
      await writeJson(loc.userConfigFile, {
        mcpServers: { bad: { type: "http", url: "not a url" } },
      });
      const inv = await service.getInventory();
      expect(inv.mcp).toEqual([{ name: "bad", scope: "user", transport: "http" }]);
    });
  });

  describe("plugins", () => {
    it("lists plugins with enabled flag, counts, plugin skills and plugin MCP servers", async () => {
      const pA = path.join(tmp, "plugA");
      const pB = path.join(tmp, "plugB");
      await writeText(
        path.join(pA, "skills", "a", "SKILL.md"),
        "---\nname: Alpha\ndescription: does a\n---\nbody",
      );
      await writeJson(path.join(pA, ".mcp.json"), {
        mcpServers: { pm: { command: "/bin/pm", env: { K: SECRET_ENV } } },
      });
      await writeJson(path.join(loc.claudeDir, "plugins", "installed_plugins.json"), {
        version: 2,
        plugins: {
          "plug-a@mk": [{ scope: "user", installPath: pA, version: "7.0.0" }],
          "plug-b@mk": [{ scope: "project", installPath: pB }],
          "gone@mk": [{ scope: "user", installPath: path.join(tmp, "missing") }],
        },
      });
      await writeJson(path.join(loc.claudeDir, "settings.json"), {
        enabledPlugins: { "plug-a@mk": true, "plug-b@mk": false },
      });

      const inv = await service.getInventory();
      expect(inv.plugins).toEqual(
        expect.arrayContaining([
          {
            id: "plug-a@mk",
            version: "7.0.0",
            scope: "user",
            enabled: true,
            skillCount: 1,
            mcpCount: 1,
          },
          { id: "plug-b@mk", scope: "project", enabled: false, skillCount: 0, mcpCount: 0 },
          { id: "gone@mk", scope: "user", enabled: false, skillCount: 0, mcpCount: 0 },
        ]),
      );
      expect(inv.skills).toEqual([
        {
          id: "a",
          name: "Alpha",
          description: "does a",
          source: "plugin",
          plugin: "plug-a@mk",
          zibbyManaged: false,
        },
      ]);
      expect(inv.mcp).toEqual([
        { name: "pm", scope: "plugin", transport: "stdio", target: "pm", plugin: "plug-a@mk" },
      ]);
      expect(JSON.stringify(inv)).not.toContain("SECRET");
    });
  });

  describe("user skills", () => {
    it("reads frontmatter, follows symlinks, flags zibby-managed, caps description", async () => {
      const skills = path.join(loc.claudeDir, "skills");
      await writeText(
        path.join(skills, "plain", "SKILL.md"),
        `---\nname: Plain One\ndescription: ${"x".repeat(400)}\n---\nbody`,
      );
      await writeText(path.join(skills, "noname", "SKILL.md"), "just body");
      await writeText(
        path.join(skills, "managed", "SKILL.md"),
        "---\nname: M\nmanaged-by: zibby\n---\nb",
      );
      const ext = path.join(tmp, "external-skill");
      await writeText(path.join(ext, "SKILL.md"), "---\nname: Linked\n---\nb");
      await fs.symlink(ext, path.join(skills, "linked"), "dir");
      await fs.mkdir(path.join(skills, "empty-dir"), { recursive: true });

      const inv = await service.getInventory();
      const byId = Object.fromEntries(inv.skills.map((s) => [s.id, s]));
      expect(Object.keys(byId).sort()).toEqual(["linked", "managed", "noname", "plain"]);
      expect(byId.plain?.name).toBe("Plain One");
      expect(byId.plain?.description).toHaveLength(300);
      expect(byId.plain?.source).toBe("user");
      expect(byId.noname?.name).toBe("noname");
      expect(byId.linked?.name).toBe("Linked");
      expect(byId.managed?.zibbyManaged).toBe(true);
      expect(byId.plain?.zibbyManaged).toBe(false);
    });
  });

  describe("catalog", () => {
    it("reports all four statuses", async () => {
      library = [
        { id: "fresh", name: "Fresh", instructions: "do fresh" },
        { id: "same", name: "Same", desc: "d", instructions: "do same" },
        { id: "old", name: "Old", instructions: "new body" },
        { id: "mine", name: "Mine", instructions: "zibby version" },
      ];
      const skills = path.join(loc.claudeDir, "skills");
      await writeText(
        path.join(skills, "same", "SKILL.md"),
        renderInstalledSkill(library[1] as Skill),
      );
      await writeText(
        path.join(skills, "old", "SKILL.md"),
        "---\nname: Old\nmanaged-by: zibby\n---\n\nstale body",
      );
      await writeText(path.join(skills, "mine", "SKILL.md"), "---\nname: Mine\n---\nhand written");

      const inv = await service.getInventory();
      const status = Object.fromEntries(inv.catalog.map((e) => [e.skillId, e.status]));
      expect(status).toEqual({
        fresh: "not-installed",
        same: "installed",
        old: "outdated",
        mine: "conflict",
      });
      expect(inv.catalog.find((e) => e.skillId === "same")?.desc).toBe("d");
    });
  });

  describe("installSkill", () => {
    const skill: Skill = { id: "demo", name: "Demo", desc: "A demo", instructions: "Do the demo." };
    const file = () => path.join(loc.claudeDir, "skills", "demo", "SKILL.md");

    it("writes the exact content, records activity, and re-installs over managed content", async () => {
      library = [skill];
      expect(await service.installSkill("demo")).toEqual({ skillId: "demo", status: "installed" });
      expect(await fs.readFile(file(), "utf8")).toBe(renderInstalledSkill(skill));
      expect(renderInstalledSkill(skill)).toBe(
        '---\nname: "Demo"\ndescription: "A demo"\nmanaged-by: zibby\n---\n\nDo the demo.\n',
      );
      expect(record).toHaveBeenCalledWith(
        expect.objectContaining({ kind: "skill-installed", refs: { itemId: "demo" } }),
      );
      library = [{ ...skill, instructions: "Updated." }];
      await service.installSkill("demo");
      expect(await fs.readFile(file(), "utf8")).toContain("Updated.");
      const left = await fs.readdir(path.dirname(file()));
      expect(left).toEqual(["SKILL.md"]);
    });

    it("refuses to overwrite a non-managed skill", async () => {
      library = [skill];
      await writeText(file(), "---\nname: Mine\n---\nhand written");
      await expect(service.installSkill("demo")).rejects.toBeInstanceOf(
        InventorySkillConflictError,
      );
      expect(await fs.readFile(file(), "utf8")).toBe("---\nname: Mine\n---\nhand written");
      expect(record).not.toHaveBeenCalled();
    });

    it("rejects an invalid id without writing anything", async () => {
      await expect(service.installSkill("../evil")).rejects.toThrow();
      await expect(fs.readdir(path.join(loc.claudeDir, "skills"))).rejects.toThrow();
      expect(record).not.toHaveBeenCalled();
    });

    it("throws not-found for an unknown library skill", async () => {
      await expect(service.installSkill("ghost")).rejects.toBeInstanceOf(SkillNotFoundError);
    });
  });

  describe("fail-soft", () => {
    it("returns empty sections for corrupt JSON and missing files", async () => {
      await writeText(loc.userConfigFile, "{not json");
      await writeText(path.join(loc.repoRoot, ".mcp.json"), "[[");
      await writeText(path.join(loc.claudeDir, "plugins", "installed_plugins.json"), "garbage");
      await writeText(path.join(loc.claudeDir, "settings.json"), "garbage");
      const inv = await service.getInventory();
      expect(inv).toEqual({ mcp: [], skills: [], plugins: [], catalog: [] });
    });

    it("returns empty sections when nothing exists at all", async () => {
      await fs.rm(loc.claudeDir, { recursive: true, force: true });
      await fs.rm(loc.repoRoot, { recursive: true, force: true });
      expect(await service.getInventory()).toEqual({
        mcp: [],
        skills: [],
        plugins: [],
        catalog: [],
      });
    });
  });
});
