import { promises as fs } from "node:fs";
import * as path from "node:path";
import { Inject, Injectable, Logger } from "@nestjs/common";
import {
  AGENT_ID_REGEX,
  type CreateSkillInput,
  type ExternalSkillRecord,
  RiskSchema,
  type Skill,
  SkillSchema,
  type UpdateSkillInput,
} from "@zibby/contracts";
import {
  EXTERNAL_SKILLS_DIR,
  ExternalSkillsStore,
  externalSkillDir,
} from "../external-skills/external-skills.store";
import { parseSkillMd } from "../external-skills/skill-repo";
import { MarkdownEntityStore, searchByText } from "../shared/file-storage";
import {
  CorruptSkillFileError,
  InvalidSkillIdError,
  ReadOnlySkillError,
  SkillConflictError,
  SkillNotFoundError,
} from "./skills.errors";

/** DI token carrying the absolute path of the directory that holds skill files. */
export const SKILLS_DIR = "SKILLS_DIR";

/**
 * File-backed persistence for skills: one Markdown `SKILL.md`-style file per
 * skill, named `<id>.md`, inside a configurable data directory. Same shape and
 * guarantees as {@link AgentsStorageService} — frontmatter (`name`, `glyph`,
 * `desc`) plus the `instructions` body — there is intentionally no database.
 *
 * `list`/`get` also return the skills installed from GitHub repos
 * (`ExternalSkillsStore` + `<EXTERNAL_SKILLS_DIR>/<id>/SKILL.md`), carrying
 * `source`; those are read-only here (`ReadOnlySkillError`).
 */
@Injectable()
export class SkillsStorageService extends MarkdownEntityStore<Skill> {
  protected readonly fileExt = ".md";
  protected readonly idRegex = AGENT_ID_REGEX;

  private readonly logger = new Logger(SkillsStorageService.name);

  constructor(
    @Inject(SKILLS_DIR) dir: string,
    private readonly externals: ExternalSkillsStore,
    @Inject(EXTERNAL_SKILLS_DIR) private readonly externalDir: string,
  ) {
    super(dir);
  }

  override async list(): Promise<Skill[]> {
    const own = await super.list();
    const ownIds = new Set(own.map((s) => s.id));
    const external = await Promise.all(
      (await this.externals.list())
        .filter((r) => !ownIds.has(r.id))
        .map((r) => this.readExternal(r)),
    );
    return [...own, ...external.filter((s): s is Skill => s !== null)].sort((a, b) =>
      this.compare(a, b),
    );
  }

  override async get(id: string): Promise<Skill> {
    try {
      return await super.get(id);
    } catch (error) {
      if (!(error instanceof SkillNotFoundError)) throw error;
      const record = await this.externals.get(id);
      const skill = record ? await this.readExternal(record) : null;
      if (!skill) throw error;
      return skill;
    }
  }

  override async delete(id: string): Promise<void> {
    await this.assertWritable(id);
    await super.delete(id);
  }

  async create(input: CreateSkillInput): Promise<Skill> {
    const file = this.resolveFile(input.id);
    if ((await this.fileExists(file)) || (await this.externals.get(input.id))) {
      throw new SkillConflictError(input.id);
    }
    const skill: Skill = { ...input, name: input.name ?? input.id };
    await this.writeEntity(skill);
    return skill;
  }

  /** Free-text search over the catalog by id, name, desc and category. */
  async search(query: string): Promise<Skill[]> {
    return searchByText(await this.list(), query, (s) => [s.id, s.name, s.desc, s.category]);
  }

  async update(id: string, patch: UpdateSkillInput): Promise<Skill> {
    await this.assertWritable(id);
    const existing = await this.get(id);
    const merged: Skill = { ...existing, ...patch, id: existing.id };
    await this.writeEntity(merged);
    return merged;
  }

  private async assertWritable(id: string): Promise<void> {
    if (await this.externals.get(id)) throw new ReadOnlySkillError(id);
  }

  /** An installed external skill, or null (logged) when its folder is broken. */
  private async readExternal(record: ExternalSkillRecord): Promise<Skill | null> {
    const { id, ...source } = record;
    try {
      const file = path.join(externalSkillDir(id, this.externalDir), "SKILL.md");
      // parseSkillMd keeps gray-matter's js engine disabled — repo content is untrusted.
      const { name, desc, instructions } = parseSkillMd(await fs.readFile(file, "utf8"), id);
      const result = SkillSchema.safeParse({ id, name, desc, instructions, source });
      if (result.success) return result.data;
      this.logger.warn(`External skill "${id}" is invalid: ${result.error.message}`);
    } catch (error) {
      this.logger.warn(`External skill "${id}" is unreadable: ${(error as Error).message}`);
    }
    return null;
  }

  protected idOf(skill: Skill): string {
    return skill.id;
  }

  protected notFound(id: string): Error {
    return new SkillNotFoundError(id);
  }

  protected invalidId(id: string): Error {
    return new InvalidSkillIdError(id);
  }

  protected corruptError(id: string): Error {
    return new CorruptSkillFileError(id);
  }

  protected compare(a: Skill, b: Skill): number {
    return a.id.localeCompare(b.id);
  }

  protected bodyOf(skill: Skill): string {
    return skill.instructions;
  }

  /**
   * Parse a Markdown skill file into a {@link Skill}. The id comes from the file
   * name; structured config from the frontmatter; instructions from the body.
   * Returns null only if structurally broken — a single out-of-range field is
   * dropped rather than discarding the whole skill.
   */
  protected fromFrontmatter(data: Record<string, unknown>, id: string, body: string): Skill | null {
    const candidate: Record<string, unknown> = { id, instructions: body };
    if (typeof data.name === "string") candidate.name = data.name;
    if (typeof data.glyph === "string") candidate.glyph = data.glyph;
    if (typeof data.desc === "string") candidate.desc = data.desc;
    if (typeof data.category === "string") candidate.category = data.category;
    if (typeof data.requires_approval === "boolean")
      candidate.requires_approval = data.requires_approval;
    if (RiskSchema.safeParse(data.risk).success) candidate.risk = data.risk;

    const result = SkillSchema.safeParse(candidate);
    return result.success ? result.data : null;
  }

  /** Serialize a skill's structured config to the YAML frontmatter object. */
  protected toFrontmatter(skill: Skill): Record<string, unknown> {
    const data: Record<string, unknown> = { name: skill.name ?? skill.id };
    if (skill.glyph !== undefined) data.glyph = skill.glyph;
    if (skill.desc !== undefined) data.desc = skill.desc;
    if (skill.category !== undefined) data.category = skill.category;
    if (skill.requires_approval !== undefined) data.requires_approval = skill.requires_approval;
    if (skill.risk !== undefined) data.risk = skill.risk;
    return data;
  }
}
