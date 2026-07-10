import { randomUUID } from "node:crypto";
import { Injectable, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import type { Automation } from "@zibby/contracts";
import { AgentFactoryService } from "../agent-factory/agent-factory.service";
import { AgentRunnerService } from "../agents/agent-runner.service";
import { BriefingService } from "../briefing/briefing.service";
import { MemoryDistillerService } from "../memory/memory-distiller.service";
import { PatternExtractorService } from "../patterns/pattern-extractor.service";
import { PipelineRunnerService } from "../pipelines/pipeline-runner.service";
import { GapDetectorService } from "../gaps/gap-detector.service";
import { LoggerService, type ScopedLogger } from "../shared/logging/logger.service";
import { TraceContextService } from "../shared/logging/trace-context.service";
import { SystemConfigStore } from "../system/system-config.store";
import { TaskSchedulerService } from "../tasks/task-scheduler.service";
import { AutomationsStorageService } from "./automations.storage.service";
import { matchesCron } from "./cron";

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
  private timer: ReturnType<typeof setInterval> | null = null;
  private unsubscribe: (() => void) | null = null;
  /** Wall-clock of the last tick — the heartbeat the /health probe reads (M8). */
  private lastTickAt: string | null = null;
  private tickMs = 0;
  private readonly log: ScopedLogger;

  constructor(
    private readonly storage: AutomationsStorageService,
    private readonly agentRunner: AgentRunnerService,
    private readonly pipelineRunner: PipelineRunnerService,
    private readonly logger: LoggerService,
    private readonly trace: TraceContextService,
    private readonly briefing: BriefingService,
    private readonly distiller: MemoryDistillerService,
    private readonly patterns: PatternExtractorService,
    private readonly gaps: GapDetectorService,
    private readonly systemConfig: SystemConfigStore,
    private readonly agentFactory: AgentFactoryService,
    private readonly taskScheduler: TaskSchedulerService,
  ) {
    this.log = logger.child(SchedulerService.name);
  }

  onModuleInit(): void {
    // Loop interval from the operator-owned system config; `0` disables it (the test
    // default — tests drive `tick()` directly). Re-arm live when the config changes.
    this.arm();
    this.unsubscribe = this.systemConfig.onChange(() => this.arm());
  }

  /** (Re-)arm the loop from `systemConfig.automationTickMs`; `0` leaves it disabled. */
  private arm(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    const tickMs = this.systemConfig.current().automationTickMs;
    this.tickMs = tickMs;
    if (tickMs > 0) {
      this.timer = setInterval(() => void this.tick(), tickMs);
      // Don't keep the event loop alive just for the scheduler.
      this.timer.unref?.();
      this.log.info("scheduler started", { tickMs });
    } else {
      this.log.debug("scheduler tick disabled (automationTickMs <= 0)");
    }
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
    this.unsubscribe?.();
  }

  /**
   * Heartbeat for the /health probe (M8). `running` is whether the tick loop is
   * armed; `tickMs === 0` is the intentional test/CI mode (disabled, not broken).
   * `lastTickAt` is null until the first tick fires.
   */
  health(): { running: boolean; tickMs: number; lastTickAt: string | null } {
    return { running: this.timer !== null, tickMs: this.tickMs, lastTickAt: this.lastTickAt };
  }

  /** Evaluate all enabled cron automations against `now`; fire the due ones. */
  async tick(now: Date = new Date()): Promise<string[]> {
    this.lastTickAt = now.toISOString();
    const minute = now.toISOString().slice(0, 16);
    const fired: string[] = [];
    for (const automation of await this.storage.list()) {
      if (!automation.enabled || automation.trigger.type !== "cron") continue;
      if (!matchesCron(automation.trigger.expr, now)) continue;
      // Idempotence: don't fire twice within the same wall minute.
      if (automation.lastFiredAt?.slice(0, 16) === minute) continue;
      // Each cron-fired run gets its own trace scope (no request to inherit one),
      // so the run it dispatches links back to this tick.
      await this.trace.run({ traceId: randomUUID() }, () =>
        this.fire(automation, now.toISOString()),
      );
      fired.push(automation.id);
    }
    if (fired.length > 0) this.log.info("automations fired", { count: fired.length, ids: fired });
    return fired;
  }

  /** Fire an automation now (manual/event path); returns a run reference. */
  async trigger(id: string): Promise<string> {
    const automation = await this.storage.get(id);
    const ref = await this.dispatch(automation);
    await this.storage.markFired(id, new Date().toISOString());
    return ref;
  }

  private async fire(automation: Automation, at: string): Promise<void> {
    await this.dispatch(automation);
    await this.storage.markFired(automation.id, at);
  }

  /** Start the target run via the appropriate runner; return its id reference. */
  private async dispatch(automation: Automation): Promise<string> {
    const { target, prompt } = automation;
    this.log.info("dispatching automation", { id: automation.id, target: target.type });
    switch (target.type) {
      case "agent": {
        const run = await this.agentRunner.start(target.agentId, prompt ?? "", "automation");
        return run.runId;
      }
      case "pipeline": {
        // Phase 116b: the automation's free-text prompt rides as the pipeline's
        // first-phase input (`PipelineRunnerService.start`'s trailing `input` param)
        // — the same seam a chain's instructions already use. Absent for every
        // automation predating a prompt (no behaviour change).
        const run = await this.pipelineRunner.start(
          target.pipelineId,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          prompt,
        );
        return run.pipelineRunId;
      }
      case "briefing": {
        // Deterministic assembly, not a claude run — dispatch straight to the
        // briefing service and return the vault note id as the run ref. The prompt
        // steers the optional butler-voice headline ("how to write the briefing").
        const { noteId } = await this.briefing.generate(new Date(), prompt);
        return noteId;
      }
      case "memory-distill": {
        // Nightly system automation: distil durable learnings out of finished runs
        // into the vault. Not a claude run in the usual sense — a single cheap model
        // pass owned by the system; the ref is `memory-distill:<count>`.
        return this.distiller.distill();
      }
      case "pattern-extract": {
        // M4 nightly job: scan 30 days of approval-decision activity, draft rule
        // proposals into vault/patterns/suggestions.md; ref = `patterns:<count>`.
        const { proposals } = await this.patterns.extract();
        return `patterns:${proposals.length}`;
      }
      case "gap-detect": {
        // M5: scan recurring task creation for automatable manual work, draft
        // suggestions into the vault. Deterministic; ref = `gaps:<count>`.
        const { suggestions } = await this.gaps.detect();
        return `gaps:${suggestions.length}`;
      }
      case "agent-factory": {
        // Phase 4b: scan recurring orchestrator-fallback telemetry for a missing
        // specialist agent, park a deterministic candidate behind the
        // `agent-proposal` Tier-3 approval. Deterministic; ref = `agent-proposals:<count>`.
        const { proposed } = await this.agentFactory.detect();
        return `agent-proposals:${proposed.length}`;
      }
      case "task": {
        // Phase 116b — the "prompt automation": fire through the EXISTING task
        // pipeline exactly like the New Task dialog, reusing classification, the
        // orchestrator fallback, attribution, the budget/limit/concurrency guard,
        // the approval gate, attachment feeding and toolGrants. `target.target`
        // (an @-mentioned run target) is threaded BOTH into the input and as the
        // explicit-target arg — present, it bypasses classification; absent, the
        // task classifier/orchestrator-fallback decides at fire time.
        const result = await this.taskScheduler.createTask(
          {
            text: target.text,
            target: target.target,
            attachmentSetId: target.attachmentSetId,
            output: target.output,
            toolGrants: target.toolGrants,
          },
          Date.now(),
          undefined,
          target.target,
          false, // synchronous cron fire — the existing dispatch() contract
        );
        // A synchronous (`background: false`) create only ever resolves to
        // "dispatched" (a live run) or "scheduled" (held/queued/limit-deferred) —
        // "pending" is exclusively the interactive dialog's background path.
        return result.outcome === "dispatched" ? result.runRef : result.task.id;
      }
    }
  }
}
