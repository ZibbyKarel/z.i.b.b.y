import {
  Inject,
  Injectable,
  type OnModuleDestroy,
  type OnModuleInit,
  Optional,
} from "@nestjs/common";
import { ModuleRef } from "@nestjs/core";
import type { ChannelItem, CredentialsInput, Integration } from "@zibby/contracts";
import { ActivityLogService } from "../activity/activity-log.service";
import { CredentialsStore } from "../integrations/credentials.store";
import { IntegrationsStorageService } from "../integrations/integrations.storage.service";
import { LoggerService, type ScopedLogger } from "../shared/logging/logger.service";
import { TraceContextService } from "../shared/logging/trace-context.service";
import { SystemConfigStore } from "../system/system-config.store";
import { TickingWatcherBase } from "../shared/ticking-watcher-base";
import { withRetry } from "../shared/retry";
import { randomUUID } from "node:crypto";
import { WatcherHealthRegistry } from "../health/watcher-health.registry";
import type { PollContext } from "./adapters/adapter";
import { MAX_ZIBBY_PR_READS } from "./adapters/adapter";
import { AdapterRegistry } from "./adapters/adapter-registry";
import { ChannelEventsService } from "./channel-events.service";
import { ChannelItemStore } from "./channel-item.store";
import { sanitizeInbound } from "../shared/text/untrusted-envelope";

/**
 * The seam the watcher hands a freshly-ingested `new` item to. 5.3 binds the real
 * {@link CHANNEL_TRIAGE_FLOW}; until then it's absent and the watcher stops at
 * state `new` (5.2 ingestion-only). It also reconciles a handled item's task
 * outcome once the run finishes.
 */
export interface ChannelTriageFlow {
  /** Triage + act on a `new` item; return the transitioned item. */
  handle(item: ChannelItem): Promise<ChannelItem>;
  /** Sweep handled-with-taskId items and copy a finished task's outcome. */
  sweepOutcomes(): Promise<void>;
}
export const CHANNEL_TRIAGE_FLOW = Symbol("CHANNEL_TRIAGE_FLOW");

/**
 * The inbound heartbeat (Phase 5.2). `systemConfig.channelTickMs` (default 30s, `0`
 * disables; every e2e seeds "0" and drives {@link tick} directly).
 * Per enabled, credentialled integration: adapter.poll → persist new items (state
 * `new`, sanitized text) → hand each to the triage flow (5.3) → advance the cursor
 * AFTER items persist, so a crash re-polls rather than drops (dedup-by-id makes the
 * replay harmless). Per-integration try/catch: one failing integration stamps its
 * own `lastError` and never blocks the others.
 */
