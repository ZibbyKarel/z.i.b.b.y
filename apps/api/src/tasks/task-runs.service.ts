import * as path from "node:path";
import { Injectable } from "@nestjs/common";
import {
  type AgentRun,
  type GoalRun,
  ORCHESTRATOR_ID,
  type Pipeline,
  type PipelineRun,
  type Processor,
  type RunKind,
  type RunLogChunk,
  type ScheduledTask,
  type TaskRun,
  type TaskTarget,
} from "@zibby/contracts";
import { AgentRunnerService } from "../agents/agent-runner.service";
import { AgentsStorageService } from "../agents/agents.storage.service";
import { GoalRunnerService } from "../goals/goal-runner.service";
import { GoalRunNotStoppableError } from "../goals/goals.errors";
import { GoalsStorageService } from "../goals/goals.storage.service";
import {
  PipelineRunNotStoppableError,
  PipelineRunnerService,
} from "../pipelines/pipeline-runner.service";
import { PipelinesStorageService } from "../pipelines/pipelines.storage.service";
import { ProjectsStorageService } from "../projects/projects.storage.service";
import { ScheduledTasksStorageService } from "./scheduled-tasks.storage.service";

/** The unified run could not be resolved across any runner store (memory or disk). */
export class TaskRunNotFoundError extends Error {
  constructor(runId: string) {
    super(`Task run "${runId}" not found`);
    this.name = "TaskRunNotFoundError";
  }
}

/**
 * The run isn't currently running (already terminal, parked, or paused-limit), or
 * its kind has no stop at all (a scheduled task owns no single live process).
 */
export class TaskRunNotStoppableError extends Error {
  constructor(runId: string) {
    super(`Task run "${runId}" cannot be stopped (not currently running)`);
    this.name = "TaskRunNotStoppableError";
  }
}

/**
 * The run's kind/state has no resume: a parked pipeline/goal run can be resumed, and
 * (Phase 49) an errored/interrupted agent run can be re-run — anything else (a running
 * run, a non-parked pipeline/goal, an agent run that didn't end in error/interrupted)
 * throws this, which the controller maps to a 409.
 */
export class TaskRunNotResumableError extends Error {
  constructor(runId: string) {
    super(
      `Task run "${runId}" cannot be resumed (parked pipeline/goal runs, or errored/interrupted agent runs)`,
    );
    this.name = "TaskRunNotResumableError";
  }
}

/** Definition id → human name, per processor kind. */
interface NameMaps {
  agent: ReadonlyMap<string, string>;
  pipeline: ReadonlyMap<string, string>;
  goal: ReadonlyMap<string, string>;
}

/** Registered project id / absolute path → human name, for resolving a run's display project. */
interface ProjectNameMaps {
  byId: ReadonlyMap<string, string>;
  byPath: ReadonlyMap<string, string>;
}

/**
 * The unified task-run surface. Owns the merge that used to live in the web
 * (`mergeRunFeed` + the per-kind `*ToView` converters): it reads all three runner
 * histories plus the still-waiting scheduled tasks, folds a goal's maker/verifier
 * child runs out of the feed (shipped Phase-26 behaviour — one card per task), and
 * resolves the human processor name from the definition stores.
 *
 * Every lifecycle sub-resource takes a bare `runId`; {@link kindOf} resolves the
 * owning runner (in-memory fast path, on-disk fallback) and the helper delegates.
 */
@Injectable()
export class TaskRunsService {
  constructor(
    private readonly agentRunner: AgentRunnerService,
    private readonly pipelineRunner: PipelineRunnerService,
    private readonly goalRunner: GoalRunnerService,
    private readonly agentsStore: AgentsStorageService,
    private readonly pipelinesStore: PipelinesStorageService,
    private readonly goalsStore: GoalsStorageService,
    private readonly projectsStore: ProjectsStorageService,
    private readonly scheduled: ScheduledTasksStorageService,
  ) {}

