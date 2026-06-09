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
 * Demo mode: every run executes the bundled token-free `demo-task.mjs` (it does
 * not interpret the agent's `instructions`). Set `AGENT_RUNNER_MODE=claude` to
 * spawn a real `claude -p` session instead — the agent's instructions become the
 * system prompt, every agent+skill the delegatable catalog, and its `tools` the
 * permission scope (see {@link ClaudeRunCommandService}). Off by default so the
 * test agent never burns tokens.
 */
@Injectable()
export class AgentRunnerService implements OnModuleInit, OnModuleDestroy {
  private readonly dir: string
  private readonly core: RunnerCore<AgentRunRecord>

  /**
   * Agents backed by a bundled, deterministic task script keyed by id. These run
   * their `.mjs` in **every** mode — including claude mode — because the script is
   * the demo: the Cleaner's `cleaner-task.mjs` drives the Variant B approval gate
   * (it emits `INTENT {action:"delete"}` and blocks for a decision), which a real
   * `claude -p … --permission-mode dontAsk` session would bypass entirely.
   */
  private static readonly REAL_TASK_SCRIPTS: Record<string, string> = {
    cleaner: "cleaner-task.mjs",
  }

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
    // The sandbox the task runs in (and writes its file into). Named without the
    // pid since we need it before spawning; the run id below carries the pid.
    const cwd = path.join(this.dir, `${agentId}_${startedMs}`)
    const { command, args } = await this.buildCommand(agent, prompt, cwd)
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
   * Build the command for a run. Demo by default; `claude -p` when opted in.
   * In claude mode the agent's instructions become the session's system prompt
   * and its `tools` the permission scope — see {@link ClaudeRunCommandService}.
   */
  private async buildCommand(
    agent: Agent,
    task: string,
    cwd: string,
  ): Promise<{ command: string; args: string[] }> {
    // Real-task agents (the Cleaner) always run their bundled script — see
    // REAL_TASK_SCRIPTS. Only the remaining agents honour claude mode.
    const isRealTask = agent.id in AgentRunnerService.REAL_TASK_SCRIPTS
    if (process.env.AGENT_RUNNER_MODE === "claude" && !isRealTask) {
      return this.claude.buildClaudeCommand({
        instructions: agent.instructions,
        task,
        tools: agent.tools,
        model: agent.model,
        thinking: agent.thinking,
      })
    }
    // The task script receives the sandbox `cwd` and the run's task/prompt (some
    // scripts, e.g. the Cleaner, read the prompt as a target directory).
    return { command: process.execPath, args: [this.demoScriptFor(agent), cwd, task] }
  }

  /**
   * Pick the bundled task script for a run. `AGENT_DEMO_SCRIPT` (used by tests)
   * overrides everything; otherwise a real-task agent maps to its own script by id
   * (see REAL_TASK_SCRIPTS), and every other agent falls back to the generic
   * token-free `demo-task.mjs`.
   */
  private demoScriptFor(agent: Agent): string {
    if (process.env.AGENT_DEMO_SCRIPT) return process.env.AGENT_DEMO_SCRIPT
    const script = AgentRunnerService.REAL_TASK_SCRIPTS[agent.id] ?? "demo-task.mjs"
    return path.resolve(__dirname, script)
  }
}
