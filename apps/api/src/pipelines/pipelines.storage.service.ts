import { randomBytes } from "node:crypto"
import { promises as fs } from "node:fs"
import * as path from "node:path"
import { Inject, Injectable, type OnModuleInit } from "@nestjs/common"
import {
  AGENT_ID_REGEX,
  type CreatePipelineInput,
  type Pipeline,
  PipelineSchema,
  type UpdatePipelineInput,
} from "@zibby/contracts"
import matter from "gray-matter"
import {
  CorruptPipelineFileError,
  InvalidPipelineError,
  InvalidPipelineIdError,
  PipelineConflictError,
  PipelineNotFoundError,
} from "./pipelines.errors"

/** DI token carrying the absolute path of the directory that holds pipeline files. */
export const PIPELINES_DIR = "PIPELINES_DIR"

const FILE_EXT = ".pipeline.md"

/**
 * File-backed persistence for pipelines: one `<id>.pipeline.md` per pipeline. The
 * frontmatter carries the structured config (`name`, `desc`, `budget`, `phases`)
 * and the Markdown body is `instructions`. Same guarantees as the agents/skills
 * stores — atomic writes, defense-in-depth id guards, tolerant listing — but the
 * `phases` array is validated by the contract schema (a malformed chain makes the
 * pipeline corrupt rather than silently dropping a stage).
 */
@Injectable()
export class PipelinesStorageService implements OnModuleInit {
  private readonly dir: string

  constructor(@Inject(PIPELINES_DIR) dir: string) {
    this.dir = path.resolve(dir)
  }

  async onModuleInit(): Promise<void> {
    await this.ensureDir()
  }

  async ensureDir(): Promise<void> {
    await fs.mkdir(this.dir, { recursive: true })
  }

  async create(input: CreatePipelineInput): Promise<Pipeline> {
    const file = this.resolveFile(input.id)
    if (await this.exists(file)) {
      throw new PipelineConflictError(input.id)
    }
    // The contract already validated loop targets; defensively re-validate so a
    // direct service caller can't persist a dangling back-edge.
    const parsed = PipelineSchema.safeParse({ ...input, name: input.name ?? input.id })
    if (!parsed.success) {
      throw new InvalidPipelineError(parsed.error.issues[0]?.message ?? "invalid pipeline")
    }
    await this.writeAtomic(file, parsed.data)
    return parsed.data
  }

  async get(id: string): Promise<Pipeline> {
    const file = this.resolveFile(id)
    const raw = await this.readRaw(file, id)
    return this.parse(raw, id)
  }

  async list(): Promise<Pipeline[]> {
    await this.ensureDir()
    const entries = await fs.readdir(this.dir)
    const pipelines: Pipeline[] = []
    for (const entry of entries) {
      if (!entry.endsWith(FILE_EXT)) continue
      const id = entry.slice(0, -FILE_EXT.length)
      const raw = await fs.readFile(path.join(this.dir, entry), "utf8").catch(() => null)
      if (raw === null) continue
      const parsed = this.tryParse(raw, id)
      if (parsed) pipelines.push(parsed)
    }
    return pipelines.sort((a, b) => a.id.localeCompare(b.id))
  }

  async update(id: string, patch: UpdatePipelineInput): Promise<Pipeline> {
    const file = this.resolveFile(id)
    const existing = await this.get(id)
    const candidate = { ...existing, ...patch, id: existing.id }
    const parsed = PipelineSchema.safeParse(candidate)
    if (!parsed.success) {
      throw new InvalidPipelineError(parsed.error.issues[0]?.message ?? "invalid pipeline")
    }
    await this.writeAtomic(file, parsed.data)
    return parsed.data
  }

  async delete(id: string): Promise<void> {
    const file = this.resolveFile(id)
    try {
      await fs.unlink(file)
    } catch (error) {
      if (isErrnoException(error) && error.code === "ENOENT") {
        throw new PipelineNotFoundError(id)
      }
      throw error
    }
  }

  private resolveFile(id: string): string {
    if (typeof id !== "string" || !AGENT_ID_REGEX.test(id)) {
      throw new InvalidPipelineIdError(id)
    }
    const file = path.resolve(this.dir, `${id}${FILE_EXT}`)
    if (path.dirname(file) !== this.dir) {
      throw new InvalidPipelineIdError(id)
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
        throw new PipelineNotFoundError(id)
      }
      throw error
    }
  }

  private parse(raw: string, id: string): Pipeline {
    const pipeline = this.tryParse(raw, id)
    if (!pipeline) throw new CorruptPipelineFileError(id)
    return pipeline
  }

  /**
   * Parse a `.pipeline.md` into a {@link Pipeline}. The id comes from the file
   * name; `phases` and the scalar config from frontmatter; `instructions` from the
   * body. Returns null if structurally broken (bad YAML, no valid phase chain).
   */
  private tryParse(raw: string, id: string): Pipeline | null {
    let parsed: matter.GrayMatterFile<string>
    try {
      parsed = matter(raw)
    } catch {
      return null
    }
    const data = parsed.data as Record<string, unknown>
    const candidate: Record<string, unknown> = {
      id,
      instructions: parsed.content.trim(),
      phases: data.phases,
    }
    if (typeof data.name === "string") candidate.name = data.name
    if (typeof data.desc === "string") candidate.desc = data.desc
    if (typeof data.budget === "number") candidate.budget = data.budget

    const result = PipelineSchema.safeParse(candidate)
    return result.success ? result.data : null
  }

  private serialize(pipeline: Pipeline): string {
    const data: Record<string, unknown> = {
      name: pipeline.name ?? pipeline.id,
      phases: pipeline.phases,
    }
    if (pipeline.desc !== undefined) data.desc = pipeline.desc
    if (pipeline.budget !== undefined) data.budget = pipeline.budget
    return matter.stringify(`\n${pipeline.instructions}\n`, data)
  }

  private async writeAtomic(file: string, pipeline: Pipeline): Promise<void> {
    await this.ensureDir()
    const tmp = `${file}.${randomBytes(6).toString("hex")}.tmp`
    await fs.writeFile(tmp, this.serialize(pipeline), "utf8")
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
