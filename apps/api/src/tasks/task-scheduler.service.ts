import { randomUUID } from "node:crypto"
import {
  Injectable,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
  type OnModuleInit,
} from "@nestjs/common"
import type {
  AgentRun,
  CreateTaskInput,
  CreateTaskResult,
  PipelineRun,
  Project,
  ScheduledTask,
  TaskOutcome,
  TaskTarget,
} from "@zibby/contracts"
import { ActivityLogService } from "../activity/activity-log.service"
import { AgentRunnerService } from "../agents/agent-runner.service"
import { ApprovalsService, type ResumableRunner } from "../approvals/approvals.service"
import { BudgetService } from "../budget/budget.service"
import { GateEvaluatorService } from "../gates/gate-evaluator.service"
import { PipelineRunnerService } from "../pipelines/pipeline-runner.service"
import { ProjectsStorageService } from "../projects/projects.storage.service"
import { matchProject } from "../projects/project-matcher"
import { withPathLock } from "../shared/file-storage"
import { LoggerService, type ScopedLogger } from "../shared/logging/logger.service"
import { TraceContextService } from "../shared/logging/trace-context.service"
import { ScheduledTasksStorageService } from "./scheduled-tasks.storage.service"
import { TaskClassifierService } from "./task-classifier.service"

/** Thrown when there is nothing to route to (empty catalog) → the controller maps it to 422. */
export class EmptyCatalogError extends Error {
  constructor() {
    super("No agents or pipelines available to route to")
    this.name = "EmptyCatalogError"
  }
}

/** Outcome summaries keep to one short, readable line. */
const SUMMARY_MAX_CHARS = 200

/** The action name the spend-past-cap floor rule keys on (decision 5). */
const SPEND_PAST_CAP = "spend-past-cap"

/** Agent run statuses that free a concurrency slot. */
const TERMINAL_AGENT = new Set<AgentRun["status"]>(["done", "error", "interrupted"])
/** Pipeline run statuses that free a concurrency slot. */
const TERMINAL_PIPELINE = new Set<PipelineRun["status"]>(["done", "failed"])

/**
 * The deferred-task daemon. {@link createTask} is the single action behind the New
 * Task dialog: a task with no (or a past) `scheduledAt` is classified and dispatched
 * immediately; a future `scheduledAt` is parked in storage for the once-a-minute
 * {@link tick} to fire when due. Dispatch routes through the normal runners — so a
 * scheduled task still hits the approval gate exactly like an immediate one.
 *
 * Phase 8: before any immediate or fired dispatch, the task is attributed to an
 * engagement ({@link matchProject}, deterministic + token-free) and run through the
 * budget/concurrency guard ({@link attemptDispatch}). Over a budget cap → the task is
 * HELD behind a Tier-3 `spend-past-cap` approval (Law 3: no autonomous spend past
 * budget). At a project's `maxConcurrent` → the task is QUEUED (FIFO bookkeeping, no
 * approval) and drained when one of that project's runs reaches a terminal state.
 *
 * The heartbeat mirrors the automations {@link SchedulerService}: a tick of 0 (the
 * test default) disables the loop so tests drive {@link tick} directly.
 */
@Injectable()
export class TaskSchedulerService implements OnModuleInit, OnApplicationBootstrap, OnModuleDestroy {
  private timer: ReturnType<typeof setInterval> | null = null
  private readonly unsubscribes: Array<() => void> = []
  private readonly log: ScopedLogger
  /**
   * Task ids the operator has approved to spend past budget (release-once). A
   * released task that has to wait for a concurrency slot re-enters the queue, and
   * the drain must NOT re-hold it for the same overage — it skips the budget check
   * for ids in this set, then clears the id once it actually dispatches. In-memory
   * by design: the approval record is the durable source of truth across restart.
   */
  private readonly budgetApproved = new Set<string>()