  /**
   * The unified feed, newest-first. A goal dispatches its maker as a child
   * agent/pipeline run (`iteration.makerRunRef`) and its claude verifier as another
   * (`verifier.runRef`); those are execution detail of the goal task, so they are
   * folded **out** here (their data surfaces inside the goal's detail).
   */
  async listTaskRuns(): Promise<TaskRun[]> {
    const { runs, childRunIds } = await this.collect();
    return runs
      .filter((r) => !childRunIds.has(r.runId))
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  }

  /**
   * A single run by id — searched in the **unfolded** set, so a goal's folded
   * maker/verifier child run is still reachable (the goal detail fetches it by ref).
   * Resolves historical on-disk runs (the per-kind `listAll()` merge disk + memory).
   */
  async getTaskRun(runId: string): Promise<TaskRun> {
    const { runs } = await this.collect();
    const found = runs.find((r) => r.runId === runId);
    if (!found) throw new TaskRunNotFoundError(runId);
    return found;
  }

  /** Read an agent (or goal-child agent) run's log from a byte offset. */
  async getLogs(runId: string, offset: number): Promise<RunLogChunk> {
    const kind = await this.kindOf(runId);
    if (kind !== "agent") throw new TaskRunNotFoundError(runId);
    return this.agentRunner.readLog(runId, offset);
  }

  /** Read a pipeline run's stage log by phase id, from a byte offset. */
  async getStageLog(runId: string, phaseId: string, offset: number): Promise<RunLogChunk> {
    const kind = await this.kindOf(runId);
    if (kind !== "pipeline") throw new TaskRunNotFoundError(runId);
    return this.pipelineRunner.readStageLog(runId, phaseId, offset);
  }

  /**
   * Subscribe to append signals for a pipeline stage's log (the SSE tail's wake
   * signal; reads still go through {@link getStageLog}). Synchronous by design —
   * the stream pump subscribes before its first read — so there is no kind check
   * here: a non-pipeline id never matches a pipeline run and simply never fires,
   * while the read path keeps owning the 404.
   */
  onStageLogAppend(runId: string, phaseId: string, listener: () => void): () => void {
    return this.pipelineRunner.onStageLogAppend(runId, phaseId, listener);
  }

  /** Read one whitelisted run artifact (the owning runner enforces its allowlist). */
  async getArtifact(
    runId: string,
    name: string,
  ): Promise<{ name: string; content: string } | null> {
    const kind = await this.kindOf(runId);
    if (kind === "pipeline") return this.pipelineRunner.readArtifact(runId, name);
    if (kind === "goal") return this.goalRunner.readArtifact(runId, name);
    return null;
  }

  /**
   * Phase 43 — stop a running agent, pipeline, or goal run: resolve the owning
   * runner and delegate to its own `stop`, which kills the live child through the
   * shared RunnerCore process governance (pgid kill, `interrupted` landing). A
   * scheduled run (or a kind-specific run that isn't currently running) has
   * no stop; its own runner's "not stoppable" error is normalized here to the
   * unified {@link TaskRunNotStoppableError} the controller maps to a 409.
   */
  async stop(runId: string): Promise<TaskRun> {
    const kind = await this.kindOf(runId);
    try {
      if (kind === "agent") this.agentRunner.stop(runId);
      else if (kind === "pipeline") await this.pipelineRunner.stop(runId);
      else if (kind === "goal") await this.goalRunner.stop(runId);
      else throw new TaskRunNotStoppableError(runId);
    } catch (error) {
      if (
        error instanceof PipelineRunNotStoppableError ||
        error instanceof GoalRunNotStoppableError
      ) {
        throw new TaskRunNotStoppableError(runId);
      }
      throw error;
    }
    return this.getTaskRun(runId);
  }

  /**
   * Resume a run. A parked pipeline/goal run resumes in place with an operator note.
   * Phase 49: an errored/interrupted AGENT run is instead re-run — a NEW run spawns
   * (with `--resume <sessionId>` when the errored run captured one, else fresh) and is
   * returned, so the caller navigates to it. Any other kind/state → not resumable (409).
   */
  async resume(runId: string, note?: string): Promise<TaskRun> {
    const kind = await this.kindOf(runId);
    if (kind === "pipeline") await this.pipelineRunner.resumeParked(runId, note);
    else if (kind === "goal") await this.goalRunner.resumeParked(runId, note);
    else if (kind === "agent") return this.rerunAgent(runId);
    else throw new TaskRunNotResumableError(runId);
    return this.getTaskRun(runId);
  }

