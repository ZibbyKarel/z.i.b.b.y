import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { Inject, Injectable } from "@nestjs/common";
import type {
  AddMarketplaceInput,
  Marketplace,
  MarketplaceDetail,
  MarketplaceSkill,
  MarketplaceSummary,
} from "@zibby/contracts";
import { z } from "zod";
import { safeJson, withPathLock } from "../shared/file-storage";
import { isValidGitRemote } from "../shared/git-exec";
import {
  type Catalog,
  isInside,
  readCatalog,
  readInstalledPlugins,
  readPluginComponents,
  splitPluginKey,
} from "./marketplace-catalog";
import { MarketplaceCli } from "./marketplace-cli";
import {
  InvalidMarketplaceSourceError,
  MarketplaceCliError,
  MarketplaceConflictError,
  MarketplaceNotFoundError,
  MarketplacePluginNotFoundError,
  UnsafeMarketplacePathError,
} from "./marketplaces.errors";
import { MarketplacesStore } from "./marketplaces.store";

export const CLAUDE_PLUGINS_DIR = "CLAUDE_PLUGINS_DIR";
export const MARKETPLACES_CLONE_DIR = "MARKETPLACES_CLONE_DIR";

export function resolveMarketplacesCloneDir(): string {
  return process.env.MARKETPLACES_CLONE_DIR ?? path.join(os.homedir(), ".zibby", "marketplaces");
}

/** One entry of `claude plugin marketplace list --json`. */
const KnownMarketplacesSchema = z.array(
  z.object({
    name: z.string(),
    repo: z.string().optional(),
    url: z.string().optional(),
    path: z.string().optional(),
    installLocation: z.string().optional(),
  }),
);
type KnownMarketplace = z.infer<typeof KnownMarketplacesSchema>[number];

/** Serializes every mutation: concurrent `claude plugin` children race on installed_plugins.json. */
const LOCK = "marketplaces";

const expandHome = (p: string) =>
  p === "~" || p.startsWith("~/") ? path.join(os.homedir(), p.slice(1)) : p;

