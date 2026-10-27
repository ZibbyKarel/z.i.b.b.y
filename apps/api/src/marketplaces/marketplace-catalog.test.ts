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
  });

  it("managedPluginDirs: only existing, enabled, hook-free plugins of managed marketplaces", async () => {
    const plugins = path.join(dir, "plugins");
    const at = (name: string) => path.join(plugins, "cache", "mkt", name, "1");
    const install = (p: string) => [{ scope: "user", installPath: p, version: "1" }];
    for (const name of ["ok", "off", "hooked", "inline-hooks"]) {
      await fs.mkdir(at(name), { recursive: true });
    }
    await write(path.join(at("hooked"), "hooks/hooks.json"), {});
    await write(path.join(at("inline-hooks"), ".claude-plugin/plugin.json"), { hooks: {} });
    await write(path.join(dir, "settings.json"), {
      enabledPlugins: { "off@mkt": false, "ok@mkt": true },
    });
    await write(path.join(plugins, "installed_plugins.json"), {
      version: 2,
      plugins: {
        "ok@mkt": install(at("ok")),
        "off@mkt": install(at("off")),
        "hooked@mkt": install(at("hooked")),
        "inline-hooks@mkt": install(at("inline-hooks")),
        "gone@mkt": install(at("gone")),
        "other@elsewhere": install(at("ok")),
      },
    });
    const record = {
      id: "mkt",
      source: "s",
      devMode: false,
      managedClone: false,
      addedAt: "2026-10-26T10:00:00.000Z",
    };
    expect(await managedPluginDirs([record], plugins)).toEqual([at("ok")]);
    expect(await managedPluginDirs([], plugins)).toEqual([]);

    // An unreadable settings.json fails open: nothing counts as disabled.
    await write(path.join(dir, "settings.json"), "{ nope");
    expect(await managedPluginDirs([record], plugins)).toEqual([at("ok"), at("off")]);
  });

  it("managedPluginDirs: pulls in declared dependencies, admitting SessionStart-only hooks", async () => {
    const plugins = path.join(dir, "plugins");
    const at = (mkt: string, name: string) => path.join(plugins, "cache", mkt, name, "1");
    const install = (p: string) => [{ scope: "user", installPath: p, version: "1" }];
    for (const [mkt, name] of [
      ["mkt", "main"],
      ["mkt", "starter"],
      ["official", "superpowers"],
      ["official", "base"],
      ["official", "gate-hook"],
    ] as const) {
      await fs.mkdir(at(mkt, name), { recursive: true });
    }
    await write(path.join(at("mkt", "main"), ".claude-plugin/plugin.json"), {
      dependencies: ["superpowers@official", "gate-hook", "missing@nowhere"],
    });
    // A managed plugin whose own hooks are SessionStart-only now rides too.
    await write(path.join(at("mkt", "starter"), "hooks/hooks.json"), {
      hooks: { SessionStart: [] },
    });
    await write(path.join(at("official", "superpowers"), "hooks/hooks.json"), {
      hooks: { SessionStart: [] },
    });
    await write(path.join(at("official", "superpowers"), ".claude-plugin/plugin.json"), {
      dependencies: ["base@official"],
    });
    await write(path.join(at("official", "gate-hook"), "hooks/hooks.json"), {
      hooks: { SessionStart: [], PreToolUse: [] },
    });
    await write(path.join(plugins, "installed_plugins.json"), {
      version: 2,
      plugins: {
        "main@mkt": install(at("mkt", "main")),
        "starter@mkt": install(at("mkt", "starter")),
        "superpowers@official": install(at("official", "superpowers")),
        "base@official": install(at("official", "base")),
        "gate-hook@official": install(at("official", "gate-hook")),
      },
    });
    const record = {
      id: "mkt",
      source: "s",
      devMode: false,
      managedClone: false,
      addedAt: "2026-10-26T10:00:00.000Z",
    };
    expect(await managedPluginDirs([record], plugins)).toEqual([
      at("mkt", "main"),
      at("mkt", "starter"),
      at("official", "superpowers"),
      at("official", "base"),
    ]);
  });

  it("drops a plugin dir that escapes through a symlink and argv-unsafe names", async () => {
    const outside = path.join(dir, "outside");
    const mkt = path.join(dir, "mkt");
    await write(path.join(outside, "skills/x/SKILL.md"), "---\nname: x\n---\n");
    await fs.mkdir(path.join(mkt, "plugins"), { recursive: true });
    await fs.symlink(outside, path.join(mkt, "plugins", "evil"), "dir");
    await write(path.join(mkt, ".claude-plugin/marketplace.json"), {
      name: "mkt",
      plugins: [
        { name: "evil", source: "./plugins/evil" },
        { name: "-rf", source: "./" },
        { name: "../up", source: "./" },
      ],
    });
    const catalog = await readCatalog(mkt);
    expect(catalog?.plugins.map((p) => p.name)).toEqual(["evil"]);
    expect(catalog?.plugins[0]).toMatchObject({ skills: [] });
    expect(catalog?.plugins[0]?.dir).toBeUndefined();

    await write(path.join(mkt, ".claude-plugin/marketplace.json"), {
      name: "--evil",
      plugins: [],
    });
    expect(await readCatalog(mkt)).toBeNull();
  });

  it("reads a missing or corrupt installed_plugins.json as nothing installed", async () => {
    expect((await readInstalledPlugins(dir)).size).toBe(0);
    await write(path.join(dir, "installed_plugins.json"), "{ nope");
    expect((await readInstalledPlugins(dir)).size).toBe(0);
  });
});