  /**
   * Phase 49: re-run an agent run that ended in error/interrupted (a running or
   * otherwise-stated agent run has nothing to re-run → 409). Spawns a NEW run through
   * the agent runner's shared spawn/pgid/timeout/registry governance (with `--resume`
   * when a session id was captured), then re-points the originating task at the new
   * run — clearing the prior errored outcome so the fresh run's terminal writes back
   * and the original task's output/PR gate still fires. Operator-initiated, so it is
   * allowed like any task launch; no autonomous commit/push is introduced. Returns the
   * NEW run.
   */
  private async rerunAgent(runId: string): Promise<TaskRun> {
    const run = await this.getTaskRun(runId);
    if (run.status !== "error" && run.status !== "interrupted") {
      throw new TaskRunNotResumableError(runId);
    }
    const newRun = await this.agentRunner.rerun(runId);
    if (run.taskId) await this.scheduled.reassignRun(run.taskId, newRun.runId);
    return this.getTaskRun(newRun.runId);
  }

  /**
   * Phase 24 Part D: assign (or clear, with `null`) a run's project — an explicit
   * operator action, distinct from the path-derived `matchProject` attribution a
   * task gets at creation time. Persists onto the run's backing scheduled-task
   * record (the join `enrichRunWithTask`/`scheduledTaskToView` read from), since
   * that record — not the per-kind run — is `projectId`'s source of truth. A run
   * with no backing task (e.g. a self-dev goal started outside the task flow) has
   * nowhere durable to persist the assignment, so it is returned unchanged.
   */
  async assignProject(runId: string, projectId: string | null): Promise<TaskRun> {
    const run = await this.getTaskRun(runId);
    const taskId = run.kind === "scheduled" ? run.runId : run.taskId;
    if (taskId) await this.scheduled.setProjectId(taskId, projectId);
    return this.getTaskRun(runId);
  }

  /** Permanently delete a run and all its artifacts. */
  async delete(runId: string): Promise<void> {
    const kind = await this.kindOf(runId);
    if (kind === "agent") await this.agentRunner.delete(runId);
    else if (kind === "pipeline") await this.pipelineRunner.delete(runId);
    else if (kind === "goal") await this.goalRunner.delete(runId);
    else throw new TaskRunNotFoundError(runId);
  }

  /**
   * Which runner owns `runId`. Tries the in-memory registries first (the hot path —
   * a tailed/stopped/resumed run is almost always live), then falls back to the
   * on-disk histories so a historical run still resolves. Returns null-throwing
   * {@link TaskRunNotFoundError} when no trace exists in any store.
   */
  private async kindOf(runId: string): Promise<Exclude<RunKind, "scheduled">> {
    if (tryGet(() => this.agentRunner.get(runId))) return "agent";
    if (tryGet(() => this.pipelineRunner.get(runId))) return "pipeline";
    if (tryGet(() => this.goalRunner.get(runId))) return "goal";
    const { runs } = await this.collect();
    const found = runs.find((r) => r.runId === runId);
    if (found && found.kind !== "scheduled") return found.kind;
    throw new TaskRunNotFoundError(runId);
  }

