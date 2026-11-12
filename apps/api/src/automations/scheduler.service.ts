import { randomUUID } from "node:crypto";
import { Injectable, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import type { Automation, AutomationFire, Signal, TaskTarget } from "@zibby/contracts";
import { AgentFactoryService } from "../agent-factory/agent-factory.service";
import { BriefingService } from "../briefing/briefing.service";
import { ExternalSkillsService } from "../external-skills/external-skills.service";
import { VaultLintService } from "../memory/vault-lint.service";
import { MemoryDistillerService } from "../memory/memory-distiller.service";
import { PatternExtractorService } from "../patterns/pattern-extractor.service";
import { GapDetectorService } from "../gaps/gap-detector.service";
import { WatcherHealthRegistry } from "../health/watcher-health.registry";
import { ArchService } from "../arch/arch.service";
import { ReviewLearningService } from "../review-learning/review-learning.service";
import { SelfKnowledgeService } from "../self-knowledge/self-knowledge.service";
import { SecurityService } from "../security/security.service";
import { LoggerService, type ScopedLogger } from "../shared/logging/logger.service";
import { TraceContextService } from "../shared/logging/trace-context.service";
import { TickingWatcherBase } from "../shared/ticking-watcher-base";
import { SystemConfigStore } from "../system/system-config.store";
import { TaskSchedulerService } from "../tasks/task-scheduler.service";
import { AutomationFiresStore } from "./automation-fires.store";
import { AutomationsStorageService } from "./automations.storage.service";
import { SignalBusService } from "./signal-bus.service";
import { matchesCron } from "./cron";

/** What a dispatch produced: its ref, and `runRef` only when that ref is a live run. */
interface DispatchResult {
  ref: string;
  runRef?: string;
}

/**
 * The heartbeat (Phase 5). A once-a-minute tick fires due cron automations,
 * starting their target run through the normal runners — so any external-effect
 * action still hits the approval gate (autonomy of planning, not of destructive
 * action). Idempotent per minute (a run won't double-fire within the same wall
 * minute); missed triggers are skipped, not caught up. Event triggers are fired
 * via the manual `trigger` path (no event bus yet).
 */
@Injectable()
export class SchedulerService extends TickingWatcherBase implements OnModuleInit, OnModuleDestroy {
  private unsubscribe: (() => void) | null = null;
  /** Wall-clock of the last tick (any path, incl. test-driven `tick()`) — the M8
   * department probe's heartbeat. Distinct from the base's timer-path-only F6c
   * field (which is private up there, so this needed its own name). */
  private lastTickAtM8: string | null = null;
  protected readonly log: ScopedLogger;
  protected readonly watcherId = "scheduler" as const;

  constructor(
    private readonly storage: AutomationsStorageService,
    private readonly logger: LoggerService,
    private readonly trace: TraceContextService,
    private readonly briefing: BriefingService,
    private readonly distiller: MemoryDistillerService,
    private readonly patterns: PatternExtractorService,
    private readonly gaps: GapDetectorService,
    private readonly systemConfig: SystemConfigStore,
    private readonly agentFactory: AgentFactoryService,
    private readonly taskScheduler: TaskSchedulerService,
    private readonly selfKnowledge: SelfKnowledgeService,
    private readonly security: SecurityService,
    private readonly arch: ArchService,
    private readonly watcherHealthRegistry: WatcherHealthRegistry,
    private readonly reviewLearning: ReviewLearningService,
    private readonly signalBus: SignalBusService,
    private readonly vaultLint: VaultLintService,
    private readonly externalSkills: ExternalSkillsService,
    private readonly fires: AutomationFiresStore,
  ) {
    super();
    this.log = logger.child(SchedulerService.name);
  }

  async onModuleInit(): Promise<void> {
    // Signal-triggered automations dispatch through this same path (the bus is a leaf
    // module the producers inject, so it can't depend on the scheduler directly).
    this.signalBus.registerDispatcher((automation, signal) =>
      this.recordFire(automation, "signal", signal),
    );
    this.unsubscribe = this.systemConfig.onChange(() => this.arm());
    // F6c: self-register the heartbeat probe (the base's lastTickAt, stamped on the
    // timer path; the M8 `health()` below keeps its own tick()-stamped field).
    this.watcherHealthRegistry.register(() => this.watcherHealth());
    // Fires a crashed process left `running` are closed out before the loop arms.
    await this.fires
      .reconcile()
      .catch((error) => this.log.warn("fire reconcile failed", { error: String(error) }));
    // Loop interval from the operator-owned system config; `0` disables it (the test
    // default — tests drive `tick()` directly). Re-arm live when the config changes.
    this.arm();
  }

  protected tickMs(): number {
    return this.systemConfig.current().automationTickMs;
  }

  /** The timer-driven path — goes through the base's skip-if-in-flight guard. */
  protected async runTick(now?: Date): Promise<void> {
    await this.tick(now);
  }

  /** (Re-)arm the loop from `systemConfig.automationTickMs`; `0` leaves it disabled. */
  protected override arm(): void {
    super.arm();
    const tickMs = this.tickMs();
    if (tickMs > 0) {
      this.log.info("scheduler started", { tickMs });
    } else {
      this.log.debug("scheduler tick disabled (automationTickMs <= 0)");
    }
  }

  onModuleDestroy(): void {
    this.stopTimer();
    this.unsubscribe?.();
  }

  /**
   * Heartbeat for the /health probe (M8). `running` is whether the tick loop is
   * armed; `tickMs === 0` is the intentional test/CI mode (disabled, not broken).
   * `lastTickAt` is null until the first tick fires.
   */
  health(): { running: boolean; tickMs: number; lastTickAt: string | null } {
    return { running: this.isArmed(), tickMs: this.tickMs(), lastTickAt: this.lastTickAtM8 };
  }

  /** Evaluate all enabled cron automations against `now`; fire the due ones. */
  async tick(now: Date = new Date()): Promise<string[]> {
    this.lastTickAtM8 = now.toISOString();
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
    const ref = await this.recordFire(automation, "manual");
    await this.storage.markFired(id, new Date().toISOString());
    return ref;
  }

  private async fire(automation: Automation, at: string): Promise<void> {
    await this.recordFire(automation, "cron");
    await this.storage.markFired(automation.id, at);
  }

  /**
   * Wrap {@link dispatch} in a fire record + log (todo-4) — every path (cron, manual,
   * signal) goes through here. A run-backed target's record carries the run ref (the
   * run owns its own lifecycle and log); an in-process handler's log is the only
   * trace it leaves. Store failures are only warned about — they never block the
   * dispatch — and a throwing handler still rejects to the caller after recording.
   */
  private async recordFire(
    automation: Automation,
    source: AutomationFire["source"],
    signal?: Signal,
  ): Promise<string> {
    const { id } = automation;
    const warn = (error: unknown) =>
      this.log.warn("automation fire record failed", { id, error: String(error) });
    const fire = await this.fires.begin(id, source).catch(warn);
    const note = async (line: string) => {
      if (fire) await this.fires.appendLog(id, fire.id, line).catch(warn);
    };
    const end = async (patch: Parameters<AutomationFiresStore["finish"]>[2]) => {
      if (fire) await this.fires.finish(id, fire.id, patch).catch(warn);
    };
    const startedAt = Date.now();
    await note(
      `start target=${automation.target.type} prompt=${(automation.prompt ?? "").slice(0, 200)}`,
    );
    try {
      const { ref, runRef } = await this.dispatch(automation, signal);
      await note(`done in ${Date.now() - startedAt} ms: ${ref}`);
      await end({ status: "done", result: ref, ...(runRef ? { runRef } : {}) });
      return ref;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      // `stack` starts with "Error: <message>" — keep only the frames below it.
      const frames = error instanceof Error ? (error.stack ?? "").split("\n").slice(1) : [];
      await note([`error: ${message}`, ...frames].join("\n"));
      await note(`failed in ${Date.now() - startedAt} ms`);
      await end({ status: "error", error: message });
      throw error;
    }
  }

  /**
   * Start the target run via the appropriate runner; return its id reference. A
   * `signal` (signal-trigger path) appends its title+body to the run's text/prompt
   * and attributes a `task` target to the signal's project.
   */
  private async dispatch(automation: Automation, signal?: Signal): Promise<DispatchResult> {
    const { target } = automation;
    const signalText = signal ? `${signal.title}\n\n${signal.body}` : undefined;
    const prompt = signalText
      ? [automation.prompt, signalText].filter(Boolean).join("\n\n")
      : automation.prompt;
    this.log.info("dispatching automation", { id: automation.id, target: target.type });
    switch (target.type) {
      case "agent":
      case "workflow": {
        // Everything that creates a run instance counts toward the run-slot limit, so
        // an agent / workflow automation goes through the task scheduler with an
        // explicit target (skips classification). The workflow's first-phase input is
        // the automation's free-text prompt (Phase 116b), as before.
        const explicit: TaskTarget =
          target.type === "agent"
            ? { kind: "agent", id: target.agentId, name: target.agentId }
            : { kind: "workflow", id: target.workflowId, name: target.workflowId };
        const result = await this.taskScheduler.createTask(
          {
            text: prompt ?? "",
            ...(signal ? { title: signal.title.slice(0, 200) } : {}),
            target: explicit,
            source: "automation",
            automationId: automation.id,
          },
          Date.now(),
          signal?.projectId,
          explicit,
          false,
        );
        return result.outcome === "dispatched"
          ? { ref: result.runRef, runRef: result.runRef }
          : { ref: result.task.id };
      }
      case "briefing": {
        // Deterministic assembly, not a claude run — dispatch straight to the
        // briefing service and return the vault note id as the run ref. The prompt
        // steers the optional butler-voice headline ("how to write the briefing").
        const { noteId } = await this.briefing.generate(new Date(), prompt);
        return { ref: noteId };
      }
      case "memory-distill": {
        // Nightly system automation: distil durable learnings out of finished runs
        // into the vault. Not a claude run in the usual sense — a single cheap model
        // pass owned by the system; the ref is `memory-distill:<count>`.
        return { ref: await this.distiller.distill() };
      }
      case "pattern-extract": {
        // M4 nightly job: scan 30 days of approval-decision activity, draft rule
        // proposals into vault/patterns-suggestions.md; ref = `patterns:<count>`.
        const { proposals } = await this.patterns.extract(new Date(), {
          automationId: automation.id,
        });
        return { ref: `patterns:${proposals.length}` };
      }
      case "gap-detect": {
        // M5: scan recurring task creation for automatable manual work, draft
        // suggestions into the vault. Deterministic; ref = `gaps:<count>`.
        const { suggestions } = await this.gaps.detect(new Date(), {
          automationId: automation.id,
        });
        return { ref: `gaps:${suggestions.length}` };
      }
      case "agent-factory": {
        // Phase 4b: scan recurring orchestrator-fallback telemetry for a missing
        // specialist agent, park a deterministic candidate behind the
        // `agent-proposal` Tier-3 approval. Deterministic; ref = `agent-proposals:<count>`.
        const { proposed } = await this.agentFactory.detect();
        return { ref: `agent-proposals:${proposed.length}` };
      }
      case "task": {
        // Phase 116b — the "prompt automation": fire through the EXISTING task
        // workflow exactly like the New Task dialog, reusing classification, the
        // orchestrator fallback, attribution, the budget/limit/concurrency guard,
        // the approval gate, attachment feeding and toolGrants. `target.target`
        // (an @-mentioned run target) is threaded BOTH into the input and as the
        // explicit-target arg — present, it bypasses classification; absent, the
        // task classifier/orchestrator-fallback decides at fire time.
        const result = await this.taskScheduler.createTask(
          {
            text: signalText ? `${target.text}\n\n${signalText}` : target.text,
            ...(signal ? { title: signal.title.slice(0, 200) } : {}),
            target: target.target,
            attachmentSetId: target.attachmentSetId,
            output: target.output,
            toolGrants: target.toolGrants,
            source: "automation",
            automationId: automation.id,
          },
          Date.now(),
          signal?.projectId,
          target.target,
          false, // synchronous cron fire — the existing dispatch() contract
        );
        // A synchronous (`background: false`) create only ever resolves to
        // "dispatched" (a live run) or "scheduled" (held/queued/limit-deferred) —
        // "pending" is exclusively the interactive dialog's background path.
        return result.outcome === "dispatched"
          ? { ref: result.runRef, runRef: result.runRef }
          : { ref: result.task.id };
      }
      case "self-knowledge": {
        // F4c nightly system automation: deterministic re-compose + AUTO-block
        // merge write, not a claude run. Fail-open like memory-distill — a vault
        // hiccup must never kill the tick.
        try {
          const drift = await this.selfKnowledge.check();
          await this.selfKnowledge.write();
          return { ref: `self-knowledge:${drift ? "refreshed" : "clean"}` };
        } catch (error) {
          this.log.warn("self-knowledge refresh failed", { error: String(error) });
          return { ref: "self-knowledge:error" };
        }
      }
      case "vault-lint": {
        // Nightly report-only vault lint → knowledge/vault-lint.md. Fail-open.
        try {
          const r = await this.vaultLint.run();
          return { ref: `vault-lint:${r.brokenLinks}/${r.orphans}/${r.stale}` };
        } catch (error) {
          this.log.warn("vault lint failed", { error: String(error) });
          return { ref: "vault-lint:error" };
        }
      }
      case "security-scan": {
        // NS2 F5a: weekly system automation — dependency CVEs (Dependabot REST)
        // + a bounded secret scan, deterministic; ref = `security:<count>`.
        const { findings } = await this.security.scan();
        return { ref: `security:${findings.length}` };
      }
      case "arch-audit": {
        // NS2 F5c: nightly system automation — graphify god-node/community deltas
        // + a madge circular-dep check, deterministic; ref = `arch:<count>`.
        const { findings } = await this.arch.audit();
        return { ref: `arch:${findings.length}` };
      }
      case "review-learn": {
        // PR review learning v1: ingest new review comments on ZIBBY's own PRs,
        // distil them into candidate rules, park an approval for any rule that just
        // hit its 2nd occurrence. Proposes ≠ activates; ref = `review-rules:<count>`.
        const { observations } = await this.reviewLearning.learn();
        return { ref: `review-rules:${observations}` };
      }
      case "external-skills-sync": {
        // Weekly: check every installed GitHub skill, replace changed folders (each
        // reported as `skill-updated`). Per-repo failures land in `lastError`.
        const { updated } = await this.externalSkills.syncAll();
        return { ref: `external-skills:${updated.length}` };
      }
    }
  }
}
