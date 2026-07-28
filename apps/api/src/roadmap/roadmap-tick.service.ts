import { Injectable, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import { ActivityLogService } from "../activity/activity-log.service";
import { WatcherHealthRegistry } from "../health/watcher-health.registry";
import { LoggerService, type ScopedLogger } from "../shared/logging/logger.service";
import { TickingWatcherBase } from "../shared/ticking-watcher-base";
import { SystemConfigStore } from "../system/system-config.store";
import { RoadmapGateService } from "./roadmap-gate.service";
import { RoadmapSourceService } from "./roadmap-source.service";
import { RoadmapStore } from "./roadmap.store";

/**
 * Phase 125h — the roadmap heartbeat: `systemConfig.roadmapTickMs` (default 60s,
 * `0` disables; tests drive {@link tick} directly). Every project with a roadmap
 * directory gets two independent, per-step-guarded passes each tick:
 *
 * 1. **Auto-sync** — if the project's `RoadmapConfig.autoSync` is `true`, pull its
 *    Jira/GitHub items via `RoadmapSourceService.sync` (the same routine the
 *    manual Sync button drives). Skipped entirely for a project with the toggle
 *    off — nothing is fetched, nothing is logged.
 * 2. **Gate poll** — `RoadmapGateService.reconcileRunning` +
 *    `reconcileAwaitingMerge`, run for EVERY project with a roadmap regardless of
 *    `autoSync`. This is the poll half of the two release signals (master plan
 *    "Release signals"): an operator who merges a PR straight on GitHub, with
 *    periodic re-import switched off, must still see its dependents released —
 *    the poll is a gate-lifecycle concern, not an import concern.
 *
 * **Law 3** — this tick only ever syncs (read-only toward Jira/GitHub),
 * reconciles already-dispatched tasks' own recorded outcome, and polls an
 * already-open PR's merge state. It never merges, pushes, or dispatches on its
 * own initiative; every dispatch it can trigger (via a poll releasing an
 * `enqueued` dependent) traces back to an operator's earlier `play`/`playBulk`
 * click, per `RoadmapGateService`'s own contract.
 *
 * Per-project AND per-step try/catch: one project's sync failure never skips
 * its own reconcile pass, and one project's total failure never blocks another
 * project's tick.
 *
 * **Activity — deliberately quiet.** Only a sync that actually imported or
 * archived something records `roadmap-sync` (below); a no-op sync, an
 * `autoSync: false` project, and every reconcile pass record nothing of their
 * own here — `RoadmapGateService.release`/`markDone` already record
 * `roadmap-item-dispatched`/`roadmap-item-outcome` internally the moment a poll
 * actually changes an item's lifecycle, so this tick would otherwise double the
 * same news. A manual Sync-button click does NOT ride `roadmap-sync` either —
 * the operator already sees that response directly, so logging it too would be
 * a firehose, not a briefing.
 */
@Injectable()
export class RoadmapTickService
  extends TickingWatcherBase
  implements OnModuleInit, OnModuleDestroy
{
  private unsubscribe: (() => void) | null = null;
  protected readonly log: ScopedLogger;
  protected readonly watcherId = "roadmap" as const;

  constructor(
    private readonly roadmap: RoadmapStore,
    private readonly source: RoadmapSourceService,
    private readonly gate: RoadmapGateService,
    private readonly activity: ActivityLogService,
    private readonly systemConfig: SystemConfigStore,
    private readonly watcherHealthRegistry: WatcherHealthRegistry,
    logger: LoggerService,
  ) {
    super();
    this.log = logger.child(RoadmapTickService.name);
  }

  onModuleInit(): void {
    this.arm();
    this.unsubscribe = this.systemConfig.onChange(() => this.arm());
    this.watcherHealthRegistry.register(() => this.watcherHealth());
  }

  protected tickMs(): number {
    return this.systemConfig.current().roadmapTickMs;
  }

  /** The timer-driven path — goes through the base's skip-if-in-flight guard. */
  protected async runTick(): Promise<void> {
    await this.tick();
  }

  onModuleDestroy(): void {
    this.stopTimer();
    this.unsubscribe?.();
  }

  /**
   * Sweep every project that has a roadmap directory. Per-project try/catch —
   * a project whose config/sync/reconcile blows up entirely (e.g. an unsafe id,
   * a deleted project) never stops the sweep from reaching the rest.
   */
  async tick(): Promise<void> {
    for (const projectId of await this.roadmap.projectIds()) {
      try {
        await this.tickProject(projectId);
      } catch (error) {
        this.log.warn("roadmap tick failed for one project — others unaffected", {
          projectId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  private async tickProject(projectId: string): Promise<void> {
    await this.syncOne(projectId);
    // Independent of the sync step above (and of each other): a poll must still
    // run for a project whose sync just failed, and vice versa.
    await this.gate.reconcileRunning(projectId).catch((error: unknown) => {
      this.log.warn("roadmap reconcileRunning failed for one project", {
        projectId,
        error: error instanceof Error ? error.message : String(error),
      });
    });
    await this.gate.reconcileAwaitingMerge(projectId).catch((error: unknown) => {
      this.log.warn("roadmap reconcileAwaitingMerge failed for one project", {
        projectId,
        error: error instanceof Error ? error.message : String(error),
      });
    });
  }

  /** Re-import via `RoadmapSourceService.sync`, but only when the project opted in. */
  private async syncOne(projectId: string): Promise<void> {
    const config = await this.roadmap.readConfig(projectId);
    if (!config.autoSync) return;
    try {
      const result = await this.source.sync(projectId);
      if (result.imported > 0 || result.archived > 0) {
        void this.activity.record({
          kind: "roadmap-sync",
          summary: `Roadmap sync: ${result.imported} imported, ${result.archived} archived`,
          refs: { projectId },
        });
      }
    } catch (error) {
      this.log.warn("roadmap auto-sync failed for one project", {
        projectId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
