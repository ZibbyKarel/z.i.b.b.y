import { randomUUID } from "node:crypto"
import { promises as fs } from "node:fs"
import * as path from "node:path"
import { Inject, Injectable, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common"
import type { Agent, AgentRun, Project, Workspace } from "@zibby/contracts"
import type { IntendedAction } from "@zibby/contracts"
import { AgentsStorageService } from "./agents.storage.service"
import { ApprovalsService } from "../approvals/approvals.service"
import { GateEvaluatorService } from "../gates/gate-evaluator.service"
import { LimitsService } from "../limits/limits.service"
import { GroundingService } from "../memory/grounding.service"
import { ProjectsStorageService } from "../projects/projects.storage.service"
import { ClaudePreflightService } from "../runner/claude-preflight.service"
import { ClaudeRunCommandService } from "../runner/claude-run-command.service"
import { formatClaudeStreamLine } from "../runner/claude-stream-format"
import { RunnerCore } from "../runner/runner-core"
import { LoggerService, type ScopedLogger } from "../shared/logging/logger.service"
import { TraceContextService } from "../shared/logging/trace-context.service"
import { WorkspaceService, WorkspaceSetupError } from "../workspace/workspace.service"
import { ORCHESTRATOR_ID } from "@zibby/contracts"
import { type AgentRunRecord, agentStrategy, toAgentRun } from "./agent-run.record"
import { ORCHESTRATOR_AGENT } from "./orchestrator.agent"

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
  private readonly log: ScopedLogger

  constructor(
    @Inject(RUNS_DIR) dir: string,
    private readonly agents: AgentsStorageService,
    private readonly approvals: ApprovalsService,
    private readonly gates: GateEvaluatorService,
    private readonly claude: ClaudeRunCommandService,
    private readonly preflight: ClaudePreflightService,
    private readonly limits: LimitsService,
    private readonly projects: ProjectsStorageService,
    private readonly workspace: WorkspaceService,
    private readonly grounding: GroundingService,
    private readonly logger: LoggerService,
    private readonly trace: TraceContextService,
  ) {
    this.dir = path.resolve(dir)
    this.log = logger.child(AgentRunnerService.name)
    // Layer 2: a usage-limit signal in a run's output busts the limits cache so the
    // next /api/limits read re-fetches the authoritative percentages.
    // Variant B: a mid-run `INTENT {json}` line routes through the gate evaluator.
    // Runs spawn with `--output-format stream-json` (see buildCommand), so flatten
    // each JSON event back into readable log text — the log then shows the agent's
    // whole run, not just its final message.
    this.core = new RunnerCore(
      this.dir,
      agentStrategy,
      () => this.limits.noteLimitHit(),
      (runId, action) => this.onIntent(runId, action),
      logger.child("RunnerCore:agent"),
      formatClaudeStreamLine,
      // Phase 9: resolve a limit-paused run's resume epoch (detected reset → live
      // window reset → conservative fallback), so the core can stamp `resumeAt`.
      (detected) => this.limits.resolveResumeAt(detected),
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
    // A run that reaches a terminal state while its approval is still pending was
    // never decided — the gate hook's fail-closed deadline denied it, or the child
    // died waiting. Resolve the card as rejected so the queue doesn't keep an
    // approvable entry whose run can no longer act on the decision (approving it
    // later would no-op: the run is no longer `awaiting-approval`).
    this.core.onStatus((rec) => {
      // Phase 9 (secondary limit classification): a run that just errored with the
      // usage window exhausted (a fresh, non-stale snapshot at ≥ 100 %) is a pause,
      // not a failure — even if no limit line was printed. Reclassify before the
      // error is treated as terminal anywhere downstream.
      if (rec.status === "error") void this.maybePauseOnExhaustedWindow(rec.runId)
      const terminal =
        rec.status === "done" || rec.status === "error" || rec.status === "interrupted"
      // `paused-limit` is deliberately NOT terminal: its approvals (none in practice)
      // stay, and the run is owed an auto-resume.
      if (terminal) void this.approvals.cancelPendingForRun(rec.runId)
    })
    await this.core.init()
    this.log.debug("agent runner initialized")
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
    title = "",
    taskId?: string,
    matchedTerms?: string[],
  ): Promise<AgentRun> {
    // Throws AgentNotFoundError / InvalidAgentIdError when the agent is unknown.
    const agent = await this.agents.get(agentId)
    return this.launch(agent, prompt, project, files, title, taskId, matchedTerms)
  }

  /**
   * Start the orchestrator fallback run (`kind: "orchestrator"` task routing).
   * There is no stored agent — the synthetic {@link ORCHESTRATOR_AGENT} supplies
   * the instructions and tool scope, and the record carries the reserved
   * {@link ORCHESTRATOR_ID} as its `agentId`, so the run joins the normal agent-run
   * feed (list / log / SSE / approvals) with no extra plumbing. The command builder
   * already hands every run the full agent+skill catalog as `--agents` subagents
   * with `Agent` allowed, so the orchestrator can self-delegate out of the box.
   */
  startOrchestrator(
    prompt: string,
    files: string[] = [],
    title = "",
    taskId?: string,
    matchedTerms?: string[],
    project = "",
  ): Promise<AgentRun> {
    return this.launch(ORCHESTRATOR_AGENT, prompt, project, files, title, taskId, matchedTerms)
  }

  /** Shared spawn path: build the command for `agent` and hand it to the core. */
  private async launch(
    agent: Agent,
    prompt: string,
    project: string,
    files: string[],
    title: string,
    taskId?: string,
    matchedTerms?: string[],
  ): Promise<AgentRun> {
    const agentId = agent.id
    // Agent runs are always claude-shaped — refuse up front when the CLI can't
    // start a session, so no dead run record is ever created (→ 503 / failed task).
    await this.preflight.assertAvailable()
    this.log.info("starting agent run", { agentId, project, files: files.length })

    const startedMs = Date.now()
    // The per-run sandbox the session runs in (its cwd). The directories it
    // operates on are passed separately as `--add-dir` grants, never as the cwd.
    const cwd = path.join(this.dir, `${agentId}_${startedMs}`)
    const grantDirs = await this.resolveGrantDirs(files)

    // Resolve the project first so memory grounding can include the project note;
    // the same resolution then drives the Phase 3.1 worktree below.
    const resolved = await this.resolveProject(project)
    // Memory grounding (Phase 4): North Star + relevant MOCs + the project note,
    // composed from the vault. Fail-open inside the service ("" on any error) so a
    // vault hiccup never blocks the run.
    const grounding = await this.grounding.compose({
      task: prompt,
      projectId: resolved?.id,
      matchedTerms,
    })
    const { command, args } = await this.buildCommand(agent, prompt, grantDirs, grounding)

    // Phase 3.1: a resolvable git project gets a dedicated worktree under the run
    // sandbox; the session spawns there (its first `spawnCwd` ever) so its commits
    // land on the run's own `zibby/*` branch. The sandbox stays the intent/artifact
    // home (ZIBBY_INTENT_DIR is still `cwd`). An unresolvable project string, a
    // non-git project, or a worktree-setup failure → today's behavior (sandbox-only).
    let workspace: Workspace | undefined
    let spawnCwd: string | undefined
    if (resolved && (await this.workspace.isGitRepo(resolved.path))) {
      await fs.mkdir(cwd, { recursive: true })
      try {
        workspace = await this.workspace.createWorktree({
          projectPath: resolved.path,
          runId: `${agentId}_${startedMs}`,
          slug: title || agentId,
          dir: path.join(cwd, "worktree"),
        })
        spawnCwd = workspace.path
      } catch (error) {
        if (!(error instanceof WorkspaceSetupError)) throw error
        this.log.warn("agent worktree setup failed; running sandbox-only", {
          agentId,
          projectPath: resolved.path,
          err: error.message,
        })
      }
    }

    const spec = {
      kind: "agent" as const,
      ownerId: agentId,
      command,
      args,
      cwd,
      ...(spawnCwd ? { spawnCwd } : {}),
      startedMs,
      // The originating request's traceId rides along in the persisted record, so
      // a later mid-run gate (fired from child output, outside any request — even
      // after an API restart) can re-link its logs to that origin.
      extra: { agentId, title, prompt, project, files, taskId, traceId: this.trace.getTraceId(), workspace },
    }

    // Variant B: the run spawns immediately. Gating happens mid-run — when the
    // child announces an external-effect action via a `INTENT {json}` line, the
    // core routes it to {@link onIntent} below for evaluation.
    const rec = await this.core.start(spec)
    return toAgentRun(rec)
  }

  /**
   * Resolve a run's free-form `project` reference against the registry — by id
   * first, then by exact name (same rule as the pipeline runner). Unknown / absent
   * → null (the run is sandbox-only, no worktree); never throws.
   */
  private async resolveProject(projectRef: string): Promise<Project | null> {
    if (!projectRef) return null
    try {
      return await this.projects.get(projectRef)
    } catch {
      const all = await this.projects.list().catch((): Project[] => [])
      return all.find((p) => p.name === projectRef) ?? null
    }
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
  private onIntent(runId: string, action: IntendedAction): Promise<void> {
    // Re-establish a logging scope for this background gate: the originating
    // request's trace id (so it links back) plus the run id (the durable key).
    const traceId = this.originOf(runId) ?? this.trace.getTraceId() ?? randomUUID()
    return this.trace.run({ traceId, runId }, () => this.evaluateIntent(runId, action))
  }

  /** The persisted origin traceId of a run, or undefined for an unknown run. */
  private originOf(runId: string): string | undefined {
    try {
      return this.core.get(runId).traceId
    } catch {
      return undefined
    }
  }

  private async evaluateIntent(runId: string, action: IntendedAction): Promise<void> {
    try {
      const rec = this.core.get(runId)
      // The orchestrator is synthetic (not in storage); its empty gates/
      // requires_approval mean the evaluation runs on the locked floor alone.
      const agent =
        rec.agentId === ORCHESTRATOR_ID ? ORCHESTRATOR_AGENT : await this.agents.get(rec.agentId)
      const rules = await this.gates.rulesForAgent({
        gates: agent.gates,
        requires_approval: agent.requires_approval,
      })
      const evaluation = this.gates.evaluate(rules, action)
      const decision = evaluation.decision
      this.log.info("evaluating mid-run intent", {
        agentId: rec.agentId,
        action: action.action,
        tool: action.tool,
        decision,
        ruleId: evaluation.ruleId,
      })

      if (decision === "deny") {
        this.log.warn("mid-run intent denied", { action: action.action, ruleId: evaluation.ruleId })
        await this.core.denyIntent(runId)
        return
      }
      if (decision === "ask") {
        this.log.info("mid-run intent held for approval", { action: action.action })
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
          // A destructive delete is irreversible — always the highest severity,
          // regardless of the agent's configured default. Losing files is never
          // "medium". (The hook tags these with `action: "delete"`.)
          risk: action.action === "delete" ? "high" : agent.risk ?? "medium",
        })
        return
      }
      // allow / notify: let the action proceed immediately.
      await this.core.allowIntent(runId)
    } catch (error) {
      // Unknown agent / evaluation failure → fail safe: refuse the action.
      this.log.error("mid-run intent evaluation failed; failing safe to deny", {
        err: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      })
      await this.core.denyIntent(runId).catch(() => {})
    }
  }

  /** Running runs, plus any finished within the retention window; newest first. */
  listRunning(): AgentRun[] {
    return this.core.list().map(toAgentRun)
  }

  /**
   * Phase 9: the agent runs currently paused on the usage limit (each carries its
   * `resumeAt` + `limitResumeCycles`). The {@link LimitResumeService} scans this on a
   * tick and resumes the due ones.
   */
  listLimitPaused(): AgentRun[] {
    return this.core
      .list()
      .filter((rec) => rec.status === "paused-limit")
      .map(toAgentRun)
  }

  /** Phase 9: resume a limit-paused agent run — respawn from its stashed spawn spec. */
  async resumeLimitPaused(runId: string): Promise<AgentRun> {
    return toAgentRun(await this.core.resume(runId))
  }

  /**
   * Phase 9: fail a limit-paused agent run that flapped past the resume cap. Agent
   * runs have no parked state, so the honest terminal is `error` with a readable
   * reason rather than a respawn-forever loop.
   */
  async failLimitFlapped(runId: string, reason: string): Promise<void> {
    await this.core.failLimit(runId, reason)
  }

  /**
   * Phase 9 secondary classifier: relabel a just-errored run to `paused-limit` when
   * the usage window is exhausted (fresh, non-stale snapshot ≥ 100 %). No-op when the
   * window has headroom or the reading is stale (fail-open — a wrongly-kept error is
   * preferable to pausing a genuine failure on a lagging capture).
   */
  private async maybePauseOnExhaustedWindow(runId: string): Promise<void> {
    const { exhausted, resumeAt } = await this.limits.windowExhausted().catch(() => ({
      exhausted: false,
      resumeAt: null,
    }))
    if (!exhausted) return
    await this.core.reclassifyErrorAsPausedLimit(runId, resumeAt).catch(() => {})
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
  async delete(runId: string): Promise<void> {
    // Phase 3.1: drop the git worktree BEFORE the sandbox rm (rm-first strands
    // `.git/worktrees/*` metadata in the project repo). The worktree lives under
    // the sandbox; its main repo is re-resolved from the run's `project` label.
    // Best-effort and tolerant — a swept/unknown run simply skips this.
    let rec: AgentRunRecord | undefined
    try {
      rec = this.core.get(runId)
    } catch {
      rec = undefined
    }
    if (rec?.workspace && rec.project) {
      const resolved = await this.resolveProject(rec.project)
      if (resolved) {
        await this.workspace
          .removeWorktree({ projectPath: resolved.path, worktreePath: rec.workspace.path })
          .catch(() => {})
      }
    }
    await this.core.delete(runId)
    // A run deleted while paused on the gate leaves its approval pending forever —
    // resolve it here (no runner round-trip; the run is already gone).
    await this.approvals.cancelPendingForRun(runId)
  }

  readLog(runId: string, offset: number): Promise<{
    content: string
    nextOffset: number
    done: boolean
  }> {
    return this.core.readLog(runId, offset)
  }

  /**
   * Subscribe to every agent run's lifecycle transitions, already projected to the
   * `AgentRun` contract shape. Backs the unified `/api/events` SSE channel, which
   * replaces the dashboard's 2s polling of the running/all-runs lists. Returns an
   * unsubscribe for the controller to call when the stream closes.
   */
  onRunStatus(listener: (run: AgentRun) => void): () => void {
    return this.core.onStatus((rec) => listener(toAgentRun(rec)))
  }

  /**
   * Subscribe to new-bytes-appended notifications for one run's log — the push
   * signal behind the per-run log SSE endpoint (replaces the 1s log poll). The
   * listener re-reads via {@link readLog}, so the streamed bytes match the poll
   * path exactly. Returns an unsubscribe for stream teardown.
   */
  onLogAppend(runId: string, listener: () => void): () => void {
    return this.core.onLog(runId, listener)
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
    grounding?: string,
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
      grounding,
      // Capture the full transcript so the run log shows every step, not just the
      // final summary (the core flattens the stream-json events back to text).
      streamTranscript: true,
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
