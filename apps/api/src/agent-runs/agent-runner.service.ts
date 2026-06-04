import * as path from "node:path"
import { Inject, Injectable, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common"
import type { AgentRun } from "@zibby/contracts"
import type { IntendedAction } from "@zibby/contracts"
import { AgentsStorageService } from "../agents/agents.storage.service"
import { ApprovalsService } from "../approvals/approvals.service"
import { GateEvaluatorService } from "../gates/gate-evaluator.service"
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
 * spawn `claude -p <prompt>` instead — a one-line swap, off by default so the test
 * agent never burns tokens.
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
  ) {
    this.dir = path.resolve(dir)
    this.core = new RunnerCore(this.dir, agentStrategy)
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
  async start(agentId: string, prompt: string, project: string): Promise<AgentRun> {
    // Throws AgentNotFoundError / InvalidAgentIdError when the agent is unknown.
    const agent = await this.agents.get(agentId)

    const startedMs = Date.now()
    // The sandbox the task runs in (and writes its file into). Named without the
    // pid since we need it before spawning; the run id below carries the pid.
    const cwd = path.join(this.dir, `${agentId}_${startedMs}`)
    const { command, args } = this.buildCommand(prompt, cwd)
    const spec = {
      kind: "agent" as const,
      ownerId: agentId,
      command,
      args,
      cwd,
      startedMs,
      extra: { agentId, prompt, project },
    }

    // Phase 3.5: evaluate the intended action against the floor + the agent's own
    // rules (with legacy `requires_approval` desugar). Variant A — gate at the
    // spawn boundary. No action with an external effect runs until allowed.
    const action: IntendedAction = { action: "run", context: agent.id }
    const rules = await this.gates.rulesForAgent({
      gates: agent.gates,
      requires_approval: agent.requires_approval,
    })
    const decision = this.gates.evaluate(rules, action).decision

    if (decision === "ask") {
      const rec = await this.core.createPending(spec)
      await this.approvals.requestApproval({
        runId: rec.runId,
        kind: "agent",
        skill: agent.name ?? agent.id,
        action: "run",
        detail: prompt,
        risk: agent.risk ?? "medium",
      })
      return toAgentRun(rec)
    }

    if (decision === "deny") {
      // Refused by policy: create then immediately terminate, never spawning.
      const rec = await this.core.createPending(spec)
      this.core.cancel(rec.runId)
      return toAgentRun(this.core.get(rec.runId))
    }

    const rec = await this.core.start(spec)
    return toAgentRun(rec)
  }

  /** Running runs, plus any finished within the retention window; newest first. */
  listRunning(): AgentRun[] {
    return this.core.list().map(toAgentRun)
  }

  get(runId: string): AgentRun {
    return toAgentRun(this.core.get(runId))
  }

  stop(runId: string): AgentRun {
    return toAgentRun(this.core.stop(runId))
  }

  readLog(runId: string, offset: number): Promise<{
    content: string
    nextOffset: number
    done: boolean
  }> {
    return this.core.readLog(runId, offset)
  }

  /** Build the command for a run. Demo by default; `claude -p` when opted in. */
  private buildCommand(prompt: string, cwd: string): { command: string; args: string[] } {
    if (process.env.AGENT_RUNNER_MODE === "claude") {
      return { command: "claude", args: ["-p", prompt] }
    }
    const script = process.env.AGENT_DEMO_SCRIPT ?? path.resolve(__dirname, "demo-task.mjs")
    return { command: process.execPath, args: [script, cwd] }
  }
}