/** Comparable form of a marketplace source (`owner/repo`, a GitHub URL, a path). */
function normalizeSource(source: string): string {
  const expanded = expandHome(source.trim());
  if (path.isAbsolute(expanded)) return path.resolve(expanded);
  return expanded
    .replace(/^https?:\/\/github\.com\//i, "")
    .replace(/^git@github\.com:/i, "")
    .replace(/\/+$/, "")
    .replace(/\.git$/, "")
    .toLowerCase();
}

const matchesSource = (m: KnownMarketplace, source: string) =>
  [m.repo, m.url, m.path].some(
    (s) => s !== undefined && normalizeSource(s) === normalizeSource(source),
  );

/**
 * Connects Claude Code plugin marketplaces to ZIBBY and installs their plugins at
 * user scope through the `claude plugin` CLI (see docs/plans/2026-10-26-marketplaces.md).
 * The record (`MarketplacesStore`) says which marketplaces ZIBBY manages; catalogs
 * and install state are read from disk. Dev mode symlinks each installed plugin's
 * cache dir to its source dir in a git checkout — every removal is guarded to the
 * plugins `cache/` (links) or the clone root (managed clones).
 */
@Injectable()
export class MarketplacesService {
  constructor(
    private readonly store: MarketplacesStore,
    private readonly cli: MarketplaceCli,
    @Inject(CLAUDE_PLUGINS_DIR) private readonly pluginsDir: string,
    @Inject(MARKETPLACES_CLONE_DIR) private readonly cloneDir: string,
  ) {}

  async list(): Promise<MarketplaceSummary[]> {
    const records = await this.store.list();
    const known = records.some((r) => !r.devMode) ? await this.known() : [];
    const installed = await readInstalledPlugins(this.pluginsDir);
    return Promise.all(
      records.map(async (record) => {
        const catalog = await this.catalogFor(record, known);
        const plugins = catalog?.plugins ?? [];
        return {
          ...record,
          pluginCount: plugins.length,
          installedCount: plugins.filter((p) => installed.has(`${p.name}@${record.id}`)).length,
        };
      }),
    );
  }

  async get(id: string): Promise<MarketplaceDetail> {
    return this.detail(await this.need(id));
  }

  add(input: AddMarketplaceInput): Promise<MarketplaceDetail> {
    return withPathLock(LOCK, async () => {
      const source = input.source.trim();
      if (source.startsWith("-"))
        throw new InvalidMarketplaceSourceError(`Invalid source "${source}"`);
      const record = input.devMode ? await this.addDev(source) : await this.addNormal(source);
      await this.store.add(record);
      if (record.devMode) await this.ensureLinks(record);
      return this.detail(record);
    });
  }

  remove(id: string): Promise<{ id: string }> {
    return withPathLock(LOCK, async () => {
      const record = await this.need(id);
      for (const [plugin, install] of await this.installedOf(record)) {
        if (record.devMode) await this.unlink(install.installPath);
        await this.cli.plugin(["uninstall", `${plugin}@${id}`, "--scope", "user"]);
      }
      await this.cli.plugin(["marketplace", "remove", id]);
      await this.store.remove(id);
      if (record.managedClone && record.localPath) {
        // Only a clone ZIBBY made, and only inside its clone root — never the operator's checkout.
        if (
          !isInside(record.localPath, this.cloneDir) ||
          path.resolve(record.localPath) === path.resolve(this.cloneDir)
        ) {
          throw new UnsafeMarketplacePathError(record.localPath, this.cloneDir);
        }
        await fs.rm(record.localPath, { recursive: true, force: true });
      }
      return { id };
    });
  }

  update(id: string): Promise<MarketplaceDetail> {
    return withPathLock(LOCK, async () => {
      const record = await this.need(id);
      if (record.devMode) {
        if (record.managedClone && record.localPath) {
          await this.cli.git(["pull", "--ff-only"], record.localPath);
        }
        await this.cli.plugin(["marketplace", "update", id]);
        await this.ensureLinks(record);
      } else {
        await this.cli.plugin(["marketplace", "update", id]);
        for (const [plugin] of await this.installedOf(record)) {
          await this.cli.plugin(["update", `${plugin}@${id}`, "--scope", "user"]);
        }
      }
      return this.detail(record);
    });
  }

  installAll(id: string): Promise<MarketplaceDetail> {
    return withPathLock(LOCK, async () => {
      const record = await this.need(id);
      const installed = await this.installedOf(record);
      for (const plugin of (await this.catalogFor(record))?.plugins ?? []) {
        if (!installed.has(plugin.name)) await this.installOne(record, plugin.name);
      }
      if (record.devMode) await this.ensureLinks(record);
      return this.detail(record);
    });
  }

  install(id: string, plugin: string): Promise<MarketplaceDetail> {
    return withPathLock(LOCK, async () => {
      const record = await this.need(id);
      const catalog = await this.catalogFor(record);
      if (!catalog?.plugins.some((p) => p.name === plugin)) {
        throw new MarketplacePluginNotFoundError(id, plugin);
      }
      await this.installOne(record, plugin);
      if (record.devMode) await this.ensureLinks(record);
      return this.detail(record);
    });
  }

  uninstall(id: string, plugin: string): Promise<MarketplaceDetail> {
    return withPathLock(LOCK, async () => {
      const record = await this.need(id);
      const install = (await this.installedOf(record)).get(plugin);
      if (!install) throw new MarketplacePluginNotFoundError(id, plugin, "is not installed");
      // Dev: drop the link first so the CLI can never delete through it into the checkout.
      if (record.devMode) await this.unlink(install.installPath);
      await this.cli.plugin(["uninstall", `${plugin}@${id}`, "--scope", "user"]);
      return this.detail(record);
    });
  }

  /** Skills of every installed plugin of every managed marketplace, as `/plugin:skill`. */
  async skills(): Promise<MarketplaceSkill[]> {
    const ids = new Set((await this.store.list()).map((r) => r.id));
    if (ids.size === 0) return [];
    const out: MarketplaceSkill[] = [];
    for (const [key, install] of await readInstalledPlugins(this.pluginsDir)) {
      const { plugin, marketplace } = splitPluginKey(key);
      if (!ids.has(marketplace)) continue;
      for (const skill of (await readPluginComponents(install.installPath)).skills) {
        const name = `${plugin}:${skill.name}`;
        out.push({
          id: name,
          name,
          ...(skill.description ? { desc: skill.description } : {}),
          marketplace,
          plugin,
        });
      }
    }
    return out;
  }

  // --- adding ---------------------------------------------------------------

  private async addNormal(source: string): Promise<Marketplace> {
    const before = await this.known();
    let entry = before.find((m) => matchesSource(m, source));
    if (!entry) {
      await this.cli.plugin(["marketplace", "add", source, "--scope", "user"]);
      const after = await this.known();
      const fresh = after.filter((a) => !before.some((b) => b.name === a.name));
      entry =
        after.find((m) => matchesSource(m, source)) ?? (fresh.length === 1 ? fresh[0] : undefined);
    }
    if (!entry) {
      throw new MarketplaceCliError(
        `Added "${source}" but it is missing from claude plugin marketplace list`,
      );
    }
    await this.assertNew(entry.name);
    return {
      id: entry.name,
      source,
      devMode: false,
      managedClone: false,
      addedAt: new Date().toISOString(),
    };
  }

  private async addDev(source: string): Promise<Marketplace> {
    const local = expandHome(source);
    let localPath: string;
    let managedClone: boolean;
    if (path.isAbsolute(local)) {
      localPath = path.resolve(local);
      managedClone = false;
    } else if (isValidGitRemote(source)) {
      localPath = await this.clone(source);
      managedClone = true;
    } else {
      throw new InvalidMarketplaceSourceError("Dev mode needs an absolute local path or a git URL");
    }
    try {
      const catalog = await readCatalog(localPath);
      if (!catalog) {
        throw new InvalidMarketplaceSourceError(
          `No .claude-plugin/marketplace.json in "${localPath}"`,
        );
      }
      await this.assertNew(catalog.name);
      // Adopt: Claude already knows this marketplace from this very checkout.
      const entry = (await this.known()).find((m) => m.name === catalog.name);
      const knownPath = entry?.path ?? entry?.installLocation;
      if (!knownPath || path.resolve(knownPath) !== localPath) {
        await this.cli.plugin(["marketplace", "add", localPath, "--scope", "user"]);
      }
      return {
        id: catalog.name,
        source,
        devMode: true,
        localPath,
        managedClone,
        addedAt: new Date().toISOString(),
      };
    } catch (error) {
      // A clone made for a failed connect is ZIBBY's own — never leave it behind.
      if (managedClone) await fs.rm(localPath, { recursive: true, force: true });
      throw error;
    }
  }

  private async clone(remote: string): Promise<string> {
    const base =
      remote
        .replace(/\/+$/, "")
        .split(/[/:]/)
        .pop()
        ?.replace(/\.git$/, "") ?? "";
    if (!/^[\w.-]+$/.test(base) || base === "." || base === "..") {
      throw new InvalidMarketplaceSourceError(`Cannot derive a clone dir name from "${remote}"`);
    }
    const dest = path.join(this.cloneDir, base);
    if (
      await fs.lstat(dest).then(
        () => true,
        () => false,
      )
    ) {
      throw new InvalidMarketplaceSourceError(`Clone target "${dest}" already exists`);
    }
    await fs.mkdir(this.cloneDir, { recursive: true });
    await this.cli.git(["clone", "--", remote, dest]);
    return dest;
  }

  private async installOne(record: Marketplace, plugin: string): Promise<void> {
    await this.cli.plugin(["install", `${plugin}@${record.id}`, "--scope", "user"]);
  }

  private async assertNew(id: string): Promise<void> {
    if (await this.store.get(id)) throw new MarketplaceConflictError(id);
  }

  // --- reading --------------------------------------------------------------

  private async need(id: string): Promise<Marketplace> {
    const record = await this.store.get(id);
    if (!record) throw new MarketplaceNotFoundError(id);
    return record;
  }

  private async known(): Promise<KnownMarketplace[]> {
    const parsed = KnownMarketplacesSchema.safeParse(
      safeJson(await this.cli.plugin(["marketplace", "list", "--json"])),
    );
    if (!parsed.success)
      throw new MarketplaceCliError("Unexpected claude plugin marketplace list output");
    return parsed.data;
  }

  private async catalogFor(
    record: Marketplace,
    known?: KnownMarketplace[],
  ): Promise<Catalog | null> {
    const dir = record.devMode
      ? record.localPath
      : (known ?? (await this.known())).find((m) => m.name === record.id)?.installLocation;
    return dir ? readCatalog(dir) : null;
  }

  /** This marketplace's user-scope installs, keyed by plugin name. */
  private async installedOf(record: Marketplace) {
    const out = new Map<string, { installPath: string; version?: string }>();
    for (const [key, install] of await readInstalledPlugins(this.pluginsDir)) {
      const { plugin, marketplace } = splitPluginKey(key);
      if (marketplace === record.id) out.set(plugin, install);
    }
    return out;
  }

  private async detail(record: Marketplace): Promise<MarketplaceDetail> {
    const catalog = await this.catalogFor(record);
    const installed = await this.installedOf(record);
    const plugins = await Promise.all(
      (catalog?.plugins ?? []).map(async ({ dir, ...plugin }) => {
        const install = installed.get(plugin.name);
        return {
          ...plugin,
          installed: Boolean(install),
          ...(install?.version ? { installedVersion: install.version } : {}),
          linked: Boolean(
            record.devMode && dir && install && (await isLinkTo(install.installPath, dir)),
          ),
        };
      }),
    );
    return {
      ...record,
      ...(catalog?.description ? { description: catalog.description } : {}),
      plugins,
    };
  }

  // --- dev links ------------------------------------------------------------

  /** Point every installed local plugin's installPath at its dir in the checkout. */
  private async ensureLinks(record: Marketplace): Promise<void> {
    const catalog = await this.catalogFor(record);
    const installed = await this.installedOf(record);
    for (const plugin of catalog?.plugins ?? []) {
      const install = installed.get(plugin.name);
      if (!plugin.dir || !install || (await isLinkTo(install.installPath, plugin.dir))) continue;
      await this.assertInCache(install.installPath);
      await fs.rm(install.installPath, { recursive: true, force: true });
      await fs.mkdir(path.dirname(install.installPath), { recursive: true });
      await fs.symlink(plugin.dir, install.installPath, "dir");
    }
  }

  /** Replace a dev link with an empty dir (no-op for a real dir) before the CLI deletes it. */
  private async unlink(installPath: string): Promise<void> {
    const stat = await fs.lstat(installPath).catch(() => null);
    if (!stat?.isSymbolicLink()) return;
    await this.assertInCache(installPath);
    await fs.unlink(installPath);
    await fs.mkdir(installPath);
  }

  /** Only ever remove a path inside `<pluginsDir>/cache/` — lexically and through real parents. */
  private async assertInCache(target: string): Promise<void> {
    const cache = path.join(this.pluginsDir, "cache");
    const realCache = await fs.realpath(cache).catch(() => path.resolve(cache));
    const realParent = await fs.realpath(path.dirname(target)).catch(() => null);
    const inside =
      isInside(target, cache) &&
      path.resolve(target) !== path.resolve(cache) &&
      (realParent === null || isInside(realParent, realCache));
    if (!inside) throw new UnsafeMarketplacePathError(target, cache);
  }
}

/** `link` is a symlink resolving to `target`. */
async function isLinkTo(link: string, target: string): Promise<boolean> {
  try {
    if (!(await fs.lstat(link)).isSymbolicLink()) return false;
    return (await fs.realpath(link)) === (await fs.realpath(target));
  } catch {
    return false;
  }
}
