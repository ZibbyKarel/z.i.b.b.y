import { promises as fs } from "node:fs";
import * as path from "node:path";
import { Inject, Injectable, Logger } from "@nestjs/common";
import {
  AGENT_ID_REGEX,
  type Agent,
  AgentModelSchema,
  AgentSchema,
  AgentThinkingSchema,
  type CreateAgentInput,
  GateRuleInputSchema,
  RiskSchema,
  SubsystemIdSchema,
  type UpdateAgentInput,
} from "@zibby/contracts";
import matter from "gray-matter";
import {
  AvatarAssetStore,
  MarkdownEntityStore,
  searchByText,
  writeFileAtomic,
} from "../shared/file-storage";
import {
  AgentConflictError,
  AgentNotFoundError,
  CorruptAgentFileError,
  InvalidAgentIdError,
} from "./agents.errors";

/** DI token carrying the absolute path of the directory that holds agent files. */
export const AGENTS_DIR = "AGENTS_DIR";

/**
 * File-backed persistence for agents: one Markdown file per agent, named
 * `<id>.md`, inside a configurable data directory. The file mirrors the
 * Claude skill/agent format — YAML frontmatter (`name`, `description`) plus the
 * `instructions` as the Markdown body. The file name (and frontmatter `name`) is
 * the agent's id. There is intentionally no database.
 */
@Injectable()
export class AgentsStorageService extends MarkdownEntityStore<Agent> {
  protected readonly fileExt = ".md";
  protected readonly idRegex = AGENT_ID_REGEX;

  private readonly logger = new Logger(AgentsStorageService.name);
  /** Externalizes uploaded `data:image/*` avatars to `<dir>/assets/` (Phase 73). */
  private readonly avatarAssets: AvatarAssetStore;

  constructor(@Inject(AGENTS_DIR) dir: string) {
    super(dir);
    this.avatarAssets = new AvatarAssetStore(dir);
  }

  /**
   * Ensure the data directory exists, then run a one-shot, idempotent sweep
   * (Phase 73) that externalizes any pre-existing inline `data:` avatar left
   * in an agent's raw frontmatter from before uploads were split into asset
   * files — a no-op once every agent has already been migrated.
   */
  async onModuleInit(): Promise<void> {
    await super.onModuleInit();
    await this.sweepInlineAvatars();
  }

  async create(input: CreateAgentInput): Promise<Agent> {
    const file = this.resolveFile(input.id);
    if (await this.fileExists(file)) {
      throw new AgentConflictError(input.id);
    }
    // `name` always lands in the frontmatter (defaulting to the id), so the
    // returned entity matches what a subsequent `get` parses back.
    const agent: Agent = { ...input, name: input.name ?? input.id };
    await this.writeEntity(await this.toDiskEntity(agent));
    return agent;
  }

  /** Free-text search over the catalog by id, name, description and category. */
  async search(query: string): Promise<Agent[]> {
    return searchByText(await this.list(), query, (a) => [a.id, a.name, a.description, a.category]);
  }

  /**
   * Phase 4c (Agent Factory): the catalog minus any `status: "proposed"` candidate
   * — the dispatchable set. Consumers that treat the registry as a routing/catalog
   * source (the task classifier, the delegation catalog) read this instead of
   * {@link list}; the raw `list()` stays unfiltered so the UI can still show a
   * proposed agent awaiting its `agent-proposal` approval.
   */
  async listActive(): Promise<Agent[]> {
    return (await this.list()).filter((a) => a.status !== "proposed");
  }

  async update(id: string, patch: UpdateAgentInput): Promise<Agent> {
    const existing = await this.get(id);
    // Only overwrite fields that were actually provided; never touch the id
    // (the patch schema omits it, so the spread cannot clobber it).
    const merged: Record<string, unknown> = { ...existing, ...patch, id: existing.id };
    // `avatar: null` is the explicit "clear" signal (undefined can't survive JSON
    // transport) — drop the key so the full-entity parse below sees it as absent.
    if (patch.avatar === null) delete merged.avatar;
    const parsed = AgentSchema.parse(merged);
    await this.writeEntity(await this.toDiskEntity(parsed));
    return parsed;
  }

  /** Removes the agent file and any avatar asset it owns. */
  async delete(id: string): Promise<void> {
    await super.delete(id);
    await this.avatarAssets.remove(id);
  }

  protected idOf(agent: Agent): string {
    return agent.id;
  }

  protected notFound(id: string): Error {
    return new AgentNotFoundError(id);
  }

  protected invalidId(id: string): Error {
    return new InvalidAgentIdError(id);
  }

  protected corruptError(id: string): Error {
    return new CorruptAgentFileError(id);
  }

  protected compare(a: Agent, b: Agent): number {
    return a.id.localeCompare(b.id);
  }

  protected bodyOf(agent: Agent): string {
    return agent.instructions;
  }