  /**
   * The full unfolded set of run views (every agent/pipeline/goal run + still-waiting
   * scheduled task), with processor + task enrichment attached, plus the set of goal
   * child run ids the feed folds out.
   */
  private async collect(): Promise<{ runs: TaskRun[]; childRunIds: Set<string> }> {
    const [agents, pipelines, goals, scheduled, agentDefs, pipelineDefs, goalDefs, projects] =
      await Promise.all([
        this.agentRunner.listAll(),
        this.pipelineRunner.listAll(),
        this.goalRunner.listAll(),
        this.scheduled.list(),
        this.agentsStore.list(),
        this.pipelinesStore.list(),
        this.goalsStore.list(),
        this.projectsStore.list(),
      ]);

    const names: NameMaps = {
      agent: new Map(agentDefs.map((d) => [d.id, d.name ?? d.id])),
      pipeline: new Map(pipelineDefs.map((d) => [d.id, d.name ?? d.id])),
      goal: new Map(goalDefs.map((d) => [d.id, d.name ?? d.id])),
    };
    const projectNames: ProjectNameMaps = {
      byId: new Map(projects.map((p) => [p.id, p.name])),
      // `path` is optional (Phase 98, machine-local) — only projects that have one
      // on this machine's registry contribute a path→name entry.
      byPath: new Map(projects.flatMap((p) => (p.path ? [[p.path, p.name] as const] : []))),
    };
    const tasksById = new Map(scheduled.map((t) => [t.id, t]));
    const pipelineDefsById = new Map(pipelineDefs.map((d) => [d.id, d]));

    const childRunIds = new Set<string>();
    for (const g of goals) {
      for (const it of g.iterations) {
        if (it.makerRunRef) childRunIds.add(it.makerRunRef);
        if (it.verifier.runRef) childRunIds.add(it.verifier.runRef);
      }
    }

    const runs: TaskRun[] = [
      ...agents.map((r) =>
        resolveProjectDisplay(
          enrichRunWithTask(this.withProcessor(agentRunToView(r, projectNames), names), tasksById),
          projectNames,
        ),
      ),
      ...pipelines.map((r) =>
        resolveProjectDisplay(
          enrichRunWithTask(
            this.withProcessor(
              pipelineRunToView(r, projectNames, pipelineDefsById.get(r.pipelineId)),
              names,
            ),
            tasksById,
          ),
          projectNames,
        ),
      ),
      ...goals.map((r) =>
        resolveProjectDisplay(
          enrichRunWithTask(this.withProcessor(goalRunToView(r, projectNames), names), tasksById),
          projectNames,
        ),
      ),
      ...scheduled.flatMap((t) => scheduledTaskToView(t) ?? []),
    ];
    return { runs, childRunIds };
  }

  /** Attach the processor metadata for an agent/pipeline/goal run view. */
  private withProcessor(view: TaskRun, names: NameMaps): TaskRun {
    const processor = processorFor(view.kind, view.owner, names);
    return processor ? { ...view, processor } : view;
  }
}

/** Run a synchronous runner `get`, returning whether it found the run (swallows not-found). */
function tryGet<T>(fn: () => T): boolean {
  try {
    fn();
    return true;
  } catch {
    return false;
  }
}

/** The processor for a run-kind/owner pair, falling its name back to the id when the definition is gone. */
function processorFor(kind: RunKind, owner: string, names: NameMaps): Processor | undefined {
  if (kind === "agent" || kind === "pipeline" || kind === "goal") {
    if (!owner) return undefined;
    return { kind, id: owner, name: names[kind].get(owner) ?? owner };
  }
  return undefined;
}

// ── Pure converters (ported from apps/web/features/runs/run.ts) ──────────────

/**
 * Resolve a run's raw `project` reference (an agent run's free-form label — an
 * id, a name, or a browser-relative path with no registry entry) against the
 * registry by id, falling back to the reference itself unresolved.
 */
function resolveAgentProjectLabel(projectRef: string, projectNames: ProjectNameMaps): string {
  return projectNames.byId.get(projectRef) ?? projectRef;
}

function agentRunToView(r: AgentRun, projectNames: ProjectNameMaps): TaskRun {
  return {
    runId: r.runId,
    kind: "agent",
    owner: r.agentId,
    status: r.status,
    pct: r.pct,
    title: r.title,
    prompt: r.prompt,
    project: resolveAgentProjectLabel(r.project, projectNames),
    startedAt: r.startedAt,
    logBase: "agents",
    taskId: r.taskId,
    resumeAt: r.resumeAt,
    limitResumeCycles: r.limitResumeCycles,
    costUsd: r.costUsd,
    // Phase 49: surface the captured session id so the detail's re-run button knows
    // whether it can continue the session (`--resume`) or must start fresh.
    sessionId: r.sessionId,
  };
}

