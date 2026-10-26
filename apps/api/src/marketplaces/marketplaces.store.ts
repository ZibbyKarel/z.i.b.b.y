import { promises as fs } from "node:fs";
import * as path from "node:path";
import { Inject, Injectable } from "@nestjs/common";
import { type Marketplace, MarketplaceSchema } from "@zibby/contracts";
import { z } from "zod";
import { dataDir } from "../shared/data-dir";
import { ensureDir, safeJson, writeFileAtomic } from "../shared/file-storage";

export const MARKETPLACES_FILE = "MARKETPLACES_FILE";

export function resolveMarketplacesFile(): string {
  return process.env.MARKETPLACES_FILE ?? dataDir("marketplaces.json");
}

const RecordsSchema = z.array(MarketplaceSchema);

/**
 * The marketplaces ZIBBY manages, persisted as `data/marketplaces.json` — same
 * small-document shape as `QuickActionsStore`, but re-read on every call (no
 * in-memory copy) so the second instance `ClaudeRunModule` provides for run
 * injection always sees what `MarketplacesModule` wrote. A missing/corrupt file
 * yields an empty list, never an error. Callers serialize mutations.
 */
@Injectable()
export class MarketplacesStore {
  constructor(@Inject(MARKETPLACES_FILE) private readonly file: string) {}

  async list(): Promise<Marketplace[]> {
    let raw: string;
    try {
      raw = await fs.readFile(this.file, "utf8");
    } catch {
      return [];
    }
    const parsed = RecordsSchema.safeParse(safeJson(raw));
    return parsed.success ? parsed.data : [];
  }

  async get(id: string): Promise<Marketplace | undefined> {
    return (await this.list()).find((m) => m.id === id);
  }

  /** Append a record (replacing any with the same id). */
  async add(record: Marketplace): Promise<void> {
    const rest = (await this.list()).filter((m) => m.id !== record.id);
    await this.write([...rest, MarketplaceSchema.parse(record)]);
  }

  async remove(id: string): Promise<void> {
    await this.write((await this.list()).filter((m) => m.id !== id));
  }

  private async write(records: Marketplace[]): Promise<void> {
    await ensureDir(path.dirname(this.file));
    await writeFileAtomic(this.file, `${JSON.stringify(records, null, 2)}\n`);
  }
}
