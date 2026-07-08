import { promises as fs } from "node:fs";
import * as path from "node:path";
import { Inject, Injectable, Logger } from "@nestjs/common";
import {
  AGENT_ID_REGEX,
  type CreatePipelineInput,
  type Pipeline,
  PipelineSchema,
  type UpdatePipelineInput,
} from "@zibby/contracts";
import matter from "gray-matter";
import { AvatarAssetStore, MarkdownEntityStore, writeFileAtomic } from "../shared/file-storage";
import {
  CorruptPipelineFileError,
  InvalidPipelineError,
  InvalidPipelineIdError,
  PipelineConflictError,
  PipelineNotFoundError,
} from "./pipelines.errors";

/** DI token carrying the absolute path of the directory that holds pipeline files. */
export const PIPELINES_DIR = "PIPELINES_DIR";

/**
 * File-backed persistence for pipelines: one `<id>.pipeline.md` per pipeline. The
 * frontmatter carries the structured config (`name`, `desc`, `phases`)
 * and the Markdown body is `instructions`. Same guarantees as the agents/skills
 * stores — atomic writes, defense-in-depth id guards, tolerant listing — but the
 * `phases` array is validated by the contract schema (a malformed chain makes the
 * pipeline corrupt rather than silently dropping a stage).
 */
@Injectable()
export class PipelinesStorageService extends MarkdownEntityStore<Pipeline> {
  protected readonly fileExt = ".pipeline.md";
  protected readonly idRegex = AGENT_ID_REGEX;

  private readonly logger = new Logger(PipelinesStorageService.name);
  /** Externalizes uploaded `data:image/*` avatars to `<dir>/assets/` (Phase 73). */
  private readonly avatarAssets: AvatarAssetStore;

  constructor(@Inject(PIPELINES_DIR) dir: string) {
    super(dir);
    this.avatarAssets = new AvatarAssetStore(dir);
  }

  /**
   * Ensure the data directory exists, then run a one-shot, idempotent sweep
   * (Phase 73) that externalizes any pre-existing inline `data:` avatar left
   * in a pipeline's raw frontmatter from before uploads were split into asset
   * files — a no-op once every pipeline has already been migrated.
   */
  async onModuleInit(): Promise<void> {
    await super.onModuleInit();
    await this.sweepInlineAvatars();
  }

  async create(input: CreatePipelineInput): Promise<Pipeline> {
    const file = this.resolveFile(input.id);
    if (await this.fileExists(file)) {
      throw new PipelineConflictError(input.id);
    }
    // The contract already validated loop targets; defensively re-validate so a
    // direct service caller can't persist a dangling back-edge.
    const parsed = PipelineSchema.safeParse({ ...input, name: input.name ?? input.id });
    if (!parsed.success) {
      throw new InvalidPipelineError(parsed.error.issues[0]?.message ?? "invalid pipeline");
    }
    await this.writeEntity(await this.toDiskEntity(parsed.data));
    return parsed.data;
  }

  async update(id: string, patch: UpdatePipelineInput): Promise<Pipeline> {
    const existing = await this.get(id);
    const candidate: Record<string, unknown> = { ...existing, ...patch, id: existing.id };
    // `avatar: null` is the explicit "clear" signal (undefined can't survive JSON
    // transport) — drop the key so the full-schema parse (string|absent) succeeds.
    if (patch.avatar === null) delete candidate.avatar;
    const parsed = PipelineSchema.safeParse(candidate);
    if (!parsed.success) {
      throw new InvalidPipelineError(parsed.error.issues[0]?.message ?? "invalid pipeline");
    }
    await this.writeEntity(await this.toDiskEntity(parsed.data));
    return parsed.data;
  }

  /** Removes the pipeline file and any avatar asset it owns. */
  async delete(id: string): Promise<void> {
    await super.delete(id);
    await this.avatarAssets.remove(id);
  }

  protected idOf(pipeline: Pipeline): string {
    return pipeline.id;
  }

  protected notFound(id: string): Error {
    return new PipelineNotFoundError(id);
  }

  protected invalidId(id: string): Error {
    return new InvalidPipelineIdError(id);
  }

  protected corruptError(id: string): Error {
    return new CorruptPipelineFileError(id);
  }

  protected compare(a: Pipeline, b: Pipeline): number {
    return a.id.localeCompare(b.id);
  }

