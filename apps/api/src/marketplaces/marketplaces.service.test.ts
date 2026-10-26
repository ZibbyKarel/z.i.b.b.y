import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { MarketplaceCli } from "./marketplace-cli";
import {
  InvalidMarketplaceSourceError,
  MarketplaceConflictError,
  UnsafeMarketplacePathError,
} from "./marketplaces.errors";
import { MarketplacesService } from "./marketplaces.service";
import { MarketplacesStore } from "./marketplaces.store";

interface Known {
  name: string;
  source: string;
  repo?: string;
  path?: string;
  installLocation: string;
}

/** A marketplace checkout: one root plugin `zibby` with one skill. */
async function makeMarketplace(dir: string, name: string): Promise<void> {
  await fs.mkdir(path.join(dir, ".claude-plugin"), { recursive: true });
  await fs.writeFile(
    path.join(dir, ".claude-plugin", "marketplace.json"),
    JSON.stringify({ name, plugins: [{ name: "zibby", source: "./", version: "0.1.1" }] }),
  );
  await fs.mkdir(path.join(dir, "skills", "standup-post"), { recursive: true });
  await fs.writeFile(
    path.join(dir, "skills", "standup-post", "SKILL.md"),
    "---\nname: standup-post\ndescription: Post the standup\n---\nbody",
  );
}

const exists = (p: string) =>
  fs.lstat(p).then(
    () => true,
    () => false,
  );

/**
 * Stands in for the `claude`/`git` CLIs: keeps a known-marketplace list and an
 * `installed_plugins.json` under the tmp plugins dir, and records every call.
 */
class FakeCli implements Pick<MarketplaceCli, "plugin" | "git"> {
  calls: string[][] = [];
  gitCalls: { args: string[]; cwd?: string }[] = [];
  known: Known[] = [];
  installed: Record<string, { scope: string; installPath: string; version: string }[]> = {};
  /** What `marketplace add <source>` registers (normal mode); dev adds register the path. */
  onAdd?: (source: string) => Promise<Known>;
  /** Was the installPath a symlink at the moment `uninstall` ran? */
  uninstallSawLink: boolean[] = [];

  constructor(
    private readonly pluginsDir: string,
    private readonly remoteName = "cloned-mkt",
  ) {}

  private async save(): Promise<void> {
    await fs.writeFile(
      path.join(this.pluginsDir, "installed_plugins.json"),
      JSON.stringify({ version: 2, plugins: this.installed }),
    );
  }

  async seedInstall(key: string, installPath: string): Promise<void> {
    await fs.mkdir(installPath, { recursive: true });
    await fs.writeFile(path.join(installPath, "copied.txt"), "cache copy");
    this.installed[key] = [{ scope: "user", installPath, version: "0.1.0" }];
    await this.save();
  }

  async plugin(args: string[]): Promise<string> {
    this.calls.push(args);
    const [cmd, sub, arg] = args;
    if (cmd === "marketplace" && sub === "list") return JSON.stringify(this.known);
    if (cmd === "marketplace" && sub === "add" && arg) {
      const entry = path.isAbsolute(arg)
        ? {
            name: JSON.parse(
              await fs.readFile(path.join(arg, ".claude-plugin", "marketplace.json"), "utf8"),
            ).name,
            source: "directory",
            path: arg,
            installLocation: arg,
          }
        : await this.onAdd!(arg);
      this.known.push(entry);
    }
    if (cmd === "marketplace" && sub === "remove") {
      this.known = this.known.filter((m) => m.name !== arg);
    }
    if (cmd === "install" && sub) {
      const [plugin, mkt] = sub.split("@") as [string, string];
      await this.seedInstall(sub, path.join(this.pluginsDir, "cache", mkt, plugin, "0.1.1"));
    }
    if (cmd === "uninstall" && sub) {
      const installPath = this.installed[sub]?.[0]?.installPath ?? "";
      this.uninstallSawLink.push((await fs.lstat(installPath)).isSymbolicLink());
      // The real CLI deletes the install dir — recursively.
      await fs.rm(installPath, { recursive: true, force: true });
      delete this.installed[sub];
      await this.save();
    }
    return "";
  }

