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
  ScheduledTask,
  TaskOutcome,
  TaskTarget,
} from "@zibby/contracts"
import { AgentRunnerService } from "../agents/agent-runner.service"
import { PipelineRunnerService } from "../pipelines/pipeline-runner.service"
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

/**
 * The deferred-task daemon. {@link createTask} is the single action behind the New
 * Task dialog: a task with no (or a past) `scheduledAt` is classified and dispatched
 * immediately; a future `scheduledAt` is parked in storage for the once-a-minute
 * {@link tick} to fire when due. Dispatch routes through the normal runners — so a
 * scheduled task still hits the approval gate exactly like an immediate one.
 *
 * Every dispatched task is persisted with a `runRef` and the run is born carrying
 * the `taskId`, so when the run reaches a terminal state its outcome is written
 * back onto the task record — via a fast path (run-status subscriptions) plus a
 * catch-up sweep at startup (init-order-proof and restart-durable).
 *
 * The heartbeat mirrors the automations {@link SchedulerService}: a tick of 0 (the
 * test default) disables the loop so tests drive {@link tick} directly.
 */
@Injectable()
export class TaskSchedulerService implements OnModuleInit, OnApplicationBootstrap, OnModuleDestroy {
  private timer: ReturnType<typeof setInterval> | null = null
  private readonly unsubscribes: Array<() => void> = []
  private readonly log: ScopedLogger

  constructor(
    private readonly storage: ScheduledTasksStorageService,
    private readonly classifier: TaskClassifierService,
    private readonly agentRunner: AgentRunnerService,
    private readonly pipelineRunner: PipelineRunnerService,
    private readonly logger: LoggerService,
    private readonly trace: TraceContextService,
  ) {
    this.log = logger.child(TaskSchedulerService.name)
  }

  onModuleInit(): void {
    // Fast path of the outcome write-back: a terminal run carrying a taskId
    // writes its verdict onto the task record the moment it finishes.
    this.unsubscribes.push(
      this.agentRunner.onRunStatus((run) => {
        if (run.taskId) void this.writeAgentOutcome(run.taskId, run)
      }),
      this.pipelineRunner.onRunStatus((run) => {
        if (run.taskId) void this.writePipelineOutcome(run.taskId, run)
      }),
    )

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
   * rebuilt from disk by then): any dispatched task without an outcome whose run
   * already reached a terminal state gets its outcome written now — covering runs
   * that finished while the API was down and fast-path writes that raced persist.
   */
  onApplicationBootstrap(): void {
    void this.sweepOutcomes()
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer)
    for (const unsubscribe of this.unsubscribes) unsubscribe()
  }

  /**
   * Create a task. A future `scheduledAt` parks it (→ `scheduled`); otherwise it is
   * classified and dispatched now (→ `dispatched`, carrying the run ref) and
   * persisted so the run's outcome has somewhere to land. Throws
   * {@link EmptyCatalogError} when an immediate dispatch has nothing to route to —
   * without persisting anything (no dead task records).
   */
  async createTask(input: CreateTaskInput, now: number = Date.now()): Promise<CreateTaskResult> {
    if (input.scheduledAt != null && input.scheduledAt > now) {
      const task = await this.storage.create(
        { ...input, scheduledAt: input.scheduledAt },
        new Date(now).toISOString(),
      )
      this.log.info("task scheduled", { id: task.id, scheduledAt: task.scheduledAt })
      return { outcome: "scheduled", task }
    }

    // Generate the id BEFORE dispatch so the run is born linked to its task.
    const taskId = this.storage.newId()
    const dispatched = await this.dispatch(input.text, input.paths ?? [], input.title ?? "", taskId)
    if (!dispatched) throw new EmptyCatalogError()
    const task = await this.storage.createDispatched(
      taskId,
      input,
      dispatched.runRef,
      dispatched.target,
      now,
    )
    // The run may have finished before its task record hit disk (fast failures);
    // reconcile once now so the fast-path write it raced isn't lost.
    void this.reconcileOutcome(task)
    return { outcome: "dispatched", runRef: dispatched.runRef, target: dispatched.target, task }
  }

  /** Cancel a still-waiting scheduled task (a non-`scheduled` task is returned unchanged). */
  cancel(id: string): Promise<ScheduledTask> {
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
          const dispatched = await this.dispatch(task.text, task.paths, task.title, task.id)
          if (!dispatched) {
            await this.storage.markFailed(task.id, "No agents or pipelines available to route to")
            this.log.warn("scheduled task failed: empty catalog", { id: task.id })
            return
          }
          const updated = await this.storage.markDispatched(
            task.id,
            dispatched.runRef,
            dispatched.target,
          )
          void this.reconcileOutcome(updated)
          fired.push(task.id)
          this.log.info("scheduled task dispatched", { id: task.id, runRef: dispatched.runRef })
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
   * Classify the text and start the routed run. Returns the started run's ref and the
   * chosen target, or null when the catalog is empty (nothing to route to).
   */
  private async dispatch(
    text: string,
    paths: string[],
    title: string,
    taskId?: string,
  ): Promise<{ runRef: string; target: TaskTarget } | null> {
    const routing = await this.classifier.classify({ text, paths })
    if (!routing) return null
    const target = routing.target
    if (target.kind === "agent") {
      const run = await this.agentRunner.start(target.id, text, "", paths, title, taskId)
      return { runRef: run.runId, target }
    }
    if (target.kind === "pipeline") {
      const run = await this.pipelineRunner.start(target.id, taskId)
      return { runRef: run.pipelineRunId, target }
    }
    // Terminal fallback: the orchestrator session self-delegates to the right
    // subagent(s) or does the task directly — a task never no-ops.
    const run = await this.agentRunner.startOrchestrator(text, paths, title, taskId)
    return { runRef: run.runId, target }
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
      await this.storage.writeOutcome(taskId, {
        status: run.status === "done" ? "done" : "error",
        summary,
        finishedAt: new Date().toISOString(),
      })
      this.log.info("task outcome written", { taskId, runRef: run.runId, status: run.status })
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
      await this.storage.writeOutcome(taskId, outcome)
      this.log.info("task outcome written", { taskId, runRef: run.pipelineRunId, status: run.status })
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