  constructor(
    private readonly storage: ScheduledTasksStorageService,
    private readonly classifier: TaskClassifierService,
    private readonly agentRunner: AgentRunnerService,
    private readonly pipelineRunner: PipelineRunnerService,
    private readonly logger: LoggerService,
    private readonly trace: TraceContextService,
    private readonly activity: ActivityLogService,
    private readonly projects: ProjectsStorageService,
    private readonly budget: BudgetService,
    private readonly approvals: ApprovalsService,
    private readonly gates: GateEvaluatorService,
  ) {
    this.log = logger.child(TaskSchedulerService.name)
  }

  onModuleInit(): void {
    // Fast path of the outcome write-back + the concurrency-queue drain: a terminal
    // run carrying a taskId writes its verdict onto the task record, and ANY terminal
    // run frees a slot that a queued task for the same engagement can take.
    this.unsubscribes.push(
      this.agentRunner.onRunStatus((run) => {
        if (run.taskId) void this.writeAgentOutcome(run.taskId, run)
        if (TERMINAL_AGENT.has(run.status)) void this.drainQueues()
      }),
      this.pipelineRunner.onRunStatus((run) => {
        if (run.taskId) void this.writePipelineOutcome(run.taskId, run)
        if (TERMINAL_PIPELINE.has(run.status)) void this.drainQueues()
      }),
    )

    // The kind-"task" runner: a held task's `spend-past-cap` approval resumes it
    // (dispatch once, past the cap) or cancels it. Registered here so approving a
    // held task is never a silent no-op (the Phase-5 channel-runner lesson).
    const runner: ResumableRunner = {
      resume: (taskId) => this.releaseHeld(taskId),
      cancel: (taskId) => void this.storage.cancel(taskId),
    }
    this.approvals.register("task", runner)

    // Default to a 30s heartbeat in real runs; tests set TASK_TICK_MS=0 to disable it.
    const raw = process.env.TASK_TICK_MS
    const tickMs = raw === undefined ? 30_000 : Number(raw)
    if (tickMs > 0) {
      this.timer = setInterval(() => void this.tick(), tickMs)
      this.timer.unref?.()
      this.log.info("task scheduler started", { tickMs })
    } else {
      this.log.debug("task scheduler tick disabled (TASK_TICK_MS <= 0)")
    }
  }