  async git(args: string[], cwd?: string): Promise<string> {
    this.gitCalls.push({ args, cwd });
    if (args[0] === "clone") await makeMarketplace(args[3] ?? "", this.remoteName);
    return "";
  }
}

describe("MarketplacesService", () => {
  let root: string;
  let pluginsDir: string;
  let cloneDir: string;
  let checkout: string;
  let cli: FakeCli;
  let svc: MarketplacesService;

  beforeEach(async () => {
    root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), "marketplaces-svc-")));
    pluginsDir = path.join(root, "plugins");
    cloneDir = path.join(root, "clones");
    checkout = path.join(root, "checkout");
    await fs.mkdir(path.join(pluginsDir, "cache"), { recursive: true });
    await makeMarketplace(checkout, "zibby-skills");
    cli = new FakeCli(pluginsDir);
    const store = new MarketplacesStore(path.join(root, "marketplaces.json"));
    svc = new MarketplacesService(store, cli, pluginsDir, cloneDir);
  });
  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  const cliVerbs = () => cli.calls.map((c) => c.slice(0, 2).join(" "));

  it("normal add: registers through the CLI and finds the entry by repo", async () => {
    const location = path.join(root, "remote");
    await makeMarketplace(location, "remote-mkt");
    cli.onAdd = async () => ({
      name: "remote-mkt",
      source: "github",
      repo: "Owner/Repo",
      installLocation: location,
    });

    const detail = await svc.add({ source: "https://github.com/owner/repo.git", devMode: false });

    expect(cli.calls).toContainEqual([
      "marketplace",
      "add",
      "https://github.com/owner/repo.git",
      "--scope",
      "user",
    ]);
    expect(detail).toMatchObject({ id: "remote-mkt", devMode: false, managedClone: false });
    expect(detail.plugins).toMatchObject([
      { name: "zibby", installed: false, linked: false, skills: [{ name: "standup-post" }] },
    ]);
    expect((await svc.list())[0]).toMatchObject({ pluginCount: 1, installedCount: 0 });
    await expect(svc.add({ source: "owner/repo", devMode: false })).rejects.toBeInstanceOf(
      MarketplaceConflictError,
    );
  });

  it("dev add with a local path: uses it as-is and registers it", async () => {
    const detail = await svc.add({ source: checkout, devMode: true });
    expect(detail).toMatchObject({
      id: "zibby-skills",
      devMode: true,
      localPath: checkout,
      managedClone: false,
    });
    expect(cli.calls).toContainEqual(["marketplace", "add", checkout, "--scope", "user"]);
    expect(cli.gitCalls).toEqual([]);
  });

  it("dev add rejects a relative non-git source and a dir without marketplace.json", async () => {
    await expect(svc.add({ source: "owner/repo", devMode: true })).rejects.toBeInstanceOf(
      InvalidMarketplaceSourceError,
    );
    await expect(svc.add({ source: root, devMode: true })).rejects.toBeInstanceOf(
      InvalidMarketplaceSourceError,
    );
  });

  it("adopts a marketplace Claude already has and links its installed plugin", async () => {
    cli.known = [
      { name: "zibby-skills", source: "directory", path: checkout, installLocation: checkout },
    ];
    const installPath = path.join(pluginsDir, "cache", "zibby-skills", "zibby", "0.1.0");
    await cli.seedInstall("zibby@zibby-skills", installPath);

    const detail = await svc.add({ source: checkout, devMode: true });

    expect(cliVerbs()).not.toContain("marketplace add");
    expect((await fs.lstat(installPath)).isSymbolicLink()).toBe(true);
    expect(await fs.realpath(installPath)).toBe(checkout);
    expect(detail.plugins[0]).toMatchObject({
      installed: true,
      installedVersion: "0.1.0",
      linked: true,
    });
  });

  it("dev install symlinks the cache copy to the checkout", async () => {
    await svc.add({ source: checkout, devMode: true });
    const detail = await svc.install("zibby-skills", "zibby");

    expect(cli.calls).toContainEqual(["install", "zibby@zibby-skills", "--scope", "user"]);
    const installPath = path.join(pluginsDir, "cache", "zibby-skills", "zibby", "0.1.1");
    expect(await fs.realpath(installPath)).toBe(checkout);
    expect(detail.plugins[0]).toMatchObject({ installed: true, linked: true });
    expect(await svc.skills()).toEqual([
      {
        id: "zibby:standup-post",
        name: "zibby:standup-post",
        desc: "Post the standup",
        marketplace: "zibby-skills",
        plugin: "zibby",
      },
    ]);
  });

  it("refuses to replace an installPath outside the plugins cache", async () => {
    const outside = path.join(root, "elsewhere", "zibby");
    await cli.seedInstall("zibby@zibby-skills", outside);
    await expect(svc.add({ source: checkout, devMode: true })).rejects.toBeInstanceOf(
      UnsafeMarketplacePathError,
    );
    expect(await fs.readFile(path.join(outside, "copied.txt"), "utf8")).toBe("cache copy");
  });

  it("dev uninstall unlinks before the CLI deletes, so the checkout survives", async () => {
    await svc.add({ source: checkout, devMode: true });
    await svc.install("zibby-skills", "zibby");
    const detail = await svc.uninstall("zibby-skills", "zibby");

    expect(cli.uninstallSawLink).toEqual([false]);
    expect(await exists(path.join(checkout, "skills", "standup-post", "SKILL.md"))).toBe(true);
    expect(detail.plugins[0]).toMatchObject({ installed: false, linked: false });
  });

  it("remove never deletes the operator's own checkout", async () => {
    await svc.add({ source: checkout, devMode: true });
    await svc.install("zibby-skills", "zibby");
    await svc.remove("zibby-skills");

    expect(cli.uninstallSawLink).toEqual([false]);
    expect(cli.calls).toContainEqual(["marketplace", "remove", "zibby-skills"]);
    expect(await exists(path.join(checkout, ".claude-plugin", "marketplace.json"))).toBe(true);
    expect(await svc.list()).toEqual([]);
  });

  it("dev add from a git URL clones into the clone dir; remove deletes that clone", async () => {
    const detail = await svc.add({ source: "https://github.com/owner/cloned.git", devMode: true });
    const clone = path.join(cloneDir, "cloned");

    expect(cli.gitCalls[0]?.args).toEqual([
      "clone",
      "--",
      "https://github.com/owner/cloned.git",
      clone,
    ]);
    expect(detail).toMatchObject({ id: "cloned-mkt", localPath: clone, managedClone: true });

    await svc.remove("cloned-mkt");
    expect(await exists(clone)).toBe(false);
  });

  it("dev update pulls only a managed clone", async () => {
    await svc.add({ source: checkout, devMode: true });
    await svc.update("zibby-skills");
    expect(cli.gitCalls).toEqual([]);
    expect(cli.calls).toContainEqual(["marketplace", "update", "zibby-skills"]);

    await svc.add({ source: "https://github.com/owner/cloned.git", devMode: true });
    await svc.update("cloned-mkt");
    expect(cli.gitCalls.at(-1)).toEqual({
      args: ["pull", "--ff-only"],
      cwd: path.join(cloneDir, "cloned"),
    });
  });

  it("normal update refreshes the marketplace, then each installed plugin", async () => {
    cli.onAdd = async () => ({
      name: "zibby-skills",
      source: "github",
      repo: "owner/repo",
      installLocation: checkout,
    });
    await svc.add({ source: "owner/repo", devMode: false });
    await svc.install("zibby-skills", "zibby");
    await svc.update("zibby-skills");
    expect(cli.calls.slice(-3)).toEqual([
      ["marketplace", "update", "zibby-skills"],
      ["update", "zibby@zibby-skills", "--scope", "user"],
      ["marketplace", "list", "--json"],
    ]);
  });
});
