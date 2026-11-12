import { randomBytes } from "node:crypto";
import { EventEmitter } from "node:events";
import { promises as fs } from "node:fs";
import * as path from "node:path";
import { Inject, Injectable } from "@nestjs/common";
import {
  AUTOMATION_FIRES_KEEP,
  type AutomationFire,
  AutomationFireSchema,
  type RunLogChunk,
} from "@zibby/contracts";
import { ensureDir, safeJson, writeFileAtomic } from "../shared/file-storage/file-utils";

/** DI token for the fire-history dir (`.zibby/data/automation-fires`). */
export const AUTOMATION_FIRES_DIR = "AUTOMATION_FIRES_DIR";

/** Allowed shape of both automation and fire ids before any path join (no traversal). */
const SAFE_ID = /^[A-Za-z0-9_-]+$/;

export class AutomationFireNotFoundError extends Error {
  constructor(automationId: string, fireId: string) {
    super(`Automation fire not found: ${automationId}/${fireId}`);
    this.name = "AutomationFireNotFoundError";
  }
}

export interface AutomationFireChange {
  automationId: string;
  fireId: string;
  status: AutomationFire["status"];
}

export interface AutomationFireFinish {
  status: "done" | "error";
  result?: string;
  error?: string;
  runRef?: string;
}

/**
 * Per-fire history of every automation (cron, manual, signal): one
 * `<automationId>/<fireId>.json` record + a plain-text `<fireId>.log` beside it.
 * Files are the source of truth; the emitters only nudge live streams.
 * Keeps the newest {@link AUTOMATION_FIRES_KEEP} fires per automation.
 */
@Injectable()
export class AutomationFiresStore {
  private readonly dir: string;
  private readonly events = new EventEmitter().setMaxListeners(0);

  constructor(@Inject(AUTOMATION_FIRES_DIR) dir: string) {
    this.dir = path.resolve(dir);
  }

  async begin(
    automationId: string,
    source: AutomationFire["source"],
    now: Date = new Date(),
  ): Promise<AutomationFire> {
    const folder = this.folder(automationId);
    if (!folder) throw new AutomationFireNotFoundError(automationId, "");
    const fire: AutomationFire = {
      id: `fire_${now.getTime()}_${randomBytes(3).toString("hex")}`,
      automationId,
      source,
      startedAt: now.toISOString(),
      status: "running",
    };
    await ensureDir(folder);
    await writeFileAtomic(path.join(folder, `${fire.id}.json`), JSON.stringify(fire, null, 2));
    await fs.writeFile(path.join(folder, `${fire.id}.log`), "");
    await this.prune(folder);
    this.emitChange(fire);
    return fire;
  }

  async appendLog(automationId: string, fireId: string, line: string): Promise<void> {
    const files = this.files(automationId, fireId);
    if (!files) throw new AutomationFireNotFoundError(automationId, fireId);
    await fs.appendFile(files.log, `${line}\n`);
    this.events.emit(`log:${fireId}`);
  }

  async finish(
    automationId: string,
    fireId: string,
    patch: AutomationFireFinish,
    now: Date = new Date(),
  ): Promise<AutomationFire> {
    const fire = await this.read(automationId, fireId);
    const files = this.files(automationId, fireId);
    if (!fire || !files) throw new AutomationFireNotFoundError(automationId, fireId);
    const done: AutomationFire = {
      ...fire,
      ...patch,
      finishedAt: now.toISOString(),
      durationMs: Math.max(0, now.getTime() - Date.parse(fire.startedAt)),
    };
    await writeFileAtomic(files.json, JSON.stringify(done, null, 2));
    this.emitChange(done);
    // A log tail parked on "no new bytes" must re-read to see `done`.
    this.events.emit(`log:${fireId}`);
    return done;
  }

  /** Newest `startedAt` first; unreadable/corrupt records are skipped. */
  async list(automationId: string): Promise<AutomationFire[]> {
    const folder = this.folder(automationId);
    if (!folder) return [];
    const fires = await Promise.all(
      (await this.recordIds(folder)).map((id) => this.read(automationId, id)),
    );
    return fires
      .filter((f): f is AutomationFire => f !== undefined)
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  }

  async latest(automationId: string): Promise<AutomationFire | undefined> {
    return (await this.list(automationId))[0];
  }

  async readLog(automationId: string, fireId: string, offset: number): Promise<RunLogChunk> {
    const fire = await this.read(automationId, fireId);
    const files = this.files(automationId, fireId);
    if (!fire || !files) throw new AutomationFireNotFoundError(automationId, fireId);
    let buf: Buffer;
    try {
      buf = await fs.readFile(files.log);
    } catch {
      throw new AutomationFireNotFoundError(automationId, fireId);
    }
    const start = Math.min(offset, buf.length);
    return {
      content: buf.subarray(start).toString("utf8"),
      nextOffset: buf.length,
      done: fire.status !== "running",
    };
  }

  onChange(listener: (e: AutomationFireChange) => void): () => void {
    this.events.on("change", listener);
    return () => this.events.off("change", listener);
  }

  onLogAppend(fireId: string, listener: () => void): () => void {
    this.events.on(`log:${fireId}`, listener);
    return () => this.events.off(`log:${fireId}`, listener);
  }

  private emitChange(fire: AutomationFire): void {
    this.events.emit("change", {
      automationId: fire.automationId,
      fireId: fire.id,
      status: fire.status,
    } satisfies AutomationFireChange);
  }

  private folder(automationId: string): string | null {
    return SAFE_ID.test(automationId) ? path.join(this.dir, automationId) : null;
  }

  private files(automationId: string, fireId: string): { json: string; log: string } | null {
    const folder = this.folder(automationId);
    if (!folder || !SAFE_ID.test(fireId)) return null;
    return { json: path.join(folder, `${fireId}.json`), log: path.join(folder, `${fireId}.log`) };
  }

  private async read(automationId: string, fireId: string): Promise<AutomationFire | undefined> {
    const files = this.files(automationId, fireId);
    if (!files) return undefined;
    const raw = await fs.readFile(files.json, "utf8").catch(() => null);
    const parsed = raw === null ? null : AutomationFireSchema.safeParse(safeJson(raw));
    return parsed?.success ? parsed.data : undefined;
  }

  private async recordIds(folder: string): Promise<string[]> {
    const names = await fs.readdir(folder).catch(() => []);
    return names.filter((n) => n.endsWith(".json")).map((n) => n.slice(0, -".json".length));
  }

  /**
   * Drop the oldest record+log pairs beyond the keep limit. Ordered by the epoch-ms
   * embedded in the id (`fire_<ms>_<hex>`), so a corrupt record is pruned too.
   */
  private async prune(folder: string): Promise<void> {
    const epoch = (id: string) => Number(id.split("_")[1]) || 0;
    const stale = (await this.recordIds(folder))
      .sort((a, b) => epoch(b) - epoch(a))
      .slice(AUTOMATION_FIRES_KEEP);
    await Promise.all(
      stale.flatMap((id) => [
        fs.rm(path.join(folder, `${id}.json`), { force: true }),
        fs.rm(path.join(folder, `${id}.log`), { force: true }),
      ]),
    );
  }
}
