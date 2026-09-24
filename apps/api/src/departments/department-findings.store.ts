import { promises as fs } from "node:fs";
import * as path from "node:path";
import { Inject, Injectable } from "@nestjs/common";
import { type FindingSnapshot, FindingSnapshotSchema } from "@zibby/contracts";
import {
  ensureDir,
  resolveSafeFile,
  safeJson,
  writeFileAtomic,
} from "../shared/file-storage/file-utils";
import { LoggerService, type ScopedLogger } from "../shared/logging/logger.service";

export const SUBSYSTEM_FINDINGS_DIR = "SUBSYSTEM_FINDINGS_DIR";

/** Scan keys are simple slugs (`"sentinel"`, `"loom"`…) — no path separators. */
const KEY_REGEX = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/;

/**
 * NS2 F5a — a tiny durable JSON snapshot store so each chair (Sentinel, Loom)
 * can diff this run's fingerprints against the last-persisted set without
 * re-deriving state from the vault note. One `<key>.json` file per scan key,
 * modeled on the cursor half of `MonitorEventStore`
 * (`apps/api/src/monitors/monitor-event.store.ts`).
 *
 * Fail-open: a missing or corrupt snapshot reads as an empty set — the caller
 * treats every finding as "new" rather than throwing, exactly like a first
 * run. This store is internal (no contract endpoint) — the note is the human
 * proposal surface, this is the machine cursor.
 */
@Injectable()
export class SubsystemFindingsStore {
  private readonly log: ScopedLogger;

  constructor(
    @Inject(SUBSYSTEM_FINDINGS_DIR) private readonly dir: string,
    logger: LoggerService,
  ) {
    this.log = logger.child(SubsystemFindingsStore.name);
  }

  /** The last-persisted fingerprint set for `key`; `[]` (empty set) on any read failure. */
  async read(key: string): Promise<Set<string>> {
    const file = this.fileFor(key);
    if (!file) return new Set();
    const raw = await fs.readFile(file, "utf8").catch(() => null);
    if (raw === null) return new Set();
    const json = safeJson(raw);
    const parsed = FindingSnapshotSchema.safeParse(json);
    if (!parsed.success) {
      this.log.warn("corrupt findings snapshot — treating as empty (fail-open)", { key });
      return new Set();
    }
    return new Set(parsed.data.fingerprints);
  }

  /** Persist the current fingerprint set for `key` (sorted, deduped). */
  async write(key: string, fingerprints: Iterable<string>): Promise<void> {
    const file = this.fileFor(key);
    if (!file) return;
    const snapshot: FindingSnapshot = {
      key,
      fingerprints: [...new Set(fingerprints)].sort(),
      updatedAt: new Date().toISOString(),
    };
    await ensureDir(this.dir);
    await writeFileAtomic(file, `${JSON.stringify(snapshot, null, 2)}\n`);
  }

  private fileFor(key: string): string | null {
    return resolveSafeFile(path.resolve(this.dir), key, ".json", KEY_REGEX);
  }
}
