import type {
  MessageRef,
  OperatorChannel,
  OperatorChannelConnection,
  OperatorInboundHandler,
  OperatorNotification,
} from "./operator-channel.port";
import { RateLimitedError } from "./operator-channel.port";

const SLACK_API = "https://slack.com/api";

/** Fallback wait when a 429 carries no `Retry-After`. */
const DEFAULT_RETRY_AFTER_S = 5;

interface SlackResponse {
  ok: boolean;
  error?: string;
}

/** Block Kit for one notification: headline, context lines, link buttons. */
export function toSlackBlocks(n: OperatorNotification): unknown[] {
  const blocks: unknown[] = [
    { type: "section", text: { type: "mrkdwn", text: `*${n.headline}*` } },
  ];
  if (n.lines.length > 0) {
    blocks.push({ type: "section", text: { type: "mrkdwn", text: n.lines.join("\n") } });
  }
  if (n.links.length > 0) {
    blocks.push({
      type: "actions",
      elements: n.links.map((l, i) => ({
        type: "button",
        action_id: `link-${i}`,
        text: { type: "plain_text", text: l.label },
        url: l.url,
      })),
    });
  }
  return blocks;
}

/** The plain `text` fallback (notifications, screen readers, old clients). */
export function toSlackText(n: OperatorNotification): string {
  return [n.headline, ...n.lines, ...n.links.map((l) => `${l.label}: ${l.url}`)].join("\n");
}

/**
 * Slack transport for the operator channel: the bot token (`xoxb-…`) drives the Web
 * API over plain `fetch` (the `slack.adapter.ts` precedent — no SDK dependency for
 * four JSON calls). The app token (`xapp-…`) is reserved for Socket Mode, which the
 * inbound side (Phase 2) opens in {@link start}; Phase 1 is outbound only, so
 * `start` just records the handler.
 *
 * Tokens travel only in the `authorization` header — no error message, log line or
 * return value ever contains one. A 429 surfaces as {@link RateLimitedError} so the
 * notifier's queue can back off on `Retry-After`; this class never sleeps.
 */
export class SlackOperatorChannel implements OperatorChannel {
  readonly capabilities = { threads: true, buttons: true, edit: true };
  private dmChannelId: string | null = null;
  private handler: OperatorInboundHandler | null = null;

  constructor(
    private readonly botToken: string,
    private readonly appToken: string | null,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  private async call<T extends SlackResponse>(
    method: string,
    body: Record<string, unknown>,
  ): Promise<T> {
    const res = await this.fetchImpl(`${SLACK_API}/${method}`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.botToken}`,
        "content-type": "application/json; charset=utf-8",
      },
      body: JSON.stringify(body),
    });
    if (res.status === 429) {
      const after = Number(res.headers.get("retry-after"));
      throw new RateLimitedError(
        (Number.isFinite(after) && after > 0 ? after : DEFAULT_RETRY_AFTER_S) * 1000,
      );
    }
    const parsed = (await res.json()) as T;
    if (!parsed.ok) throw new Error(`${method}: ${parsed.error ?? "unknown error"}`);
    return parsed;
  }

  async connect(operatorUserId: string): Promise<OperatorChannelConnection> {
    const auth = await this.call<SlackResponse & { team?: string }>("auth.test", {});
    const open = await this.call<SlackResponse & { channel?: { id?: string } }>(
      "conversations.open",
      { users: operatorUserId },
    );
    const dm = open.channel?.id;
    if (!dm) throw new Error("conversations.open: no channel id");
    this.dmChannelId = dm;
    return { ...(auth.team ? { workspace: auth.team } : {}), dmChannelId: dm };
  }

  async send(notification: OperatorNotification): Promise<MessageRef> {
    if (!this.dmChannelId) throw new Error("operator DM not resolved (connect first)");
    const res = await this.call<SlackResponse & { channel?: string; ts?: string }>(
      "chat.postMessage",
      {
        channel: this.dmChannelId,
        text: toSlackText(notification),
        blocks: toSlackBlocks(notification),
        unfurl_links: false,
      },
    );
    return { channel: res.channel ?? this.dmChannelId, ts: res.ts ?? "" };
  }

  async update(ref: MessageRef, notification: OperatorNotification): Promise<void> {
    await this.call("chat.update", {
      channel: ref.channel,
      ts: ref.ts,
      text: toSlackText(notification),
      blocks: toSlackBlocks(notification),
    });
  }

  /** Phase 2 opens Socket Mode here with {@link appToken}; Phase 1 only keeps the handler. */
  start(handler: OperatorInboundHandler): Promise<void> {
    this.handler = handler;
    return Promise.resolve();
  }

  stop(): Promise<void> {
    this.handler = null;
    return Promise.resolve();
  }

  /** Whether Socket Mode can be opened (Phase 2) — the app token is stored. */
  get canListen(): boolean {
    return this.appToken !== null;
  }

  /** Whether an inbound handler is registered (Phase 2 dispatches to it). */
  get listening(): boolean {
    return this.handler !== null;
  }
}
