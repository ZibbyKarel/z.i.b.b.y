import { randomUUID } from "node:crypto"
import { Injectable, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common"
import type { Automation } from "@zibby/contracts"
import { AgentRunnerService } from "../agents/agent-runner.service"
import { BriefingService } from "../briefing/briefing.service"
import { PipelineRunnerService } from "../pipelines/pipeline-runner.service"
import { LoggerService, type ScopedLogger } from "../shared/logging/logger.service"
import { TraceContextService } from "../shared/logging/trace-context.service"
import { AutomationsStorageService } from "./automations.storage.service"
import { matchesCron } from "./cron"

/**
 * The heartbeat (Phase 5). A once-a-minute tick fires due cron automations,
 * starting their target run through the normal runners — so any external-effect
 * action still hits the approval gate (autonomy of planning, not of destructive
 * action). Idempotent per minute (a run won't double-fire within the same wall
 * minute); missed triggers are skipped, not caught up. Event triggers are fired
 * via the manual `trigger` path (no event bus yet).
 */
@Injectable()
export class SchedulerService implements OnModuleInit, OnModuleDestroy {
  private timer: ReturnType<typeof setInterval> | null = null
  private readonly log: ScopedLogger

  constructor(
    private readonly storage: AutomationsStorageService,
    private readonly agentRunner: AgentRunnerService,
    private readonly pipelineRunner: PipelineRunnerService,
    private readonly logger: LoggerService,
    private readonly trace: TraceContextService,
    private readonly briefing: BriefingService,
  ) {
    this.log = logger.child(SchedulerService.name)
  }

  onModuleInit(): void {
    const tickMs = Number(process.env.AUTOMATION_TICK_MS)
    // A tick of 0 disables the loop (tests drive `tick()` directly).
    if (tickMs > 0) {
      this.timer = setInterval(() => void this.tick(), tickMs)
      // Don't keep the event loop alive just for the scheduler.
      this.timer.unref?.()
      this.log.info("scheduler started", { tickMs })
    } else {
      this.log.debug("scheduler tick disabled (AUTOMATION_TICK_MS <= 0)")
    }
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer)
  }

  /** Evaluate all enabled cron automations against `now`; fire the due ones. */
  async tick(now: Date = new Date()): Promise<string[]> {
    const minute = now.toISOString().slice(0, 16)
    const fired: string[] = []
    for (const automation of await this.storage.list()) {
      if (!automation.enabled || automation.trigger.type !== "cron") continue
      if (!matchesCron(automation.trigger.expr, now)) continue
      // Idempotence: don't fire twice within the same wall minute.
      if (automation.lastFiredAt?.slice(0, 16) === minute) continue
      // Each cron-fired run gets its own trace scope (no request to inherit one),
      // so the run it dispatches links back to this tick.
      await this.trace.run({ traceId: randomUUID() }, () =>
        this.fire(automation, now.toISOString()),
      )
      fired.push(automation.id)
    }
    if (fired.length > 0) this.log.info("automations fired", { count: fired.length, ids: fired })
    return fired
  }

  /** Fire an automation now (manual/event path); returns a run reference. */
  async trigger(id: string): Promise<string> {
    const automation = await this.storage.get(id)
    const ref = await this.dispatch(automation)
    await this.storage.markFired(id, new Date().toISOString())
    return ref
  }

  private async fire(automation: Automation, at: string): Promise<void> {
    await this.dispatch(automation)
    await this.storage.markFired(automation.id, at)
  }

  /** Start the target run via the appropriate runner; return its id reference. */
  private async dispatch(automation: Automation): Promise<string> {
    const { target } = automation
    this.log.info("dispatching automation", { id: automation.id, target: target.type })
    switch (target.type) {
      case "agent": {
        const run = await this.agentRunner.start(target.agentId, target.prompt ?? "", "automation")
        return run.runId
      }
      case "pipeline": {
        const run = await this.pipelineRunner.start(target.pipelineId)
        return run.pipelineRunId
      }
      case "briefing": {
        // Deterministic assembly, not a claude run — dispatch straight to the
        // briefing service and return the vault note id as the run ref.
        const { noteId } = await this.briefing.generate()
        return noteId
      }
    }
  }
}