/**
 * Total cost across a pipeline run's stages, or `undefined` when none carry
 * `costUsd` (a run from before the costing feature) — so an old run doesn't show a
 * misleading "$0.00". Shared with `task-scheduler.service.ts`'s cost-line write on
 * pipeline outcome (Phase 12) so the two never compute it differently.
 */
export function sumStageCosts(stageRuns: readonly { costUsd?: number }[]): number | undefined {
  const withCost = stageRuns.filter((s) => s.costUsd != null);
  return withCost.length ? withCost.reduce((sum, s) => sum + (s.costUsd ?? 0), 0) : undefined;
}

/**
 * The run's target-project display label, resolved from the resolved project's
 * absolute `projectPath` — never the run's own sandbox `cwd` (a pipeline/goal run's
 * `cwd` is its per-phase sandbox root, named `${id}_${startedMs}`, which reads as a
 * meaningless id when shown as "project"). Falls back to the path's basename when
 * the project isn't (or is no longer) in the registry; "" when the run has no
 * resolved project at all (sandbox-only).
 */
function resolveSandboxProjectLabel(
  projectPath: string | undefined,
  projectNames: ProjectNameMaps,
): string {
  if (!projectPath) return "";
  return projectNames.byPath.get(projectPath) ?? path.basename(projectPath);
}

function pipelineRunToView(
  r: PipelineRun,
  projectNames: ProjectNameMaps,
  pipeline?: Pipeline,
): TaskRun {
  // A directed task's per-run override wins; absent that, the pipeline definition's
  // own `outputs:` is the default sink (mirrors the delivery path's own fallback —
  // `run.outputsOverride ?? pipeline.outputs` in PipelineRunnerService.runOutputs).
  const fileOutput =
    r.outputsOverride?.find((o) => o.type === "file") ??
    pipeline?.outputs?.find((o) => o.type === "file");
  const costUsd = sumStageCosts(r.stageRuns);
  const status: TaskRun["status"] =
    r.status === "paused-limit"
      ? "paused-limit"
      : r.status === "parked"
        ? r.parkedReason === "retries" || r.parkedReason === "limit"
          ? "parked"
          : "awaiting-approval"
        : r.status === "failed"
          ? "error"
          : r.status === "done"
            ? "done"
            : r.status === "interrupted"
              ? "interrupted"
              : "running";
  return {
    runId: r.pipelineRunId,
    kind: "pipeline",
    owner: r.pipelineId,
    status,
    pct: null,
    title: "",
    prompt: r.currentStage ? `fáze: ${r.currentStage}` : "",
    project: resolveSandboxProjectLabel(r.projectPath, projectNames),
    startedAt: r.startedAt,
    logBase: null,
    taskId: r.taskId,
    parked: r.parked,
    resumeAt: r.resumeAt,
    limitResumeCycles: r.limitResumeCycles,
    checkpoints: r.checkpoints,
    stageRuns: r.stageRuns,
    currentStage: r.currentStage,
    outputArtifactName: fileOutput?.from,
    costUsd,
  };
}

function goalRunToView(r: GoalRun, projectNames: ProjectNameMaps): TaskRun {
  const status: TaskRun["status"] =
    r.status === "paused-limit"
      ? "paused-limit"
      : r.status === "parked"
        ? "parked"
        : r.status === "failed"
          ? "error"
          : r.status === "done"
            ? "done"
            : r.status === "interrupted"
              ? "interrupted"
              : "running";
  return {
    runId: r.goalRunId,
    kind: "goal",
    owner: r.goalId,
    status,
    pct: null,
    title: "",
    prompt: r.currentIteration != null ? `iterace ${r.currentIteration + 1}` : "",
    project: resolveSandboxProjectLabel(r.projectPath, projectNames),
    startedAt: r.startedAt,
    logBase: null,
    taskId: r.taskId,
    resumeAt: r.resumeAt,
    limitResumeCycles: r.limitResumeCycles,
    goalId: r.goalId,
    iterations: r.iterations,
    goalParked: r.parked,
    goalParkedReason: r.parkedReason,
  };
}

