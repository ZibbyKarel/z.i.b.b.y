import { randomUUID } from "node:crypto"
import { Injectable, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common"
import type {
  CreateTaskInput,
  CreateTaskResult,
  ScheduledTask,
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

/**
 * The deferred-task daemon. {@link createTask} is the single action behind the New
 * Task dialog: a task with no (or a past) `scheduledAt` is classified and dispatched
 * immediately; a future `scheduledAt` is parked in storage for the once-a-minute
 * {@link tick} to fire when due. Dispatch routes through the normal runners — so a
 * scheduled task still hits the approval gate exactly like an immediate one.
 *
 * The heartbeat mirrors the automations {@link SchedulerService}: a tick of 0 (the
 * test default) disables the loop so tests drive {@link tick} directly.
 */
@Injectable()
export class TaskSchedulerService implements OnModuleInit, OnModuleDestroy {
  private timer: ReturnType<typeof setInterval> | null = null
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

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer)
  }

  /**
   * Create a task. A future `scheduledAt` parks it (→ `scheduled`); otherwise it is
   * classified and dispatched now (→ `dispatched`, carrying the run ref). Throws
   * {@link EmptyCatalogError} when an immediate dispatch has nothing to route to.
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

    const dispatched = await this.dispatch(input.text, input.paths ?? [], input.title ?? "")
    if (!dispatched) throw new EmptyCatalogError()
    return { outcome: "dispatched", runRef: dispatched.runRef, target: dispatched.target }
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
          const dispatched = await this.dispatch(task.text, task.paths, task.title)
          if (!dispatched) {
            await this.storage.markFailed(task.id, "No agents or pipelines available to route to")
            this.log.warn("scheduled task failed: empty catalog", { id: task.id })
            return
          }
          await this.storage.markDispatched(task.id, dispatched.runRef, dispatched.target)
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
  ): Promise<{ runRef: string; target: TaskTarget } | null> {
    const routing = await this.classifier.classify({ text, paths })
    if (!routing) return null
    const target = routing.target
    if (target.kind === "agent") {
      const run = await this.agentRunner.start(target.id, text, "", paths, title)
      return { runRef: run.runId, target }
    }
    const run = await this.pipelineRunner.start(target.id)
    return { runRef: run.pipelineRunId, target }
  }
}
