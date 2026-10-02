import { promises as fs } from "node:fs";
import * as path from "node:path";
import { Inject, Injectable, Logger } from "@nestjs/common";
import {
  AGENT_ID_REGEX,
  type CreateWorkflowInput,
  type UpdateWorkflowInput,
  type Workflow,
  WorkflowSchema,
} from "@zibby/contracts";
import matter from "gray-matter";
import { AvatarAssetStore, MarkdownEntityStore, writeFileAtomic } from "../shared/file-storage";
import {
  CorruptWorkflowFileError,
  InvalidWorkflowError,
  InvalidWorkflowIdError,
  WorkflowConflictError,
  WorkflowNotFoundError,
} from "./workflows.errors";

/** DI token carrying the absolute path of the directory that holds workflow files. */
export const WORKFLOWS_DIR = "WORKFLOWS_DIR";

/**
 * File-backed persistence for workflows: one `<id>.workflow.md` per workflow. The
 * frontmatter carries the structured config (`name`, `desc`, `phases`)
 * and the Markdown body is `instructions`. Same guarantees as the agents/skills
 * stores — atomic writes, defense-in-depth id guards, tolerant listing — but the
 * `phases` array is validated by the contract schema (a malformed chain makes the
 * workflow corrupt rather than silently dropping a stage).
 */
@Injectable()
export class WorkflowsStorageService extends MarkdownEntityStore<Workflow> {
  protected readonly fileExt = ".workflow.md";
  protected readonly idRegex = AGENT_ID_REGEX;

  private readonly logger = new Logger(WorkflowsStorageService.name);
  /** Externalizes uploaded `data:image/*` avatars to `<dir>/assets/` (Phase 73). */
  private readonly avatarAssets: AvatarAssetStore;

  constructor(@Inject(WORKFLOWS_DIR) dir: string) {
    super(dir);
    this.avatarAssets = new AvatarAssetStore(dir);
  }

  /**
   * Ensure the data directory exists, then run a one-shot, idempotent sweep
   * (Phase 73) that externalizes any pre-existing inline `data:` avatar left
   * in a workflow's raw frontmatter from before uploads were split into asset
   * files — a no-op once every workflow has already been migrated.
   */
  async onModuleInit(): Promise<void> {
    await super.onModuleInit();
    await this.sweepInlineAvatars();
  }

  async create(input: CreateWorkflowInput): Promise<Workflow> {
    const file = this.resolveFile(input.id);
    if (await this.fileExists(file)) {
      throw new WorkflowConflictError(input.id);
    }
    // The contract already validated loop targets; defensively re-validate so a
    // direct service caller can't persist a dangling back-edge.
    const parsed = WorkflowSchema.safeParse({ ...input, name: input.name ?? input.id });
    if (!parsed.success) {
      throw new InvalidWorkflowError(parsed.error.issues[0]?.message ?? "invalid workflow");
    }
    await this.writeEntity(await this.toDiskEntity(parsed.data));
    return parsed.data;
  }

  async update(id: string, patch: UpdateWorkflowInput): Promise<Workflow> {
    const existing = await this.get(id);
    const candidate: Record<string, unknown> = { ...existing, ...patch, id: existing.id };
    // `avatar: null` is the explicit "clear" signal (undefined can't survive JSON
    // transport) — drop the key so the full-schema parse (string|absent) succeeds.
    if (patch.avatar === null) delete candidate.avatar;
    const parsed = WorkflowSchema.safeParse(candidate);
    if (!parsed.success) {
      throw new InvalidWorkflowError(parsed.error.issues[0]?.message ?? "invalid workflow");
    }
    await this.writeEntity(await this.toDiskEntity(parsed.data));
    return parsed.data;
  }

  /** Removes the workflow file and any avatar asset it owns. */
  async delete(id: string): Promise<void> {
    await super.delete(id);
    await this.avatarAssets.remove(id);
  }

  protected idOf(workflow: Workflow): string {
    return workflow.id;
  }

  protected notFound(id: string): Error {
    return new WorkflowNotFoundError(id);
  }

