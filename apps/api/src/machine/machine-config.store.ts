import { promises as fs } from "node:fs";
import * as path from "node:path";
import { Inject, Injectable } from "@nestjs/common";
import { type MachineConfig, MachineConfigSchema } from "@zibby/contracts";
import { defaultCloneRoot } from "../shared/data-dir";
import { ensureDir, safeJson, writeFileAtomic } from "../shared/file-storage";

/** DI token carrying the absolute path of the machine config file. */
export const MACHINE_CONFIG_FILE = "MACHINE_CONFIG_FILE";

/**
 * Phase 76 — THIS machine's per-machine config, persisted as a single
 * `data/machine/config.json`. Unlike `SystemConfigStore` (operator-owned, synced
 * knobs), this file is deliberately per-machine and
 * gitignored (see `.gitignore`: `.zibby/data/machine/config.json`) — it must
 * NEVER be committed/synced, since a clone root is a local filesystem detail
 * that differs machine to machine. A missing/garbage file reads as the
 * default: `{ cloneRoot: defaultCloneRoot() }`. Writes are atomic.
 */
@Injectable()
export class MachineConfigStore {
  private readonly dir: string;

  constructor(@Inject(MACHINE_CONFIG_FILE) private readonly file: string) {
    this.dir = path.dirname(file);
  }

  /** The default config when no file exists yet, or it fails to parse. */
  private defaultConfig(): MachineConfig {
    return { cloneRoot: defaultCloneRoot() };
  }

  /** Read the config; a missing/garbage file → the computed default. */
  async read(): Promise<MachineConfig> {
    const raw = await fs.readFile(this.file, "utf8").catch(() => null);
    if (raw === null) return this.defaultConfig();
    const parsed = MachineConfigSchema.safeParse(safeJson(raw));
    return parsed.success ? parsed.data : this.defaultConfig();
  }

  /** Merge `patch` over the current config, re-validate, persist atomically. */
  async write(patch: Partial<MachineConfig>): Promise<MachineConfig> {
    const current = await this.read();
    const next = MachineConfigSchema.parse({ ...current, ...patch });
    await ensureDir(this.dir);
    await writeFileAtomic(this.file, `${JSON.stringify(next, null, 2)}\n`);
    return next;
  }
}
