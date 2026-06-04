import { Inject, Injectable, type OnModuleInit } from "@nestjs/common"
import {
  AGENT_ID_REGEX,
  type Agent,
  AgentModelSchema,
  AgentSchema,
  AgentThinkingSchema,
  type CreateAgentInput,
  GateRuleInputSchema,
  RiskSchema,
  type UpdateAgentInput,
} from "@zibby/contracts"
import { MarkdownEntityStore } from "../shared/file-storage"
import {
  AgentConflictError,
  AgentNotFoundError,
  CorruptAgentFileError,
  InvalidAgentIdError,
} from "./agents.errors"

/** DI token carrying the absolute path of the directory that holds agent files. */
export const AGENTS_DIR = "AGENTS_DIR"

/**
 * File-backed persistence for agents: one Markdown file per agent, named
 * `<id>.md`, inside a configurable data directory. The file mirrors the
 * Claude skill/agent format — YAML frontmatter (`name`, `description`) plus the
 * `instructions` as the Markdown body. The file name (and frontmatter `name`) is
 * the agent's id. There is intentionally no database.
 */
@Injectable()
export class AgentsStorageService extends MarkdownEntityStore<Agent> implements OnModuleInit {
  protected readonly fileExt = ".md"
  protected readonly idRegex = AGENT_ID_REGEX

  constructor(@Inject(AGENTS_DIR) dir: string) {
    super(dir)
  }

  /** Ensure the data directory exists before the app starts serving traffic. */
  async onModuleInit(): Promise<void> {
    await this.ensureDir()
  }

  async create(input: CreateAgentInput): Promise<Agent> {
    const file = this.resolveFile(input.id)
    if (await this.fileExists(file)) {
      throw new AgentConflictError(input.id)
    }
    // `name` always lands in the frontmatter (defaulting to the id), so the
    // returned entity matches what a subsequent `get` parses back.
    const agent: Agent = { ...input, name: input.name ?? input.id }
    await this.writeEntity(agent)
    return agent
  }

  async update(id: string, patch: UpdateAgentInput): Promise<Agent> {
    const existing = await this.get(id)
    // Only overwrite fields that were actually provided; never touch the id
    // (the patch schema omits it, so the spread cannot clobber it).
    const merged: Agent = { ...existing, ...patch, id: existing.id }
    await this.writeEntity(merged)
    return merged
  }

  protected idOf(agent: Agent): string {
    return agent.id
  }

  protected notFound(id: string): Error {
    return new AgentNotFoundError(id)
  }

  protected invalidId(id: string): Error {
    return new InvalidAgentIdError(id)
  }

  protected corruptError(id: string): Error {
    return new CorruptAgentFileError(id)
  }

  protected compare(a: Agent, b: Agent): number {
    return a.id.localeCompare(b.id)
  }

  protected bodyOf(agent: Agent): string {
    return agent.instructions
  }

  /**
   * Parse a Markdown agent file into an {@link Agent}. The id comes from the file
   * name (the source of truth); the structured config comes from the frontmatter
   * and the instructions from the Markdown body. Returns null only if the file is
   * structurally broken (bad YAML, empty body) — a single out-of-range field
   * (e.g. a hand-edited `model: gpt-9`) is dropped rather than discarding the
   * whole agent, so one typo never makes an agent vanish from the catalog.
   */
  protected fromFrontmatter(
    data: Record<string, unknown>,
    id: string,
    body: string,
  ): Agent | null {
    const candidate: Record<string, unknown> = { id, instructions: body }
    if (typeof data.name === "string") candidate.name = data.name
    if (typeof data.description === "string") candidate.description = data.description
    if (typeof data.glyph === "string") candidate.glyph = data.glyph
    if (typeof data.category === "string") candidate.category = data.category
    if (Array.isArray(data.tools) && data.tools.every((t) => typeof t === "string")) {
      candidate.tools = data.tools
    }
    if (AgentModelSchema.safeParse(data.model).success) candidate.model = data.model
    if (AgentThinkingSchema.safeParse(data.thinking).success) candidate.thinking = data.thinking
    if (typeof data.requires_approval === "boolean") candidate.requires_approval = data.requires_approval
    if (RiskSchema.safeParse(data.risk).success) candidate.risk = data.risk
    // Drop the whole gates field if any rule is malformed (don't silently apply a
    // partially-parsed policy); a single bad rule shouldn't weaken the gate.
    const gates = GateRuleInputSchema.array().safeParse(data.gates)
    if (gates.success) candidate.gates = gates.data

    const result = AgentSchema.safeParse(candidate)
    return result.success ? result.data : null
  }

  /** Serialize an agent's structured config to the YAML frontmatter object. */
  protected toFrontmatter(agent: Agent): Record<string, unknown> {
    const data: Record<string, unknown> = { name: agent.name ?? agent.id }
    if (agent.description !== undefined) data.description = agent.description
    if (agent.glyph !== undefined) data.glyph = agent.glyph
    if (agent.model !== undefined) data.model = agent.model
    if (agent.thinking !== undefined) data.thinking = agent.thinking
    if (agent.tools !== undefined) data.tools = agent.tools
    if (agent.category !== undefined) data.category = agent.category
    if (agent.requires_approval !== undefined) data.requires_approval = agent.requires_approval
    if (agent.risk !== undefined) data.risk = agent.risk
    if (agent.gates !== undefined) data.gates = agent.gates
    return data
  }
}