  protected invalidId(id: string): Error {
    return new InvalidWorkflowIdError(id);
  }

  protected corruptError(id: string): Error {
    return new CorruptWorkflowFileError(id);
  }

  protected compare(a: Workflow, b: Workflow): number {
    return a.id.localeCompare(b.id);
  }

  protected bodyOf(workflow: Workflow): string {
    return workflow.instructions;
  }

  /**
   * Parse a `.workflow.md` into a {@link Workflow}. The id comes from the file
   * name; `phases` and the scalar config from frontmatter; `instructions` from the
   * body. Returns null if structurally broken (bad YAML, no valid phase chain).
   */
  protected fromFrontmatter(
    data: Record<string, unknown>,
    id: string,
    body: string,
  ): Workflow | null {
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
    // Delivery sinks (default [] when absent, so older workflows parse unchanged).
    if (data.outputs !== undefined) candidate.outputs = data.outputs;
    // Department attribution (Phase 81) — absent stays absent, no phantom rewrite.
    if (typeof data.department === "string") candidate.department = data.department;
    // Ladder rung (NS2 F9). Absent falls through to the schema's `"standard"`
    // default, so pre-F9 workflows parse unchanged. This MUST be copied: the
    // schema defaulting the field means a missing copy here is silent — every
    // workflow would read as `"standard"` regardless of its frontmatter, and the
    // cheapest-first ordering the stage-2 fallback depends on would collapse to a
    // constant instead of failing loudly.
    if (typeof data.complexity === "string") candidate.complexity = data.complexity;
    // P1-03 per-run spend cap — absent stays absent (uncapped). A legacy bare number
    // (`budget: 25`, never read before P1-03) is ignored, not a reason to drop the file.
    if (typeof data.budget === "object" && data.budget !== null) candidate.budget = data.budget;
    if (typeof data.project === "string") candidate.project = data.project;

    const result = WorkflowSchema.safeParse(candidate);
    return result.success ? result.data : null;
  }

  protected toFrontmatter(workflow: Workflow): Record<string, unknown> {
    const data: Record<string, unknown> = {
      name: workflow.name ?? workflow.id,
      phases: workflow.phases,
    };
    if (workflow.desc !== undefined) data.desc = workflow.desc;
    if (workflow.avatar !== undefined) data.avatar = workflow.avatar;
    if (workflow.outputs.length > 0) data.outputs = workflow.outputs;
    if (workflow.department !== undefined) data.department = workflow.department;
    // Always written, unlike the optional fields above: `complexity` is schema-
    // defaulted, so it is never `undefined` on a parsed entity, and omitting it
    // here would silently strip the rung from disk on any update round-trip.
    data.complexity = workflow.complexity;
    if (workflow.budget !== undefined) data.budget = workflow.budget;
    if (workflow.project !== undefined) data.project = workflow.project;
    return data;
  }

  /**
   * Build the on-disk form of `workflow`: if `avatar` is an uploaded
   * `data:image/` URI, externalize it to `assets/<id>.<ext>` and swap the
   * frontmatter value to that bare reference; otherwise (a `/`-rooted bundled
   * path, or none) leave the entity untouched, and drop any stale asset the
   * write is replacing (a clear or a switch to a bundled avatar). The entity
   * returned to the caller always keeps the full data URI — only this disk
   * copy differs.
   */
  private async toDiskEntity(workflow: Workflow): Promise<Workflow> {
    if (typeof workflow.avatar === "string") {
      const ref = await this.avatarAssets.externalize(workflow.id, workflow.avatar);
      if (ref !== null) return { ...workflow, avatar: ref };
    }
    // Not a data URI (bundled `/avatars/*.png`) or no avatar at all — tolerant
    // no-op if there was nothing to clean up.
    await this.avatarAssets.remove(workflow.id);
    return workflow;
  }

  /**
   * Phase 73 migration: on startup, externalize any pre-existing inline
   * `data:` avatar left in a workflow's *raw* frontmatter (read directly, not
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
        this.logger.warn(`Skipping inline-avatar sweep for workflow "${id}": ${String(error)}`);
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
