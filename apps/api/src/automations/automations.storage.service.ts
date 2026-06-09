import { Inject, Injectable, type OnModuleInit } from "@nestjs/common"
import {
  AGENT_ID_REGEX,
  type Automation,
  AutomationSchema,
  type CreateAutomationInput,
  type UpdateAutomationInput,
} from "@zibby/contracts"
import { EntityFileStore, safeJson, searchByText } from "../shared/file-storage"

export const AUTOMATIONS_DIR = "AUTOMATIONS_DIR"

export class AutomationNotFoundError extends Error {
  constructor(public readonly id: string) {
    super(`Automation "${id}" not found`)
    this.name = "AutomationNotFoundError"
  }
}
export class AutomationConflictError extends Error {
  constructor(public readonly id: string) {
    super(`Automation "${id}" already exists`)
    this.name = "AutomationConflictError"
  }
}
export class InvalidAutomationIdError extends Error {
  constructor(public readonly id: string) {
    super(`Invalid automation id: "${id}"`)
    this.name = "InvalidAutomationIdError"
  }
}

/** Durable, file-backed persistence for automations — one `<id>.json` each. */
@Injectable()
export class AutomationsStorageService extends EntityFileStore<Automation> implements OnModuleInit {
  protected readonly fileExt = ".json"
  protected readonly idRegex = AGENT_ID_REGEX

  constructor(@Inject(AUTOMATIONS_DIR) dir: string) {
    super(dir)
  }

  async onModuleInit(): Promise<void> {
    await this.ensureDir()
  }

  async create(input: CreateAutomationInput): Promise<Automation> {
    const file = this.resolveFile(input.id)
    if (await this.fileExists(file)) throw new AutomationConflictError(input.id)
    const automation: Automation = { ...input }
    await this.writeEntity(automation)
    return automation
  }

  async update(id: string, patch: UpdateAutomationInput): Promise<Automation> {
    const existing = await this.get(id)
    const merged: Automation = { ...existing, ...patch, id: existing.id }
    await this.writeEntity(merged)
    return merged
  }

  /** Free-text search over automations by id and name. */
  async search(query: string): Promise<Automation[]> {
    return searchByText(await this.list(), query, (a) => [a.id, a.name])
  }

  /** Stamp the last-fired time (idempotence + display); separate from user updates. */
  async markFired(id: string, at: string): Promise<Automation> {
    const existing = await this.get(id)
    const merged: Automation = { ...existing, lastFiredAt: at }
    await this.writeEntity(merged)
    return merged
  }

  protected idOf(automation: Automation): string {
    return automation.id
  }

  protected serialize(automation: Automation): string {
    return JSON.stringify(automation)
  }

  protected tryParse(raw: string): Automation | null {
    const parsed = AutomationSchema.safeParse(safeJson(raw))
    return parsed.success ? parsed.data : null
  }

  protected compare(a: Automation, b: Automation): number {
    return a.id.localeCompare(b.id)
  }

  protected notFound(id: string): Error {
    return new AutomationNotFoundError(id)
  }

  protected invalidId(id: string): Error {
    return new InvalidAutomationIdError(id)
  }
}