@Injectable()
export class ChannelWatcherService
  extends TickingWatcherBase
  implements OnModuleInit, OnModuleDestroy
{
  private unsubscribe: (() => void) | null = null;
  protected readonly log: ScopedLogger;
  protected readonly watcherId = "channel" as const;
  /** F6c: the most recent poll failure this tick round (null = last round clean).
   * Feeds the health probe's `detail` only — `integrations.markSync` owns the
   * durable per-integration `lastError`; triage-degraded surfacing is a follow-up. */
  private lastPollError: string | null = null;

  constructor(
    private readonly integrations: IntegrationsStorageService,
    private readonly credentials: CredentialsStore,
    private readonly registry: AdapterRegistry,
    private readonly store: ChannelItemStore,
    private readonly events: ChannelEventsService,
    private readonly logger: LoggerService,
    private readonly trace: TraceContextService,
    private readonly activity: ActivityLogService,
    private readonly systemConfig: SystemConfigStore,
    private readonly watcherHealthRegistry: WatcherHealthRegistry,
    private readonly moduleRef: ModuleRef,
    @Optional() @Inject(CHANNEL_TRIAGE_FLOW) private readonly flow?: ChannelTriageFlow,
  ) {
    super();
    this.log = logger.child(ChannelWatcherService.name);
  }

  onModuleInit(): void {
    // Poll interval from the operator-owned system config; `0` disables (re-arm live).
    this.arm();
    this.unsubscribe = this.systemConfig.onChange(() => this.arm());
    // F6c: self-register the heartbeat probe; `detail` carries the last poll error.
    this.watcherHealthRegistry.register(() => {
      const health = this.watcherHealth();
      return this.lastPollError ? { ...health, detail: this.lastPollError } : health;
    });
  }

  protected tickMs(): number {
    return this.systemConfig.current().channelTickMs;
  }

  /** The timer-driven path — goes through the base's skip-if-in-flight guard. */
  protected async runTick(): Promise<void> {
    await this.tick();
  }

  /** (Re-)arm the poll loop from `systemConfig.channelTickMs`; `0` leaves it disabled. */
  protected override arm(): void {
    super.arm();
    const tickMs = this.tickMs();
    if (tickMs > 0) {
      this.log.info("channel watcher started", { tickMs });
    } else {
      this.log.debug("channel watcher tick disabled (channelTickMs <= 0)");
    }
  }

  onModuleDestroy(): void {
    this.stopTimer();
    this.unsubscribe?.();
  }

  /** Poll every enabled, credentialled integration once; return the ingested item ids. */
  async tick(): Promise<string[]> {
    const ingested: string[] = [];
    // F6c: a clean round clears the health probe's detail; any failure below re-stamps it.
    this.lastPollError = null;
    // Outcome reconciliation first, so a finished Tier-1 task lands on its item.
    await this.flow
      ?.sweepOutcomes()
      .catch((err) => this.log.debug("outcome sweep failed", { error: (err as Error).message }));

    for (const integration of await this.integrations.list()) {
      if (!integration.enabled) continue;
      const creds = await this.credentials.read(integration.id);
      if (!creds) continue;
      // Each integration's poll runs in its own trace scope + try/catch.
      await this.trace.run({ traceId: randomUUID() }, async () => {
        try {
          const ids = await this.pollOne(integration, creds);
          ingested.push(...ids);
        } catch (err) {
          // The poll exhausted its retry/backoff budget (pollOne) — surface it: stamp
          // lastError AND record an activity line so a persistently failing channel is
          // visible in the briefing, never silent (M8 "never fails silently").
          const message = err instanceof Error ? err.message : String(err);
          // F6c: surface the failure on the watcher's health probe too (last one wins).
          this.lastPollError = `${integration.id}: ${message}`;
          await this.integrations.markSync(integration.id, { status: "error", lastError: message });
          void this.activity.record({
            kind: "integration-retry-exhausted",
            summary: `integration ${integration.id} (${integration.kind}) failed after retries: ${message}`,
            refs: { integrationId: integration.id, status: "error" },
          });
          this.log.warn("integration poll failed after retries", {
            id: integration.id,
            error: message,
          });
        }
      });
    }
    return ingested;
  }

  /**
   * ZIBBY's own open PR numbers for a github integration's project (phase-126a,
   * condition (a) of the operator's ask) — resolved through `ZibbyPrLocator`
   * (`review-learning/zibby-pr.locator.ts`), the exact seam `ReviewCommentFetcher`
   * already uses to answer "is this ZIBBY's PR" (D6 in
   * `docs/plans/phase-126a-github-question-scope.md`). `ChannelsModule`
   * deliberately does NOT import `ReviewLearningModule` to get a constructor
   * injection: that module drags in `ArtifactsModule` + `ScheduledTasksStorageModule`,
   * and D8 rules out widening this module's import graph for one bookkeeping
   * lookup — the DI cycle this codebase has already been bitten by lives in
   * exactly that class of cross-module import. Instead it's resolved lazily via
   * `ModuleRef` (`strict: false` searches the WHOLE app container, not just this
   * module's own imports, so no export/import wiring is needed at all) — the
   * same escape hatch `PipelineRunnerService` uses to reach `HandoffService`
   * from a module that doesn't import `HandoffModule`, never `forwardRef`. The
   * class reference itself is fetched via a lazy `await import(...)` too, so
   * this file never eagerly `require`s the review-learning module chain at
   * load time (mirrors the `import type` + lazy-value-import split
   * `pipeline-runner.service.ts` uses for the same reason).
   *
   * Fail-open: ANY failure here — the locator throws, the provider isn't up
   * yet, the project genuinely has no PRs — returns an empty array rather than
   * propagating. A bookkeeping miss must never stop channel ingestion; the
   * mentions search alone still carries the poll.
   */
  private async zibbyPrNumbersFor(projectId: string): Promise<readonly number[]> {
    try {
      const { ZibbyPrLocator } = await import("../review-learning/zibby-pr.locator");
      const locator = this.moduleRef.get(ZibbyPrLocator, { strict: false });
      const numbers = await locator.numbersFor(projectId);
      // The adapter turns each number into its own `GET /repos/{repo}/issues/{n}`,
      // so an unbounded set would mean an unbounded poll. Capping HERE rather than
      // in the adapter is deliberate: this class has the scoped logger, and a
      // dropped number is exactly the kind of silent coverage loss that must be
      // visible in the record rather than printed to stderr from a `new`-built
      // adapter with no trace context.
      if (numbers.length > MAX_ZIBBY_PR_READS) {
        this.log.warn("zibby PR set capped for this poll", {
          projectId,
          cap: MAX_ZIBBY_PR_READS,
          dropped: numbers.length - MAX_ZIBBY_PR_READS,
        });
        return numbers.slice(0, MAX_ZIBBY_PR_READS);
      }
      return numbers;
    } catch (err) {
      this.log.debug("zibby PR lookup failed (fail-open, mentions-only this poll)", {
        projectId,
        error: err instanceof Error ? err.message : String(err),
      });
      return [];
    }
  }

  private async pollOne(integration: Integration, creds: CredentialsInput): Promise<string[]> {
    const adapter = this.registry.resolve(integration.kind);
    const cursor = await this.store.readCursor(integration.id);
    // Only a github integration owned by a project (never a company — the locator
    // keys on projectId) gets the ZIBBY-PR half of the union; every other kind
    // (and a company-owned github integration) polls with no ctx at all.
    const ctx: PollContext | undefined =
      integration.kind === "github" && integration.projectId
        ? { zibbyPrNumbers: await this.zibbyPrNumbersFor(integration.projectId) }
        : undefined;
    // M8: retry a transient poll failure with exponential backoff before giving up.
    // Only the network read retries; item persistence below is idempotent (dedup-by-id)
    // and stays outside the retry. Exhaustion rethrows to tick's catch (the DLQ boundary).
    const { items, cursor: nextCursor } = await withRetry(
      () => adapter.poll(integration, creds, cursor, ctx),
      {
        retries: intEnv("CHANNEL_POLL_RETRIES", 2),
        baseMs: intEnv("CHANNEL_POLL_BACKOFF_MS", 250),
        onRetry: (attempt, error) =>
          this.log.debug("integration poll retry", {
            id: integration.id,
            attempt,
            error: error instanceof Error ? error.message : String(error),
          }),
      },
    );

    const ingested: string[] = [];
    for (const msg of items) {
      const item: ChannelItem = {
        id: msg.id,
        integrationId: integration.id,
        kind: integration.kind,
        externalRef: msg.externalRef,
        from: msg.from,
        receivedAt: msg.receivedAt,
        text: sanitizeInbound(msg.text),
        raw: msg.raw,
        state: "new",
        ...(msg.url ? { url: msg.url } : {}),
      };
      const stored = await this.store.put(item);
      // Only a genuinely new item (not a dedup hit) is acted on / announced.
      const isNew = stored === item;
      if (isNew) {
        this.events.emit({ itemId: stored.id, state: stored.state });
        ingested.push(stored.id);
        // A genuinely new inbound item — record once, here at the source (NOT on
        // every empty poll: noise discipline starts where the item is born).
        void this.activity.record({
          kind: "channel-item",
          summary: `inbound ${integration.kind} item from ${integration.id}`,
          refs: { itemId: stored.id, integrationId: integration.id },
        });
        if (this.flow) {
          const acted = await this.flow.handle(stored).catch((err) => {
            // A triage failure leaves the item `new` to retry next tick (at-least-once).
            this.log.warn("triage flow failed", {
              itemId: stored.id,
              error: (err as Error).message,
            });
            return null;
          });
          if (acted) this.events.emit({ itemId: acted.id, state: acted.state });
        }
      }
    }

    // Cursor AFTER items persist — crash re-polls (dedup-safe) rather than drops.
    await this.store.writeCursor(integration.id, nextCursor);
    await this.integrations.markSync(integration.id, {
      status: "connected",
      lastSyncAt: new Date().toISOString(),
      lastError: undefined,
    });
    return ingested;
  }
}

/** Parse a non-negative integer env var, falling back to `dflt` on absent/garbage. */
function intEnv(name: string, dflt: number): number {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n >= 0 ? n : dflt;
}
