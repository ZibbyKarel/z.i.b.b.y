import { promises as fs } from "node:fs";
import * as path from "node:path";
import { Inject, Injectable, Optional } from "@nestjs/common";
import { type Proposal, ProposalSchema } from "@zibby/contracts";
import {
  ensureDir,
  isErrnoException,
  safeJson,
  withPathLock,
  writeFileAtomic,
} from "../shared/file-storage";
import { LoggerService, type ScopedLogger } from "../shared/logging/logger.service";

/** DI token for the proposals directory (holds the single `proposals.json`). */
export const PROPOSALS_DIR = "PROPOSALS_DIR";

const FILE_NAME = "proposals.json";

/** What is on disk: no file yet, a valid array, a corrupt file, or an unreadable one. */
type FileState =
  | { kind: "missing" }
  | { kind: "ok"; records: Proposal[] }
  | { kind: "corrupt" }
  | { kind: "unreadable"; error: Error };

/**
 * File-backed system proposals (TODO 14) — ONE JSON array at
 * `<data>/proposals/proposals.json`. Small by construction (each producer caps
 * its own output at ~10 per run), so a whole-file read-modify-write is the
 * simplest correct shape. Writes are atomic (tmp + rename) and serialized
 * in-process per file ({@link withPathLock}).
 *
 * Reads are fail-open: a missing, unreadable or corrupt file reads as `[]` (never
 * a 500). Writes never destroy evidence: a corrupt file (unparseable, not an
 * array, or ANY record failing the schema) is renamed to
 * `proposals.json.corrupt-<ts>` with a warning before the fresh write, and an
 * unreadable (non-ENOENT) file makes the write fail instead of overwriting it.
 */
@Injectable()
export class ProposalsStore {
  private readonly dir: string;
  private readonly file: string;
  private readonly log?: ScopedLogger;

  constructor(@Inject(PROPOSALS_DIR) dir: string, @Optional() logger?: LoggerService) {
    this.dir = path.resolve(dir);
    this.file = path.join(this.dir, FILE_NAME);
    this.log = logger?.child(ProposalsStore.name);
  }

  /** Every stored record; `[]` when missing, unreadable or corrupt. */
  async readAll(): Promise<Proposal[]> {
    const state = await this.readState();
    return state.kind === "ok" ? state.records : [];
  }

  /**
   * Serialized read-modify-write: `fn` receives the current records and returns
   * the next array plus a result; the next array is validated and written atomically.
   */
  mutate<T>(fn: (all: Proposal[]) => { next: Proposal[]; result: T }): Promise<T> {
    return withPathLock(this.file, async () => {
      const state = await this.readState();
      if (state.kind === "unreadable") throw state.error;
      if (state.kind === "corrupt") await this.quarantine();
      const { next, result } = fn(state.kind === "ok" ? state.records : []);
      const validated = next.map((p) => ProposalSchema.parse(p));
      await ensureDir(this.dir);
      await writeFileAtomic(this.file, `${JSON.stringify(validated, null, 2)}\n`);
      return result;
    });
  }

  private async readState(): Promise<FileState> {
    let raw: string;
    try {
      raw = await fs.readFile(this.file, "utf8");
    } catch (err) {
      if (isErrnoException(err) && err.code === "ENOENT") return { kind: "missing" };
      return { kind: "unreadable", error: err instanceof Error ? err : new Error(String(err)) };
    }
    const parsed: unknown = safeJson(raw);
    if (!Array.isArray(parsed)) return { kind: "corrupt" };
    const records: Proposal[] = [];
    for (const item of parsed) {
      const one = ProposalSchema.safeParse(item);
      if (!one.success) return { kind: "corrupt" };
      records.push(one.data);
    }
    return { kind: "ok", records };
  }

  /** Move the corrupt file aside (original bytes kept) so the next write starts fresh. */
  private async quarantine(): Promise<void> {
    const stamp = new Date().toISOString().replace(/:/g, "");
    const target = `${this.file}.corrupt-${stamp}`;
    await fs.rename(this.file, target);
    this.log?.warn("corrupt proposals.json quarantined before write", { quarantined: target });
  }
}
