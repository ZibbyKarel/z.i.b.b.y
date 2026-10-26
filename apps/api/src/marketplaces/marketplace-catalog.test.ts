import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { managedPluginDirs, readCatalog, readInstalledPlugins } from "./marketplace-catalog";

async function write(file: string, content: string | object): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, typeof content === "string" ? content : JSON.stringify(content));
}

describe("marketplace catalog", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "marketplace-catalog-"));
  });
  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("returns null without a marketplace.json", async () => {
    expect(await readCatalog(dir)).toBeNull();
  });

  it("reads plugins and their component inventory", async () => {
    await write(path.join(dir, ".claude-plugin/marketplace.json"), {
      name: "mkt",
      metadata: { description: "My marketplace" },
      plugins: [
        { name: "zibby", source: "./" },
        { name: "tools", source: "./plugins/tools", description: "Tools", version: "2.0.0" },
        { name: "remote", source: { source: "github", repo: "a/b" } },
        { name: "escape", source: "../outside" },
      ],
    });
    await write(path.join(dir, ".claude-plugin/plugin.json"), {
      version: "0.1.1",
      description: "Root plugin",
      mcpServers: { inline: { command: "x" } },
    });
    await write(
      path.join(dir, "skills/standup-post/SKILL.md"),
      "---\nname: standup-post\ndescription: Post the standup\n---\nbody",
    );
    await write(path.join(dir, "skills/no-front/SKILL.md"), "just body");
    await write(path.join(dir, "skills/not-a-skill/README.md"), "x");
    await write(path.join(dir, "agents/reviewer.md"), "---\ndescription: Reviews\n---\n");
    await write(path.join(dir, "commands/ship.md"), "---\ndescription: Ships\n---\n");
    await write(path.join(dir, ".mcp.json"), { mcpServers: { db: {}, inline: {} } });
    await write(path.join(dir, "plugins/tools/hooks/hooks.json"), {});
    await write(path.join(dir, "plugins/tools/.mcp.json"), { flat: {} });

    const catalog = await readCatalog(dir);
    expect(catalog?.name).toBe("mkt");
    expect(catalog?.description).toBe("My marketplace");
    const [zibby, tools, remote, escape] = catalog?.plugins ?? [];
    expect(zibby).toMatchObject({
      name: "zibby",
      description: "Root plugin",
      version: "0.1.1",
      dir: path.resolve(dir),
      skills: [{ name: "no-front" }, { name: "standup-post", description: "Post the standup" }],
      agents: [{ name: "reviewer", description: "Reviews" }],
      commands: [{ name: "ship", description: "Ships" }],
      hooks: false,
    });
    expect(zibby?.mcpServers.sort()).toEqual(["db", "inline"]);
    expect(tools).toMatchObject({ version: "2.0.0", hooks: true, mcpServers: ["flat"] });
    for (const plugin of [remote, escape]) {
      expect(plugin).toMatchObject({ skills: [], hooks: false, mcpServers: [] });
      expect(plugin?.dir).toBeUndefined();
    }
  });

  it("reads only user-scope installs and filters them to managed marketplaces", async () => {
    await write(path.join(dir, "installed_plugins.json"), {
      version: 2,
      plugins: {
        "zibby@zibby-skills": [
          { scope: "project", installPath: "/p", version: "0" },
          { scope: "user", installPath: "/u", version: "0.1.0" },
        ],
        "proj@zibby-skills": [{ scope: "project", installPath: "/x" }],
        "other@elsewhere": [{ scope: "user", installPath: "/o" }],
      },
    });
    const installed = await readInstalledPlugins(dir);
    expect([...installed.keys()]).toEqual(["zibby@zibby-skills", "other@elsewhere"]);
    expect(installed.get("zibby@zibby-skills")).toEqual({ installPath: "/u", version: "0.1.0" });

    const record = {
      id: "zibby-skills",
      source: "s",
      devMode: false,
      managedClone: false,
      addedAt: "2026-10-26T10:00:00.000Z",
    };
    expect(await managedPluginDirs([record], dir)).toEqual(["/u"]);
    expect(await managedPluginDirs([], dir)).toEqual([]);
  });

  it("reads a missing or corrupt installed_plugins.json as nothing installed", async () => {
    expect((await readInstalledPlugins(dir)).size).toBe(0);
    await write(path.join(dir, "installed_plugins.json"), "{ nope");
    expect((await readInstalledPlugins(dir)).size).toBe(0);
  });
});
