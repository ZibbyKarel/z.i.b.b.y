import { promises as fs } from "node:fs";
import * as path from "node:path";
import { Inject, Injectable } from "@nestjs/common";
import { z } from "zod";
import { ensureDir, safeJson, writeFileAtomic } from "../shared/file-storage";

/** DI token carrying the absolute path of the run-read file. */
export const RUN_READ_FILE = "RUN_READ_FILE";

const RunReadSchema = z.object({
  /** Failures that finished before this are read — the floor set on first use. */
  readBefore: z.string(),
  readIds: z.array(z.string()),
});

export interface RunReadState {
  readBefore: string;
  readIds: ReadonlySet<string>;
}

/**
 * Which failed runs the operator has read (the notification bell). File-backed —
 * `.zibby/data/run-read.json`. A missing file is created with `readBefore = now`,
 * so history that predates the bell never floods it.
 * ponytail: `readIds` only grows; prune ids of deleted runs if the file ever gets big.
 */
@Injectable()
export class RunReadStore {
  constructor(@Inject(RUN_READ_FILE) private readonly file: string) {}

  async state(): Promise<RunReadState> {
    const raw = await fs.readFile(this.file, "utf8").catch(() => null);
    const parsed = raw === null ? null : RunReadSchema.safeParse(safeJson(raw));
    if (parsed?.success) {
      return { readBefore: parsed.data.readBefore, readIds: new Set(parsed.data.readIds) };
    }
    const fresh = { readBefore: new Date().toISOString(), readIds: [] };
    await this.persist(fresh);
    return { readBefore: fresh.readBefore, readIds: new Set() };
  }

  async markRead(runIds: readonly string[]): Promise<void> {
    const { readBefore, readIds } = await this.state();
    await this.persist({ readBefore, readIds: [...new Set([...readIds, ...runIds])] });
  }

  private async persist(data: z.infer<typeof RunReadSchema>): Promise<void> {
    await ensureDir(path.dirname(this.file));
    await writeFileAtomic(this.file, `${JSON.stringify(data, null, 2)}\n`);
  }
}
