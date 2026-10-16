import { randomUUID } from "node:crypto";
import { Injectable, type OnModuleDestroy, type OnModuleInit, Optional } from "@nestjs/common";
import type {
  CredentialsInput,
  Integration,
  MonitorEvent,
  MonitorEventKind,
} from "@zibby/contracts";
import { ActivityLogService } from "../activity/activity-log.service";
import { CredentialsStore } from "../integrations/credentials.store";
import { IntegrationsStorageService } from "../integrations/integrations.storage.service";
import { ResolvedProjectService } from "../projects/resolved-project.service";
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
    // Phase 129 — the repos of a repo-less company GitHub integration. Optional so
    // existing wiring/tests without it keep polling project-owned integrations.
    @Optional() private readonly resolvedProjects?: ResolvedProjectService,
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

  /**
   * Phase 129 (G2) — a company-owned GitHub integration without its own `repo` is
   * polled once per distinct repo of its inheriting projects, with `config.repo`
   * filled in. Each repo keeps its own cursor + status sidecar, keyed
   * `<integrationId>--<owner>-<name>` (so they never collide with each other or a
   * plain integration's), and its alerts/status carry the repo's first project.
   * One failing repo doesn't stop the others; the first failure is rethrown.
   */
  private async pollOne(
    integration: Integration,
    creds: CredentialsInput,
    adapter: MonitorAdapter,
  ): Promise<string[]> {
    if (integration.config.kind !== "github" || integration.config.repo) {
      return this.pollTarget(integration, creds, adapter);
    }
    const targets = (await this.resolvedProjects?.githubRepoTargets(integration)) ?? new Map();
    const ingested: string[] = [];
    let failure: unknown;
    for (const [repo, projectIds] of targets) {
      const scoped: Integration = { ...integration, config: { ...integration.config, repo } };
      const target = {
        key: `${integration.id}--${repo.replace(/[^a-zA-Z0-9._-]/g, "-")}`,
        ...(projectIds[0] ? { projectId: projectIds[0] } : {}),
      };
      try {
        ingested.push(...(await this.pollTarget(scoped, creds, adapter, target)));
      } catch (err) {
        failure ??= new Error(`${repo}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    if (failure !== undefined) throw failure;
    return ingested;
  }

  private async pollTarget(
    integration: Integration,
    creds: CredentialsInput,
    adapter: MonitorAdapter,
    target: { key: string; projectId?: string } = {
      key: integration.id,
      ...(integration.projectId ? { projectId: integration.projectId } : {}),
    },
  ): Promise<string[]> {
    const cursor = await this.store.readCursor(target.key, adapter.kind);
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
        ...(target.projectId ? { projectId: target.projectId } : {}),
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
    await this.store.writeCursor(target.key, adapter.kind, nextCursor);
    // N4b: the source's health snapshot is state, not an event — overwrite the
    // sidecar every tick (silent Tier-1; the alert path above owns notification).
    if (status) {
      await this.store.writeStatus(
        {
          integrationId: integration.id,
          ...(target.projectId ? { projectId: target.projectId } : {}),
          adapterKind: adapter.kind,
          ...status,
        },
        target.key,
      );
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
          text: `${event.title}\n\n${event.detail}\n${event.url ? `\nRun: ${event.url}\n` : ""}\n${INSTRUCTION[event.kind]}`,
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

/**
 * Per-kind investigation instruction (NS2 F7a, correction 1c) — a CI alert and
 * a Sentry alert need different framing; a `Record` also makes any future kind
 * a compile-time reminder to supply text. Everything else about `dispatch` is
 * unchanged: same tier path, same `createTask`, same act-then-report gate.
 */
const INSTRUCTION: Record<MonitorEventKind, string> = {
  "ci-run-failed":
    "Investigate the failing CI run and prepare a fix on its own branch. Do not push or merge — the PR is the gate.",
  "error-unresolved":
    "Investigate the Sentry error, find the root cause, and prepare a fix on its own branch. Do not push or merge — the PR is the gate.",
};

/** Parse a non-negative integer env var, falling back to `dflt` on absent/garbage. */
function intEnv(name: string, dflt: number): number {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n >= 0 ? n : dflt;
}
