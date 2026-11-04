import { Inject, Injectable, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import type { ActivityEntry, WebPushSubscription } from "@zibby/contracts";
import type { Subscription } from "rxjs";
import webpush from "web-push";
import { LoggerService, type ScopedLogger } from "../shared/logging/logger.service";
import { ActivityEventsService } from "../activity/activity-events.service";
import { OperatorChannelStore } from "../operator-channel/operator-channel.store";
import { type OperatorEventLookups, toOperatorEvent } from "../operator-channel/operator-events";
import { OPERATOR_MESSAGES, fill } from "../operator-channel/operator-messages";
import { OPERATOR_EVENT_LOOKUPS } from "../operator-channel/operator-notifier.service";
import { type VapidKeys, WebPushStore } from "./web-push.store";

/** DI token for the function that actually talks to the browser's push service. */
export const WEB_PUSH_SENDER = "WEB_PUSH_SENDER";

export type WebPushSender = (
  sub: WebPushSubscription,
  payload: string,
  vapid: VapidKeys,
) => Promise<void>;

export const defaultWebPushSender: WebPushSender = async (sub, payload, vapid) => {
  await webpush.sendNotification(sub, payload, {
    vapidDetails: { subject: process.env.WEB_PUSH_SUBJECT ?? "mailto:zibby@example.com", ...vapid },
    TTL: 86_400,
  });
};

const DEDUPE_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * Rides the activity stream through `toOperatorEvent` and pushes Tier-3 events (what
 * waits on the operator) to every stored browser subscription. Deduped per
 * `kind|target|state` for 24 h; a subscription the push service reports gone
 * (404/410) is dropped. Never throws into the stream.
 */
@Injectable()
export class WebPushNotifier implements OnModuleInit, OnModuleDestroy {
  now: () => Date = () => new Date();
  private readonly seen = new Map<string, number>();
  private readonly log: ScopedLogger;
  private pending: Promise<void>[] = [];
  private sub: Subscription | null = null;

  constructor(
    private readonly events: ActivityEventsService,
    private readonly store: WebPushStore,
    private readonly settings: OperatorChannelStore,
    @Inject(OPERATOR_EVENT_LOOKUPS) private readonly lookups: OperatorEventLookups,
    @Inject(WEB_PUSH_SENDER) private readonly send: WebPushSender,
    logger: LoggerService,
  ) {
    this.log = logger.child(WebPushNotifier.name);
  }

  onModuleInit(): void {
    this.sub = this.events.stream().subscribe(({ entry }) => {
      const p = this.onActivity(entry);
      this.pending.push(p);
      void p.finally(() => {
        this.pending = this.pending.filter((x) => x !== p);
      });
    });
  }

  onModuleDestroy(): void {
    this.sub?.unsubscribe();
  }

  /** Test seam: settle in-flight pushes. */
  async idle(): Promise<void> {
    await Promise.all(this.pending);
  }

  async onActivity(entry: ActivityEntry): Promise<void> {
    try {
      const event = await toOperatorEvent(entry, this.lookups);
      if (!event || event.tier !== 3) return;
      const subs = await this.store.list();
      if (subs.length === 0) return;
      const nowMs = this.now().getTime();
      for (const [k, at] of this.seen) if (nowMs - at >= DEDUPE_WINDOW_MS) this.seen.delete(k);
      const key = `${event.kind}|${event.target}|${event.state}`;
      if (this.seen.has(key)) return;
      this.seen.set(key, nowMs);

      const { locale } = await this.settings.readSettings();
      const payload = JSON.stringify({
        title: "ZIBBY",
        body: fill(OPERATOR_MESSAGES[locale].headline[event.kind], { title: event.title }),
        url: event.path ?? "/",
        tag: `${event.kind}|${event.target}`,
      });
      const vapid = await this.store.vapid();
      let sent = 0;
      let failed = 0;
      for (const sub of subs) {
        try {
          await this.send(sub, payload, vapid);
          sent++;
        } catch (err) {
          failed++;
          const status = (err as { statusCode?: number }).statusCode;
          if (status === 404 || status === 410) await this.store.remove(sub.endpoint);
        }
      }
      if (sent === 0) this.seen.delete(key); // fully failed: retry on the next event
      await this.store.appendDelivery({
        ts: this.now().toISOString(),
        kind: event.kind,
        target: event.target,
        sent,
        failed,
      });
    } catch (err) {
      // never break the activity stream over a notification
      this.log.warn("web push failed", { error: err instanceof Error ? err.message : String(err) });
    }
  }
}
