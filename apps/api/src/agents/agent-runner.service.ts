import { promises as fs } from "node:fs"
import * as path from "node:path"
import { Inject, Injectable, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common"
import type { Agent, AgentRun } from "@zibby/contracts"
import type { IntendedAction } from "@zibby/contracts"
import { AgentsStorageService } from "./agents.storage.service"
import { ApprovalsService } from "../approvals/approvals.service"
import { GateEvaluatorService } from "../gates/gate-evaluator.service"
import { LimitsService } from "../limits/limits.service"
import { ClaudeRunCommandService } from "../runner/claude-run-command.service"
import { RunnerCore } from "../runner/runner-core"
import { type AgentRunRecord, agentStrategy, toAgentRun } from "./agent-run.record"

/** DI token carrying the absolute path of the directory that holds run artifacts. */
export const RUNS_DIR = "RUNS_DIR"

// Re-exported so existing importers (the controller) keep their import path.
export { RunNotFoundError } from "../runner/runner-core"

/**
 * Spawns agents as child processes and tracks their runs durably. A thin wrapper
 * over the shared {@link RunnerCore}: this class owns the Nest DI surface and the
 * agent-specific command building and existence check, while spawn/log/sidecar/
 * restart machinery lives once in the core (shared with skills and pipeline
 * stages).
 *
 * Every run spawns a real `claude -p` session: the agent's instructions become the
 * system prompt, every agent+skill the delegatable catalog, and its `tools` the
 * permission scope (see {@link ClaudeRunCommandService}). The session runs from a
 * fresh per-run sandbox and is *granted* access to the directories it must operate
 * on (the run's `files`) via `--add-dir` — it is never spawned inside them.
 *
 * Mid-run approval gate (Variant B): a destructive Bash command trips a PreToolUse
 * hook that writes an `intent-request.json` into the sandbox and blocks; the core
 * watches for it and routes the action through {@link onIntent} (allow / ask / deny).
 */
@Injectable()
export class AgentRunnerService implements OnModuleInit, OnModuleDestroy {
  private readonly dir: string
  private readonly core: RunnerCore<AgentRunRecord>

  constructor(
    @Inject(RUNS_DIR) dir: string,
    private readonly agents: AgentsStorageService,
    private readonly approvals: ApprovalsService,
    private readonly gates: GateEvaluatorService,
    private readonly claude: ClaudeRunCommandService,
    private readonly limits: LimitsService,
  ) {
    this.dir = path.resolve(dir)
    // Layer 2: a usage-limit signal in a run's output busts the limits cache so the
    // next /api/limits read re-fetches the authoritative percentages.
    // Variant B: a mid-run `INTENT {json}` line routes through the gate evaluator.
    this.core = new RunnerCore(
      this.dir,
      agentStrategy,
      () => this.limits.noteLimitHit(),
      (runId, action) => this.onIntent(runId, action),
    )
  }

  /** Rebuild the registry from disk and register for approval decisions on agent runs. */
  async onModuleInit(): Promise<void> {
    this.approvals.register("agent", {
      resume: async (runId) => {
        await this.core.resume(runId)
      },
      cancel: (runId) => {
        this.core.cancel(runId)
      },
    })
    await this.core.init()
  }

  /** Kill any still-live children on shutdown so we don't leak zombies. */
  onModuleDestroy(): void {
    this.core.shutdown()
  }

  /**
   * Start a run of `agentId`. Verifies the agent exists (a missing/invalid id
   * surfaces as the storage layer's not-found error → 404), spawns the command in
   * a fresh per-run sandbox folder, and wires its output to a log file plus a
   * metadata sidecar.
   */
  async start(
    agentId: string,
    prompt: string,
    project: string,
    files: string[] = [],
  ): Promise<AgentRun> {
    // Throws AgentNotFoundError / InvalidAgentIdError when the agent is unknown.
    const agent = await this.agents.get(agentId)

    const startedMs = Date.now()
    // The per-run sandbox the session runs in (its cwd). The directories it
    // operates on are passed separately as `--add-dir` grants, never as the cwd.
    const cwd = path.join(this.dir, `${agentId}_${startedMs}`)
    const grantDirs = await this.resolveGrantDirs(files)
    const { command, args } = await this.buildCommand(agent, prompt, grantDirs)
    const spec = {
      kind: "agent" as const,
      ownerId: agentId,
      command,
      args,
      cwd,
      startedMs,
      extra: { agentId, prompt, project, files },
    }

    // Variant B: the run spawns immediately. Gating happens mid-run — when the
    // child announces an external-effect action via a `INTENT {json}` line, the
    // core routes it to {@link onIntent} below for evaluation.
    const rec = await this.core.start(spec)
    return toAgentRun(rec)
  }

  /**
   * Variant B mid-run gate. A live run announced an external-effect `action` and is
   * now blocking on its decision file. The core is entity-agnostic, so re-load the
   * agent from this run's id, evaluate the action against its rules (with legacy
   * `requires_approval` desugar) plus the locked floor, and steer the child:
   *
   * - `deny`   → write a deny decision; the child aborts → run `interrupted`.
   * - `ask`    → hold the run at `awaiting-approval` and raise an approval; the
   *              child keeps blocking until approve (resume → allow) or reject
   *              (cancel → deny).
   * - else     → write an allow decision; the child proceeds.
   *
   * Any failure (e.g. the agent was deleted mid-run) fails safe to a deny.
   */
  private async onIntent(runId: string, action: IntendedAction): Promise<void> {
    try {
      const rec = this.core.get(runId)
      const agent = await this.agents.get(rec.agentId)
      const rules = await this.gates.rulesForAgent({
        gates: agent.gates,
        requires_approval: agent.requires_approval,
      })
      const decision = this.gates.evaluate(rules, action).decision

      if (decision === "deny") {
        await this.core.denyIntent(runId)
        return
      }
      if (decision === "ask") {
        await this.core.holdForApproval(runId)
        await this.approvals.requestApproval({
          runId,
          kind: "agent",
          skill: agent.name ?? agent.id,
          action: action.action,
          // The action's own `context` (e.g. the Cleaner's deletion list, packed as
          // approval-enrichment JSON) is what the card should show; fall back to the
          // run's prompt when the action carried no detail of its own.
          detail: action.context ?? rec.prompt,
          risk: agent.risk ?? "medium",
        })
        return
      }
      // allow / notify: let the action proceed immediately.
      await this.core.allowIntent(runId)
    } catch {
      // Unknown agent / evaluation failure → fail safe: refuse the action.
      await this.core.denyIntent(runId).catch(() => {})
    }
  }

  /** Running runs, plus any finished within the retention window; newest first. */
  listRunning(): AgentRun[] {
    return this.core.list().map(toAgentRun)
  }

  /** The full run history (on disk + in memory), newest first; no age cutoff. */
  async listAll(): Promise<AgentRun[]> {
    return (await this.core.listAll()).map(toAgentRun)
  }

  get(runId: string): AgentRun {
    return toAgentRun(this.core.get(runId))
  }

  stop(runId: string): AgentRun {
    return toAgentRun(this.core.stop(runId))
  }

  /** Permanently delete a run and all its artifacts (sidecar, log, sandbox). */
  delete(runId: string): Promise<void> {
    return this.core.delete(runId)
  }

  readLog(runId: string, offset: number): Promise<{
    content: string
    nextOffset: number
    done: boolean
  }> {
    return this.core.readLog(runId, offset)
  }

  /**
   * Build the `claude -p` command for a run. The agent's instructions become the
   * session's system prompt and its `tools` the permission scope (see
   * {@link ClaudeRunCommandService}). `grantDirs` (the run's `files` that resolve
   * to directories) are surfaced both in the task text — so the model knows which
   * directory to act on — and as `--add-dir` access grants.
   */
  private buildCommand(
    agent: Agent,
    prompt: string,
    grantDirs: string[],
  ): Promise<{ command: string; args: string[] }> {
    const task = grantDirs.length
      ? `${prompt}\n\nOperate on this directory: ${grantDirs[0]}`.trim()
      : prompt
    return this.claude.buildClaudeCommand({
      instructions: agent.instructions,
      task,
      tools: agent.tools,
      model: agent.model,
      thinking: agent.thinking,
      grantDirs,
    })
  }

  /**
   * Resolve a run's `files` to the absolute directories the session should be
   * granted (`--add-dir`). Only **absolute** paths are accepted: a relative entry
   * is dropped, never resolved. Resolving a relative path here would root it
   * against the API process cwd (`apps/api`) — so a bare folder name like `test`
   * (all the browser folder picker can surface) would silently grant
   * `apps/api/test`, a real directory. For a delete-capable agent that is a
   * data-loss footgun, so the boundary refuses anything not already absolute.
   * Non-directory, missing, or relative entries are dropped — a run with no valid
   * directory simply gets no grant (the model then has nothing external to touch).
   */
  private async resolveGrantDirs(files: string[]): Promise<string[]> {
    const dirs: string[] = []
    for (const f of files) {
      if (!path.isAbsolute(f)) continue
      const abs = path.resolve(f)
      const stat = await fs.stat(abs).catch(() => null)
      if (stat?.isDirectory()) dirs.push(abs)
    }
    return dirs
  }
}
