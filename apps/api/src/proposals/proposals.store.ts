import { promises as fs } from "node:fs";
import * as path from "node:path";
import { Inject, Injectable } from "@nestjs/common";
import { type Proposal, ProposalSchema } from "@zibby/contracts";
import { ensureDir, safeJson, withPathLock, writeFileAtomic } from "../shared/file-storage";

/** DI token for the proposals directory (holds the single `proposals.json`). */
export const PROPOSALS_DIR = "PROPOSALS_DIR";

const FILE_NAME = "proposals.json";

/**
 * File-backed system proposals (TODO 14) — ONE JSON array at
 * `<data>/proposals/proposals.json`. Small by construction (each producer caps
 * its own output at ~10 per run), so a whole-file read-modify-write is the
 * simplest correct shape. Writes are atomic (tmp + rename) and serialized
 * in-process per file ({@link withPathLock}). An unreadable or garbage file reads
 * as `[]` (never a 500); an individually invalid record is skipped.
 */
@Injectable()
export class ProposalsStore {
  private readonly dir: string;
  private readonly file: string;

  constructor(@Inject(PROPOSALS_DIR) dir: string) {
    this.dir = path.resolve(dir);
    this.file = path.join(this.dir, FILE_NAME);
  }

  /** Every stored record (garbage skipped); `[]` when missing or corrupt. */
  async readAll(): Promise<Proposal[]> {
    const raw = await fs.readFile(this.file, "utf8").catch(() => null);
    if (raw === null) return [];
    const parsed: unknown = safeJson(raw);
    if (!Array.isArray(parsed)) return [];
    const out: Proposal[] = [];
    for (const item of parsed) {
      const one = ProposalSchema.safeParse(item);
      if (one.success) out.push(one.data);
    }
    return out;
  }

  /**
   * Serialized read-modify-write: `fn` receives the current records and returns
   * the next array plus a result; the next array is validated and written atomically.
   */
  mutate<T>(fn: (all: Proposal[]) => { next: Proposal[]; result: T }): Promise<T> {
    return withPathLock(this.file, async () => {
      const { next, result } = fn(await this.readAll());
      const validated = next.map((p) => ProposalSchema.parse(p));
      await ensureDir(this.dir);
      await writeFileAtomic(this.file, `${JSON.stringify(validated, null, 2)}\n`);
      return result;
    });
  }
}
