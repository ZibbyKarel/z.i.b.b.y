import { randomUUID } from "node:crypto"
import { EventEmitter } from "node:events"
import { promises as fs } from "node:fs"
import * as path from "node:path"
import { Inject, Injectable, type OnModuleInit } from "@nestjs/common"
import {
  GOAL_RUN_ARTIFACTS,
  type Goal,
  type GoalIteration,
  type GoalIterationStatus,
  type GoalRun,
  type GoalRunArtifact,
  GoalRunSchema,
  type Project,
} from "@zibby/contracts"
import { AgentRunnerService } from "../agents/agent-runner.service"
import { PipelineRunnerService } from "../pipelines/pipeline-runner.service"
import { ProjectsStorageService } from "../projects/projects.storage.service"
import { LoggerService, type ScopedLogger } from "../shared/logging/logger.service"
import { TraceContextService } from "../shared/logging/trace-context.service"
import { WorkspaceService, WorkspaceSetupError } from "../workspace/workspace.service"
import { GoalsStorageService } from "./goals.storage.service"
import { GoalRunNotFoundError, GoalRunNotParkedError } from "./goals.errors"

/** DI token carrying the absolute path of the directory that holds goal run artifacts. */
export const GOAL_RUNS_DIR = "GOAL_RUNS_DIR"

const RETENTION_MS = 30 * 60 * 1000
const MAX_LISTED = 50
const AGGREGATE_FILE = "run.json"

/**
 * The outer loop engine. A goal run iterates a *maker* (an existing agent or
 * pipeline, dispatched through its own runner untouched) against a *verifier*
 * (Phase 10.2), persisting every iteration to disk and parking when bounded
 * effort is exhausted. The goal owns ONE worktree per run; iterations accumulate
 * commits on its branch.
 *
 * This is deliberately thin glue over delivered machinery: the maker dispatch
 * reuses {@link AgentRunnerService.start} / {@link PipelineRunnerService.start}
 * verbatim (so demo mode stays the e2e seam and the mid-run approval gate applies
 * unchanged inside every iteration), and the aggregate is the
 * {@link PipelineRunnerService} pattern with `iterations[]` replacing `stageRuns[]`.
 */
@Injectable()
export class GoalRunnerService implements OnModuleInit {
  private readonly dir: string
  private readonly runs = new Map<string, GoalRun>()
  /** The base prompt for each live run's maker (not persisted — recomputed from objective on restart). */
  private readonly prompts = new Map<string, string>()
  private readonly events = new EventEmitter()
  private readonly log: ScopedLogger

  constructor(
    @Inject(GOAL_RUNS_DIR) dir: string,
    private readonly goals: GoalsStorageService,
    private readonly agentRunner: AgentRunnerService,
    private readonly pipelineRunner: PipelineRunnerService,
    private readonly projects: ProjectsStorageService,
    private readonly workspace: WorkspaceService,
    private readonly logger: LoggerService,
    private readonly trace: TraceContextService,
  ) {
    this.dir = path.resolve(dir)
    this.log = logger.child(GoalRunnerService.name)
    this.events.setMaxListeners(0)
  }

  async onModuleInit(): Promise<void> {
    await fs.mkdir(this.dir, { recursive: true }).catch(() => {})
    // Restart reconciliation lands in Phase 10.4; for now rebuild the registry so
    // a just-finished run survives a quick reload for the feed.
    await this.rehydrate()
  }

