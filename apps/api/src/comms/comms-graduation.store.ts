import { promises as fs } from "node:fs";
import * as path from "node:path";
import { Inject, Injectable } from "@nestjs/common";
import { type HeraldGraduation, HeraldGraduationSchema } from "@zibby/contracts";
import { z } from "zod";
import { safeJson, writeFileAtomic } from "../shared/file-storage";
import { LoggerService, type ScopedLogger } from "../shared/logging/logger.service";

/** DI token for the single graduations JSON file. */
export const HERALD_GRADUATION_FILE = "HERALD_GRADUATION_FILE";

const GraduationListSchema = z.array(HeraldGraduationSchema);

/**
 * NS2 F6a — the durable list of graduated `(integrationId, category)` pairs: a
 * channel/category that accumulated enough consecutive approved replies to
 * auto-send at Tier-2. Single `graduations.json` list (like `mandate.json`),
 * tolerant read — a missing or corrupt file reads as `[]` (fail-open: no
 * graduation rather than a throw).
 */
@Injectable()
export class HeraldGraduationStore {
  private readonly file: string;
  private readonly log: ScopedLogger;

  constructor(@Inject(HERALD_GRADUATION_FILE) file: string, logger: LoggerService) {
    this.file = path.resolve(file);
    this.log = logger.child(HeraldGraduationStore.name);
  }

  async list(): Promise<HeraldGraduation[]> {
    const raw = await fs.readFile(this.file, "utf8").catch(() => null);
    if (raw === null) return [];
    const parsed = GraduationListSchema.safeParse(safeJson(raw));
    if (!parsed.success) {
      this.log.warn("corrupt graduations file — treating as empty (fail-open)");
      return [];
    }
    return parsed.data;
  }

  async isGraduated(
    integrationId: string,
    category: HeraldGraduation["category"],
  ): Promise<boolean> {
    const all = await this.list();
    return all.some((g) => g.integrationId === integrationId && g.category === category);
  }

  /** Add a graduation (idempotent — replaces an existing entry for the same pair). */
  async add(graduation: HeraldGraduation): Promise<void> {
    const all = await this.list();
    const next = [
      ...all.filter(
        (g) =>
          !(g.integrationId === graduation.integrationId && g.category === graduation.category),
      ),
      graduation,
    ];
    await this.write(next);
  }

  /** Remove a graduation (downgrade / admin path). No-op if not present. */
  async remove(integrationId: string, category: HeraldGraduation["category"]): Promise<void> {
    const all = await this.list();
    const next = all.filter((g) => !(g.integrationId === integrationId && g.category === category));
    if (next.length !== all.length) await this.write(next);
  }

  private async write(all: HeraldGraduation[]): Promise<void> {
    await fs.mkdir(path.dirname(this.file), { recursive: true });
    await writeFileAtomic(this.file, JSON.stringify(all, null, 2));
  }
}
