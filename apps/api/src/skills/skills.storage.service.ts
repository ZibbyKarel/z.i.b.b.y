import { Inject, Injectable, type OnModuleInit } from "@nestjs/common"
import {
  AGENT_ID_REGEX,
  type CreateSkillInput,
  RiskSchema,
  type Skill,
  SkillSchema,
  type UpdateSkillInput,
} from "@zibby/contracts"
import { MarkdownEntityStore } from "../shared/file-storage"
import {
  CorruptSkillFileError,
  InvalidSkillIdError,
  SkillConflictError,
  SkillNotFoundError,
} from "./skills.errors"

/** DI token carrying the absolute path of the directory that holds skill files. */
export const SKILLS_DIR = "SKILLS_DIR"

/**
 * File-backed persistence for skills: one Markdown `SKILL.md`-style file per
 * skill, named `<id>.md`, inside a configurable data directory. Same shape and
 * guarantees as {@link AgentsStorageService} — frontmatter (`name`, `glyph`,
 * `desc`) plus the `instructions` body — there is intentionally no database.
 */
@Injectable()
export class SkillsStorageService extends MarkdownEntityStore<Skill> implements OnModuleInit {
  protected readonly fileExt = ".md"
  protected readonly idRegex = AGENT_ID_REGEX

  constructor(@Inject(SKILLS_DIR) dir: string) {
    super(dir)
  }

  async onModuleInit(): Promise<void> {
    await this.ensureDir()
  }

  async create(input: CreateSkillInput): Promise<Skill> {
    const file = this.resolveFile(input.id)
    if (await this.fileExists(file)) {
      throw new SkillConflictError(input.id)
    }
    const skill: Skill = { ...input, name: input.name ?? input.id }
    await this.writeEntity(skill)
    return skill
  }

  async update(id: string, patch: UpdateSkillInput): Promise<Skill> {
    const existing = await this.get(id)
    const merged: Skill = { ...existing, ...patch, id: existing.id }
    await this.writeEntity(merged)
    return merged
  }

  protected idOf(skill: Skill): string {
    return skill.id
  }

  protected notFound(id: string): Error {
    return new SkillNotFoundError(id)
  }

  protected invalidId(id: string): Error {
    return new InvalidSkillIdError(id)
  }

  protected corruptError(id: string): Error {
    return new CorruptSkillFileError(id)
  }

  protected compare(a: Skill, b: Skill): number {
    return a.id.localeCompare(b.id)
  }

  protected bodyOf(skill: Skill): string {
    return skill.instructions
  }

  /**
   * Parse a Markdown skill file into a {@link Skill}. The id comes from the file
   * name; structured config from the frontmatter; instructions from the body.
   * Returns null only if structurally broken — a single out-of-range field is
   * dropped rather than discarding the whole skill.
   */
  protected fromFrontmatter(
    data: Record<string, unknown>,
    id: string,
    body: string,
  ): Skill | null {
    const candidate: Record<string, unknown> = { id, instructions: body }
    if (typeof data.name === "string") candidate.name = data.name
    if (typeof data.glyph === "string") candidate.glyph = data.glyph
    if (typeof data.desc === "string") candidate.desc = data.desc
    if (typeof data.requires_approval === "boolean") candidate.requires_approval = data.requires_approval
    if (RiskSchema.safeParse(data.risk).success) candidate.risk = data.risk

    const result = SkillSchema.safeParse(candidate)
    return result.success ? result.data : null
  }

  /** Serialize a skill's structured config to the YAML frontmatter object. */
  protected toFrontmatter(skill: Skill): Record<string, unknown> {
    const data: Record<string, unknown> = { name: skill.name ?? skill.id }
    if (skill.glyph !== undefined) data.glyph = skill.glyph
    if (skill.desc !== undefined) data.desc = skill.desc
    if (skill.requires_approval !== undefined) data.requires_approval = skill.requires_approval
    if (skill.risk !== undefined) data.risk = skill.risk
    return data
  }
}