  /**
   * Start a run of `goalId`. Returns immediately; iterations run in the background.
   * Creates one worktree per run (Phase 3.1) when the project is a git repo, seeds
   * the aggregate, persists it, and kicks the driver.
   */
  async start(
    goalId: string,
    prompt = "",
    project = "",
    files: string[] = [],
    title = "",
    taskId?: string,
    matchedTerms?: string[],
  ): Promise<GoalRun> {
    // Throws GoalNotFoundError / InvalidGoalIdError when unknown → 404.
    const goal = await this.goals.get(goalId)
    const resolved = await this.resolveProject(project)

    const startedMs = Date.now()
    const goalRunId = `${goalId}_${startedMs}`
    const root = path.join(this.dir, goalRunId)
    await fs.mkdir(root, { recursive: true })
    // The objective is the human-readable anchor for the whole run (a forensic artifact).
    await fs.writeFile(path.join(root, "objective.md"), `${goal.objective}\n`, "utf8").catch(() => {})

    const run: GoalRun = {
      goalRunId,
      goalId,
      status: "running",
      currentIteration: 0,
      iterations: [],
      startedAt: new Date(startedMs).toISOString(),
      cwd: root,
      ...(taskId ? { taskId } : {}),
      ...(resolved ? { projectPath: resolved.path } : {}),
      ...(matchedTerms?.length ? { matchedTerms } : {}),
    }
    this.runs.set(goalRunId, run)
    this.prompts.set(goalRunId, prompt || goal.objective)
    await this.writeAggregate(run)

    // Phase 3.1: a git project gets ONE worktree for the whole run; every maker
    // iteration spawns there so its commits land on the goal's own branch. A
    // worktree-setup failure on a git project is fatal (no silent main-checkout use).
    if (resolved && (await this.workspace.isGitRepo(resolved.path))) {
      try {
        run.workspace = await this.workspace.createWorktree({
          projectPath: resolved.path,
          runId: goalRunId,
          slug: title || goalId,
          dir: path.join(root, "worktree"),
        })
        await this.writeAggregate(run)
      } catch (error) {
        if (!(error instanceof WorkspaceSetupError)) throw error
        run.status = "failed"
        run.currentIteration = null
        await this.writeAggregate(run)
        this.log.error("goal run failed: worktree setup", {
          goalRunId,
          projectPath: resolved.path,
          err: error.message,
        })
        return run
      }
    }

    this.log.info("starting goal run", {
      goalId,
      goalRunId,
      maker: `${goal.maker.kind}:${goal.maker.id}`,
      maxIterations: goal.maxIterations,
      branch: run.workspace?.branch,
    })

    const traceId = this.trace.getTraceId() ?? randomUUID()
    void this.trace.run({ traceId, runId: goalRunId }, () => this.drive(run, goal, resolved, files))
    return run
  }

  /**
   * The outer loop. Phase 10.1 scaffold: dispatch the maker for the current
   * iteration, wait for it to reach a terminal state, record the iteration, and
   * stop after one (no verifier yet — Phase 10.2 replaces this body with the real
   * maker → verifier → decideStop loop).
   */
  private async drive(
    run: GoalRun,
    goal: Goal,
    project: Project | null,
    files: string[],
  ): Promise<void> {
    const index = run.currentIteration ?? 0
    const status = await this.runIteration(run, goal, project, files, index)

    run.status = status === "done" ? "done" : status === "paused-limit" ? "paused-limit" : "failed"
    if (run.status !== "paused-limit") run.currentIteration = null
    await this.writeAggregate(run)
    this.log.info("goal run finished (scaffold)", { goalRunId: run.goalRunId, status: run.status })
  }

  /**
   * Run one iteration: dispatch the maker into the goal's worktree, wait for it to
   * finish, and append the iteration record. Returns the maker's mapped terminal
   * status. The verifier is layered on in Phase 10.2.
   */
  protected async runIteration(
    run: GoalRun,
    goal: Goal,
    project: Project | null,
    files: string[],
    index: number,
  ): Promise<GoalIterationStatus> {
    const iteration: GoalIteration = {
      index,
      makerKind: goal.maker.kind,
      verifier: { kind: goal.verifier.kind, satisfied: false, output: "" },
      startedAt: new Date().toISOString(),
      status: "running",
    }
    run.iterations.push(iteration)
    run.currentIteration = index
    await this.writeAggregate(run)

    const makerRunRef = await this.dispatchMaker(run, goal, project, files)
    iteration.makerRunRef = makerRunRef
    await this.writeAggregate(run)

    const status = await this.waitForMaker(goal.maker.kind, makerRunRef)
    iteration.status = status
    iteration.endedAt = new Date().toISOString()
    await this.writeAggregate(run)
    this.log.info("goal iteration maker finished", {
      goalRunId: run.goalRunId,
      index,
      makerRunRef,
      status,
    })
    return status
  }

