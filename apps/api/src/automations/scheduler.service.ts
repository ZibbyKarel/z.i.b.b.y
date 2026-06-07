import { Injectable, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common"
import type { Automation } from "@zibby/contracts"
import { AgentRunnerService } from "../agents/agent-runner.service"
import { PipelineRunnerService } from "../pipelines/pipeline-runner.service"
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

  constructor(
    private readonly storage: AutomationsStorageService,
    private readonly agentRunner: AgentRunnerService,
    private readonly pipelineRunner: PipelineRunnerService,
  ) {}

  onModuleInit(): void {
    const tickMs = Number(process.env.AUTOMATION_TICK_MS)
    // A tick of 0 disables the loop (tests drive `tick()` directly).
    if (tickMs > 0) {
      this.timer = setInterval(() => void this.tick(), tickMs)
      // Don't keep the event loop alive just for the scheduler.
      this.timer.unref?.()
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
      await this.fire(automation, now.toISOString())
      fired.push(automation.id)
    }
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
    switch (target.type) {
      case "agent": {
        const run = await this.agentRunner.start(target.agentId, target.prompt ?? "", "automation")
        return run.runId
      }
      case "pipeline": {
        const run = await this.pipelineRunner.start(target.pipelineId)
        return run.pipelineRunId
      }
    }
  }
}
