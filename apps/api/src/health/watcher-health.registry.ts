import { Injectable } from "@nestjs/common";
import type { WatcherHealth } from "@zibby/contracts";
import { LoggerService, type ScopedLogger } from "../shared/logging/logger.service";

/**
 * NS2 F6c — the aggregation point for the five heartbeat watchers' health probes.
 * Each `TickingWatcherBase` subclass self-registers a probe closure at
 * `onModuleInit` (the `ApprovalsService.register` precedent), and `/health`
 * composes `watchers[]` from {@link all}. Fail-open end to end: a throwing probe
 * is dropped with a warning, never fatal — and a `stale` watcher never flips the
 * overall `/health` status to degraded in v1 (it surfaces as a briefing line and
 * a settings-HUD indicator instead).
 */
@Injectable()
export class WatcherHealthRegistry {
  private readonly probes: Array<() => WatcherHealth> = [];
  private readonly log: ScopedLogger;

  constructor(logger: LoggerService) {
    this.log = logger.child(WatcherHealthRegistry.name);
  }

  /** Register one watcher's probe closure (called at each watcher's `onModuleInit`). */
  register(probe: () => WatcherHealth): void {
    this.probes.push(probe);
  }

  /** Snapshot every registered watcher's health; a throwing probe is dropped-with-warn. */
  all(): WatcherHealth[] {
    const out: WatcherHealth[] = [];
    for (const probe of this.probes) {
      try {
        out.push(probe());
      } catch (err) {
        this.log.warn("watcher health probe threw — dropped (fail-open)", {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
    return out;
  }
}
