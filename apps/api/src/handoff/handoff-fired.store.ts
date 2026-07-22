import { promises as fs } from "node:fs";
import * as path from "node:path";
import { Inject, Injectable } from "@nestjs/common";
import { AGENT_ID_REGEX } from "@zibby/contracts";
import { z } from "zod";
import {
  ensureDir,
  resolveSafeFile,
  safeJson,
  writeFileAtomic,
} from "../shared/file-storage/file-utils";
import { LoggerService, type ScopedLogger } from "../shared/logging/logger.service";

/** DI token for the fired-fingerprints directory. */
export const HANDOFF_FIRED_DIR = "HANDOFF_FIRED_DIR";

const FiredSnapshotSchema = z.object({
  ruleId: z.string().min(1),
  fingerprints: z.array(z.string()),
  updatedAt: z.string(),
});
type FiredSnapshot = z.infer<typeof FiredSnapshotSchema>;

/**
 * A2 — the idempotency snapshot behind `HandoffService.evaluate`'s "the same
 * `(rule.id, signal.fingerprint)` never dispatches twice" guarantee (design doc
 * Part A.2). One `<ruleId>.json` file per rule, holding the set of fingerprints
 * that already fired for it — the same fingerprint-set pattern
 * `SubsystemFindingsStore` (`apps/api/src/subsystems/subsystem-findings.store.ts`)
 * uses for Sentinel/Loom scan diffing, kept as its own internal store here (no
 * contract endpoint, own dir) rather than reused directly, since the keying
 * concept differs (rule id, not scan key) even though the storage shape matches.
 *
 * Fail-open throughout: a missing or corrupt snapshot reads as an empty set — a
 * signal is treated as "never fired" rather than blocking dispatch on a read error.
 */
@Injectable()
export class HandoffFiredStore {
  private readonly log: ScopedLogger;

  constructor(
    @Inject(HANDOFF_FIRED_DIR) private readonly dir: string,
    logger: LoggerService,
  ) {
    this.log = logger.child(HandoffFiredStore.name);
  }

  async hasFired(ruleId: string, fingerprint: string): Promise<boolean> {
    const fired = await this.read(ruleId);
    return fired.has(fingerprint);
  }

  /** Idempotent — adding an already-recorded fingerprint is a no-op write. */
  async markFired(ruleId: string, fingerprint: string): Promise<void> {
    const fired = await this.read(ruleId);
    if (fired.has(fingerprint)) return;
    fired.add(fingerprint);
    await this.write(ruleId, fired);
  }

  private async read(ruleId: string): Promise<Set<string>> {
    const file = this.fileFor(ruleId);
    if (!file) return new Set();
    const raw = await fs.readFile(file, "utf8").catch(() => null);
    if (raw === null) return new Set();
    const parsed = FiredSnapshotSchema.safeParse(safeJson(raw));
    if (!parsed.success) {
      this.log.warn("corrupt handoff-fired snapshot — treating as empty (fail-open)", { ruleId });
      return new Set();
    }
    return new Set(parsed.data.fingerprints);
  }

  private async write(ruleId: string, fingerprints: Set<string>): Promise<void> {
    const file = this.fileFor(ruleId);
    if (!file) return;
    const snapshot: FiredSnapshot = {
      ruleId,
      fingerprints: [...fingerprints].sort(),
      updatedAt: new Date().toISOString(),
    };
    await ensureDir(this.dir);
    await writeFileAtomic(file, `${JSON.stringify(snapshot, null, 2)}\n`);
  }

  private fileFor(ruleId: string): string | null {
    return resolveSafeFile(path.resolve(this.dir), ruleId, ".json", AGENT_ID_REGEX);
  }
}
