import { Injectable } from "@nestjs/common"
import type { Agent, Skill } from "@zibby/contracts"
import { AgentsStorageService } from "../agents/agents.storage.service"
import { SkillsStorageService } from "../skills/skills.storage.service"
import { mapTools, toSubagentTools } from "./claude-tools"

/**
 * Inputs for one `claude -p` run, projected from the selected agent (or skill).
 * `instructions` is the entity's Markdown body — it becomes the session's real
 * system prompt (appended, so Claude Code's base prompt and the Agent tool stay
 * intact). `task` is the user's prompt, passed bare as the `-p` argument.
 */
export interface ClaudeRunOptions {
  instructions: string
  task: string
  tools?: readonly string[]
  model?: Agent["model"]
  thinking?: Agent["thinking"]
}

/** A single subagent in the `--agents` catalog JSON. */
interface CatalogEntry {
  description: string
  prompt: string
  tools?: string
  model?: string
}

/** Thinking budget → `--effort` level (1:1 today; kept as a seam for divergence). */
const THINKING_TO_EFFORT: Record<NonNullable<Agent["thinking"]>, string> = {
  low: "low",
  medium: "medium",
  high: "high",
}

/**
 * Builds the `claude -p` command for a run. The mechanism is flags-only — no
 * sandbox files: the selected entity's body goes in via `--append-system-prompt`,
 * the full agent+skill catalog via `--agents` JSON (each delegatable through the
 * Agent tool with its own prompt/tools/model), and permissions via
 * `--permission-mode dontAsk` + `--allowedTools` mapped from the entity's `tools`.
 * This runs under the Max subscription with no extra API/classifier cost.
 *
 * Args are built up-front and persisted in the run spec, so the approval→resume
 * path replays them unchanged — gated runs spawn with the same catalog.
 */
@Injectable()
export class ClaudeRunCommandService {
  constructor(
    private readonly agents: AgentsStorageService,
    private readonly skills: SkillsStorageService,
  ) {}

  async buildClaudeCommand(opts: ClaudeRunOptions): Promise<{ command: string; args: string[] }> {
    const { catalog, allowedTools } = await this.buildCatalog(opts.tools)
    const args = [
      "-p",
      opts.task,
      "--permission-mode",
      "dontAsk",
      "--allowedTools",
      ...allowedTools,
      "--append-system-prompt",
      opts.instructions,
      "--agents",
      JSON.stringify(catalog),
    ]
    if (opts.model) args.push("--model", opts.model)
    if (opts.thinking) {
      const effort = THINKING_TO_EFFORT[opts.thinking]
      if (effort) args.push("--effort", effort)
    }
    return { command: "claude", args }
  }

  /**
   * Every agent and skill as the delegatable subagent catalog, plus the session
   * `--allowedTools` allow-list. Agents win on an id collision (richer entry:
   * tools + model). Tolerant — a failed listing yields an empty catalog.
   *
   * `allowedTools` is the **union** of the primary's tools and every catalog
   * subagent's tools (+ `Agent`): under `dontAsk` the allow-list is session-wide,
   * so a delegated worker needs its tools on it or its calls are denied. The
   * union is the orchestration ceiling (bounded by what agents actually declare).
   */
  private async buildCatalog(
    primaryTools: readonly string[] | undefined,
  ): Promise<{ catalog: Record<string, CatalogEntry>; allowedTools: string[] }> {
    const [agents, skills] = await Promise.all([
      this.agents.list().catch((): Agent[] => []),
      this.skills.list().catch((): Skill[] => []),
    ])

    const allowed = new Set<string>(["Agent", ...mapTools(primaryTools)])
    const catalog: Record<string, CatalogEntry> = {}

    for (const agent of agents) {
      const tools = toSubagentTools(agent.tools)
      for (const t of mapTools(agent.tools)) allowed.add(t)
      catalog[agent.id] = {
        description: agent.description ?? agent.name ?? agent.id,
        prompt: agent.instructions,
        ...(tools ? { tools } : {}),
        ...(agent.model ? { model: agent.model } : {}),
      }
    }
    for (const skill of skills) {
      if (catalog[skill.id]) continue
      // Skills carry no structured tools — give them the conservative default.
      const tools = toSubagentTools(undefined)
      for (const t of mapTools(undefined)) allowed.add(t)
      catalog[skill.id] = {
        description: skill.desc ?? skill.name ?? skill.id,
        prompt: skill.instructions,
        ...(tools ? { tools } : {}),
      }
    }
    return { catalog, allowedTools: [...allowed] }
  }
}
