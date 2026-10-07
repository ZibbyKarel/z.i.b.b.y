import { readFileSync } from "node:fs";
import * as path from "node:path";
import { Inject, Injectable } from "@nestjs/common";
import { type SystemConfig, SystemConfigSchema } from "@zibby/contracts";
import { ensureDir, safeJson, writeFileAtomic } from "../shared/file-storage";

/** DI token carrying the absolute path of the system config file. */
export const SYSTEM_CONFIG_FILE = "SYSTEM_CONFIG_FILE";

/**
 * Staffing-driven capacity: `maxConcurrentRuns` (whole runs at once) was replaced by
 * the `maxWorkingAgents` machine fuse. The schema is `.strict()`, so a file still
 * carrying the old key would otherwise fail to parse and drop EVERY knob back to its
 * default. Same number, new meaning; a legacy `null` (uncapped) takes the default —
 * the fuse always exists. The file is rewritten in the new shape on the next save.
 */
export function migrateLegacySystemConfig(raw: unknown): unknown {
  if (!raw || typeof raw !== "object" || !("maxConcurrentRuns" in raw)) return raw;
  const { maxConcurrentRuns, ...rest } = raw as Record<string, unknown>;
  return typeof maxConcurrentRuns === "number" && !("maxWorkingAgents" in rest)
    ? { ...rest, maxWorkingAgents: maxConcurrentRuns }
    : rest;
}

/** A subscriber notified after the config changes; returns an unsubscribe. */
export type SystemConfigListener = (config: SystemConfig) => void;

/**
 * The operator-owned runtime system config, persisted as a single
 * `data/system-config.json`. These knobs were formerly start-only env vars; making
 * them file-backed lets the operator edit them from `/settings` (Law: files are the
 * source of truth).
 *
 * The config is held IN MEMORY and exposed synchronously via {@link current}, because
 * the consumers are sync call-sites: `AdapterRegistry.resolve()` (hot per-integration
 * path), `GoalRunnerService.shellTimeoutMs()`, the schedulers' arm logic. The initial
 * load is a synchronous `readFileSync` in the constructor — `@Global` gives the store
 * visibility but NOT init-order guarantees, so a consumer's `onModuleInit` may run
 * before any async load would have resolved; a sync load at construction sidesteps that
 * for this one small file. {@link write} re-validates, persists atomically, updates the
 * in-memory copy and notifies subscribers (the schedulers re-arm their timers).
 */
@Injectable()
export class SystemConfigStore {
  private readonly dir: string;
  private config: SystemConfig;
  private readonly listeners = new Set<SystemConfigListener>();

  constructor(@Inject(SYSTEM_CONFIG_FILE) private readonly file: string) {
    this.dir = path.dirname(file);
    this.config = SystemConfigStore.load(file);
  }

  /** Read the file synchronously; a missing/garbage file → schema default. */
  private static load(file: string): SystemConfig {
    let raw: string;
    try {
      raw = readFileSync(file, "utf8");
    } catch {
      return SystemConfigSchema.parse({});
    }
    const parsed = SystemConfigSchema.safeParse(migrateLegacySystemConfig(safeJson(raw)));
    return parsed.success ? parsed.data : SystemConfigSchema.parse({});
  }

  /** The effective config right now (synchronous — the in-memory copy). */
  current(): SystemConfig {
    return this.config;
  }

  /** Async accessor for the controller; mirrors the in-memory {@link current}. */
  async read(): Promise<SystemConfig> {
    return this.config;
  }

  /** Replace the config (re-validated), persist atomically, then notify subscribers. */
  async write(next: SystemConfig): Promise<SystemConfig> {
    const validated = SystemConfigSchema.parse(next);
    await ensureDir(this.dir);
    await writeFileAtomic(this.file, `${JSON.stringify(validated, null, 2)}\n`);
    this.config = validated;
    for (const listener of this.listeners) listener(validated);
    return validated;
  }

  /** Subscribe to config changes; returns an unsubscribe. */
  onChange(listener: SystemConfigListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
