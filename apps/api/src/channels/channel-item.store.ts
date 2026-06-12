import { promises as fs } from "node:fs"
import * as path from "node:path"
import { Inject, Injectable, type OnModuleInit } from "@nestjs/common"
import { AGENT_ID_REGEX, type ChannelItem, ChannelItemSchema } from "@zibby/contracts"
import {
  ensureDir,
  fileExists,
  resolveSafeFile,
  safeJson,
  writeFileAtomic,
} from "../shared/file-storage"

/** DI token for the root directory holding per-integration channel item dirs. */
export const CHANNELS_DIR = "CHANNELS_DIR"

const CURSOR_FILE = "cursor.json"

export interface ChannelItemFilter {
  integrationId?: string
  state?: ChannelItem["state"]
}

/**
 * Two-level file store for channel items: `<root>/<integrationId>/<itemId>.json`,
 * with a sibling `cursor.json` per integration. `resolveSafeFile` is flat-dir only
 * (the Phase-4 vault lesson), so resolution is TWO steps — the integration id is
 * validated against the channels root FIRST, then the item id against the
 * integration dir. A single-step resolve against the root would be a traversal
 * hole. Dedup is an id-collision check: {@link put} returns the existing item
 * unchanged when the file already exists, so a re-poll can never duplicate.
 */
@Injectable()
export class ChannelItemStore implements OnModuleInit {
  private readonly root: string

  constructor(@Inject(CHANNELS_DIR) dir: string) {
    this.root = path.resolve(dir)
  }

  async onModuleInit(): Promise<void> {
    await ensureDir(this.root)
  }

  /** Resolve the integration's directory inside the root, or null if the id is unsafe. */
  private integrationDir(integrationId: string): string | null {
    // ext "" → the path IS the directory; containment (dirname === root) still applies.
    return resolveSafeFile(this.root, integrationId, "", AGENT_ID_REGEX)
  }

  /** Resolve an item's file via the two-step containment check. */
  private itemFile(integrationId: string, itemId: string): string | null {
    const dir = this.integrationDir(integrationId)
    if (dir === null) return null
    return resolveSafeFile(dir, itemId, ".json", AGENT_ID_REGEX)
  }

  /**
   * Persist a new item (atomic). Dedup: if the file already exists, the existing
   * item is returned unchanged and nothing is written — id-collision IS the dedup.
   */
  async put(item: ChannelItem): Promise<ChannelItem> {
    const file = this.itemFile(item.integrationId, item.id)
    if (file === null) throw new Error(`unsafe channel item path: ${item.integrationId}/${item.id}`)
    if (await fileExists(file)) {
      const existing = await this.readFile(file)
      if (existing) return existing
    }
    await ensureDir(path.dirname(file))
    await writeFileAtomic(file, JSON.stringify(item))
    return item
  }

  /** Overwrite an item in place (state transition; whole-file atomic rewrite). */
  async update(item: ChannelItem): Promise<ChannelItem> {
    const file = this.itemFile(item.integrationId, item.id)
    if (file === null) throw new Error(`unsafe channel item path: ${item.integrationId}/${item.id}`)
    await ensureDir(path.dirname(file))
    await writeFileAtomic(file, JSON.stringify(item))
    return item
  }

  async get(integrationId: string, itemId: string): Promise<ChannelItem | null> {
    const file = this.itemFile(integrationId, itemId)
    if (file === null) return null
    return this.readFile(file)
  }

  /** Find an item by id across every integration dir (the get-by-id endpoint). */
  async findById(itemId: string): Promise<ChannelItem | null> {
    for (const integrationId of await this.integrationIds()) {
      const found = await this.get(integrationId, itemId)
      if (found) return found
    }
    return null
  }

  /** Tolerant listing across integration dirs, optionally filtered. */
  async list(filter: ChannelItemFilter = {}): Promise<ChannelItem[]> {
    const integrationIds = filter.integrationId
      ? [filter.integrationId]
      : await this.integrationIds()
    const out: ChannelItem[] = []
    for (const integrationId of integrationIds) {
      const dir = this.integrationDir(integrationId)
      if (dir === null) continue
      const entries = await fs.readdir(dir).catch(() => [] as string[])
      for (const entry of entries) {
        if (!entry.endsWith(".json") || entry === CURSOR_FILE) continue
        const item = await this.readFile(path.join(dir, entry))
        if (!item) continue
        if (filter.state && item.state !== filter.state) continue
        out.push(item)
      }
    }
    return out.sort((a, b) => a.receivedAt.localeCompare(b.receivedAt))
  }

  /** Read the persisted poll cursor for an integration (null if none/unsafe). */
  async readCursor(integrationId: string): Promise<string | undefined> {
    const dir = this.integrationDir(integrationId)
    if (dir === null) return undefined
    const raw = await fs.readFile(path.join(dir, CURSOR_FILE), "utf8").catch(() => null)
    if (raw === null) return undefined
    const parsed = safeJson(raw)
    return parsed && typeof parsed === "object" && typeof (parsed as { cursor?: unknown }).cursor === "string"
      ? (parsed as { cursor: string }).cursor
      : undefined
  }

  /** Persist the poll cursor AFTER items are written (crash-safe replay ordering). */
  async writeCursor(integrationId: string, cursor: string | undefined): Promise<void> {
    if (cursor === undefined) return
    const dir = this.integrationDir(integrationId)
    if (dir === null) throw new Error(`unsafe integration id: ${integrationId}`)
    await ensureDir(dir)
    await writeFileAtomic(path.join(dir, CURSOR_FILE), JSON.stringify({ cursor }))
  }

  /** The integration ids that have a channel directory under the root. */
  private async integrationIds(): Promise<string[]> {
    const entries = await fs.readdir(this.root, { withFileTypes: true }).catch(() => [])
    return entries.filter((e) => e.isDirectory()).map((e) => e.name)
  }

  private async readFile(file: string): Promise<ChannelItem | null> {
    const raw = await fs.readFile(file, "utf8").catch(() => null)
    if (raw === null) return null
    const parsed = ChannelItemSchema.safeParse(safeJson(raw))
    return parsed.success ? parsed.data : null
  }
}