  protected bodyOf(pipeline: Pipeline): string {
    return pipeline.instructions;
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
    };
    if (typeof data.name === "string") candidate.name = data.name;
    if (typeof data.desc === "string") candidate.desc = data.desc;
    if (typeof data.avatar === "string") {
      // An on-disk `assets/<id>.<ext>` reference (Phase 73) is inlined back to
      // the full data URI here, so the entity the caller sees is unchanged from
      // before externalization. A gone/unreadable asset omits `avatar` entirely
      // rather than surfacing a broken reference. A `/`-rooted bundled path or
      // an already-inline data URI (not yet swept) passes through unchanged.
      if (this.avatarAssets.isAssetRef(data.avatar)) {
        const inlined = this.avatarAssets.inlineSync(data.avatar);
        if (inlined !== null) candidate.avatar = inlined;
      } else {
        candidate.avatar = data.avatar;
      }
    }
    // Delivery sinks (default [] when absent, so older pipelines parse unchanged).
    if (data.outputs !== undefined) candidate.outputs = data.outputs;
    // Subsystem attribution (Phase 81) — absent stays absent, no phantom rewrite.
    if (typeof data.ownerSubsystem === "string") candidate.ownerSubsystem = data.ownerSubsystem;

    const result = PipelineSchema.safeParse(candidate);
    return result.success ? result.data : null;
  }

  protected toFrontmatter(pipeline: Pipeline): Record<string, unknown> {
    const data: Record<string, unknown> = {
      name: pipeline.name ?? pipeline.id,
      phases: pipeline.phases,
    };
    if (pipeline.desc !== undefined) data.desc = pipeline.desc;
    if (pipeline.avatar !== undefined) data.avatar = pipeline.avatar;
    if (pipeline.outputs.length > 0) data.outputs = pipeline.outputs;
    if (pipeline.ownerSubsystem !== undefined) data.ownerSubsystem = pipeline.ownerSubsystem;
    return data;
  }

  /**
   * Build the on-disk form of `pipeline`: if `avatar` is an uploaded
   * `data:image/` URI, externalize it to `assets/<id>.<ext>` and swap the
   * frontmatter value to that bare reference; otherwise (a `/`-rooted bundled
   * path, or none) leave the entity untouched, and drop any stale asset the
   * write is replacing (a clear or a switch to a bundled avatar). The entity
   * returned to the caller always keeps the full data URI — only this disk
   * copy differs.
   */
  private async toDiskEntity(pipeline: Pipeline): Promise<Pipeline> {
    if (typeof pipeline.avatar === "string") {
      const ref = await this.avatarAssets.externalize(pipeline.id, pipeline.avatar);
      if (ref !== null) return { ...pipeline, avatar: ref };
    }
    // Not a data URI (bundled `/avatars/*.png`) or no avatar at all — tolerant
    // no-op if there was nothing to clean up.
    await this.avatarAssets.remove(pipeline.id);
    return pipeline;
  }

  /**
   * Phase 73 migration: on startup, externalize any pre-existing inline
   * `data:` avatar left in a pipeline's *raw* frontmatter (read directly, not
   * via `fromFrontmatter`, so an already-externalized `assets/...` ref isn't
   * mistaken for one still needing migration). Idempotent and tolerant — a
   * single unreadable/corrupt file is logged and skipped, never fatal to boot.
   */
  private async sweepInlineAvatars(): Promise<void> {
    const entries = await fs.readdir(this.dir).catch(() => [] as string[]);
    for (const entry of entries) {
      if (!entry.endsWith(this.fileExt)) continue;
      const id = entry.slice(0, -this.fileExt.length);
      try {
        await this.externalizeInlineAvatarIfAny(id);
      } catch (error) {
        this.logger.warn(`Skipping inline-avatar sweep for pipeline "${id}": ${String(error)}`);
      }
    }
  }

  private async externalizeInlineAvatarIfAny(id: string): Promise<void> {
    const file = path.join(this.dir, `${id}${this.fileExt}`);
    const raw = await fs.readFile(file, "utf8");
    const parsed = matter(raw);
    const data = parsed.data as Record<string, unknown>;
    const avatar = data.avatar;
    if (typeof avatar !== "string" || !avatar.startsWith("data:")) return;
    const ref = await this.avatarAssets.externalize(id, avatar);
    if (ref === null) return;
    await writeFileAtomic(file, matter.stringify(parsed.content, { ...data, avatar: ref }));
  }
}
