import { readFileSync } from "node:fs";
import * as path from "node:path";
import { Inject, Injectable } from "@nestjs/common";
import {
  DEFAULT_LEVEL_MAPPING,
  type LevelMapping,
  type LevelMappingEntry,
  type LevelMappingKind,
  LevelMappingSchema,
} from "@zibby/contracts";
import { ensureDir, safeJson, withPathLock, writeFileAtomic } from "../shared/file-storage";

/** DI token for the level-mapping file path (`<roadmapRoot>/_level-mapping.json`). */
export const LEVEL_MAPPING_FILE = "LEVEL_MAPPING_FILE";

/**
 * Global level-mapping table (`/settings?tab=tasks`): a single JSON document,
 * the same architectural slot as `PinsStore`/`SystemConfigStore` — one small
 * operator-owned document, not a collection of named entities. Synchronous
 * load in the constructor for the same reason those stores load synchronously
 * (see `PinsStore`'s docblock): the table must be available before the first
 * request. A missing OR corrupt file fails open to `DEFAULT_LEVEL_MAPPING`
 * rather than erroring — a garbled mapping table must never block a sync
 * tick (125b) or the settings page from rendering.
 */
@Injectable()
export class LevelMappingStore {
  private readonly dir: string;
  private mapping: LevelMapping;

  constructor(@Inject(LEVEL_MAPPING_FILE) private readonly file: string) {
    this.dir = path.dirname(file);
    this.mapping = LevelMappingStore.load(file);
  }

  private static load(file: string): LevelMapping {
    let raw: string;
    try {
      raw = readFileSync(file, "utf8");
    } catch {
      return DEFAULT_LEVEL_MAPPING;
    }
    const parsed = LevelMappingSchema.safeParse(safeJson(raw));
    return parsed.success ? parsed.data : DEFAULT_LEVEL_MAPPING;
  }

  async read(): Promise<LevelMapping> {
    return this.mapping;
  }

  /**
   * Persist a replacement document — locked on the file path so this can
   * never interleave with a concurrent {@link ensureLevels} (or another
   * `write()`). See {@link writeUnlocked} for why the actual write logic
   * lives in a separate, unlocked method.
   */
  async write(next: LevelMapping): Promise<LevelMapping> {
    return withPathLock(this.file, () => this.writeUnlocked(next));
  }

  /**
   * The actual validate-and-persist logic, WITHOUT taking the lock itself.
   * `withPathLock` is reentrant — a nested call for the same key from inside
   * an already-held section runs inline, unprotected — so `ensureLevels`
   * cannot just call the public, locked `write()` from inside its own locked
   * section and get real mutual exclusion out of it: that nested call would
   * silently skip the lock it looks like it's taking. Splitting the unlocked
   * body out lets both the public `write()` and `ensureLevels` each acquire
   * the lock exactly once, at their own outermost call, while still sharing
   * one implementation.
   */
  private async writeUnlocked(next: LevelMapping): Promise<LevelMapping> {
    const validated = LevelMappingSchema.parse(next);
    await ensureDir(this.dir);
    await writeFileAtomic(this.file, `${JSON.stringify(validated, null, 2)}\n`);
    this.mapping = validated;
    return validated;
  }

  /**
   * Append any `externalLevel` under `kind` the caller has never seen before,
   * each defaulting to `target: "task"` — 125b calls this per sync fetch so
   * the table populates itself from reality instead of a guess. Existing
   * entries are left untouched (this only ADDS, never overwrites an
   * operator's choice), and a batch that repeats the same unseen level more
   * than once still appends it exactly once. Matching is case-insensitive,
   * mirroring `resolveLevel`. Locked on the file path — the SAME key
   * `write()` locks on — so a concurrent `write()` (an operator replacing the
   * whole table via the settings page) can never interleave with an
   * in-flight append and silently clobber it (or vice versa): whichever
   * caller gets the lock first runs to completion, with `this.mapping`
   * fully updated, before the other's read-modify-write begins.
   */
  async ensureLevels(kind: LevelMappingKind, externalLevels: string[]): Promise<LevelMapping> {
    return withPathLock(this.file, async () => {
      const seen = new Set(
        this.mapping.entries
          .filter((entry) => entry.kind === kind)
          .map((entry) => entry.externalLevel.trim().toLowerCase()),
      );
      const additions: LevelMappingEntry[] = [];
      for (const externalLevel of externalLevels) {
        const key = externalLevel.trim().toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        additions.push({ kind, externalLevel, target: "task" });
      }
      if (additions.length === 0) return this.mapping;
      // NOT `this.write(...)` — that would re-acquire (reentrantly, and
      // therefore unprotected) the same lock this section already holds.
      return this.writeUnlocked({ entries: [...this.mapping.entries, ...additions] });
    });
  }
}
