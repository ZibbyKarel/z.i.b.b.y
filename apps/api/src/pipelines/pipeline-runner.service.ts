import { randomUUID } from "node:crypto"
import { EventEmitter } from "node:events"
import { promises as fs } from "node:fs"
import * as path from "node:path"
import { Inject, Injectable, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common"
import {
  type Pipeline,
  type PipelinePhase,
  type PipelineRun,
  PipelineRunSchema,
  type RunLogChunk,
  type StageRun,
} from "@zibby/contracts"
import { AgentsStorageService } from "../agents/agents.storage.service"
import { ClaudeRunCommandService } from "../runner/claude-run-command.service"
import { RunnerCore } from "../runner/runner-core"
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
    private readonly logger: LoggerService,
    private readonly trace: TraceContextService,
  ) {
    this.dir = path.resolve(dir)
    this.log = logger.child(PipelineRunnerService.name)
    // One listener per open SSE connection; lift the default cap of 10.
    this.events.setMaxListeners(0)
    this.core = new RunnerCore(
      this.dir,
      pipelineStageStrategy,
      undefined,
      undefined,
      logger.child("RunnerCore:pipeline"),
    )
  }

  async onModuleInit(): Promise<void> {
    await this.core.init()
    await this.reconstruct()
  }

  onModuleDestroy(): void {
    this.core.shutdown()
  }

  /**
   * Start a run of `pipelineId`. Returns immediately; phases run in the background.
   * (The optional `project` from the request is reserved for the real `claude -p`
   * executor in Phase 6 and intentionally unused in demo mode.)
   */
  async start(pipelineId: string): Promise<PipelineRun> {
    // Throws PipelineNotFoundError / InvalidPipelineIdError when unknown → 404.
    const pipeline = await this.pipelines.get(pipelineId)

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
    }
    this.runs.set(pipelineRunId, run)
    await this.writeAggregate(run)

    this.log.info("starting pipeline run", {
      pipelineId,
      pipelineRunId,
      phases: pipeline.phases.length,
    })

    // Fire-and-forget driver; the FE polls getRun for progress. The driver runs
    // after this request returns, so re-open a logging scope keyed by the run id
    // (carrying the originating trace id) for every line the background work emits.
    const traceId = this.trace.getTraceId() ?? randomUUID()
    void this.trace.run({ traceId, runId: pipelineRunId }, () => this.drive(run, pipeline))
    return run
  }

  list(): PipelineRun[] {
    const cutoff = Date.now() - RETENTION_MS
    const out: PipelineRun[] = []
    for (const [id, run] of this.runs) {
      const finished = run.status !== "running"
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
  private async drive(run: PipelineRun, pipeline: Pipeline): Promise<void> {
    const byId = new Map(pipeline.phases.map((p) => [p.id, p]))
    const order = pipeline.phases
    const retries = new Map<string, number>()
    // Absolute path of the file to feed into the next phase's `consumes` input.
    let handoffSource: string | null = null
    let cursor: string | null = order[0]?.id ?? null

    while (cursor) {
      const phase = byId.get(cursor)
      if (!phase) break // defensive; superRefine guarantees targets exist
      run.currentStage = phase.id

      const attempt = (retries.get(phase.id) ?? 0) + 1
      const stageCwd = path.join(run.cwd, phase.id)
      await fs.mkdir(stageCwd, { recursive: true })
      await this.placeHandoff(handoffSource, stageCwd, phase)

      this.log.info("pipeline phase starting", { phase: phase.id, agent: phase.agent, attempt })
      const stageRun = await this.runStage(run, pipeline, phase, stageCwd, attempt)
      run.stageRuns.push(stageRun)
      await this.writeAggregate(run)

      if (stageRun.status === "done") {
        this.log.info("pipeline phase done", { phase: phase.id, attempt })
        handoffSource = path.join(stageCwd, phase.produces)
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

  /** Spawn one stage child and wait for it to finish; return its StageRun. */
  private async runStage(
    run: PipelineRun,
    _pipeline: Pipeline,
    phase: PipelinePhase,
    stageCwd: string,
    attempt: number,
  ): Promise<StageRun> {
    const { command, args } = await this.buildStageCommand(phase, stageCwd)
    const rec = await this.core.start({
      kind: "pipeline-stage",
      ownerId: `${run.pipelineRunId}.${phase.id}`,
      command,
      args,
      cwd: stageCwd,
      extra: { pipelineRunId: run.pipelineRunId, phaseId: phase.id, attempt },
    })
    const status = await this.waitForStage(rec.runId)
    return { phaseId: phase.id, runId: rec.runId, attempt, status }
  }

  /** Poll the core until the stage's child leaves the `running` state. */
  private async waitForStage(runId: string): Promise<StageRun["status"]> {
    for (;;) {
      const status = this.core.get(runId).status
      if (status !== "running") return status
      await new Promise((r) => setTimeout(r, 25))
    }
  }

  /** Copy the handoff source (if any) into this stage's `consumes` path. */
  private async placeHandoff(
    source: string | null,
    stageCwd: string,
    phase: PipelinePhase,
  ): Promise<void> {
    if (!source) return
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
  ): Promise<{ command: string; args: string[] }> {
    if (process.env.AGENT_RUNNER_MODE === "claude") {
      // The phase's agent drives the stage: its instructions become the session
      // system prompt; the task tells it to consume the handoff and produce the
      // next one. The demo path covers the pipeline machinery without tokens.
      const agent = await this.agents.get(phase.agent)
      const task = `Proveď fázi pipeline "${phase.id}". Vstup (pokud existuje) najdeš v "${phase.consumes}"; výstup zapiš do "${phase.produces}".`
      return this.claude.buildClaudeCommand({
        instructions: agent.instructions,
        task,
        tools: agent.tools,
        model: agent.model,
        thinking: agent.thinking,
      })
    }
    const script =
      process.env.PIPELINE_DEMO_STAGE_SCRIPT ?? path.resolve(__dirname, "demo-stage.mjs")
    return { command: process.execPath, args: [script, cwd, phase.id, phase.produces, phase.consumes] }
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
      if (run.status === "running") {
        run = { ...run, status: "failed", currentStage: null }
        await this.writeAggregate(run)
      }
      this.runs.set(run.pipelineRunId, run)
    }
  }
}
