import { Inject, Injectable, type OnModuleInit } from "@nestjs/common"
import {
  AGENT_ID_REGEX,
  type CreateIntegrationInput,
  type Integration,
  IntegrationSchema,
  type IntegrationStatus,
  type UpdateIntegrationInput,
} from "@zibby/contracts"
import { EntityFileStore, safeJson } from "../shared/file-storage"

export const INTEGRATIONS_DIR = "INTEGRATIONS_DIR"

export class IntegrationNotFoundError extends Error {
  constructor(public readonly id: string) {
    super(`Integration "${id}" not found`)
    this.name = "IntegrationNotFoundError"
  }
}
export class IntegrationConflictError extends Error {
  constructor(public readonly id: string) {
    super(`Integration "${id}" already exists`)
    this.name = "IntegrationConflictError"
  }
}
export class InvalidIntegrationIdError extends Error {
  constructor(public readonly id: string) {
    super(`Invalid integration id: "${id}"`)
    this.name = "InvalidIntegrationIdError"
  }
}
/** Thrown when an update tries to change the immutable `kind` (→ 422). */
export class ImmutableKindError extends Error {
  constructor(public readonly id: string) {
    super(`Integration "${id}" kind is immutable`)
    this.name = "ImmutableKindError"
  }
}

/** Watcher-/test-stamped connection health, the markFired analogue for integrations. */
export interface SyncStamp {
  status: IntegrationStatus
  lastSyncAt?: string
  lastError?: string
}

/**
 * Durable, file-backed persistence for integrations — one `<id>.json` each.
 * `status`/`lastSyncAt`/`lastError` ARE persisted (stamped by the watcher /
 * connection test, like an automation's `lastFiredAt`). `hasCredentials` is
 * intentionally NOT persisted — it's a read-time computation the controller layers
 * on from the credentials store — so it's stripped on serialize and defaulted on
 * parse (the schema default is `false`).
 */
@Injectable()
export class IntegrationsStorageService
  extends EntityFileStore<Integration>
  implements OnModuleInit
{
  protected readonly fileExt = ".json"
  protected readonly idRegex = AGENT_ID_REGEX

  constructor(@Inject(INTEGRATIONS_DIR) dir: string) {
    super(dir)
  }

  async onModuleInit(): Promise<void> {
    await this.ensureDir()
  }

  async create(input: CreateIntegrationInput): Promise<Integration> {
    const file = this.resolveFile(input.id)
    if (await this.fileExists(file)) throw new IntegrationConflictError(input.id)
    const integration = IntegrationSchema.parse({ ...input })
    await this.writeEntity(integration)
    return integration
  }

  async update(id: string, patch: UpdateIntegrationInput): Promise<Integration> {
    const existing = await this.get(id)
    const merged: Integration = {
      ...existing,
      ...patch,
      // Identity + kind are immutable; status fields are server-owned.
      id: existing.id,
      kind: existing.kind,
    }
    await this.writeEntity(merged)
    return merged
  }

  /** Stamp connection health (watcher poll result / connection test); separate from user updates. */
  async markSync(id: string, stamp: SyncStamp): Promise<Integration> {
    const existing = await this.get(id)
    const merged: Integration = {
      ...existing,
      status: stamp.status,
      lastSyncAt: stamp.lastSyncAt ?? existing.lastSyncAt,
      // An explicit undefined clears a prior error on a successful sync.
      lastError: "lastError" in stamp ? stamp.lastError : existing.lastError,
    }
    await this.writeEntity(merged)
    return merged
  }

  protected idOf(integration: Integration): string {
    return integration.id
  }

  protected serialize(integration: Integration): string {
    // `hasCredentials` is computed at read time — never persist it.
    const persisted: Partial<Integration> = { ...integration }
    delete persisted.hasCredentials
    return JSON.stringify(persisted)
  }

  protected tryParse(raw: string): Integration | null {
    const parsed = IntegrationSchema.safeParse(safeJson(raw))
    return parsed.success ? parsed.data : null
  }

  protected compare(a: Integration, b: Integration): number {
    return a.id.localeCompare(b.id)
  }

  protected notFound(id: string): Error {
    return new IntegrationNotFoundError(id)
  }

  protected invalidId(id: string): Error {
    return new InvalidIntegrationIdError(id)
  }
}
