import { Injectable, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import { type EffectiveRoadmapConfig, resolveRoadmapConfig } from "@zibby/contracts";
import { WatcherHealthRegistry } from "../health/watcher-health.registry";
import { ProjectsStorageService } from "../projects/projects.storage.service";
import { ResolvedProjectService } from "../projects/resolved-project.service";
import { LoggerService, type ScopedLogger } from "../shared/logging/logger.service";
import { TickingWatcherBase } from "../shared/ticking-watcher-base";
import { SystemConfigStore } from "../system/system-config.store";
import { RoadmapGateService } from "./roadmap-gate.service";
import { RoadmapStore } from "./roadmap.store";

/**
 * Phase 125h — the roadmap heartbeat: `systemConfig.roadmapTickMs` (default 15 min,
 * `0` disables; tests drive {@link tick} directly). Every project with a roadmap
 * directory gets two independent, per-step-guarded passes each tick:
 *
 * 1. **Gate poll** — `RoadmapGateService.reconcileRunning` +
 *    `reconcileAwaitingMerge`, run for EVERY project with a roadmap. This is the
 *    poll half of the two release signals (master plan "Release signals"): an
 *    operator who merges a PR straight on GitHub must still see its dependents
 *    released.
 * 2. **Auto-pickup** — if the project's effective `autoPlay` is `true`,
 *    `RoadmapGateService.autoPickup` enqueues its unblocked `todo` tasks and
 *    decomposes its never-decomposed childless epics. Skipped entirely for a
 *    project with the toggle off. Runs LAST so it sees the slots the reconcile
 *    passes just freed.
 *
 * **Law 3** — this tick reconciles already-dispatched tasks' own recorded
 * outcome, polls an already-open PR's merge state, and — for a project that
 * opted in — dispatches implementation work onto its own branch. It never
 * merges, never pushes to a shared branch, never deploys: the PR is where it
 * stops, exactly as when the operator clicks Play. A dispatch here is a
 * Tier-1/2 act with the operator's standing consent (the per-project `autoPlay`
 * toggle), not an autonomous commit to the outside world.
 *
 * Per-project AND per-step try/catch: one project's failure never blocks
 * another project's tick.
 *
 * **Activity — deliberately quiet.** Reconcile passes record nothing of their
 * own here — `RoadmapGateService.release`/`markDone` already record
 * `roadmap-item-dispatched`/`roadmap-item-outcome` internally the moment a poll
 * actually changes an item's lifecycle, so this tick would otherwise double the
 * same news.
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
    private readonly gate: RoadmapGateService,
    private readonly systemConfig: SystemConfigStore,
    private readonly watcherHealthRegistry: WatcherHealthRegistry,
    private readonly projects: ProjectsStorageService,
    private readonly resolvedProjects: ResolvedProjectService,
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
   * a project whose config/reconcile blows up entirely (e.g. an unsafe id,
   * a deleted project) never stops the sweep from reaching the rest.
   */
  async tick(): Promise<void> {
    const projectIds = await this.roadmap.projectIds();
    const effective = new Map<string, EffectiveRoadmapConfig>();
    for (const projectId of projectIds) {
      const config = await this.effectiveConfig(projectId).catch((error: unknown) => {
        this.log.warn("roadmap config unreadable for one project — skipped this tick", {
          projectId,
          error: error instanceof Error ? error.message : String(error),
        });
        return null;
      });
      if (config) effective.set(projectId, config);
    }
    for (const [projectId, config] of effective) {
      try {
        await this.tickProject(projectId, config);
      } catch (error) {
        this.log.warn("roadmap tick failed for one project — others unaffected", {
          projectId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  /**
   * Phase 128 (D8) — the project's toggles with inheritance applied: own value,
   * else its effective company's `roadmapDefaults`, else the global `false`.
   */
  private async effectiveConfig(projectId: string): Promise<EffectiveRoadmapConfig> {
    const config = await this.roadmap.readConfig(projectId);
    const project = await this.projects.get(projectId).catch(() => null);
    const company = project ? await this.resolvedProjects.resolveCompany(project) : undefined;
    return resolveRoadmapConfig(config, company?.roadmapDefaults);
  }

  private async tickProject(projectId: string, config: EffectiveRoadmapConfig): Promise<void> {
    // Independent of each other: one pass failing never skips the other.
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
    // LAST on purpose: both reconcile passes have just freed the slots of
    // everything that finished — so pickup sees the most current picture.
    if (config.autoPlay) await this.autoPlayOne(projectId);
  }

  /** Auto-pickup via `RoadmapGateService.autoPickup` (the caller checked the effective `autoPlay`). */
  private async autoPlayOne(projectId: string): Promise<void> {
    try {
      await this.gate.autoPickup(projectId);
    } catch (error) {
      this.log.warn("roadmap auto-pickup failed for one project", {
        projectId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
