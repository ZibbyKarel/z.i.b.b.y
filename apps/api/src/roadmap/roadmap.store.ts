import { promises as fs } from "node:fs";
import * as path from "node:path";
import { Inject, Injectable, type OnModuleInit } from "@nestjs/common";
import {
  AGENT_ID_REGEX,
  ROADMAP_ITEM_ID_REGEX,
  type RoadmapConfig,
  RoadmapConfigSchema,
  type RoadmapItem,
  RoadmapItemSchema,
} from "@zibby/contracts";
import {
  ensureDir,
  fileExists,
  isErrnoException,
  resolveSafeFile,
  safeJson,
  withPathLock,
  writeFileAtomic,
} from "../shared/file-storage";
import {
  CorruptRoadmapItemFileError,
  InvalidRoadmapItemIdError,
  InvalidRoadmapProjectIdError,
  RoadmapItemConflictError,
  RoadmapItemNotFoundError,
} from "./roadmap.errors";

/** DI token for the root directory holding per-project roadmap item dirs. */
export const ROADMAP_DIR = "ROADMAP_DIR";

const CONFIG_FILE = "_config.json";

/**
 * Two-level file store for roadmap items: `<root>/<projectId>/<itemId>.json`,
 * with a sibling `_config.json` per project (the auto-sync toggle) —
 * modeled directly on `ChannelItemStore`
 * (`<root>/<integrationId>/<itemId>.json` + `cursor.json`), the precedent for
 * a two-level store (`EntityFileStore` is flat-dir only). Resolution is
 * deliberately TWO steps: the project id is validated against the roadmap
 * root FIRST, then the item id against the resolved project dir — a
 * single-step resolve against the root would be a traversal hole (an item id
 * like `../other-project/x` could otherwise escape its own project
 * directory even though it passes the item id regex).
 */
@Injectable()
export class RoadmapStore implements OnModuleInit {
  private readonly root: string;

  constructor(@Inject(ROADMAP_DIR) dir: string) {
    this.root = path.resolve(dir);
  }

  async onModuleInit(): Promise<void> {
    await ensureDir(this.root);
  }

  /** Resolve the project's directory inside the root, or null if the id is unsafe. */
  private projectDir(projectId: string): string | null {
    // ext "" -> the path IS the directory; containment (dirname === root) still applies.
    return resolveSafeFile(this.root, projectId, "", AGENT_ID_REGEX);
  }

  /**
   * Resolve the project's directory, throwing {@link InvalidRoadmapProjectIdError}
   * (NOT the item-id error) when the project id itself is unsafe — every
   * caller below either only has a projectId in hand (`list`/`readConfig`/
   * `writeConfig`) or needs to attribute a resolution failure to the right
   * half of the (projectId, itemId) pair (`itemFile`).
   */
  private requireProjectDir(projectId: string): string {
    const dir = this.projectDir(projectId);
    if (dir === null) throw new InvalidRoadmapProjectIdError(projectId);
    return dir;
  }

  /**
   * Resolve an item's file via the two-step containment check. Throws
   * {@link InvalidRoadmapProjectIdError} if `projectId` itself is unsafe;
   * returns `null` (never throws) if only `itemId` is unsafe under an
   * otherwise-valid project — the caller maps that to
   * {@link InvalidRoadmapItemIdError}.
   */
  private itemFile(projectId: string, itemId: string): string | null {
    const dir = this.requireProjectDir(projectId);
    return resolveSafeFile(dir, itemId, ".json", ROADMAP_ITEM_ID_REGEX);
  }

