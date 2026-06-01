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
import matter from "gray-matter"
import {
  AgentConflictError,
  AgentNotFoundError,
  CorruptAgentFileError,
  InvalidAgentIdError,
} from "./agents.errors"

/** DI token carrying the absolute path of the directory that holds agent files. */
export const AGENTS_DIR = "AGENTS_DIR"

const FILE_EXT = ".md"

/**
 * File-backed persistence for agents: one Markdown file per agent, named
 * `<id>.md`, inside a configurable data directory. The file mirrors the
 * Claude skill/agent format — YAML frontmatter (`name`, `description`) plus the
 * `instructions` as the Markdown body. The file name (and frontmatter `name`) is
 * the agent's id. There is intentionally no database.
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
    const agent: Agent = {
      id: input.id,
      ...(input.description !== undefined ? { description: input.description } : {}),
      instructions: input.instructions,
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
      if (!entry.endsWith(FILE_EXT)) continue
      const id = path.basename(entry, FILE_EXT)
      const raw = await fs.readFile(path.join(this.dir, entry), "utf8").catch(() => null)
      if (raw === null) continue
      const parsed = this.tryParse(raw, id)
      // Skip corrupt files instead of failing the whole listing.
      if (parsed) agents.push(parsed)
    }
    return agents.sort((a, b) => a.id.localeCompare(b.id))
  }

  async update(id: string, patch: UpdateAgentInput): Promise<Agent> {
    const file = this.resolveFile(id)
    const existing = await this.get(id)

    // Only overwrite fields that were actually provided; never touch the id.
    const merged: Agent = {
      ...existing,
      ...(patch.description !== undefined ? { description: patch.description } : {}),
      ...(patch.instructions !== undefined ? { instructions: patch.instructions } : {}),
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
    const file = path.resolve(this.dir, `${id}${FILE_EXT}`)
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
    const agent = this.tryParse(raw, id)
    if (!agent) throw new CorruptAgentFileError(id)
    return agent
  }

  /**
   * Parse a Markdown agent file into an {@link Agent}. The id comes from the file
   * name (the source of truth), the description from frontmatter, and the
   * instructions from the Markdown body. Returns null if the file is malformed.
   */
  private tryParse(raw: string, id: string): Agent | null {
    let parsed: matter.GrayMatterFile<string>
    try {
      parsed = matter(raw)
    } catch {
      return null
    }
    const data = parsed.data as Record<string, unknown>
    const candidate = {
      id,
      ...(typeof data.description === "string" ? { description: data.description } : {}),
      instructions: parsed.content.trim(),
    }
    const result = AgentSchema.safeParse(candidate)
    return result.success ? result.data : null
  }

  /** Serialize an agent to the Markdown-with-frontmatter format. */
  private serialize(agent: Agent): string {
    const data: Record<string, string> = { name: agent.id }
    if (agent.description !== undefined) data.description = agent.description
    // Blank line after the frontmatter (skill-file style); trailing newline at EOF.
    return matter.stringify(`\n${agent.instructions}\n`, data)
  }

  /** Write via a temp file + atomic rename so a crash can't leave a torn file. */
  private async writeAtomic(file: string, agent: Agent): Promise<void> {
    await this.ensureDir()
    const tmp = `${file}.${randomBytes(6).toString("hex")}.tmp`
    await fs.writeFile(tmp, this.serialize(agent), "utf8")
    try {
      await fs.rename(tmp, file)
    } catch (error) {
      await fs.rm(tmp, { force: true })
      throw error
    }
  }
}

function isErrnoException(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error
}
