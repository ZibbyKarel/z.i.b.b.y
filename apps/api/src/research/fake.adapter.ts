import { promises as fs } from "node:fs";
import * as path from "node:path";
import { Inject, Injectable } from "@nestjs/common";
import type { ResearchSource } from "@zibby/contracts";
import { safeJson } from "../shared/file-storage";
import type { RawResearchItem, ResearchSourceAdapter } from "./research-source.adapter";

/** DI token carrying the absolute path of the fixtures dir (one JSON file per source). */
export const RESEARCH_FIXTURES_DIR = "RESEARCH_FIXTURES_DIR";

/**
 * The floor adapter: reads `<RESEARCH_FIXTURES_DIR>/<sourceId>.json` (a JSON array of
 * {@link RawResearchItem}). A missing/garbage file yields `[]` — quiet, never throws.
 * This is the analogue of the channel `FakeChannelAdapter`: it lets the whole
 * research layer (config → rank → digest → briefing fold) run dependency-free, with
 * real network fetchers (RSS/HN/PH) slotting in behind the same seam later.
 */
@Injectable()
export class FakeResearchAdapter implements ResearchSourceAdapter {
  constructor(@Inject(RESEARCH_FIXTURES_DIR) private readonly dir: string) {}

  async fetch(source: ResearchSource): Promise<RawResearchItem[]> {
    const file = path.join(this.dir, `${source.id}.json`);
    const raw = await fs.readFile(file, "utf8").catch(() => null);
    if (raw === null) return [];
    const parsed = safeJson(raw);
    if (!Array.isArray(parsed)) return [];
    const out: RawResearchItem[] = [];
    for (const entry of parsed) {
      if (!entry || typeof entry !== "object") continue;
      const e = entry as Partial<RawResearchItem>;
      if (typeof e.title !== "string" || !e.title) continue;
      out.push({
        id: typeof e.id === "string" && e.id ? e.id : `${source.id}-${out.length}`,
        title: e.title,
        url: typeof e.url === "string" ? e.url : undefined,
        summary: typeof e.summary === "string" ? e.summary : "",
        publishedAt: typeof e.publishedAt === "string" ? e.publishedAt : undefined,
      });
    }
    return out;
  }
}
