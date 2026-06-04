import { randomBytes } from "node:crypto"
import { promises as fs } from "node:fs"
import * as path from "node:path"
import { Inject, Injectable, type OnModuleInit } from "@nestjs/common"
import {
  AGENT_ID_REGEX,
  type Automation,
  AutomationSchema,
  type CreateAutomationInput,
  type UpdateAutomationInput,
} from "@zibby/contracts"

export const AUTOMATIONS_DIR = "AUTOMATIONS_DIR"

const FILE_EXT = ".json"

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
export class AutomationsStorageService implements OnModuleInit {
  private readonly dir: string

  constructor(@Inject(AUTOMATIONS_DIR) dir: string) {
    this.dir = path.resolve(dir)
  }

  async onModuleInit(): Promise<void> {
    await fs.mkdir(this.dir, { recursive: true })
  }

  async create(input: CreateAutomationInput): Promise<Automation> {
    const file = this.resolveFile(input.id)
    if (await this.exists(file)) throw new AutomationConflictError(input.id)
    const automation: Automation = { ...input }
    await this.writeAtomic(automation)
    return automation
  }

  async get(id: string): Promise<Automation> {
    const file = this.resolveFile(id)
    const raw = await fs.readFile(file, "utf8").catch((error: unknown) => {
      if (isErrno(error) && error.code === "ENOENT") throw new AutomationNotFoundError(id)
      throw error
    })
    const parsed = AutomationSchema.safeParse(safeJson(raw))
    if (!parsed.success) throw new AutomationNotFoundError(id)
    return parsed.data
  }

  async list(): Promise<Automation[]> {
    await fs.mkdir(this.dir, { recursive: true })
    const entries = await fs.readdir(this.dir).catch(() => [] as string[])
    const out: Automation[] = []
    for (const entry of entries) {
      if (!entry.endsWith(FILE_EXT)) continue
      const raw = await fs.readFile(path.join(this.dir, entry), "utf8").catch(() => null)
      if (raw === null) continue
      const parsed = AutomationSchema.safeParse(safeJson(raw))
      if (parsed.success) out.push(parsed.data)
    }
    return out.sort((a, b) => a.id.localeCompare(b.id))
  }

  async update(id: string, patch: UpdateAutomationInput): Promise<Automation> {
    const existing = await this.get(id)
    const merged: Automation = { ...existing, ...patch, id: existing.id }
    await this.writeAtomic(merged)
    return merged
  }

  /** Stamp the last-fired time (idempotence + display); separate from user updates. */
  async markFired(id: string, at: string): Promise<Automation> {
    const existing = await this.get(id)
    const merged: Automation = { ...existing, lastFiredAt: at }
    await this.writeAtomic(merged)
    return merged
  }

  async delete(id: string): Promise<void> {
    const file = this.resolveFile(id)
    try {
      await fs.unlink(file)
    } catch (error) {
      if (isErrno(error) && error.code === "ENOENT") throw new AutomationNotFoundError(id)
      throw error
    }
  }

  private resolveFile(id: string): string {
    if (typeof id !== "string" || !AGENT_ID_REGEX.test(id)) throw new InvalidAutomationIdError(id)
    const file = path.resolve(this.dir, `${id}${FILE_EXT}`)
    if (path.dirname(file) !== this.dir) throw new InvalidAutomationIdError(id)
    return file
  }

  private async exists(file: string): Promise<boolean> {
    return fs
      .access(file)
      .then(() => true)
      .catch(() => false)
  }

  private async writeAtomic(automation: Automation): Promise<void> {
    await fs.mkdir(this.dir, { recursive: true })
    const file = this.resolveFile(automation.id)
    const tmp = `${file}.${randomBytes(6).toString("hex")}.tmp`
    await fs.writeFile(tmp, JSON.stringify(automation), "utf8")
    try {
      await fs.rename(tmp, file)
    } catch (error) {
      await fs.rm(tmp, { force: true })
      throw error
    }
  }
}

function safeJson(raw: string): unknown {
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}
function isErrno(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error
}