function enrichRunWithTask(run: TaskRun, tasksById: ReadonlyMap<string, ScheduledTask>): TaskRun {
  if (!run.taskId) return run;
  const task = tasksById.get(run.taskId);
  if (!task) return run;
  return {
    ...run,
    taskTitle: task.title || task.text,
    taskText: task.text,
    taskOutcome: task.outcome?.status,
    taskOutcomeSummary: task.outcome?.summary,
    taskOutcomeFinishedAt: task.outcome?.finishedAt,
    taskOutputKind: task.output?.type,
    // The structured PR result (url + line totals) when the task's `pr` output opened a
    // PR — what makes the detail render the compact link + coloured `+/−` surface.
    ...(task.outcome?.pr ? { prOutput: task.outcome.pr } : {}),
    attachments: task.attachments,
    // Phase 65: carried alongside `attachments` so the detail can build the
    // open-file serve URL (`GET /api/tasks/attachments/:setId/:name`).
    ...(task.attachmentSetId ? { attachmentSetId: task.attachmentSetId } : {}),
    // F2c: the switchboard's stage-1 classification trace, enriched onto the run
    // exactly like every other task-sourced field here — read-model-only.
    ...(task.classification ? { classification: task.classification } : {}),
    // The engagement id lives on the scheduled task; agent/pipeline/goal run
    // views don't carry it themselves, so join it in here (scheduled rows set it
    // directly). This is what lets the feed be filtered by project and the project
    // detail summarise its runs. Runs with no owning task (e.g. a self-dev goal)
    // simply keep no projectId and fall outside every project filter.
    ...(task.projectId ? { projectId: task.projectId } : {}),
  };
}

/**
 * The task's `projectId` (the engagement FK) is the authoritative source for a
 * run's project — it wins over the kind-specific `project` label (an agent run's
 * free-form reference, or a pipeline/goal run's resolved-path guess) whenever it
 * resolves to a registered project. Runs with no owning task, or whose project was
 * since deleted, keep their existing `project` label unchanged.
 */
function resolveProjectDisplay(run: TaskRun, projectNames: ProjectNameMaps): TaskRun {
  if (!run.projectId) return run;
  const name = projectNames.byId.get(run.projectId);
  return name ? { ...run, project: name } : run;
}

/** Owner id a routed target reads as: the stored definition id, or the orchestrator id. */
function targetOwner(target: TaskTarget | undefined): string {
  if (!target) return "";
  return target.kind === "orchestrator" ? ORCHESTRATOR_ID : target.id;
}

/** A processor for a scheduled task's chosen target, when it references a stored definition. */
function scheduledProcessor(target: TaskTarget | undefined): Processor | undefined {
  if (!target) return undefined;
  if (target.kind === "agent" || target.kind === "pipeline" || target.kind === "goal") {
    return { kind: target.kind, id: target.id, name: target.name };
  }
  return undefined;
}

function scheduledTaskToView(t: ScheduledTask): TaskRun | null {
  if (t.status === "dispatched") return null;
  const status: TaskRun["status"] =
    t.status === "scheduled"
      ? "scheduled"
      : t.status === "queued"
        ? "queued"
        : t.status === "held"
          ? "held"
          : t.status === "pending"
            ? "pending"
            : t.status === "cancelled"
              ? "interrupted"
              : "error";
  const processor = scheduledProcessor(t.target);
  return {
    runId: t.id,
    kind: "scheduled",
    owner: targetOwner(t.target),
    status,
    pct: null,
    title: t.title,
    prompt: t.text,
    project: "",
    startedAt: new Date(t.scheduledAt).toISOString(),
    logBase: null,
    ...(processor ? { processor } : {}),
    projectId: t.projectId,
    heldReason: t.heldReason,
    approvalId: t.approvalId,
    deferredLimit: t.deferredReason === "limit",
  };
}