  /**
   * Parse a Markdown agent file into an {@link Agent}. The id comes from the file
   * name (the source of truth); the structured config comes from the frontmatter
   * and the instructions from the Markdown body. Returns null only if the file is
   * structurally broken (bad YAML, empty body) — a single out-of-range field
   * (e.g. a hand-edited `model: gpt-9`) is dropped rather than discarding the
   * whole agent, so one typo never makes an agent vanish from the catalog.
   */
  protected fromFrontmatter(data: Record<string, unknown>, id: string, body: string): Agent | null {
    const candidate: Record<string, unknown> = { id, instructions: body };
    if (typeof data.name === "string") candidate.name = data.name;
    if (typeof data.description === "string") candidate.description = data.description;
    if (typeof data.glyph === "string") candidate.glyph = data.glyph;
    if (typeof data.avatar === "string") {
      // An on-disk `assets/<id>.<ext>` reference (Phase 73) is inlined back to
      // the full data URI here, so the entity the caller sees is unchanged
      // from before externalization. A gone/unreadable asset omits `avatar`
      // entirely rather than surfacing a broken reference (the UI falls back
      // to the glyph). A `/`-rooted bundled path or an already-inline data URI
      // (not yet swept — see `sweepInlineAvatars`) passes through unchanged.
      if (this.avatarAssets.isAssetRef(data.avatar)) {
        const inlined = this.avatarAssets.inlineSync(data.avatar);
        if (inlined !== null) candidate.avatar = inlined;
      } else {
        candidate.avatar = data.avatar;
      }
    }
    if (typeof data.category === "string") candidate.category = data.category;
    // `tools` is normally a YAML list, but some files write it inline as a
    // comma/space-separated string (e.g. `tools: Read, Grep, Glob`). Accept both
    // so the allow-list isn't silently dropped under `claude -p`'s `dontAsk`.
    if (Array.isArray(data.tools) && data.tools.every((t) => typeof t === "string")) {
      candidate.tools = data.tools;
    } else if (typeof data.tools === "string") {
      const tools = data.tools
        .split(/[,\s]+/)
        .map((t) => t.trim())
        .filter((t) => t.length > 0);
      if (tools.length > 0) candidate.tools = tools;
    }
    if (AgentModelSchema.safeParse(data.model).success) candidate.model = data.model;
    if (AgentThinkingSchema.safeParse(data.thinking).success) candidate.thinking = data.thinking;
    if (typeof data.requires_approval === "boolean")
      candidate.requires_approval = data.requires_approval;
    if (RiskSchema.safeParse(data.risk).success) candidate.risk = data.risk;
    // Drop the whole gates field if any rule is malformed (don't silently apply a
    // partially-parsed policy); a single bad rule shouldn't weaken the gate.
    const gates = GateRuleInputSchema.array().safeParse(data.gates);
    if (gates.success) candidate.gates = gates.data;
    if (data.status === "proposed" || data.status === "active") candidate.status = data.status;
    if (SubsystemIdSchema.safeParse(data.ownerSubsystem).success)
      candidate.ownerSubsystem = data.ownerSubsystem;

    const result = AgentSchema.safeParse(candidate);
    return result.success ? result.data : null;
  }

  /** Serialize an agent's structured config to the YAML frontmatter object. */
  protected toFrontmatter(agent: Agent): Record<string, unknown> {
    const data: Record<string, unknown> = { name: agent.name ?? agent.id };
    if (agent.description !== undefined) data.description = agent.description;
    if (agent.glyph !== undefined) data.glyph = agent.glyph;
    if (agent.avatar !== undefined) data.avatar = agent.avatar;
    if (agent.model !== undefined) data.model = agent.model;
    if (agent.thinking !== undefined) data.thinking = agent.thinking;
    if (agent.tools !== undefined) data.tools = agent.tools;
    if (agent.category !== undefined) data.category = agent.category;
    if (agent.requires_approval !== undefined) data.requires_approval = agent.requires_approval;
    if (agent.risk !== undefined) data.risk = agent.risk;
    if (agent.gates !== undefined) data.gates = agent.gates;
    if (agent.status !== undefined) data.status = agent.status;
    if (agent.ownerSubsystem !== undefined) data.ownerSubsystem = agent.ownerSubsystem;
    return data;
  }

  /**
   * Build the on-disk form of `agent`: if `avatar` is an uploaded `data:image/`
   * URI, externalize it to `assets/<id>.<ext>` and swap the frontmatter value
   * to that bare reference; otherwise (a `/`-rooted bundled path, or none)
   * leave the entity untouched, and drop any stale asset the write is
   * replacing (a clear or a switch to a bundled avatar). The entity returned
   * to the caller always keeps the full data URI — only this disk copy differs.
   */
  private async toDiskEntity(agent: Agent): Promise<Agent> {
    if (typeof agent.avatar === "string") {
      const ref = await this.avatarAssets.externalize(agent.id, agent.avatar);
      if (ref !== null) return { ...agent, avatar: ref };
    }
    // Not a data URI (bundled `/avatars/*.png`) or no avatar at all — tolerant
    // no-op if there was nothing to clean up.
    await this.avatarAssets.remove(agent.id);
    return agent;
  }

  /**
   * Phase 73 migration: on startup, externalize any pre-existing inline
   * `data:` avatar left in an agent's *raw* frontmatter (read directly, not
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
        this.logger.warn(`Skipping inline-avatar sweep for agent "${id}": ${String(error)}`);
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
