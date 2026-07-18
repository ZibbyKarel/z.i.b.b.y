import { randomUUID } from "node:crypto";
import { Injectable, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import type { CredentialsInput, Integration, MonitorEvent } from "@zibby/contracts";
import { ActivityLogService } from "../activity/activity-log.service";
import { CredentialsStore } from "../integrations/credentials.store";
import { IntegrationsStorageService } from "../integrations/integrations.storage.service";
import { LoggerService, type ScopedLogger } from "../shared/logging/logger.service";
import { TraceContextService } from "../shared/logging/trace-context.service";
import { withRetry } from "../shared/retry";
import { TickingWatcherBase } from "../shared/ticking-watcher-base";
import { SystemConfigStore } from "../system/system-config.store";
import { TaskSchedulerService } from "../tasks/task-scheduler.service";
import { WatcherHealthRegistry } from "../health/watcher-health.registry";
import { type MonitorAdapter, MonitorAdapterRegistry } from "./monitor-adapter";
import { MonitorEventStore } from "./monitor-event.store";

/**
 * The monitor heartbeat (N3) — the status/alert twin of the channel watcher.
 * `systemConfig.monitorTickMs` (default 60s, `0` disables; tests drive
 * {@link tick} directly). Per enabled, credentialled integration, every
 * registered adapter that `wants()` it polls with its own cursor; a NEW alert
 * (dedup by deterministic id) is persisted, recorded (`monitor-alert`), and
 * handled on the tier path: an investigation task dispatched through the
 * ordinary scheduler — classifier routes it, budget/limit guards apply, a fix
 * ends at the structural PR gate like any other run (Tier-2 act-then-report; the
 * gate itself stays Tier-3). Task dispatch failing leaves the event `new` — the
 * next tick retries it (the alert is never lost, never silently dropped).
 * Per-integration try/catch: one failing monitor never blocks the others.
 */
@Injectable()
export class MonitorWatcherService
  extends TickingWatcherBase
  implements OnModuleInit, OnModuleDestroy
{
  private unsubscribe: (() => void) | null = null;
  protected readonly log: ScopedLogger;
  protected readonly watcherId = "monitor" as const;

  constructor(
    private readonly integrations: IntegrationsStorageService,
    private readonly credentials: CredentialsStore,
    private readonly registry: MonitorAdapterRegistry,
    private readonly store: MonitorEventStore,
    private readonly scheduler: TaskSchedulerService,
    private readonly activity: ActivityLogService,
    private readonly systemConfig: SystemConfigStore,
    private readonly trace: TraceContextService,
    private readonly watcherHealthRegistry: WatcherHealthRegistry,
    logger: LoggerService,
  ) {
    super();
    this.log = logger.child(MonitorWatcherService.name);
  }

  onModuleInit(): void {
    this.arm();
    this.unsubscribe = this.systemConfig.onChange(() => this.arm());
    // F6c: self-register the heartbeat probe.
    this.watcherHealthRegistry.register(() => this.watcherHealth());
  }

  protected tickMs(): number {
    return this.systemConfig.current().monitorTickMs;
  }

  /** The timer-driven path — goes through the base's skip-if-in-flight guard. */
  protected async runTick(): Promise<void> {
    await this.tick();
  }

  /** (Re-)arm the poll loop from `systemConfig.monitorTickMs`; `0` disables. */
  protected override arm(): void {
    super.arm();
    const tickMs = this.tickMs();
    if (tickMs > 0) {
      this.log.info("monitor watcher started", { tickMs });
    } else {
      this.log.debug("monitor watcher tick disabled (monitorTickMs <= 0)");
    }
  }

  onModuleDestroy(): void {
    this.stopTimer();
    this.unsubscribe?.();
  }

  /** Poll every opted-in integration once; return ingested event ids. */
  async tick(): Promise<string[]> {
    const ingested: string[] = [];
    // Re-drive alerts a previous tick ingested but could not dispatch.
    await this.retryUnhandled().catch(() => {});

    for (const integration of await this.integrations.list()) {
      if (!integration.enabled) continue;
      const adapters = this.registry.forIntegration(integration);
      if (adapters.length === 0) continue;
      const creds = await this.credentials.read(integration.id);
      if (!creds) continue;
      for (const adapter of adapters) {
        await this.trace.run({ traceId: randomUUID() }, async () => {
          try {
            ingested.push(...(await this.pollOne(integration, creds, adapter)));
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            this.log.warn("monitor poll failed after retries", {
              id: integration.id,
              adapter: adapter.kind,
              error: message,
            });
          }
        });
      }
    }
    return ingested;
  }

  private async pollOne(
    integration: Integration,
    creds: CredentialsInput,
    adapter: MonitorAdapter,
  ): Promise<string[]> {
    const cursor = await this.store.readCursor(integration.id, adapter.kind);
    const {
      events,
      cursor: nextCursor,
      status,
    } = await withRetry(() => adapter.poll(integration, creds, cursor), {
      retries: intEnv("MONITOR_POLL_RETRIES", 2),
      baseMs: intEnv("MONITOR_POLL_BACKOFF_MS", 250),
      onRetry: (attempt, error) =>
        this.log.debug("monitor poll retry", {
          id: integration.id,
          attempt,
          error: error instanceof Error ? error.message : String(error),
        }),
    });

    const ingested: string[] = [];
    for (const alert of events) {
      const event: MonitorEvent = {
        ...alert,
        integrationId: integration.id,
        ...(integration.projectId ? { projectId: integration.projectId } : {}),
        state: "new",
      };
      const stored = await this.store.putNew(event);
      if (!stored) continue; // dedup hit — already known
      ingested.push(stored.id);
      // Recorded once, at birth (noise discipline) — the alert itself is Tier-1.
      void this.activity.record({
        kind: "monitor-alert",
        summary: stored.title,
        refs: { itemId: stored.id, integrationId: integration.id },
      });
      await this.dispatch(stored);
    }

    // Cursor AFTER events persist — crash re-polls (dedup-safe) rather than drops.
    await this.store.writeCursor(integration.id, adapter.kind, nextCursor);
    // N4b: the source's health snapshot is state, not an event — overwrite the
    // sidecar every tick (silent Tier-1; the alert path above owns notification).
    if (status) {
      await this.store.writeStatus({
        integrationId: integration.id,
        ...(integration.projectId ? { projectId: integration.projectId } : {}),
        adapterKind: adapter.kind,
        ...status,
      });
    }
    return ingested;
  }

  /**
   * Handle one `new` alert on the tier path: dispatch the investigation task via
   * the ordinary scheduler (guards + classifier included). Inbound alert text is
   * DATA framed as context, never a command (Law 4). Failure leaves it `new`.
   */
  private async dispatch(event: MonitorEvent): Promise<void> {
    try {
      const result = await this.scheduler.createTask(
        {
          title: event.title,
          text: `${event.title}\n\n${event.detail}\n${event.url ? `\nRun: ${event.url}\n` : ""}\nInvestigate the failing CI run and prepare a fix on its own branch. Do not push or merge — the PR is the gate.`,
          paths: [],
        },
        Date.now(),
        event.projectId,
      );
      const taskId = "task" in result ? result.task.id : undefined;
      await this.store.patch(event.id, { state: "handled", ...(taskId ? { taskId } : {}) });
    } catch (err) {
      // Empty catalog / claude down / anything — the alert stays `new`; the next
      // tick retries. Never silently dropped, never crashes the loop.
      this.log.warn("monitor dispatch failed — alert stays new", {
        eventId: event.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  /** Re-dispatch alerts stuck `new` (a previous dispatch failed). */
  private async retryUnhandled(): Promise<void> {
    for (const event of await this.store.listFiltered({ state: "new" })) {
      await this.dispatch(event);
    }
  }
}

/** Parse a non-negative integer env var, falling back to `dflt` on absent/garbage. */
function intEnv(name: string, dflt: number): number {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n >= 0 ? n : dflt;
}
