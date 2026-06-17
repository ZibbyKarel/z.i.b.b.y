import { randomUUID } from "node:crypto"
import { Injectable, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common"
import type { Automation } from "@zibby/contracts"
import { AgentRunnerService } from "../agents/agent-runner.service"
import { BriefingService } from "../briefing/briefing.service"
import { DiscoveryTriageService } from "../discovery/discovery-triage.service"
import { MemoryDistillerService } from "../memory/memory-distiller.service"
import { PatternExtractorService } from "../patterns/pattern-extractor.service"
import { PipelineRunnerService } from "../pipelines/pipeline-runner.service"
import { GapDetectorService } from "../gaps/gap-detector.service"
import { ResearchService } from "../research/research.service"
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
  /** Wall-clock of the last tick — the heartbeat the /health probe reads (M8). */
  private lastTickAt: string | null = null
  private tickMs = 0
  private readonly log: ScopedLogger

  constructor(
    private readonly storage: AutomationsStorageService,
    private readonly agentRunner: AgentRunnerService,
    private readonly pipelineRunner: PipelineRunnerService,
    private readonly logger: LoggerService,
    private readonly trace: TraceContextService,
    private readonly briefing: BriefingService,
    private readonly discovery: DiscoveryTriageService,
    private readonly distiller: MemoryDistillerService,
    private readonly patterns: PatternExtractorService,
    private readonly research: ResearchService,
    private readonly gaps: GapDetectorService,
  ) {
    this.log = logger.child(SchedulerService.name)
  }

  onModuleInit(): void {
    const tickMs = Number(process.env.AUTOMATION_TICK_MS)
    this.tickMs = Number.isFinite(tickMs) ? tickMs : 0
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

  /**
   * Heartbeat for the /health probe (M8). `running` is whether the tick loop is
   * armed; `tickMs === 0` is the intentional test/CI mode (disabled, not broken).
   * `lastTickAt` is null until the first tick fires.
   */
  health(): { running: boolean; tickMs: number; lastTickAt: string | null } {
    return { running: this.timer !== null, tickMs: this.tickMs, lastTickAt: this.lastTickAt }
  }

  /** Evaluate all enabled cron automations against `now`; fire the due ones. */
  async tick(now: Date = new Date()): Promise<string[]> {
    this.lastTickAt = now.toISOString()
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
      case "discovery": {
        // Phase 10.3: deterministic scan → task candidates parked behind the gate.
        // *Proposed ≠ dispatched* — discovery never starts a run; the ref is a count.
        const parked = await this.discovery.run()
        return `discovery:${parked.length}`
      }
      case "memory-distill": {
        // Nightly system automation: distil durable learnings out of finished runs
        // into the vault. Not a claude run in the usual sense — a single cheap model
        // pass owned by the system; the ref is `memory-distill:<count>`.
        return this.distiller.distill()
      }
      case "pattern-extract": {
        // M4 nightly job: scan 30 days of approval-decision activity, draft rule
        // proposals into vault/patterns/suggestions.md; ref = `patterns:<count>`.
        const { proposals } = await this.patterns.extract()
        return `patterns:${proposals.length}`
      }
      case "research-digest": {
        // M6: fetch + rank the operator's research sources, mirror the digest to the
        // vault for the morning briefing. Deterministic; ref = `research:<count>`.
        const digest = await this.research.refresh()
        return `research:${digest.items.length}`
      }
      case "gap-detect": {
        // M5: scan recurring task creation for automatable manual work, draft
        // suggestions into the vault. Deterministic; ref = `gaps:<count>`.
        const { suggestions } = await this.gaps.detect()
        return `gaps:${suggestions.length}`
      }
    }
  }
}
