import { randomBytes } from "node:crypto"
import { promises as fs } from "node:fs"
import * as path from "node:path"
import { Inject, Injectable, type OnModuleInit } from "@nestjs/common"
import {
  AGENT_ID_REGEX,
  type CreateSkillInput,
  RiskSchema,
  type Skill,
  SkillSchema,
  type UpdateSkillInput,
} from "@zibby/contracts"
import matter from "gray-matter"
import {
  CorruptSkillFileError,
  InvalidSkillIdError,
  SkillConflictError,
  SkillNotFoundError,
} from "./skills.errors"

/** DI token carrying the absolute path of the directory that holds skill files. */
export const SKILLS_DIR = "SKILLS_DIR"

const FILE_EXT = ".md"

/**
 * File-backed persistence for skills: one Markdown `SKILL.md`-style file per
 * skill, named `<id>.md`, inside a configurable data directory. Same shape and
 * guarantees as {@link AgentsStorageService} — frontmatter (`name`, `glyph`,
 * `desc`) plus the `instructions` body — there is intentionally no database.
 */
@Injectable()
export class SkillsStorageService implements OnModuleInit {
  private readonly dir: string

  constructor(@Inject(SKILLS_DIR) dir: string) {
    this.dir = path.resolve(dir)
  }

  async onModuleInit(): Promise<void> {
    await this.ensureDir()
  }

  async ensureDir(): Promise<void> {
    await fs.mkdir(this.dir, { recursive: true })
  }

  async create(input: CreateSkillInput): Promise<Skill> {
    const file = this.resolveFile(input.id)
    if (await this.exists(file)) {
      throw new SkillConflictError(input.id)
    }
    const skill: Skill = { ...input, name: input.name ?? input.id }
    await this.writeAtomic(file, skill)
    return skill
  }

  async get(id: string): Promise<Skill> {
    const file = this.resolveFile(id)
    const raw = await this.readRaw(file, id)
    return this.parse(raw, id)
  }

  async list(): Promise<Skill[]> {
    await this.ensureDir()
    const entries = await fs.readdir(this.dir)
    const skills: Skill[] = []
    for (const entry of entries) {
      if (!entry.endsWith(FILE_EXT)) continue
      const id = path.basename(entry, FILE_EXT)
      const raw = await fs.readFile(path.join(this.dir, entry), "utf8").catch(() => null)
      if (raw === null) continue
      const parsed = this.tryParse(raw, id)
      // Skip corrupt files instead of failing the whole listing.
      if (parsed) skills.push(parsed)
    }
    return skills.sort((a, b) => a.id.localeCompare(b.id))
  }

  async update(id: string, patch: UpdateSkillInput): Promise<Skill> {
    const file = this.resolveFile(id)
    const existing = await this.get(id)
    const merged: Skill = { ...existing, ...patch, id: existing.id }
    await this.writeAtomic(file, merged)
    return merged
  }

  async delete(id: string): Promise<void> {
    const file = this.resolveFile(id)
    try {
      await fs.unlink(file)
    } catch (error) {
      if (isErrnoException(error) && error.code === "ENOENT") {
        throw new SkillNotFoundError(id)
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
      throw new InvalidSkillIdError(id)
    }
    const file = path.resolve(this.dir, `${id}${FILE_EXT}`)
    if (path.dirname(file) !== this.dir) {
      throw new InvalidSkillIdError(id)
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
        throw new SkillNotFoundError(id)
      }
      throw error
    }
  }

  private parse(raw: string, id: string): Skill {
    const skill = this.tryParse(raw, id)
    if (!skill) throw new CorruptSkillFileError(id)
    return skill
  }

  /**
   * Parse a Markdown skill file into a {@link Skill}. The id comes from the file
   * name; structured config from the frontmatter; instructions from the body.
   * Returns null only if structurally broken — a single out-of-range field is
   * dropped rather than discarding the whole skill.
   */
  private tryParse(raw: string, id: string): Skill | null {
    let parsed: matter.GrayMatterFile<string>
    try {
      parsed = matter(raw)
    } catch {
      return null
    }
    const data = parsed.data as Record<string, unknown>
    const candidate: Record<string, unknown> = { id, instructions: parsed.content.trim() }
    if (typeof data.name === "string") candidate.name = data.name
    if (typeof data.glyph === "string") candidate.glyph = data.glyph
    if (typeof data.desc === "string") candidate.desc = data.desc
    if (typeof data.requires_approval === "boolean") candidate.requires_approval = data.requires_approval
    if (RiskSchema.safeParse(data.risk).success) candidate.risk = data.risk

    const result = SkillSchema.safeParse(candidate)
    return result.success ? result.data : null
  }

  /** Serialize a skill to the Markdown-with-frontmatter format. */
  private serialize(skill: Skill): string {
    const data: Record<string, unknown> = { name: skill.name ?? skill.id }
    if (skill.glyph !== undefined) data.glyph = skill.glyph
    if (skill.desc !== undefined) data.desc = skill.desc
    if (skill.requires_approval !== undefined) data.requires_approval = skill.requires_approval
    if (skill.risk !== undefined) data.risk = skill.risk
    return matter.stringify(`\n${skill.instructions}\n`, data)
  }

  /** Write via a temp file + atomic rename so a crash can't leave a torn file. */
  private async writeAtomic(file: string, skill: Skill): Promise<void> {
    await this.ensureDir()
    const tmp = `${file}.${randomBytes(6).toString("hex")}.tmp`
    await fs.writeFile(tmp, this.serialize(skill), "utf8")
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
