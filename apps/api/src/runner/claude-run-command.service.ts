import * as path from "node:path"
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
  /**
   * Absolute directories the session may operate on beyond its sandbox cwd
   * (`--add-dir`). The agent runs *from* its per-run sandbox and is *granted*
   * access to these — e.g. the Cleaner's directory-to-clean. So coordination
   * artifacts stay in the sandbox and the target only receives the real effect.
   */
  grantDirs?: readonly string[]
}

/** Absolute path of the PreToolUse approval hook, resolved next to this module. */
const APPROVAL_HOOK = path.resolve(__dirname, "claude-approval-hook.mjs")

/**
 * Operating contract prepended to every run's system prompt. Runs are headless
 * `claude -p` sessions: single-turn, with stdin ignored. There is no human at a
 * terminal, so a question printed to chat ("Approve? yes/no") receives no reply —
 * the turn just ends and the process exits `done` having done nothing. This is the
 * exact failure mode where an agent prints a deletion plan, asks for confirmation,
 * and terminates before its approval gate ever engages.
 *
 * Consent is NOT obtained in chat: the platform intercepts destructive commands
 * (the rm family, `find … -delete`, `git clean`) via a PreToolUse hook BEFORE they
 * run, surfaces an approval card to the human, and blocks the command until they
 * approve or reject — out of band from this session. So the correct behaviour is to
 * EXECUTE the action (run the `rm`); the gate handles human consent. Asking first
 * defeats it. Prepended (not appended) so it frames the agent's own body, and
 * separated by a rule the body can't easily override.
 */
export const OPERATING_CONTRACT = [
  "## Execution environment (read first)",
  "",
  "You run non-interactively (`claude -p`): a single turn, no interactive human, stdin closed.",
  "Anything you print as a question gets NO reply — your turn simply ends and the run stops.",
  "",
  "- NEVER ask for confirmation or print a \"yes/no\" prompt and wait. It is a dead end.",
  "- To delete, overwrite, or otherwise act with an external effect, just RUN the command.",
  "- The platform intercepts destructive commands before they execute, shows the human an",
  "  approval card, and pauses until they approve or reject. Consent happens there, not in chat.",
  "- So: act directly. Do not describe a plan and stop — carry it out; the gate handles approval.",
  "",
  "---",
  "",
].join("\n")

/** Prefix an agent/skill body with the operating contract that frames every run. */
function withOperatingContract(instructions: string): string {
  return `${OPERATING_CONTRACT}${instructions}`
}

/**
 * Settings JSON registering the approval hook on every Bash tool call. The hook
 * gates only destructive commands (it self-filters and otherwise allows), so
 * attaching it unconditionally is cheap. `command` is shell-quoted so a node or
 * hook path with spaces still resolves.
 */
function approvalSettings(): string {
  const command = `${JSON.stringify(process.execPath)} ${JSON.stringify(APPROVAL_HOOK)}`
  return JSON.stringify({
    hooks: {
      PreToolUse: [{ matcher: "Bash", hooks: [{ type: "command", command, timeout: 600 }] }],
    },
  })
}

/** A single subagent in the `--agents` catalog JSON. */
interface CatalogEntry {
  description: string
  prompt: string
  tools?: string
  model?: string
}

/**
 * Kickoff prompt used when a run is launched with a blank task. `claude --print`
 * rejects an empty prompt ("Input must be provided …"), and a run started from the
 * UI may carry no prompt at all (the agent's body in `--append-system-prompt`
 * already says what to do, so the user prompt is optional). A minimal kickoff lets
 * the session start; the system prompt drives it from there.
 */
const KICKOFF_FALLBACK = "Begin."

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
      opts.task.trim() ? opts.task : KICKOFF_FALLBACK,
      "--permission-mode",
      "dontAsk",
      "--allowedTools",
      ...allowedTools,
      "--append-system-prompt",
      withOperatingContract(opts.instructions),
      "--agents",
      JSON.stringify(catalog),
      // Mid-run approval gate: a PreToolUse hook intercepts destructive Bash and
      // blocks on a decision RunnerCore writes (see claude-approval-hook.mjs).
      "--settings",
      approvalSettings(),
    ]
    // Grant access to dirs outside the sandbox (e.g. the Cleaner's target).
    for (const dir of opts.grantDirs ?? []) args.push("--add-dir", dir)
    if (opts.model) args.push("--model", opts.model)
    if (opts.thinking) {
      const effort = THINKING_TO_EFFORT[opts.thinking]
      if (effort) args.push("--effort", effort)
    }
    // `CLAUDE_BIN` is a test seam (point it at a stub binary); production runs the
    // real `claude` CLI. The command/args are always the real claude shape.
    return { command: process.env.CLAUDE_BIN ?? "claude", args }
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
