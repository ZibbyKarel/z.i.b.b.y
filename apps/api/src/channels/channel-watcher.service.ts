import {
  Inject,
  Injectable,
  type OnModuleDestroy,
  type OnModuleInit,
  Optional,
} from "@nestjs/common"
import type { ChannelItem, CredentialsInput, Integration } from "@zibby/contracts"
import { ActivityLogService } from "../activity/activity-log.service"
import { CredentialsStore } from "../integrations/credentials.store"
import { IntegrationsStorageService } from "../integrations/integrations.storage.service"
import { LoggerService, type ScopedLogger } from "../shared/logging/logger.service"
import { TraceContextService } from "../shared/logging/trace-context.service"
import { randomUUID } from "node:crypto"
import { AdapterRegistry } from "./adapters/adapter-registry"
import { ChannelEventsService } from "./channel-events.service"
import { ChannelItemStore } from "./channel-item.store"
import { sanitizeInbound } from "./sanitize"

/**
 * The seam the watcher hands a freshly-ingested `new` item to. 5.3 binds the real
 * {@link CHANNEL_TRIAGE_FLOW}; until then it's absent and the watcher stops at
 * state `new` (5.2 ingestion-only). It also reconciles a handled item's task
 * outcome once the run finishes.
 */
export interface ChannelTriageFlow {
  /** Triage + act on a `new` item; return the transitioned item. */
  handle(item: ChannelItem): Promise<ChannelItem>
  /** Sweep handled-with-taskId items and copy a finished task's outcome. */
  sweepOutcomes(): Promise<void>
}
export const CHANNEL_TRIAGE_FLOW = Symbol("CHANNEL_TRIAGE_FLOW")

/**
 * The inbound heartbeat (Phase 5.2). CHANNEL_TICK_MS (default 30s, ≤ 0 disables —
 * the TASK_TICK_MS semantics; every e2e sets "0" and drives {@link tick} directly).
 * Per enabled, credentialled integration: adapter.poll → persist new items (state
 * `new`, sanitized text) → hand each to the triage flow (5.3) → advance the cursor
 * AFTER items persist, so a crash re-polls rather than drops (dedup-by-id makes the
 * replay harmless). Per-integration try/catch: one failing integration stamps its
 * own `lastError` and never blocks the others.
 */
@Injectable()
export class ChannelWatcherService implements OnModuleInit, OnModuleDestroy {
  private timer: ReturnType<typeof setInterval> | null = null
  private readonly log: ScopedLogger

  constructor(
    private readonly integrations: IntegrationsStorageService,
    private readonly credentials: CredentialsStore,
    private readonly registry: AdapterRegistry,
    private readonly store: ChannelItemStore,
    private readonly events: ChannelEventsService,
    private readonly logger: LoggerService,
    private readonly trace: TraceContextService,
    private readonly activity: ActivityLogService,
    @Optional() @Inject(CHANNEL_TRIAGE_FLOW) private readonly flow?: ChannelTriageFlow,
  ) {
    this.log = logger.child(ChannelWatcherService.name)
  }

  onModuleInit(): void {
    const raw = process.env.CHANNEL_TICK_MS
    const tickMs = raw === undefined ? 30_000 : Number(raw)
    if (tickMs > 0) {
      this.timer = setInterval(() => void this.tick(), tickMs)
      this.timer.unref?.()
      this.log.info("channel watcher started", { tickMs })
    } else {
      this.log.debug("channel watcher tick disabled (CHANNEL_TICK_MS <= 0)")
    }
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer)
  }

  /** Poll every enabled, credentialled integration once; return the ingested item ids. */
  async tick(): Promise<string[]> {
    const ingested: string[] = []
    // Outcome reconciliation first, so a finished Tier-1 task lands on its item.
    await this.flow?.sweepOutcomes().catch((err) =>
      this.log.debug("outcome sweep failed", { error: (err as Error).message }),
    )

    for (const integration of await this.integrations.list()) {
      if (!integration.enabled) continue
      const creds = await this.credentials.read(integration.id)
      if (!creds) continue
      // Each integration's poll runs in its own trace scope + try/catch.
      await this.trace.run({ traceId: randomUUID() }, async () => {
        try {
          const ids = await this.pollOne(integration, creds)
          ingested.push(...ids)
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err)
          await this.integrations.markSync(integration.id, { status: "error", lastError: message })
          this.log.warn("integration poll failed", { id: integration.id, error: message })
        }
      })
    }
    return ingested
  }

  private async pollOne(integration: Integration, creds: CredentialsInput): Promise<string[]> {
    const adapter = this.registry.resolve(integration.kind)
    const cursor = await this.store.readCursor(integration.id)
    const { items, cursor: nextCursor } = await adapter.poll(integration, creds, cursor)

    const ingested: string[] = []
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
      }
      const stored = await this.store.put(item)
      // Only a genuinely new item (not a dedup hit) is acted on / announced.
      const isNew = stored === item
      if (isNew) {
        this.events.emit({ itemId: stored.id, state: stored.state })
        ingested.push(stored.id)
        // A genuinely new inbound item — record once, here at the source (NOT on
        // every empty poll: noise discipline starts where the item is born).
        void this.activity.record({
          kind: "channel-item",
          summary: `inbound ${integration.kind} item from ${integration.id}`,
          refs: { itemId: stored.id, integrationId: integration.id },
        })
        if (this.flow) {
          const acted = await this.flow.handle(stored).catch((err) => {
            // A triage failure leaves the item `new` to retry next tick (at-least-once).
            this.log.warn("triage flow failed", { itemId: stored.id, error: (err as Error).message })
            return null
          })
          if (acted) this.events.emit({ itemId: acted.id, state: acted.state })
        }
      }
    }

    // Cursor AFTER items persist — crash re-polls (dedup-safe) rather than drops.
    await this.store.writeCursor(integration.id, nextCursor)
    await this.integrations.markSync(integration.id, {
      status: "connected",
      lastSyncAt: new Date().toISOString(),
      lastError: undefined,
    })
    return ingested
  }
}
