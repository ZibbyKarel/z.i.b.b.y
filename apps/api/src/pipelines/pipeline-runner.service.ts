import { randomUUID } from "node:crypto"
import { EventEmitter } from "node:events"
import { promises as fs } from "node:fs"
import * as path from "node:path"
import { Inject, Injectable, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common"
import {
  DEFAULT_VERIFY_CHECKS,
  type IntendedAction,
  type PhaseEscalation,
  type Pipeline,
  type PipelinePhase,
  type PipelineRun,
  PipelineRunSchema,
  type Project,
  type RunLogChunk,
  type StageRun,
} from "@zibby/contracts"
import { AgentsStorageService } from "../agents/agents.storage.service"
import { ApprovalsService } from "../approvals/approvals.service"
import { GateEvaluatorService } from "../gates/gate-evaluator.service"
import { ClaudePreflightService } from "../runner/claude-preflight.service"
import { ClaudeRunCommandService } from "../runner/claude-run-command.service"
import { RunnerCore } from "../runner/runner-core"
import { ProjectsStorageService } from "../projects/projects.storage.service"
import { LoggerService, type ScopedLogger } from "../shared/logging/logger.service"
import { TraceContextService } from "../shared/logging/trace-context.service"
import { PipelinesStorageService } from "./pipelines.storage.service"
import { type PipelineStageRecord, pipelineStageStrategy } from "./pipeline-stage.record"

/** DI token carrying the absolute path of the directory that holds pipeline run artifacts. */
export const PIPELINE_RUNS_DIR = "PIPELINE_RUNS_DIR"

const RETENTION_MS = 30 * 60 * 1000
const MAX_LISTED = 50
const AGGREGATE_FILE = "run.json"

// Re-exported so the controller can map it to a 404 without importing the core.
export { RunNotFoundError } from "../runner/runner-core"

/** Raised when a pipeline run id is unknown — controllers map it to a 404. */
export class PipelineRunNotFoundError extends Error {
  constructor(id: string) {
    super(`Pipeline run "${id}" not found`)
    this.name = "PipelineRunNotFoundError"
  }
}

/**
 * Raised when resume-with-note targets a run that is not retries-parked —
 * controllers map it to a 409. Approval-parked runs resume only through the
 * approvals path, so there is exactly one gate per parking machine.
 */
export class RunNotRetriesParkedError extends Error {
  constructor(id: string) {
    super(`Pipeline run "${id}" is not retries-parked`)
    this.name = "RunNotRetriesParkedError"
  }
}

/**
 * Runs a pipeline by chaining its phases through the shared {@link RunnerCore}: one
 * child process per phase (so each stage's log polls independently), handoff over
 * disk (phase N's `produces` is copied into phase N+1's `consumes`), and the
 * tester loop / back-edge with `maxRetries` as a hard fuse against an infinite
 * loop.
 *
 * The aggregate {@link PipelineRun} is held in memory and mirrored to a
 * `<runRoot>/run.json` sidecar after every transition, so a restart can report an
 * accurate `currentStage`. A pipeline can't auto-resume a mid-flight child, so a
 * run left `running` at restart is reconciled to `failed` (same honesty as agent
 * runs being relabelled `interrupted`).
 */
@Injectable()
export class PipelineRunnerService implements OnModuleInit, OnModuleDestroy {
  private readonly dir: string
  private readonly core: RunnerCore<PipelineStageRecord>
  private readonly runs = new Map<string, PipelineRun>()
  private readonly log: ScopedLogger
  /**
   * Push channel for aggregate transitions. Unlike agent runs (whose lifecycle the
   * core owns), the pipeline aggregate lives here, so the event fires from
   * {@link writeAggregate} — every persisted transition (stage advance, finish)
   * notifies the `/api/events` SSE channel, replacing the FE's 1s aggregate poll.
   */
  private readonly events = new EventEmitter()

  constructor(
    @Inject(PIPELINE_RUNS_DIR) dir: string,
    private readonly pipelines: PipelinesStorageService,
    private readonly agents: AgentsStorageService,
    private readonly claude: ClaudeRunCommandService,
    private readonly preflight: ClaudePreflightService,
    private readonly approvals: ApprovalsService,
    private readonly gates: GateEvaluatorService,
    private readonly projects: ProjectsStorageService,
    private readonly logger: LoggerService,
    private readonly trace: TraceContextService,
  ) {
    this.dir = path.resolve(dir)
    this.log = logger.child(PipelineRunnerService.name)
    // One listener per open SSE connection; lift the default cap of 10.
    this.events.setMaxListeners(0)
    // Variant B for stages: a live claude stage announcing a destructive action
    // (via the hook's intent-request.json) routes through the gate evaluator.
    this.core = new RunnerCore(
      this.dir,
      pipelineStageStrategy,
      undefined,
      (stageRunId, action) => this.onStageIntent(stageRunId, action),
      logger.child("RunnerCore:pipeline"),
    )
  }

  async onModuleInit(): Promise<void> {
    // Approval decisions on a parked stage route back here: approve releases the
    // blocked child (the same live process continues), reject aborts it — the
    // stage lands `interrupted` and the driver takes its normal failure path.
    this.approvals.register("pipeline-stage", {
      resume: async (stageRunId) => {
        try {
          await this.core.resume(stageRunId)
          await this.setAggregateStatus(stageRunId, "running")
        } catch (error) {
          // The run may have been deleted while its approval sat in the queue.
          this.log.warn("pipeline-stage resume skipped (run not found)", {
            stageRunId,
            err: error instanceof Error ? error.message : String(error),
          })
        }
      },
      cancel: (stageRunId) => {
        try {
          this.core.cancel(stageRunId)
        } catch (error) {
          this.log.warn("pipeline-stage cancel skipped (run not found)", {
            stageRunId,
            err: error instanceof Error ? error.message : String(error),
          })
        }
      },
    })
    await this.core.init()
    await this.reconstruct()
  }

  onModuleDestroy(): void {
    this.core.shutdown()
  }

  /**
   * Start a run of `pipelineId`. Returns immediately; phases run in the background.
   * `project` (id or name from the request) resolves against the registry: its
   * `path` becomes the spawn cwd of claude stages and the verify-phase cwd, and
   * its `checks` the verify fallback. Unresolvable → sandbox-only (deterministic
   * for demo/e2e).
   */
  async start(pipelineId: string, taskId?: string, projectRef?: string): Promise<PipelineRun> {
    // Throws PipelineNotFoundError / InvalidPipelineIdError when unknown → 404.
    const pipeline = await this.pipelines.get(pipelineId)

    // Claude-mode stages spawn real `claude -p` sessions — refuse the whole run
    // up front when the CLI can't start one (→ 503). Demo pipelines keep working.
    if (process.env.AGENT_RUNNER_MODE === "claude") {
      await this.preflight.assertAvailable()
    }

    const project = await this.resolveProject(projectRef)

    const startedMs = Date.now()
    const pipelineRunId = `${pipelineId}_${startedMs}`
    const root = path.join(this.dir, pipelineRunId)
    await fs.mkdir(root, { recursive: true })

    const firstPhase = pipeline.phases[0]
    const run: PipelineRun = {
      pipelineRunId,
      pipelineId,
      status: "running",
      currentStage: firstPhase ? firstPhase.id : null,
      stageRuns: [],
      startedAt: new Date(startedMs).toISOString(),
      cwd: root,
      ...(taskId ? { taskId } : {}),
      ...(project ? { projectPath: project.path } : {}),
    }
    this.runs.set(pipelineRunId, run)
    await this.writeAggregate(run)

    this.log.info("starting pipeline run", {
      pipelineId,
      pipelineRunId,
      phases: pipeline.phases.length,
      projectPath: project?.path,
    })

    // Fire-and-forget driver; the FE polls getRun for progress. The driver runs
    // after this request returns, so re-open a logging scope keyed by the run id
    // (carrying the originating trace id) for every line the background work emits.
    const traceId = this.trace.getTraceId() ?? randomUUID()
    void this.trace.run({ traceId, runId: pipelineRunId }, () => this.drive(run, pipeline, project))
    return run
  }

  /**
   * Resolve the request's free-form project reference against the registry —
   * by id first, then by exact name. Unknown/absent → null (sandbox-only run);
   * never throws (the project is an enhancement, not a precondition).
   */
  private async resolveProject(projectRef: string | undefined): Promise<Project | null> {
    if (!projectRef) return null
    try {
      return await this.projects.get(projectRef)
    } catch {
      const all = await this.projects.list().catch((): Project[] => [])
      return all.find((p) => p.name === projectRef) ?? null
    }
  }

  /**
   * Re-resolve a run's project from its persisted `projectPath` (for resume
   * after restart). A registry record deleted in the meantime degrades to a
   * synthetic project carrying just the path — cwd still applies, checks fall
   * back to the defaults.
   */
  private async projectForRun(run: PipelineRun): Promise<Project | null> {
    if (!run.projectPath) return null
    const all = await this.projects.list().catch((): Project[] => [])
    return (
      all.find((p) => p.path === run.projectPath) ?? {
        id: "unregistered",
        name: "unregistered",
        path: run.projectPath,
      }
    )
  }

  /**
   * Resume a retries-parked run with an operator note: the note lands in
   * `<phaseId>.note.md` AND is appended to the failure context file (so the
   * retried phase sees failure + guidance in one handoff), the parked phase's
   * retry counter resets, and the driver re-enters the machine at `loop.to`.
   * Throws {@link RunNotRetriesParkedError} (→ 409) for any other state.
   */
  async resumeParked(pipelineRunId: string, note?: string): Promise<PipelineRun> {
    let run = this.runs.get(pipelineRunId)
    if (!run) {
      const fromDisk = await this.readAggregate(pipelineRunId)
      if (!fromDisk) throw new PipelineRunNotFoundError(pipelineRunId)
      this.runs.set(pipelineRunId, fromDisk)
      run = fromDisk
    }
    if (run.status !== "parked" || run.parkedReason !== "retries" || !run.parked) {
      throw new RunNotRetriesParkedError(pipelineRunId)
    }
    const pipeline = await this.pipelines.get(run.pipelineId)
    const parked = run.parked
    const phase = pipeline.phases.find((p) => p.id === parked.phaseId)
    if (!phase?.loop) throw new RunNotRetriesParkedError(pipelineRunId)

    const trimmed = note?.trim()
    if (trimmed) {
      await fs
        .writeFile(path.join(run.cwd, `${parked.phaseId}.note.md`), `${trimmed}\n`, "utf8")
        .catch(() => {})
      await fs
        .appendFile(parked.failureFile, `\n\n## Operator note\n\n${trimmed}\n`, "utf8")
        .catch(() => {})
    }

    const retries = new Map(Object.entries(run.retries ?? {}))
    retries.set(parked.phaseId, 0)

    run.status = "running"
    delete run.parkedReason
    delete run.parked
    run.retries = Object.fromEntries(retries)
    run.currentStage = phase.loop.to
    await this.writeAggregate(run)
    this.log.info("parked pipeline run resumed", {
      pipelineRunId,
      phase: parked.phaseId,
      retryTo: phase.loop.to,
      withNote: Boolean(trimmed),
    })

    const project = await this.projectForRun(run)
    const cursor = phase.loop.to
    const traceId = this.trace.getTraceId() ?? randomUUID()
    void this.trace.run({ traceId, runId: pipelineRunId }, () =>
      this.drive(run, pipeline, project, {
        cursor,
        handoffSource: parked.failureFile,
        retries,
      }),
    )
    return run
  }

  list(): PipelineRun[] {
    const cutoff = Date.now() - RETENTION_MS
    const out: PipelineRun[] = []
    for (const [id, run] of this.runs) {
      // Parked runs stay in memory regardless of age: a retries-parked run may
      // sit for days and must remain resumable without a restart round-trip.
      const finished = run.status !== "running" && run.status !== "parked"
      if (finished && Date.parse(run.startedAt) < cutoff) {
        this.runs.delete(id)
        continue
      }
      out.push(run)
    }
    return out.sort((a, b) => b.startedAt.localeCompare(a.startedAt)).slice(0, MAX_LISTED)
  }

  /** The full run history (on disk + in memory), newest first; no age cutoff. */
  async listAll(): Promise<PipelineRun[]> {
    const byId = new Map<string, PipelineRun>()
    const entries = await fs.readdir(this.dir, { withFileTypes: true }).catch(() => [])
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const raw = await fs
        .readFile(path.join(this.dir, entry.name, AGGREGATE_FILE), "utf8")
        .catch(() => null)
      if (raw === null) continue
      let data: unknown
      try {
        data = JSON.parse(raw)
      } catch {
        continue
      }
      const parsed = PipelineRunSchema.safeParse(data)
      if (!parsed.success) continue
      byId.set(parsed.data.pipelineRunId, parsed.data)
    }
    // In-memory wins: it carries the live `currentStage`/`status` of an active run.
    for (const [id, run] of this.runs) byId.set(id, run)
    return [...byId.values()].sort((a, b) => b.startedAt.localeCompare(a.startedAt))
  }

  get(pipelineRunId: string): PipelineRun {
    const run = this.runs.get(pipelineRunId)
    if (!run) throw new PipelineRunNotFoundError(pipelineRunId)
    return run
  }

  /**
   * Permanently delete a pipeline run. Each stage spawned through the core writes
   * its sidecar/log to the *runs dir root* (not the stage cwd), so removing the run
   * folder alone would orphan them — delete every stage's artifacts first, then the
   * folder (aggregate + per-phase sandboxes). Throws if the run is unknown.
   */
  async delete(pipelineRunId: string): Promise<void> {
    const run = this.runs.get(pipelineRunId) ?? (await this.readAggregate(pipelineRunId))
    if (!run) throw new PipelineRunNotFoundError(pipelineRunId)
    for (const stage of run.stageRuns) {
      // Escalation markers have no real run behind them; a missing sidecar is fine.
      await this.core.delete(stage.runId).catch(() => {})
    }
    this.runs.delete(pipelineRunId)
    const root = this.resolveRunDir(pipelineRunId)
    if (root) await fs.rm(root, { recursive: true, force: true }).catch(() => {})
  }

  /** Read a stage's log by phase id (the most recent attempt of that phase). */
  readStageLog(pipelineRunId: string, phaseId: string, offset: number): Promise<RunLogChunk> {
    const run = this.runs.get(pipelineRunId)
    if (!run) throw new PipelineRunNotFoundError(pipelineRunId)
    const stage = [...run.stageRuns].reverse().find((s) => s.phaseId === phaseId)
    if (!stage) throw new PipelineRunNotFoundError(`${pipelineRunId}/${phaseId}`)
    return this.core.readLog(stage.runId, offset)
  }

  /**
   * Drive the phases in order. The cursor moves forward on success; on failure it
   * either takes the phase's back-edge (bounded by `maxRetries`) or fails the run.
   */
  private async drive(
    run: PipelineRun,
    pipeline: Pipeline,
    project: Project | null = null,
    resume?: { cursor: string; handoffSource: string | null; retries: Map<string, number> },
  ): Promise<void> {
    const byId = new Map(pipeline.phases.map((p) => [p.id, p]))
    const order = pipeline.phases
    const retries = resume?.retries ?? new Map<string, number>()
    // Absolute path of the file to feed into the next phase's `consumes` input.
    let handoffSource: string | null = resume?.handoffSource ?? null
    let cursor: string | null = resume?.cursor ?? order[0]?.id ?? null

    while (cursor) {
      const phase = byId.get(cursor)
      if (!phase) break // defensive; superRefine guarantees targets exist
      run.currentStage = phase.id

      const attempt = (retries.get(phase.id) ?? 0) + 1
      const stageCwd = path.join(run.cwd, phase.id)
      await fs.mkdir(stageCwd, { recursive: true })
      await this.placeHandoff(handoffSource, stageCwd, phase)

      this.log.info("pipeline phase starting", {
        phase: phase.id,
        type: phase.type,
        agent: phase.agent,
        attempt,
      })
      const stageRun = await this.runStage(run, phase, stageCwd, attempt, project)
      // A rejected approval lands here with the aggregate still "parked" (the
      // cancel path flips only the stage) — un-park before recording the outcome.
      if (run.status === "parked") {
        run.status = "running"
        delete run.parkedReason
      }
      run.stageRuns.push(stageRun)
      await this.writeAggregate(run)

      if (stageRun.status === "done") {
        this.log.info("pipeline phase done", { phase: phase.id, attempt })
        // A verify phase transforms nothing: it leaves the handoff untouched, so
        // the next phase consumes the last *producing* phase's output.
        if (phase.produces) handoffSource = path.join(stageCwd, phase.produces)
        const idx = order.findIndex((p) => p.id === phase.id)
        cursor = order[idx + 1]?.id ?? null
        continue
      }

      // Stage failed (or was interrupted). Take the back-edge if one remains.
      const loop = phase.loop
      if (loop && (retries.get(phase.id) ?? 0) < loop.maxRetries) {
        retries.set(phase.id, (retries.get(phase.id) ?? 0) + 1)
        this.log.warn("pipeline phase failed; retrying", {
          phase: phase.id,
          status: stageRun.status,
          attempt,
          retryTo: loop.to,
        })
        handoffSource = await this.writeFailureContext(run, phase, stageRun)
        cursor = loop.to
        continue
      }

      // Retries exhausted with `then: "park"`: durable parking — no synthetic
      // error marker (the parked detail is the surface), no failed status. The
      // driver exits; {@link resumeParked} re-enters this machine with a note.
      if (loop?.then === "park") {
        const failureFile = await this.writeFailureContext(run, phase, stageRun)
        run.status = "parked"
        run.parkedReason = "retries"
        run.parked = { phaseId: phase.id, attempts: attempt, failureFile }
        run.retries = Object.fromEntries(retries)
        run.currentStage = phase.id
        await this.writeAggregate(run)
        this.log.warn("pipeline run parked (retries exhausted)", {
          phase: phase.id,
          attempts: attempt,
        })
        return
      }

      // No loop, or retries exhausted: escalate (surface), then fall through.
      if (loop?.escalate) {
        this.log.warn("pipeline phase escalated (retries exhausted)", { phase: phase.id, attempt })
        run.stageRuns.push({
          phaseId: phase.id,
          runId: `${run.pipelineRunId}.${phase.id}.escalated`,
          attempt,
          status: "error",
        })
      }
      if (!loop || loop.then === "fail") {
        this.log.error("pipeline phase failed; failing run", {
          phase: phase.id,
          status: stageRun.status,
        })
        run.status = "failed"
        cursor = null
      } else {
        handoffSource = await this.writeFailureContext(run, phase, stageRun)
        cursor = loop.then
      }
    }

    if (run.status === "running") run.status = "done"
    run.currentStage = null
    await this.writeAggregate(run)
    this.log.info("pipeline run finished", { status: run.status, stages: run.stageRuns.length })
  }

  /**
   * The escalation rung for `attempt` (1 = the original run, no override; retry
   * n applies rung n, later retries clamp to the last rung).
   */
  private escalationFor(phase: PipelinePhase, attempt: number): PhaseEscalation | null {
    const ladder = phase.loop?.escalation
    if (!ladder || ladder.length === 0 || attempt <= 1) return null
    return ladder[Math.min(attempt - 2, ladder.length - 1)] ?? null
  }

  /** Spawn one stage child and wait for it to finish; return its StageRun. */
  private async runStage(
    run: PipelineRun,
    phase: PipelinePhase,
    stageCwd: string,
    attempt: number,
    project: Project | null,
  ): Promise<StageRun> {
    const escalation = this.escalationFor(phase, attempt)
    if (escalation) {
      this.log.info("applying escalation rung", { phase: phase.id, attempt, ...escalation })
    }
    const { command, args, spawnCwd } = await this.buildStageCommand(
      phase,
      stageCwd,
      project,
      escalation,
    )
    const rec = await this.core.start({
      kind: "pipeline-stage",
      ownerId: `${run.pipelineRunId}.${phase.id}`,
      command,
      args,
      cwd: stageCwd,
      ...(spawnCwd ? { spawnCwd } : {}),
      extra: { pipelineRunId: run.pipelineRunId, phaseId: phase.id, attempt },
    })
    const status = await this.waitForStage(rec.runId)
    return { phaseId: phase.id, runId: rec.runId, attempt, status }
  }

  /**
   * Poll the core until the stage's child reaches a TERMINAL state. A stage held
   * at `awaiting-approval` (a gated mid-run intent) still has its live child
   * blocking on the decision file — returning there would misread the pause as
   * stage completion, so the wait rides through it and the same phase continues
   * after the approval releases the child.
   */
  private async waitForStage(runId: string): Promise<"done" | "error" | "interrupted"> {
    for (;;) {
      const status = this.core.get(runId).status
      if (status !== "running" && status !== "awaiting-approval") return status
      await new Promise((r) => setTimeout(r, 25))
    }
  }

  /**
   * Variant B gate for pipeline stages. A live stage announced an external-effect
   * action and is blocking on its decision file: evaluate it against the phase
   * agent's rules (plus the locked floor) and steer the child. `ask` parks the
   * whole pipeline run (the driver's await rides through the pause) and raises a
   * `pipeline-stage` approval keyed by the STAGE run id. Failures fail safe to deny.
   */
  private onStageIntent(stageRunId: string, action: IntendedAction): Promise<void> {
    const traceId = this.trace.getTraceId() ?? randomUUID()
    return this.trace.run({ traceId, runId: stageRunId }, () =>
      this.evaluateStageIntent(stageRunId, action),
    )
  }

  private async evaluateStageIntent(stageRunId: string, action: IntendedAction): Promise<void> {
    try {
      const rec = this.core.get(stageRunId)
      const run = this.runs.get(rec.pipelineRunId)
      if (!run) throw new PipelineRunNotFoundError(rec.pipelineRunId)
      const pipeline = await this.pipelines.get(run.pipelineId)
      const phase = pipeline.phases.find((p) => p.id === rec.phaseId)
      if (!phase) throw new Error(`Phase "${rec.phaseId}" not found in "${run.pipelineId}"`)
      // Verify phases never spawn claude, so they can't raise intents — an
      // agent-less phase here is a malformed signal; the catch denies it.
      if (!phase.agent) throw new Error(`Phase "${rec.phaseId}" carries no agent`)
      const agent = await this.agents.get(phase.agent)
      const rules = await this.gates.rulesForAgent({
        gates: agent.gates,
        requires_approval: agent.requires_approval,
      })
      const evaluation = this.gates.evaluate(rules, action)
      this.log.info("evaluating mid-run stage intent", {
        pipelineRunId: run.pipelineRunId,
        phaseId: rec.phaseId,
        action: action.action,
        decision: evaluation.decision,
        ruleId: evaluation.ruleId,
      })

      if (evaluation.decision === "deny") {
        await this.core.denyIntent(stageRunId)
        return
      }
      if (evaluation.decision === "ask") {
        // Hold the stage (its child keeps blocking) and park the aggregate — the
        // web maps parked+approval → awaiting-approval and refetches approvals.
        await this.core.holdForApproval(stageRunId)
        run.status = "parked"
        run.parkedReason = "approval"
        await this.writeAggregate(run)
        await this.approvals.requestApproval({
          runId: stageRunId,
          kind: "pipeline-stage",
          skill: agent.name ?? agent.id,
          action: action.action,
          detail: action.context ?? `Pipeline "${run.pipelineId}", fáze "${rec.phaseId}"`,
          risk: agent.risk ?? "medium",
        })
        return
      }
      // allow / notify: let the action proceed immediately.
      await this.core.allowIntent(stageRunId)
    } catch (error) {
      // Unknown phase/agent or evaluation failure → fail safe: refuse the action.
      this.log.error("stage intent evaluation failed; failing safe to deny", {
        stageRunId,
        err: error instanceof Error ? error.message : String(error),
      })
      await this.core.denyIntent(stageRunId).catch(() => {})
    }
  }

  /** Flip the aggregate that owns `stageRunId` to `status` and persist it. */
  private async setAggregateStatus(
    stageRunId: string,
    status: PipelineRun["status"],
  ): Promise<void> {
    const rec = this.core.get(stageRunId)
    const run = this.runs.get(rec.pipelineRunId)
    if (!run) return
    run.status = status
    if (status !== "parked") delete run.parkedReason
    await this.writeAggregate(run)
  }

  /** Copy the handoff source (if any) into this stage's `consumes` path. */
  private async placeHandoff(
    source: string | null,
    stageCwd: string,
    phase: PipelinePhase,
  ): Promise<void> {
    // A verify phase declares no `consumes` — it checks the project, not a file.
    if (!source || !phase.consumes) return
    const dest = this.resolveInside(stageCwd, phase.consumes)
    if (!dest) return
    await fs.mkdir(path.dirname(dest), { recursive: true })
    await fs.copyFile(source, dest).catch(() => {
      // A missing source is not fatal — the stage simply starts without input.
    })
  }

  /** Write the failed stage's log tail as the handoff context for the retry. */
  private async writeFailureContext(
    run: PipelineRun,
    phase: PipelinePhase,
    stageRun: StageRun,
  ): Promise<string> {
    const file = path.join(run.cwd, `${phase.id}.failure.txt`)
    const log = await this.core.readLog(stageRun.runId, 0).catch(() => null)
    const body = `Phase "${phase.id}" failed (attempt ${stageRun.attempt}).\n\n${log?.content ?? ""}`
    await fs.writeFile(file, body, "utf8").catch(() => {})
    return file
  }

  /** Resolve a relative path strictly inside `base`, rejecting `..` escapes. */
  private resolveInside(base: string, rel: string): string | null {
    const resolved = path.resolve(base, rel)
    const baseResolved = path.resolve(base)
    if (resolved !== baseResolved && !resolved.startsWith(baseResolved + path.sep)) {
      return null
    }
    return resolved
  }

  private async buildStageCommand(
    phase: PipelinePhase,
    cwd: string,
    project: Project | null,
    escalation: PhaseEscalation | null = null,
  ): Promise<{ command: string; args: string[]; spawnCwd?: string }> {
    // Verify phases are deterministic shell checks — identical in demo and
    // claude mode (no model, no tokens, no intents, no preflight). They run in
    // the project checkout when one was resolved, else in the stage sandbox.
    if (phase.type === "verify") {
      const commands = phase.commands ?? project?.checks ?? [...DEFAULT_VERIFY_CHECKS]
      return {
        command: "/bin/sh",
        args: ["-c", commands.join(" && ")],
        ...(project ? { spawnCwd: project.path } : {}),
      }
    }
    if (process.env.AGENT_RUNNER_MODE === "claude") {
      // The phase's agent drives the stage: its instructions become the session
      // system prompt; the task tells it to consume the handoff and produce the
      // next one. The demo path covers the pipeline machinery without tokens.
      if (!phase.agent) throw new Error(`Agent phase "${phase.id}" carries no agent`)
      const agent = await this.agents.get(phase.agent)
      // Handoff paths are passed ABSOLUTE: with a project resolved the session
      // spawns inside the checkout (its real CLAUDE.md/.claude context loads),
      // so anything sandbox-relative would silently resolve against the repo.
      const consumesAbs = phase.consumes ? path.join(cwd, phase.consumes) : null
      const producesAbs = phase.produces ? path.join(cwd, phase.produces) : null
      const task = [
        `Proveď fázi pipeline "${phase.id}".`,
        consumesAbs ? `Vstup (pokud existuje) najdeš v "${consumesAbs}".` : "",
        producesAbs ? `Výstup zapiš do "${producesAbs}".` : "",
      ]
        .filter(Boolean)
        .join(" ")
      const built = await this.claude.buildClaudeCommand({
        instructions: agent.instructions,
        task,
        tools: agent.tools,
        // Escalation rung (a retry's harder model/thinking) > phase > agent.
        model: escalation?.model ?? phase.model ?? agent.model,
        thinking: escalation?.thinking ?? phase.thinking ?? agent.thinking,
        // The sandbox holds the handoff files; with cwd in the project the
        // session still needs write access to it (reverse grant).
        ...(project ? { grantDirs: [cwd] } : {}),
      })
      return project ? { ...built, spawnCwd: project.path } : built
    }
    const script =
      process.env.PIPELINE_DEMO_STAGE_SCRIPT ?? path.resolve(__dirname, "demo-stage.mjs")
    return {
      command: process.execPath,
      args: [script, cwd, phase.id, phase.produces ?? "", phase.consumes ?? ""],
    }
  }

  /** The run's folder inside the runs dir, or null if the id would escape it. */
  private resolveRunDir(pipelineRunId: string): string | null {
    const dir = path.resolve(this.dir, pipelineRunId)
    if (path.dirname(dir) !== this.dir) return null
    return dir
  }

  /** Read a run's aggregate `run.json` from disk (for a run dropped from memory). */
  private async readAggregate(pipelineRunId: string): Promise<PipelineRun | null> {
    const root = this.resolveRunDir(pipelineRunId)
    if (!root) return null
    const raw = await fs.readFile(path.join(root, AGGREGATE_FILE), "utf8").catch(() => null)
    if (raw === null) return null
    try {
      const parsed = PipelineRunSchema.safeParse(JSON.parse(raw))
      return parsed.success ? parsed.data : null
    } catch {
      return null
    }
  }

  /**
   * Subscribe to aggregate transitions of every pipeline run. Backs the unified
   * `/api/events` SSE channel; returns an unsubscribe for the controller to call
   * when the stream closes.
   */
  onRunStatus(listener: (run: PipelineRun) => void): () => void {
    this.events.on("status", listener)
    return () => this.events.off("status", listener)
  }

  private async writeAggregate(run: PipelineRun): Promise<void> {
    await fs
      .writeFile(path.join(run.cwd, AGGREGATE_FILE), JSON.stringify(run), "utf8")
      .catch(() => {
        // Best-effort: a failed write degrades restart fidelity, not the run.
      })
    // Persisting is the transition point — notify the status channel after it so a
    // subscriber that refetches sees the same state we just wrote to disk.
    this.events.emit("status", run)
  }

  /** Rebuild aggregates from `<runRoot>/run.json` sidecars; a mid-flight run fails. */
  private async reconstruct(): Promise<void> {
    const entries = await fs.readdir(this.dir, { withFileTypes: true }).catch(() => [])
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const file = path.join(this.dir, entry.name, AGGREGATE_FILE)
      const raw = await fs.readFile(file, "utf8").catch(() => null)
      if (raw === null) continue
      let data: unknown
      try {
        data = JSON.parse(raw)
      } catch {
        continue
      }
      const parsed = PipelineRunSchema.safeParse(data)
      if (!parsed.success) continue
      let run = parsed.data
      // A run left "running" lost its mid-flight child with the previous backend.
      // An APPROVAL-parked run is the same situation (its blocking child died
      // with the API) → honest reconciliation is `failed`. A RETRIES-parked run
      // has no child at all — it is durable and stays parked, resumable.
      const approvalParked = run.status === "parked" && run.parkedReason !== "retries"
      if (run.status === "running" || approvalParked) {
        run = {
          ...run,
          status: "failed",
          currentStage: null,
          parkedReason: undefined,
          parked: undefined,
        }
        await this.writeAggregate(run)
      }
      this.runs.set(run.pipelineRunId, run)
    }
  }
}
