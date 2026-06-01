import { randomBytes } from "node:crypto"
import { promises as fs } from "node:fs"
import * as path from "node:path"
import { Inject, Injectable, type OnModuleInit } from "@nestjs/common"
import {
  AGENT_ID_REGEX,
  type Agent,
  AgentSchema,
  type CreateAgentInput,
  type UpdateAgentInput,
} from "@zibby/contracts"
import {
  AgentConflictError,
  AgentNotFoundError,
  CorruptAgentFileError,
  InvalidAgentIdError,
} from "./agents.errors"

/** DI token carrying the absolute path of the directory that holds agent files. */
export const AGENTS_DIR = "AGENTS_DIR"

/**
 * File-backed persistence for agents: one JSON file per agent, named `<id>.json`,
 * inside a configurable data directory. There is intentionally no database — an
 * agent is just a stored file (richer behaviour will be layered on later).
 */
@Injectable()
export class AgentsStorageService implements OnModuleInit {
  private readonly dir: string

  constructor(@Inject(AGENTS_DIR) dir: string) {
    this.dir = path.resolve(dir)
  }

  /** Ensure the data directory exists before the app starts serving traffic. */
  async onModuleInit(): Promise<void> {
    await this.ensureDir()
  }

  async ensureDir(): Promise<void> {
    await fs.mkdir(this.dir, { recursive: true })
  }

  async create(input: CreateAgentInput): Promise<Agent> {
    const file = this.resolveFile(input.id)
    if (await this.exists(file)) {
      throw new AgentConflictError(input.id)
    }
    const now = new Date().toISOString()
    const agent: Agent = {
      id: input.id,
      name: input.name,
      ...(input.description !== undefined ? { description: input.description } : {}),
      instructions: input.instructions,
      createdAt: now,
      updatedAt: now,
    }
    await this.writeAtomic(file, agent)
    return agent
  }

  async get(id: string): Promise<Agent> {
    const file = this.resolveFile(id)
    const raw = await this.readRaw(file, id)
    return this.parse(raw, id)
  }

  async list(): Promise<Agent[]> {
    await this.ensureDir()
    const entries = await fs.readdir(this.dir)
    const agents: Agent[] = []
    for (const entry of entries) {
      if (!entry.endsWith(".json")) continue
      const raw = await fs.readFile(path.join(this.dir, entry), "utf8").catch(() => null)
      if (raw === null) continue
      const parsed = this.tryParse(raw)
      // Skip corrupt files instead of failing the whole listing.
      if (parsed) agents.push(parsed)
    }
    return agents.sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  }

  async update(id: string, patch: UpdateAgentInput): Promise<Agent> {
    const file = this.resolveFile(id)
    const existing = await this.get(id)

    // Only overwrite fields that were actually provided; never touch id/createdAt.
    const merged: Agent = {
      ...existing,
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.description !== undefined ? { description: patch.description } : {}),
      ...(patch.instructions !== undefined ? { instructions: patch.instructions } : {}),
      updatedAt: this.nextTimestamp(existing.updatedAt),
    }
    await this.writeAtomic(file, merged)
    return merged
  }

  async delete(id: string): Promise<void> {
    const file = this.resolveFile(id)
    try {
      await fs.unlink(file)
    } catch (error) {
      if (isErrnoException(error) && error.code === "ENOENT") {
        throw new AgentNotFoundError(id)
      }
      throw error
    }
  }

  /**
   * Map an id to an absolute file path *inside* the data directory, rejecting any
   * id that could escape it. Two independent guards: the shared contract regex
   * (no separators / traversal) and a resolved-path containment check.
   */
  private resolveFile(id: string): string {
    if (typeof id !== "string" || !AGENT_ID_REGEX.test(id)) {
      throw new InvalidAgentIdError(id)
    }
    const file = path.resolve(this.dir, `${id}.json`)
    if (path.dirname(file) !== this.dir) {
      throw new InvalidAgentIdError(id)
    }
    return file
  }

  private async exists(file: string): Promise<boolean> {
    try {
      await fs.access(file)
      return true
    } catch {
      return false
    }
  }

  private async readRaw(file: string, id: string): Promise<string> {
    try {
      return await fs.readFile(file, "utf8")
    } catch (error) {
      if (isErrnoException(error) && error.code === "ENOENT") {
        throw new AgentNotFoundError(id)
      }
      throw error
    }
  }

  private parse(raw: string, id: string): Agent {
    const agent = this.tryParse(raw)
    if (!agent) throw new CorruptAgentFileError(id)
    return agent
  }

  private tryParse(raw: string): Agent | null {
    let json: unknown
    try {
      json = JSON.parse(raw)
    } catch {
      return null
    }
    const result = AgentSchema.safeParse(json)
    return result.success ? result.data : null
  }

  /** Write via a temp file + atomic rename so a crash can't leave a torn file. */
  private async writeAtomic(file: string, agent: Agent): Promise<void> {
    await this.ensureDir()
    const tmp = `${file}.${randomBytes(6).toString("hex")}.tmp`
    await fs.writeFile(tmp, JSON.stringify(agent, null, 2), "utf8")
    try {
      await fs.rename(tmp, file)
    } catch (error) {
      await fs.rm(tmp, { force: true })
      throw error
    }
  }

  /** Guarantee a strictly newer `updatedAt`, even on sub-millisecond updates. */
  private nextTimestamp(previous: string): string {
    const now = new Date()
    const prev = Date.parse(previous)
    if (!Number.isNaN(prev) && now.getTime() <= prev) {
      return new Date(prev + 1).toISOString()
    }
    return now.toISOString()
  }
}

function isErrnoException(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error
}
