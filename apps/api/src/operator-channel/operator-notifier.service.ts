import { Inject, Injectable, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import type {
  ActivityEntry,
  OperatorChannelSettings,
  OperatorDeliveryEntry,
  QuietHours,
  TestResult,
} from "@zibby/contracts";
import type { Subscription } from "rxjs";
import { ActivityEventsService } from "../activity/activity-events.service";
import { LoggerService, type ScopedLogger } from "../shared/logging/logger.service";
import {
  type MessageRef,
  type OperatorNotification,
  RateLimitedError,
} from "./operator-channel.port";
import { OperatorChannelService } from "./operator-channel.service";
import { OperatorChannelStore } from "./operator-channel.store";
import { type OperatorEvent, type OperatorEventLookups, toOperatorEvent } from "./operator-events";
import { buildNotification, buildTestNotification } from "./operator-messages";
import { threadConversationId } from "./thread-binding.store";

/** DI token for the {@link OperatorEventLookups} the mapping enriches entries with. */
export const OPERATOR_EVENT_LOOKUPS = "OPERATOR_EVENT_LOOKUPS";

/** How long a dedupe key suppresses its repeat. */
const DEDUPE_WINDOW_MS = 24 * 60 * 60 * 1000;
/** Max 429 retries for one message before it is logged `failed`. */
const MAX_RATE_LIMIT_RETRIES = 3;

const minutesOf = (hhmm: string): number => {
  const [h = 0, m = 0] = hhmm.split(":").map(Number);
  return h * 60 + m;
};

/** True when `now` (in `q.tz`) is inside the quiet window; `from > to` wraps midnight. */
export function inQuietHours(q: QuietHours | undefined, now: Date): boolean {
  if (!q) return false;
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: q.tz,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  const cur = get("hour") * 60 + get("minute");
  const from = minutesOf(q.from);
  const to = minutesOf(q.to);
  return from <= to ? cur >= from && cur < to : cur >= from || cur < to;
}

/**
 * Event source → policy → channel. Subscribes to the activity stream (the one bus
 * every existing emit point already feeds), maps each entry via
 * {@link toOperatorEvent} (unmapped = Tier-1 = never sent), then:
 *
 * 1. **toggle** — the kind must be in `notify.events`, the channel `enabled`;
 * 2. **dedupe** — `kind + target + state` is sent once per {@link DEDUPE_WINDOW_MS};
 * 3. **coalesce** — events landing within {@link coalesceMs} of the first one go out
 *    as ONE message;
 * 4. **quiet hours** — Tier-2 is held back (logged `quiet-hours`), Tier-3 breaks
 *    through flagged;
 * 5. **per-hour cap** — past `maxPerHour` messages a batch is logged `capped`.
 *
 * Sends go through one serial queue spaced {@link minIntervalMs} apart (Slack's
 * ~1 msg/s per channel), backing off on a 429's `Retry-After`. Every outcome lands
 * in the delivery log. Never throws into the stream — a failed notification is a
 * logged `failed` line, never a broken emitter.
 */
@Injectable()
export class OperatorNotifier implements OnModuleInit, OnModuleDestroy {
  /** Burst window; tests set 0. */
  coalesceMs = 3000;
  /** Spacing between sends (rate limit); tests set 0. */
  minIntervalMs = 1100;
  /** Clock + sleep seams for the policy tests. */
  now: () => Date = () => new Date();
  sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms));

  private readonly log: ScopedLogger;
  private readonly seen = new Map<string, number>();
  private readonly sentAt: number[] = [];
  private buffer: OperatorEvent[] = [];
  private timer: NodeJS.Timeout | null = null;
  private queue: Promise<void> = Promise.resolve();
  private pending: Promise<void>[] = [];
  private sub: Subscription | null = null;

  constructor(
    private readonly events: ActivityEventsService,
    private readonly store: OperatorChannelStore,
    private readonly channel: OperatorChannelService,
    @Inject(OPERATOR_EVENT_LOOKUPS) private readonly lookups: OperatorEventLookups,
    logger: LoggerService,
  ) {
    this.log = logger.child(OperatorNotifier.name);
  }

  onModuleInit(): void {
    this.sub = this.events.stream().subscribe(({ entry }) => {
      this.track(this.onActivity(entry));
    });
  }

  onModuleDestroy(): void {
    this.sub?.unsubscribe();
    if (this.timer) clearTimeout(this.timer);
  }

  private track(p: Promise<void>): void {
    this.pending.push(p);
    void p.finally(() => {
      this.pending = this.pending.filter((x) => x !== p);
    });
  }

  /** Test/flush seam: settle in-flight mapping, flush the burst buffer, drain the queue. */
  async idle(): Promise<void> {
    await Promise.all(this.pending);
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
      this.flush();
    }
    await this.queue;
  }

  /** Map + filter one activity entry; buffers it for the coalesced flush. */
  async onActivity(entry: ActivityEntry): Promise<void> {
    try {
      const settings = await this.store.readSettings();
      if (!settings.enabled) return;
      const event = await toOperatorEvent(entry, this.lookups);
      if (!event || !settings.notify.events.includes(event.kind)) return;
      const now = this.now().getTime();
      const key = `${event.kind}|${event.target}|${event.state}`;
      const last = this.seen.get(key);
      if (last !== undefined && now - last < DEDUPE_WINDOW_MS) return;
      this.seen.set(key, now);
      this.prune(now);
      this.buffer.push(event);
      if (!this.timer) this.timer = setTimeout(() => this.flushNow(), this.coalesceMs);
    } catch (error) {
      this.log.warn("operator notification mapping failed", {
        kind: entry.kind,
        err: errText(error),
      });
    }
  }

  private flushNow(): void {
    this.timer = null;
    this.flush();
  }

  private prune(now: number): void {
    for (const [k, at] of this.seen) if (now - at >= DEDUPE_WINDOW_MS) this.seen.delete(k);
  }

  /** Take the buffered burst and queue it as one message (after quiet hours + cap). */
  private flush(): void {
    const batch = this.buffer;
    this.buffer = [];
    if (batch.length === 0) return;
    this.queue = this.queue.then(() => this.deliverBatch(batch));
  }

  private async deliverBatch(batch: OperatorEvent[]): Promise<void> {
    const settings = await this.store.readSettings();
    const now = this.now();
    const quiet = inQuietHours(settings.notify.quietHours, now);
    const held = quiet ? batch.filter((e) => e.tier === 2) : [];
    const send = quiet ? batch.filter((e) => e.tier === 3) : batch;
    for (const e of held) await this.record(e, "quiet-hours", now);
    if (send.length === 0) return;

    const hourAgo = now.getTime() - 60 * 60 * 1000;
    while (this.sentAt.length > 0 && (this.sentAt[0] ?? 0) <= hourAgo) this.sentAt.shift();
    if (this.sentAt.length >= settings.notify.maxPerHour) {
      for (const e of send) await this.record(e, "capped", now);
      this.log.warn("operator notification capped", { max: settings.notify.maxPerHour });
      return;
    }

    // A task that already has a thread (announced there, or started from it) is
    // answered in that thread, one message each; the rest go out as before.
    const top: OperatorEvent[] = [];
    for (const e of send) {
      const thread = e.taskId ? await this.store.threads.forTask(e.taskId) : null;
      if (thread) await this.deliver([e], settings, quiet, now, thread.threadTs);
      else top.push(e);
    }
    if (top.length > 0) await this.deliver(top, settings, quiet, now);
  }

  private async deliver(
    events: OperatorEvent[],
    settings: OperatorChannelSettings,
    quiet: boolean,
    now: Date,
    threadTs?: string,
  ): Promise<void> {
    const notification = {
      ...buildNotification(events, settings, quiet),
      ...(threadTs ? { threadTs } : {}),
    };
    try {
      const ref = await this.sendWithBackoff(notification);
      this.sentAt.push(this.now().getTime());
      for (const e of events) await this.record(e, "sent", now, ref.ts);
      const [only] = events;
      if (!threadTs && only && events.length === 1) await this.bindThread(only, ref, now);
    } catch (error) {
      this.log.warn("operator notification failed", {
        kind: notification.kind,
        err: errText(error),
      });
      for (const e of events) await this.record(e, "failed", now, undefined, errText(error));
    }
  }

  /**
   * Phase 3 — a single-event message about a run/PR becomes a thread a reply can be
   * feedback on. A coalesced message names several things, so it binds nothing.
   */
  private async bindThread(e: OperatorEvent, ref: MessageRef, now: Date): Promise<void> {
    if (!e.taskId && !e.runId && !e.prUrl) return;
    await this.store.threads
      .bind({
        channel: ref.channel,
        threadTs: ref.ts,
        conversationId: threadConversationId(ref.ts),
        title: e.title,
        at: now.toISOString(),
        ...(e.taskId ? { taskId: e.taskId } : {}),
        ...(e.runId ? { runId: e.runId } : {}),
        ...(e.prUrl ? { prRef: e.prUrl } : {}),
        ...(e.branch ? { branch: e.branch } : {}),
      })
      .catch((error: unknown) => this.log.warn("thread bind failed", { err: errText(error) }));
  }

  /** One send through the serial queue's spacing, retrying a 429 after `Retry-After`. */
  private async sendWithBackoff(
    n: OperatorNotification,
  ): ReturnType<OperatorChannelService["send"]> {
    for (let attempt = 0; ; attempt++) {
      try {
        const ref = await this.channel.send(n);
        if (this.minIntervalMs > 0) await this.sleep(this.minIntervalMs);
        return ref;
      } catch (error) {
        if (!(error instanceof RateLimitedError) || attempt >= MAX_RATE_LIMIT_RETRIES) throw error;
        this.log.info("operator channel rate limited — backing off", { ms: error.retryAfterMs });
        await this.sleep(error.retryAfterMs);
      }
    }
  }

  private async record(
    e: OperatorEvent,
    status: OperatorDeliveryEntry["status"],
    at: Date,
    messageRef?: string,
    detail?: string,
  ): Promise<void> {
    await this.store
      .appendDelivery({
        ts: at.toISOString(),
        kind: e.kind,
        targetRef: e.target,
        status,
        ...(messageRef ? { messageRef } : {}),
        ...(detail ? { detail } : {}),
      })
      .catch((error: unknown) =>
        this.log.warn("delivery log append failed", { err: errText(error) }),
      );
  }

  /** `POST /test` — bypasses toggles and policy (but not the queue); logged as `test`. */
  async sendTest(): Promise<TestResult> {
    const settings: OperatorChannelSettings = await this.store.readSettings();
    let result: TestResult = { ok: false, detail: "not sent" };
    this.queue = this.queue.then(async () => {
      const at = this.now();
      try {
        const ref = await this.sendWithBackoff(buildTestNotification(settings));
        await this.store.appendDelivery({
          ts: at.toISOString(),
          kind: "test",
          targetRef: "test",
          status: "sent",
          messageRef: ref.ts,
        });
        result = { ok: true, detail: `sent (${ref.ts})` };
      } catch (error) {
        await this.store
          .appendDelivery({
            ts: at.toISOString(),
            kind: "test",
            targetRef: "test",
            status: "failed",
            detail: errText(error),
          })
          .catch(() => undefined);
        result = { ok: false, detail: errText(error) };
      }
    });
    await this.queue;
    return result;
  }
}

const errText = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);
