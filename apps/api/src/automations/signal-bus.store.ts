import { promises as fs } from "node:fs";
import * as path from "node:path";
import { Inject, Injectable } from "@nestjs/common";
import { AGENT_ID_REGEX, SignalSchema } from "@zibby/contracts";
import { z } from "zod";
import {
  ensureDir,
  resolveSafeFile,
  safeJson,
  writeFileAtomic,
} from "../shared/file-storage/file-utils";
import { LoggerService, type ScopedLogger } from "../shared/logging/logger.service";

/** DI token for the signal-bus runtime dir (`.zibby/data/automations-fired`). */
export const SIGNAL_BUS_DIR = "SIGNAL_BUS_DIR";

const FiredSnapshotSchema = z.object({
  automationId: z.string().min(1),
  fingerprints: z.array(z.string()),
  updatedAt: z.string(),
});

/** A signal-triggered dispatch parked behind an `automation-dispatch` approval. */
export const PendingDispatchSchema = z.object({
  id: z.string().min(1),
  automationId: z.string().min(1),
  signal: SignalSchema,
  createdAt: z.string(),
});
export type PendingDispatch = z.infer<typeof PendingDispatchSchema>;

/**
 * Runtime state of the signal bus: per-automation fired fingerprints
 * (`<automationId>.json`, idempotency — the same finding never fires an
 * automation twice) and parked dispatches (`pending/<id>.json`). Fail-open: a
 * missing/corrupt file reads as empty.
 */
@Injectable()
export class SignalBusStore {
  private readonly log: ScopedLogger;

  constructor(
    @Inject(SIGNAL_BUS_DIR) private readonly dir: string,
    logger: LoggerService,
  ) {
    this.log = logger.child(SignalBusStore.name);
  }

  async hasFired(automationId: string, fingerprint: string): Promise<boolean> {
    return (await this.readFired(automationId)).has(fingerprint);
  }

  async markFired(automationId: string, fingerprint: string): Promise<void> {
    const file = this.fileIn(this.dir, automationId);
    if (!file) return;
    const fired = await this.readFired(automationId);
    if (fired.has(fingerprint)) return;
    fired.add(fingerprint);
    await ensureDir(this.dir);
    await writeFileAtomic(
      file,
      `${JSON.stringify({ automationId, fingerprints: [...fired].sort(), updatedAt: new Date().toISOString() }, null, 2)}\n`,
    );
  }

  async createPending(pending: PendingDispatch): Promise<void> {
    const dir = path.join(this.dir, "pending");
    const file = this.fileIn(dir, pending.id);
    if (!file) throw new Error(`Invalid pending dispatch id: ${pending.id}`);
    await ensureDir(dir);
    await writeFileAtomic(file, `${JSON.stringify(pending, null, 2)}\n`);
  }

  async getPending(id: string): Promise<PendingDispatch | null> {
    const file = this.fileIn(path.join(this.dir, "pending"), id);
    if (!file) return null;
    const raw = await fs.readFile(file, "utf8").catch(() => null);
    if (raw === null) return null;
    const parsed = PendingDispatchSchema.safeParse(safeJson(raw));
    return parsed.success ? parsed.data : null;
  }

  async deletePending(id: string): Promise<void> {
    const file = this.fileIn(path.join(this.dir, "pending"), id);
    if (file) await fs.rm(file, { force: true });
  }

  private async readFired(automationId: string): Promise<Set<string>> {
    const file = this.fileIn(this.dir, automationId);
    if (!file) return new Set();
    const raw = await fs.readFile(file, "utf8").catch(() => null);
    if (raw === null) return new Set();
    const parsed = FiredSnapshotSchema.safeParse(safeJson(raw));
    if (!parsed.success) {
      this.log.warn("corrupt signal-fired snapshot — treating as empty (fail-open)", {
        automationId,
      });
      return new Set();
    }
    return new Set(parsed.data.fingerprints);
  }

  private fileIn(dir: string, id: string): string | null {
    return resolveSafeFile(path.resolve(dir), id, ".json", AGENT_ID_REGEX);
  }
}