  /** Dispatch the maker through its own runner (with the goal's worktree); return its run ref. */
  protected async dispatchMaker(
    run: GoalRun,
    goal: Goal,
    project: Project | null,
    files: string[],
  ): Promise<string> {
    const prompt = this.makerPrompt(run, goal)
    const projectRef = project?.id ?? ""
    if (goal.maker.kind === "agent") {
      const r = await this.agentRunner.start(
        goal.maker.id,
        prompt,
        projectRef,
        files,
        goal.name ?? goal.id,
        run.taskId,
        run.matchedTerms,
        run.workspace,
      )
      return r.runId
    }
    const r = await this.pipelineRunner.start(
      goal.maker.id,
      run.taskId,
      projectRef,
      run.matchedTerms,
      run.workspace,
    )
    return r.pipelineRunId
  }

  /** The prompt handed to an agent maker (pipeline makers run their own phases). */
  protected makerPrompt(run: GoalRun, goal: Goal): string {
    const base = this.prompts.get(run.goalRunId) ?? goal.objective
    return [`Goal: ${goal.objective}`, base === goal.objective ? "" : base, goal.instructions]
      .filter(Boolean)
      .join("\n\n")
  }

  /**
   * Poll the maker's own runner until its run reaches a terminal state, then map it
   * to a {@link GoalIterationStatus}: `done` → done, `paused-limit` → paused-limit,
   * everything else (error/interrupted/failed/parked/missing) → failed. Rides
   * through `running` and `awaiting-approval` (the inner mid-run gate is live).
   */
  protected async waitForMaker(
    kind: "agent" | "pipeline",
    runRef: string,
  ): Promise<GoalIterationStatus> {
    for (;;) {
      const raw = this.makerStatus(kind, runRef)
      if (raw === null) return "failed"
      if (raw !== "running" && raw !== "awaiting-approval") {
        if (raw === "done") return "done"
        if (raw === "paused-limit") return "paused-limit"
        return "failed"
      }
      await new Promise((r) => setTimeout(r, 40))
    }
  }

  /** The maker run's current status, or null if the run is unknown (swept/gone). */
  private makerStatus(kind: "agent" | "pipeline", runRef: string): string | null {
    try {
      return kind === "agent"
        ? this.agentRunner.get(runRef).status
        : this.pipelineRunner.get(runRef).status
    } catch {
      return null
    }
  }

  /** Resolve a run's free-form project reference by id then name; null if unknown. */
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
   * Resume a parked goal run with an operator note. Phase 10.1 enforces the 409
   * guard (the run must be parked); the note injection + re-entry into `drive()`
   * at `currentIteration` is implemented in Phase 10.2 once the real loop exists.
   * Throws {@link GoalRunNotParkedError} (→ 409) for any non-parked state.
   */
  async resumeParked(goalRunId: string, note?: string): Promise<GoalRun> {
    const run = this.runs.get(goalRunId) ?? (await this.readAggregate(goalRunId))
    if (!run) throw new GoalRunNotFoundError(goalRunId)
    this.runs.set(goalRunId, run)
    if (run.status !== "parked" || !run.parked) throw new GoalRunNotParkedError(goalRunId)
    this.log.info("goal resume requested (re-drive lands in 10.2)", {
      goalRunId,
      withNote: Boolean(note?.trim()),
    })
    return run
  }

  list(): GoalRun[] {
    const cutoff = Date.now() - RETENTION_MS
    const out: GoalRun[] = []
    for (const [id, run] of this.runs) {
      const finished =
        run.status !== "running" && run.status !== "parked" && run.status !== "paused-limit"
      if (finished && Date.parse(run.startedAt) < cutoff) {
        this.runs.delete(id)
        continue
      }
      out.push(run)
    }
    return out.sort((a, b) => b.startedAt.localeCompare(a.startedAt)).slice(0, MAX_LISTED)
  }

