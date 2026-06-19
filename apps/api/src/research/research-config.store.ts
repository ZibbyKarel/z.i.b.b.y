import { promises as fs } from "node:fs";
import * as path from "node:path";
import { Inject, Injectable } from "@nestjs/common";
import { type ResearchConfig, ResearchConfigSchema } from "@zibby/contracts";
import { ensureDir, safeJson, writeFileAtomic } from "../shared/file-storage";

/** DI token carrying the absolute path of the research config file. */
export const RESEARCH_CONFIG_FILE = "RESEARCH_CONFIG_FILE";

/**
 * The operator-owned research config, persisted as a single `data/research-config.json`
 * — same posture as `mandate.json` / `budget.json`. A missing/garbage file reads as the
 * schema default (empty interests + sources, finance off). Writes are atomic.
 */
@Injectable()
export class ResearchConfigStore {
  private readonly dir: string;

  constructor(@Inject(RESEARCH_CONFIG_FILE) private readonly file: string) {
    this.dir = path.dirname(file);
  }

  /** Read the config; a missing/garbage file → schema default. */
  async read(): Promise<ResearchConfig> {
    const raw = await fs.readFile(this.file, "utf8").catch(() => null);
    if (raw === null) return ResearchConfigSchema.parse({});
    const parsed = ResearchConfigSchema.safeParse(safeJson(raw));
    return parsed.success ? parsed.data : ResearchConfigSchema.parse({});
  }

  /** Replace the config (re-validated through the contract schema). */
  async write(config: ResearchConfig): Promise<ResearchConfig> {
    const next = ResearchConfigSchema.parse(config);
    await ensureDir(this.dir);
    await writeFileAtomic(this.file, `${JSON.stringify(next, null, 2)}\n`);
    return next;
  }
}
