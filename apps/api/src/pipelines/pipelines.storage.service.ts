import { Inject, Injectable, type OnModuleInit } from "@nestjs/common"
import {
  AGENT_ID_REGEX,
  type CreatePipelineInput,
  type Pipeline,
  PipelineSchema,
  type UpdatePipelineInput,
} from "@zibby/contracts"
import { MarkdownEntityStore } from "../shared/file-storage"
import {
  CorruptPipelineFileError,
  InvalidPipelineError,
  InvalidPipelineIdError,
  PipelineConflictError,
  PipelineNotFoundError,
} from "./pipelines.errors"

/** DI token carrying the absolute path of the directory that holds pipeline files. */
export const PIPELINES_DIR = "PIPELINES_DIR"

/**
 * File-backed persistence for pipelines: one `<id>.pipeline.md` per pipeline. The
 * frontmatter carries the structured config (`name`, `desc`, `phases`)
 * and the Markdown body is `instructions`. Same guarantees as the agents/skills
 * stores — atomic writes, defense-in-depth id guards, tolerant listing — but the
 * `phases` array is validated by the contract schema (a malformed chain makes the
 * pipeline corrupt rather than silently dropping a stage).
 */
@Injectable()
export class PipelinesStorageService extends MarkdownEntityStore<Pipeline> implements OnModuleInit {
  protected readonly fileExt = ".pipeline.md"
  protected readonly idRegex = AGENT_ID_REGEX

  constructor(@Inject(PIPELINES_DIR) dir: string) {
    super(dir)
  }

  async onModuleInit(): Promise<void> {
    await this.ensureDir()
  }

  async create(input: CreatePipelineInput): Promise<Pipeline> {
    const file = this.resolveFile(input.id)
    if (await this.fileExists(file)) {
      throw new PipelineConflictError(input.id)
    }
    // The contract already validated loop targets; defensively re-validate so a
    // direct service caller can't persist a dangling back-edge.
    const parsed = PipelineSchema.safeParse({ ...input, name: input.name ?? input.id })
    if (!parsed.success) {
      throw new InvalidPipelineError(parsed.error.issues[0]?.message ?? "invalid pipeline")
    }
    await this.writeEntity(parsed.data)
    return parsed.data
  }

  async update(id: string, patch: UpdatePipelineInput): Promise<Pipeline> {
    const existing = await this.get(id)
    const candidate = { ...existing, ...patch, id: existing.id }
    const parsed = PipelineSchema.safeParse(candidate)
    if (!parsed.success) {
      throw new InvalidPipelineError(parsed.error.issues[0]?.message ?? "invalid pipeline")
    }
    await this.writeEntity(parsed.data)
    return parsed.data
  }

  protected idOf(pipeline: Pipeline): string {
    return pipeline.id
  }

  protected notFound(id: string): Error {
    return new PipelineNotFoundError(id)
  }

  protected invalidId(id: string): Error {
    return new InvalidPipelineIdError(id)
  }

  protected corruptError(id: string): Error {
    return new CorruptPipelineFileError(id)
  }

  protected compare(a: Pipeline, b: Pipeline): number {
    return a.id.localeCompare(b.id)
  }

  protected bodyOf(pipeline: Pipeline): string {
    return pipeline.instructions
  }

  /**
   * Parse a `.pipeline.md` into a {@link Pipeline}. The id comes from the file
   * name; `phases` and the scalar config from frontmatter; `instructions` from the
   * body. Returns null if structurally broken (bad YAML, no valid phase chain).
   */
  protected fromFrontmatter(
    data: Record<string, unknown>,
    id: string,
    body: string,
  ): Pipeline | null {
    const candidate: Record<string, unknown> = {
      id,
      instructions: body,
      phases: data.phases,
    }
    if (typeof data.name === "string") candidate.name = data.name
    if (typeof data.desc === "string") candidate.desc = data.desc

    const result = PipelineSchema.safeParse(candidate)
    return result.success ? result.data : null
  }

  protected toFrontmatter(pipeline: Pipeline): Record<string, unknown> {
    const data: Record<string, unknown> = {
      name: pipeline.name ?? pipeline.id,
      phases: pipeline.phases,
    }
    if (pipeline.desc !== undefined) data.desc = pipeline.desc
    return data
  }
}