  /**
   * Catch-up sweep AFTER every module finished init (the runners' registries are
   * rebuilt from disk by then): write any missed outcomes, then re-arm the queues —
   * a slot may have freed while the API was down, so drain every project's queue once.
   */
  onApplicationBootstrap(): void {
    void this.sweepOutcomes().then(() => this.drainQueues())
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer)
    for (const unsubscribe of this.unsubscribes) unsubscribe()
  }

  /**
   * Create a task. A future `scheduledAt` parks it (→ `scheduled`); otherwise it is
   * attributed, budget/concurrency-guarded and dispatched now. Over a cap the task is
   * persisted `held` (behind an approval); at capacity it is persisted `queued`; both
   * surface to the client as a parked task (`outcome: "scheduled"`). Throws
   * {@link EmptyCatalogError} when an immediate dispatch has nothing to route to.
   */
  /**
   * @param trustedProjectId set ONLY by server-side callers (the channel triage flow,
   * which already matched the engagement over sanitized text). It bypasses the
   * matcher; the public contract never accepts it from a client (Law 4 — attribution
   * is server-derived, never client-asserted).
   */
  async createTask(
    input: CreateTaskInput,
    now: number = Date.now(),
    trustedProjectId?: string,
  ): Promise<CreateTaskResult> {
    const project = trustedProjectId
      ? await this.projects.get(trustedProjectId).catch((): Project | null => null)
      : matchProject(await this.projects.list().catch((): Project[] => []), {
          text: input.text,
          paths: input.paths,
        })

    if (input.scheduledAt != null && input.scheduledAt > now) {
      const task = await this.storage.create(
        { ...input, scheduledAt: input.scheduledAt },
        new Date(now).toISOString(),
        project?.id,
      )
      this.log.info("task scheduled", { id: task.id, scheduledAt: task.scheduledAt, projectId: project?.id })
      void this.activity.record({
        kind: "task-created",
        summary: `task scheduled${task.title ? `: ${task.title}` : ""}`,
        refs: { taskId: task.id, status: "scheduled", ...(project ? { projectId: project.id } : {}) },
      })
      return { outcome: "scheduled", task }
    }

    // Generate the id BEFORE dispatch so the run is born linked to its task.
    const taskId = this.storage.newId()
    void this.activity.record({
      kind: "task-created",
      summary: `task created${input.title ? `: ${input.title}` : ""}`,
      refs: { taskId, ...(project ? { projectId: project.id } : {}) },
    })
    return this.attemptCreate(taskId, input, project, now)
  }

  /** Cancel a still-waiting task. A held task's approval is rejected (single source of truth). */
  async cancel(id: string): Promise<ScheduledTask> {
    const task = await this.storage.get(id)
    if (task.status === "held" && task.approvalId) {
      // Route through approvals.reject → the kind-"task" runner cancels the task.
      await this.approvals.reject(task.approvalId).catch(() => {})
      return this.storage.get(id)
    }
    return this.storage.cancel(id)
  }

  /** Fire every scheduled task whose time has come; returns the fired ids. */
  async tick(now: Date = new Date()): Promise<string[]> {
    const fired: string[] = []
    for (const task of await this.storage.list()) {
      if (task.status !== "scheduled") continue
      if (task.scheduledAt > now.getTime()) continue
      // Each fired task gets its own trace scope (no request to inherit one), so the
      // run it dispatches links back to this tick.
      await this.trace.run({ traceId: randomUUID() }, async () => {
        try {
          const project = task.projectId
            ? await this.projects.get(task.projectId).catch((): Project | null => null)
            : null
          const result = await this.attemptDispatch(task, project, now, { skipBudget: false })
          if (result === "dispatched") fired.push(task.id)
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err)
          await this.storage.markFailed(task.id, message)
          this.log.error("scheduled task failed", { id: task.id, error: message })
        }
      })
    }
    return fired
  }

  /**
   * The immediate-create guard: attribute, budget-check, then either hold, queue, or
   * dispatch — returning the client-facing {@link CreateTaskResult}. A held/queued
   * task surfaces as `outcome: "scheduled"` (a parked task the feed renders by status).
   */
  private async attemptCreate(
    taskId: string,
    input: CreateTaskInput,
    project: Project | null,
    now: number,
  ): Promise<CreateTaskResult> {
    const projectId = project?.id
    const check = await this.budget.check(projectId, new Date(now))
    if (!check.ok) {
      const task = await this.storage.createHeld(taskId, input, projectId, check.detail, now)
      const held = await this.holdForApproval(task, project, check.detail)
      return { outcome: "scheduled", task: held }
    }
    if (await this.atCapacity(project)) {
      const task = await this.storage.createQueued(taskId, input, projectId, now)
      this.recordQueued(task, project)
      return { outcome: "scheduled", task }
    }
    const dispatched = await this.dispatch(input.text, input.paths ?? [], input.title ?? "", taskId, projectId)
    if (!dispatched) throw new EmptyCatalogError()
    const task = await this.persistDispatched(taskId, input, dispatched, projectId, now)
    void this.reconcileOutcome(task)
    return { outcome: "dispatched", runRef: dispatched.runRef, target: dispatched.target, task }
  }

  /**
   * The guard for an EXISTING task record (the tick fire path, the queue drain, and
   * the release path). Returns the resulting state. `skipBudget` is the release-once
   * bypass — an operator-approved overage skips the budget check but still honors
   * concurrency. Records the budget ledger line on every actual dispatch.
   */
  private async attemptDispatch(
    task: ScheduledTask,
    project: Project | null,
    now: number | Date,
    opts: { skipBudget: boolean },
  ): Promise<"dispatched" | "queued" | "held" | "failed"> {
    const at = typeof now === "number" ? new Date(now) : now
    if (!opts.skipBudget) {
      const check = await this.budget.check(task.projectId, at)
      if (!check.ok) {
        await this.storage.markHeld(task.id, check.detail)
        await this.holdForApproval(task, project, check.detail)
        return "held"
      }
    }
    if (await this.atCapacity(project)) {
      await this.storage.markQueued(task.id)
      this.recordQueued(task, project)
      return "queued"
    }
    const dispatched = await this.dispatch(task.text, task.paths, task.title, task.id, task.projectId)
    if (!dispatched) {
      await this.storage.markFailed(task.id, "No agents or pipelines available to route to")
      this.log.warn("task failed: empty catalog", { id: task.id })
      return "failed"
    }
    await this.recordLedger(task.id, task.projectId, dispatched)
    const updated = await this.storage.markDispatched(task.id, dispatched.runRef, dispatched.target)
    this.budgetApproved.delete(task.id)
    void this.reconcileOutcome(updated)
    this.recordDispatchedActivity(task.id, task.projectId, dispatched)
    this.log.info("task dispatched", { id: task.id, runRef: dispatched.runRef, projectId: task.projectId })
    return "dispatched"
  }

  /** True when the project caps concurrency and is already at its `maxConcurrent`. */
  private async atCapacity(project: Project | null): Promise<boolean> {
    const max = project?.budget?.maxConcurrent
    if (project == null || max == null) return false
    return (await this.budget.countRunning(project.id)) >= max
  }

  /** Park a held task behind a `spend-past-cap` approval; returns the stamped task. */
  private async holdForApproval(
    task: ScheduledTask,
    project: Project | null,
    detail: string,
  ): Promise<ScheduledTask> {
    // Evaluate the floor so a `gate-decision` is recorded (the approval IS the gate).
    this.gates.evaluate(await this.gates.floor(), { action: SPEND_PAST_CAP })
    const approval = await this.approvals.requestApproval({
      runId: task.id,
      kind: "task",
      skill: project?.name ?? "global",
      action: SPEND_PAST_CAP,
      detail,
      risk: "medium",
    })
    const stamped = await this.storage.setApproval(task.id, approval.id)
    void this.activity.record({
      kind: "task-held",
      summary: `task held — ${detail}`,
      refs: {
        taskId: task.id,
        approvalId: approval.id,
        ...(task.projectId ? { projectId: task.projectId } : {}),
      },
    })
    this.log.info("task held over budget", { id: task.id, approvalId: approval.id, detail })
    return stamped
  }

  /** The kind-"task" approval resume: dispatch a held task once, past the cap. */
  private async releaseHeld(taskId: string): Promise<void> {
    let task: ScheduledTask
    try {
      task = await this.storage.get(taskId)
    } catch {
      this.log.warn("release skipped: task gone", { taskId })
      return
    }
    if (task.status !== "held") {
      this.log.info("release skipped: task no longer held", { taskId, status: task.status })
      return
    }
    // Mark the overage approved so a wait-for-slot re-queue won't re-hold it.
    this.budgetApproved.add(taskId)
    const project = task.projectId
      ? await this.projects.get(task.projectId).catch((): Project | null => null)
      : null
    await this.attemptDispatch(task, project, Date.now(), { skipBudget: true })
  }

  /**
   * Drain every project's concurrency queue: for each project with queued tasks,
   * dispatch the oldest first while a slot is free. A normal queued task re-runs the
   * full guard (budget first — it can become held if the budget filled meanwhile); a
   * released (budget-approved) task skips only the budget check.
   */
  private drainQueues(): Promise<void> {
    // Serialize all drains: many terminal events fire near-simultaneously, and two
    // overlapping drains would both read the same task as `queued` and dispatch it
    // twice (a TOCTOU double-dispatch). The lock makes each drain see the prior
    // drain's markDispatched, so a queued task is dispatched exactly once.
    return withPathLock("scheduler:drain", async () => {
      const queued = (await this.storage.list().catch((): ScheduledTask[] => []))
        .filter((t) => t.status === "queued" && t.projectId)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt)) // FIFO
      if (queued.length === 0) return
      const byProject = new Map<string, ScheduledTask[]>()
      for (const task of queued) {
        const list = byProject.get(task.projectId as string) ?? []
        list.push(task)
        byProject.set(task.projectId as string, list)
      }
      for (const [projectId, list] of byProject) {
        const project = await this.projects.get(projectId).catch((): Project | null => null)
        for (const task of list) {
          if (await this.atCapacity(project)) break // no slot free for this project
          // Re-read: a concurrent cancel may have moved it on already.
          const fresh = await this.storage.get(task.id).catch((): ScheduledTask | null => null)
          if (!fresh || fresh.status !== "queued") continue
          await this.trace.run({ traceId: randomUUID() }, () =>
            this.attemptDispatch(fresh, project, Date.now(), {
              skipBudget: this.budgetApproved.has(fresh.id),
            }),
          )
        }
      }
    })
  }

  /**
   * Classify the text and start the routed run, threading the resolved `projectId`
   * into the runner so the run carries its engagement. Returns the started run's ref
   * and the chosen target, or null when the catalog is empty (nothing to route to).
   */
  private async dispatch(
    text: string,
    paths: string[],
    title: string,
    taskId: string,
    projectId: string | undefined,
  ): Promise<{ runRef: string; target: TaskTarget } | null> {
    const routing = await this.classifier.classify({ text, paths })
    if (!routing) return null
    const target = routing.target
    // The classifier's matched terms ride into the run so memory grounding selects
    // the same MOCs the routing keyed on (Phase 4).
    const { matchedTerms } = routing
    if (target.kind === "agent") {
      const run = await this.agentRunner.start(target.id, text, projectId ?? "", paths, title, taskId, matchedTerms)
      return { runRef: run.runId, target }
    }
    if (target.kind === "pipeline") {
      const run = await this.pipelineRunner.start(target.id, taskId, projectId, matchedTerms)
      return { runRef: run.pipelineRunId, target }
    }
    // Terminal fallback: the orchestrator session self-delegates to the right
    // subagent(s) or does the task directly — a task never no-ops. It carries the
    // projectId too so an orchestrator-dispatched task counts toward concurrency.
    const run = await this.agentRunner.startOrchestrator(text, paths, title, taskId, matchedTerms, projectId ?? "")
    return { runRef: run.runId, target }
  }

  /** Persist an immediately-dispatched task + its activity (the create path). */
  private async persistDispatched(
    taskId: string,
    input: CreateTaskInput,
    dispatched: { runRef: string; target: TaskTarget },
    projectId: string | undefined,
    now: number,
  ): Promise<ScheduledTask> {
    await this.recordLedger(taskId, projectId, dispatched, now)
    const task = await this.storage.createDispatched(
      taskId,
      input,
      dispatched.runRef,
      dispatched.target,
      now,
      projectId,
    )
    this.recordDispatchedActivity(taskId, projectId, dispatched)
    return task
  }

  /** Append the enforcement ledger line for a started run (awaited). */
  private recordLedger(
    taskId: string,
    projectId: string | undefined,
    dispatched: { runRef: string; target: TaskTarget },
    now: number = Date.now(),
  ): Promise<void> {
    return this.budget.recordDispatch(
      {
        at: new Date(now).toISOString(),
        ...(projectId ? { projectId } : {}),
        taskId,
        runRef: dispatched.runRef,
        kind: dispatched.target.kind,
      },
      new Date(now),
    )
  }

  private recordDispatchedActivity(
    taskId: string,
    projectId: string | undefined,
    dispatched: { runRef: string; target: TaskTarget },
  ): void {
    void this.activity.record({
      kind: "task-dispatched",
      summary: `dispatched to ${dispatched.target.kind} ${targetIdOf(dispatched.target)}`,
      refs: {
        taskId,
        runRef: dispatched.runRef,
        status: dispatched.target.kind,
        ...(projectId ? { projectId } : {}),
        ...refForTarget(dispatched.target),
      },
    })
  }

  private recordQueued(task: ScheduledTask, project: Project | null): void {
    void this.activity.record({
      kind: "task-queued",
      summary: `task queued — waiting for a slot${project ? ` in ${project.name}` : ""}`,
      refs: { taskId: task.id, ...(task.projectId ? { projectId: task.projectId } : {}) },
    })
    this.log.info("task queued", { id: task.id, projectId: task.projectId })
  }

  /** Sweep every dispatched-without-outcome task against its runner once. */
  private async sweepOutcomes(): Promise<void> {
    const tasks = await this.storage.list().catch((): ScheduledTask[] => [])
    for (const task of tasks) {
      if (task.status !== "dispatched" || task.outcome || !task.runRef) continue
      await this.reconcileOutcome(task)
    }
  }

  /** Resolve one task's run; if it already ended, write the outcome now. */
  private async reconcileOutcome(task: ScheduledTask): Promise<void> {
    if (!task.runRef || task.outcome) return
    try {
      if (task.target?.kind === "pipeline") {
        await this.writePipelineOutcome(task.id, this.pipelineRunner.get(task.runRef))
      } else {
        await this.writeAgentOutcome(task.id, this.agentRunner.get(task.runRef))
      }
    } catch {
      // Run unknown (deleted / different machine) — leave the task without outcome.
    }
  }

  private async writeAgentOutcome(taskId: string, run: AgentRun): Promise<void> {
    if (run.status !== "done" && run.status !== "error" && run.status !== "interrupted") return
    try {
      const summary = await this.agentRunSummary(run.runId)
      const status = run.status === "done" ? "done" : "error"
      const task = await this.storage.writeOutcome(taskId, {
        status,
        summary,
        finishedAt: new Date().toISOString(),
      })
      this.log.info("task outcome written", { taskId, runRef: run.runId, status: run.status })
      void this.activity.record({
        kind: "task-outcome",
        summary: `task ${status}${summary ? `: ${summary}` : ""}`,
        refs: { taskId, runRef: run.runId, status, ...(task.projectId ? { projectId: task.projectId } : {}) },
      })
    } catch (error) {
      // Task record gone or not yet persisted — the reconcile/sweep paths cover it.
      this.log.debug("task outcome write skipped", {
        taskId,
        err: error instanceof Error ? error.message : String(error),
      })
    }
  }

  private async writePipelineOutcome(taskId: string, run: PipelineRun): Promise<void> {
    if (run.status !== "done" && run.status !== "failed") return
    const outcome: TaskOutcome = {
      status: run.status === "done" ? "done" : "error",
      summary: `${run.stageRuns.length} stages, ${run.status}`,
      finishedAt: new Date().toISOString(),
    }
    try {
      const task = await this.storage.writeOutcome(taskId, outcome)
      this.log.info("task outcome written", { taskId, runRef: run.pipelineRunId, status: run.status })
      void this.activity.record({
        kind: "task-outcome",
        summary: `task ${outcome.status}: ${outcome.summary}`,
        refs: {
          taskId,
          runRef: run.pipelineRunId,
          status: outcome.status,
          ...(task.projectId ? { projectId: task.projectId } : {}),
        },
      })
    } catch (error) {
      this.log.debug("task outcome write skipped", {
        taskId,
        err: error instanceof Error ? error.message : String(error),
      })
    }
  }

  /** Last non-empty log line of an agent run, truncated to one readable line. */
  private async agentRunSummary(runId: string): Promise<string> {
    const log = await this.agentRunner.readLog(runId, 0).catch(() => null)
    if (!log) return ""
    const lines = log.content.split(/\r?\n/).filter((l) => l.trim().length > 0)
    const last = lines[lines.length - 1] ?? ""
    return last.length > SUMMARY_MAX_CHARS ? `${last.slice(0, SUMMARY_MAX_CHARS - 1)}…` : last
  }
}

/** Display id of a routing target (the orchestrator is synthetic, with no id). */
function targetIdOf(target: TaskTarget): string {
  return target.kind === "orchestrator" ? "orchestrator" : target.id
}

/** The activity ref the target contributes (agentId / pipelineId), if any. */
function refForTarget(target: TaskTarget): { agentId?: string; pipelineId?: string } {
  if (target.kind === "agent") return { agentId: target.id }
  if (target.kind === "pipeline") return { pipelineId: target.id }
  return {}
}
