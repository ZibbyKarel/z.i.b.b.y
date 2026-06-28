import { promises as fs } from "node:fs";
import { Inject, Injectable } from "@nestjs/common";
import {
  AGENT_ID_REGEX,
  type CreateIntegrationInput,
  type Integration,
  IntegrationSchema,
  type IntegrationStatus,
  type UpdateIntegrationInput,
} from "@zibby/contracts";
import {
  EntityFileStore,
  ensureDir,
  isErrnoException,
  resolveSafeFile,
  safeJson,
  writeFileAtomic,
} from "../shared/file-storage";

export const INTEGRATIONS_DIR = "INTEGRATIONS_DIR";
export const INTEGRATION_STATE_DIR = "INTEGRATION_STATE_DIR";

export class IntegrationNotFoundError extends Error {
  constructor(public readonly id: string) {
    super(`Integration "${id}" not found`);
    this.name = "IntegrationNotFoundError";
  }
}
export class IntegrationConflictError extends Error {
  constructor(public readonly id: string) {
    super(`Integration "${id}" already exists`);
    this.name = "IntegrationConflictError";
  }
}
export class InvalidIntegrationIdError extends Error {
  constructor(public readonly id: string) {
    super(`Invalid integration id: "${id}"`);
    this.name = "InvalidIntegrationIdError";
  }
}
/** Thrown when an update tries to change the immutable `kind` (→ 422). */
export class ImmutableKindError extends Error {
  constructor(public readonly id: string) {
    super(`Integration "${id}" kind is immutable`);
    this.name = "ImmutableKindError";
  }
}

/** Watcher-/test-stamped connection health, the markFired analogue for integrations. */
export interface SyncStamp {
  status: IntegrationStatus;
  lastSyncAt?: string;
  lastError?: string;
}

/**
 * Durable, file-backed persistence for integrations — one `<id>.json` each.
 *
 * The entity file holds only the versioned config (`id`/`kind`/`projectId`/
 * `name`/`enabled`/`config`). Two kinds of fields are intentionally kept OUT of it
 * so a watcher tick never churns a git-tracked file:
 *  - `status`/`lastSyncAt`/`lastError` — volatile connection health, stamped on
 *    every poll/test. Persisted to a separate, gitignored sidecar
 *    (`<stateDir>/<id>.json`) and re-attached at read time, the same way runs are
 *    kept out of version control. Schema defaults (`disconnected`/`undefined`)
 *    apply until the first stamp writes a sidecar.
 *  - `hasCredentials` — a read-time computation the controller layers on from the
 *    credentials store; stripped on serialize, defaulted on parse.
 */
@Injectable()
export class IntegrationsStorageService
  extends EntityFileStore<Integration>
 
{
  protected readonly fileExt = ".json";
  protected readonly idRegex = AGENT_ID_REGEX;
  private readonly stateDir: string;

  constructor(
    @Inject(INTEGRATIONS_DIR) dir: string,
    @Inject(INTEGRATION_STATE_DIR) stateDir: string,
  ) {
    super(dir);
    this.stateDir = stateDir;
  }

  async create(input: CreateIntegrationInput): Promise<Integration> {
    const file = this.resolveFile(input.id);
    if (await this.fileExists(file)) throw new IntegrationConflictError(input.id);
    const integration = IntegrationSchema.parse({ ...input });
    await this.writeEntity(integration);
    return integration;
  }

  async update(id: string, patch: UpdateIntegrationInput): Promise<Integration> {
    const existing = await this.get(id);
    const merged: Integration = {
      ...existing,
      ...patch,
      // Identity + kind are immutable; status fields are server-owned.
      id: existing.id,
      kind: existing.kind,
    };
    await this.writeEntity(merged);
    return merged;
  }

  /** Read an entity and re-attach its volatile sync state from the gitignored sidecar. */
  async get(id: string): Promise<Integration> {
    return this.withSyncState(await super.get(id));
  }

  /** List entities with each one's volatile sync state re-attached from its sidecar. */
  async list(): Promise<Integration[]> {
    const all = await super.list();
    return Promise.all(all.map((entity) => this.withSyncState(entity)));
  }

  /** Remove the entity file and its sync-state sidecar. */
  async delete(id: string): Promise<void> {
    await super.delete(id);
    await this.removeSyncState(id);
  }

  /** Stamp connection health (watcher poll result / connection test); separate from user updates. */
  async markSync(id: string, stamp: SyncStamp): Promise<Integration> {
    const existing = await this.get(id); // 404s before any side effect
    const next: SyncStamp = {
      status: stamp.status,
      lastSyncAt: stamp.lastSyncAt ?? existing.lastSyncAt,
      // An explicit undefined clears a prior error on a successful sync.
      lastError: "lastError" in stamp ? stamp.lastError : existing.lastError,
    };
    await this.writeSyncState(id, next);
    return { ...existing, ...next };
  }

  protected idOf(integration: Integration): string {
    return integration.id;
  }

  protected serialize(integration: Integration): string {
    // The entity file is config-only: `hasCredentials` is a read-time computation,
    // and status/lastSyncAt/lastError live in the gitignored sync-state sidecar.
    const persisted: Partial<Integration> = { ...integration };
    delete persisted.hasCredentials;
    delete persisted.status;
    delete persisted.lastSyncAt;
    delete persisted.lastError;
    return JSON.stringify(persisted);
  }

  // --- volatile sync-state sidecar (gitignored, never versioned) ---

  private syncStateFile(id: string): string {
    const file = resolveSafeFile(this.stateDir, id, ".json", this.idRegex);
    if (file === null) throw this.invalidId(id);
    return file;
  }

  /** Merge the persisted sync state onto a freshly parsed (config-only) entity. */
  private async withSyncState(entity: Integration): Promise<Integration> {
    const state = await this.readSyncState(entity.id);
    return state ? { ...entity, ...state } : entity;
  }

  private async readSyncState(id: string): Promise<SyncStamp | null> {
    try {
      const parsed = safeJson(await fs.readFile(this.syncStateFile(id), "utf8"));
      if (!parsed || typeof parsed !== "object") return null;
      const { status, lastSyncAt, lastError } = parsed as Partial<SyncStamp>;
      if (status === undefined) return null;
      return { status, lastSyncAt, lastError };
    } catch (error) {
      if (isErrnoException(error) && error.code === "ENOENT") return null;
      throw error;
    }
  }

  private async writeSyncState(id: string, stamp: SyncStamp): Promise<void> {
    await ensureDir(this.stateDir);
    await writeFileAtomic(this.syncStateFile(id), JSON.stringify(stamp));
  }

  private async removeSyncState(id: string): Promise<void> {
    try {
      await fs.unlink(this.syncStateFile(id));
    } catch (error) {
      if (!(isErrnoException(error) && error.code === "ENOENT")) throw error;
    }
  }

  protected tryParse(raw: string): Integration | null {
    return this.parseJson(IntegrationSchema, raw);
  }

  protected compare(a: Integration, b: Integration): number {
    return a.id.localeCompare(b.id);
  }

  protected notFound(id: string): Error {
    return new IntegrationNotFoundError(id);
  }

  protected invalidId(id: string): Error {
    return new InvalidIntegrationIdError(id);
  }
}
