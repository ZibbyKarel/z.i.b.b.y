import { promises as fs } from "node:fs";
import * as path from "node:path";
import { Inject, Injectable } from "@nestjs/common";
import {
  type CiStatus,
  type CiStatusQuery,
  CiStatusSchema,
  type MonitorEvent,
  MonitorEventSchema,
  type MonitorEventsQuery,
} from "@zibby/contracts";
import { EntityFileStore, resolveSafeFile, writeFileAtomic } from "../shared/file-storage";

export const MONITOR_EVENTS_DIR = "MONITOR_EVENTS_DIR";

/** Event ids are adapter-derived (`ci-<repo>-<runId>-<attempt>`). */
const EVENT_ID_REGEX = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/;

export class MonitorEventNotFoundError extends Error {
  constructor(public readonly id: string) {
    super(`Monitor event "${id}" not found`);
    this.name = "MonitorEventNotFoundError";
  }
}
export class InvalidMonitorEventIdError extends Error {
  constructor(public readonly id: string) {
    super(`Invalid monitor event id: "${id}"`);
    this.name = "InvalidMonitorEventIdError";
  }
}

/**
 * File-backed monitor events (N3) — one `<id>.json` per alert plus a cursor
 * sidecar per (integration, adapter kind) pair under `cursors/`. The
 * deterministic event id makes `putNew` a pure dedup check: a re-poll of the
 * same red run is a no-op, so the cursor can safely advance only after events
 * persist (crash → re-poll, replay-safe — the channel watcher's posture).
 */
@Injectable()
export class MonitorEventStore extends EntityFileStore<MonitorEvent> {
  protected readonly fileExt = ".json";
  protected readonly idRegex = EVENT_ID_REGEX;
  private readonly cursorsDir: string;
  private readonly statusDir: string;

  constructor(@Inject(MONITOR_EVENTS_DIR) dir: string) {
    super(dir);
    this.cursorsDir = path.join(path.resolve(dir), "cursors");
    this.statusDir = path.join(path.resolve(dir), "status");
  }

  protected idOf(event: MonitorEvent): string {
    return event.id;
  }

  protected serialize(event: MonitorEvent): string {
    return `${JSON.stringify(event, null, 2)}\n`;
  }

  protected tryParse(raw: string): MonitorEvent | null {
    return this.parseJson(MonitorEventSchema, raw);
  }

  protected compare(a: MonitorEvent, b: MonitorEvent): number {
    return b.occurredAt.localeCompare(a.occurredAt);
  }

  protected notFound(id: string): Error {
    return new MonitorEventNotFoundError(id);
  }

  protected invalidId(id: string): Error {
    return new InvalidMonitorEventIdError(id);
  }

  /** Persist a NEW event; an existing id is a dedup hit → returns null. */
  async putNew(event: MonitorEvent): Promise<MonitorEvent | null> {
    return this.createEntity(event.id, () => event);
  }

  /** Patch an event (state/taskId transitions) — read-merge-write. */
  async patch(id: string, patch: Partial<MonitorEvent>): Promise<MonitorEvent> {
    const existing = await this.get(id);
    const merged = { ...existing, ...patch, id: existing.id };
    await this.writeEntity(merged);
    return merged;
  }

  /** List newest-first, optionally filtered by project and/or state. */
  async listFiltered(query: MonitorEventsQuery = {}): Promise<MonitorEvent[]> {
    const all = await this.list();
    return all.filter(
      (e) =>
        (!query.projectId || e.projectId === query.projectId) &&
        (!query.state || e.state === query.state),
    );
  }

  /** The per-(integration, adapter) poll cursor — opaque to the store. */
  async readCursor(integrationId: string, adapterKind: string): Promise<string | undefined> {
    const file = this.cursorFile(integrationId, adapterKind);
    if (!file) return undefined;
    const raw = await fs.readFile(file, "utf8").catch(() => null);
    return raw?.trim() || undefined;
  }

  async writeCursor(
    integrationId: string,
    adapterKind: string,
    cursor: string | undefined,
  ): Promise<void> {
    const file = this.cursorFile(integrationId, adapterKind);
    if (!file || cursor === undefined) return;
    await fs.mkdir(this.cursorsDir, { recursive: true });
    await writeFileAtomic(file, cursor);
  }

  private cursorFile(integrationId: string, adapterKind: string): string | null {
    return resolveSafeFile(
      this.cursorsDir,
      `${integrationId}--${adapterKind}`,
      ".cursor",
      EVENT_ID_REGEX,
    );
  }

  /**
   * The last known CI status per (integration, adapter) — a sidecar the watcher
   * OVERWRITES every tick (N4b). State, not an event: no dedup, no history; the
   * newest snapshot is the whole truth and survives a restart.
   */
  async writeStatus(status: CiStatus): Promise<void> {
    const file = this.statusFile(status.integrationId, status.adapterKind);
    if (!file) return;
    await fs.mkdir(this.statusDir, { recursive: true });
    await writeFileAtomic(file, `${JSON.stringify(status, null, 2)}\n`);
  }

  /** All last-known statuses, optionally filtered by project; garbage skipped. */
  async listStatuses(query: CiStatusQuery = {}): Promise<CiStatus[]> {
    const names = await fs.readdir(this.statusDir).catch(() => [] as string[]);
    const statuses: CiStatus[] = [];
    for (const name of names) {
      if (!name.endsWith(".json")) continue;
      const raw = await fs.readFile(path.join(this.statusDir, name), "utf8").catch(() => null);
      if (raw === null) continue;
      const parsed = this.parseJson(CiStatusSchema, raw);
      if (parsed) statuses.push(parsed);
    }
    return statuses
      .filter((s) => !query.projectId || s.projectId === query.projectId)
      .sort((a, b) => a.integrationId.localeCompare(b.integrationId));
  }

  private statusFile(integrationId: string, adapterKind: string): string | null {
    return resolveSafeFile(
      this.statusDir,
      `${integrationId}--${adapterKind}`,
      ".json",
      EVENT_ID_REGEX,
    );
  }
}