  /** Tolerant listing of a project's items (skips `_config.json` and any corrupt file). */
  async list(projectId: string): Promise<RoadmapItem[]> {
    const dir = this.requireProjectDir(projectId);
    const entries = await fs.readdir(dir).catch(() => [] as string[]);
    const out: RoadmapItem[] = [];
    for (const entry of entries) {
      if (!entry.endsWith(".json") || entry === CONFIG_FILE) continue;
      const item = await this.readFile(path.join(dir, entry));
      if (item) out.push(item);
    }
    return out.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  /**
   * Get one item, distinguishing "the file doesn't exist" (404, an everyday
   * state) from "the file exists but doesn't parse" ({@link
   * CorruptRoadmapItemFileError} — data corruption). Deliberately does NOT
   * reuse the tolerant {@link readFile} helper `list()` uses — a bulk listing
   * skipping one broken file is fine; a targeted `get()` silently reporting
   * "not found" for a file that is actually still there, just broken, would
   * hide real data loss (see the error's docblock).
   */
  async get(projectId: string, itemId: string): Promise<RoadmapItem> {
    const file = this.itemFile(projectId, itemId);
    if (file === null) throw new InvalidRoadmapItemIdError(projectId, itemId);
    let raw: string;
    try {
      raw = await fs.readFile(file, "utf8");
    } catch (error) {
      if (isErrnoException(error) && error.code === "ENOENT") {
        throw new RoadmapItemNotFoundError(projectId, itemId);
      }
      throw error;
    }
    const parsed = RoadmapItemSchema.safeParse(safeJson(raw));
    if (!parsed.success) throw new CorruptRoadmapItemFileError(projectId, itemId);
    return parsed.data;
  }

  /** Atomic create-if-absent. A duplicate (projectId, id) throws {@link RoadmapItemConflictError}. */
  async put(item: RoadmapItem): Promise<RoadmapItem> {
    const file = this.itemFile(item.projectId, item.id);
    if (file === null) throw new InvalidRoadmapItemIdError(item.projectId, item.id);
    return withPathLock(file, async () => {
      if (await fileExists(file)) {
        throw new RoadmapItemConflictError(item.projectId, item.id);
      }
      await ensureDir(path.dirname(file));
      await writeFileAtomic(file, JSON.stringify(item, null, 2));
      return item;
    });
  }

  /**
   * Atomic get -> mutate -> write, as ONE critical section keyed by the
   * resolved file path — the read-modify-write pattern `EntityFileStore.
   * updateEntity` uses for a flat-dir store, extended to the two-level case.
   */
  async update(
    projectId: string,
    itemId: string,
    mutate: (current: RoadmapItem) => RoadmapItem,
  ): Promise<RoadmapItem> {
    const file = this.itemFile(projectId, itemId);
    if (file === null) throw new InvalidRoadmapItemIdError(projectId, itemId);
    return withPathLock(file, async () => {
      const current = await this.get(projectId, itemId);
      const next = mutate(current);
      await writeFileAtomic(file, JSON.stringify(next, null, 2));
      return next;
    });
  }

  /**
   * Locked on the same resolved file path `put`/`update` use — an unlocked
   * `unlink` could interleave with an in-flight `update`'s get-mutate-write
   * and let the update's `writeFileAtomic` rename land AFTER the unlink,
   * resurrecting an item the caller just deleted.
   */
  async delete(projectId: string, itemId: string): Promise<void> {
    const file = this.itemFile(projectId, itemId);
    if (file === null) throw new InvalidRoadmapItemIdError(projectId, itemId);
    return withPathLock(file, async () => {
      try {
        await fs.unlink(file);
      } catch (error) {
        if (isErrnoException(error) && error.code === "ENOENT") {
          throw new RoadmapItemNotFoundError(projectId, itemId);
        }
        throw error;
      }
    });
  }

  /** Read the per-project config (the auto-sync toggle) — defaults when absent/corrupt. */
  async readConfig(projectId: string): Promise<RoadmapConfig> {
    const dir = this.requireProjectDir(projectId);
    const raw = await fs.readFile(path.join(dir, CONFIG_FILE), "utf8").catch(() => null);
    if (raw === null) return RoadmapConfigSchema.parse({});
    const parsed = RoadmapConfigSchema.safeParse(safeJson(raw));
    return parsed.success ? parsed.data : RoadmapConfigSchema.parse({});
  }

  async writeConfig(projectId: string, config: RoadmapConfig): Promise<RoadmapConfig> {
    const dir = this.projectDir(projectId);
    if (dir === null) throw new InvalidRoadmapItemIdError(projectId, "");
    const validated = RoadmapConfigSchema.parse(config);
    await ensureDir(dir);
    await writeFileAtomic(path.join(dir, CONFIG_FILE), JSON.stringify(validated, null, 2));
    return validated;
  }

  /** The project ids that have a roadmap directory under the root (used by the attachment sweep). */
  async projectIds(): Promise<string[]> {
    const entries = await fs.readdir(this.root, { withFileTypes: true }).catch(() => []);
    return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
  }

  private async readFile(file: string): Promise<RoadmapItem | null> {
    const raw = await fs.readFile(file, "utf8").catch(() => null);
    if (raw === null) return null;
    const parsed = RoadmapItemSchema.safeParse(safeJson(raw));
    return parsed.success ? parsed.data : null;
  }
}