  /** The full goal run history (on disk + in memory), newest first; no age cutoff. */
  async listAll(): Promise<GoalRun[]> {
    const byId = new Map<string, GoalRun>()
    for (const run of await this.readAllAggregates()) byId.set(run.goalRunId, run)
    for (const [id, run] of this.runs) byId.set(id, run)
    return [...byId.values()].sort((a, b) => b.startedAt.localeCompare(a.startedAt))
  }

  get(goalRunId: string): GoalRun {
    const run = this.runs.get(goalRunId)
    if (!run) throw new GoalRunNotFoundError(goalRunId)
    return run
  }

  /** Permanently delete a goal run and all its artifacts (worktree pruned first). */
  async delete(goalRunId: string): Promise<void> {
    const run = this.runs.get(goalRunId) ?? (await this.readAggregate(goalRunId))
    if (!run) throw new GoalRunNotFoundError(goalRunId)
    this.runs.delete(goalRunId)
    this.prompts.delete(goalRunId)
    if (run.workspace && run.projectPath) {
      await this.workspace
        .removeWorktree({ projectPath: run.projectPath, worktreePath: run.workspace.path })
        .catch(() => {})
    }
    const root = this.resolveRunDir(goalRunId)
    if (root) await fs.rm(root, { recursive: true, force: true }).catch(() => {})
  }

  /**
   * Read one whitelisted run artifact by name. `name` must be on
   * {@link GOAL_RUN_ARTIFACTS} — anything else (incl. any traversal attempt)
   * returns null → 404; there is no generic file browser. Returns null when the
   * run is unknown or the file is absent.
   */
  async readArtifact(
    goalRunId: string,
    name: string,
  ): Promise<{ name: GoalRunArtifact["name"]; content: string } | null> {
    if (!(GOAL_RUN_ARTIFACTS as readonly string[]).includes(name)) return null
    const allowed = name as GoalRunArtifact["name"]
    const root = this.resolveRunDir(goalRunId)
    if (!root) return null
    const content = await fs.readFile(path.join(root, allowed), "utf8").catch(() => null)
    return content === null ? null : { name: allowed, content }
  }

  /** Subscribe to aggregate transitions of every goal run (SSE / activity recorder). */
  onRunStatus(listener: (run: GoalRun) => void): () => void {
    this.events.on("status", listener)
    return () => this.events.off("status", listener)
  }

  /** The run's folder inside the runs dir, or null if the id would escape it. */
  private resolveRunDir(goalRunId: string): string | null {
    const dir = path.resolve(this.dir, goalRunId)
    if (path.dirname(dir) !== this.dir) return null
    return dir
  }

  protected async writeAggregate(run: GoalRun): Promise<void> {
    await fs
      .writeFile(path.join(run.cwd, AGGREGATE_FILE), JSON.stringify(run), "utf8")
      .catch(() => {})
    this.events.emit("status", run)
  }

  /** Read a run's aggregate `run.json` from disk (for a run dropped from memory). */
  protected async readAggregate(goalRunId: string): Promise<GoalRun | null> {
    const root = this.resolveRunDir(goalRunId)
    if (!root) return null
    const raw = await fs.readFile(path.join(root, AGGREGATE_FILE), "utf8").catch(() => null)
    if (raw === null) return null
    try {
      const parsed = GoalRunSchema.safeParse(JSON.parse(raw))
      return parsed.success ? parsed.data : null
    } catch {
      return null
    }
  }

  /** Read every `<id>/run.json` aggregate from disk. */
  private async readAllAggregates(): Promise<GoalRun[]> {
    const entries = await fs.readdir(this.dir, { withFileTypes: true }).catch(() => [])
    const out: GoalRun[] = []
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const run = await this.readAggregate(entry.name)
      if (run) out.push(run)
    }
    return out
  }

  /** Rebuild the in-memory registry from disk on boot (full reconciliation in 10.4). */
  private async rehydrate(): Promise<void> {
    for (const run of await this.readAllAggregates()) this.runs.set(run.goalRunId, run)
  }
}
