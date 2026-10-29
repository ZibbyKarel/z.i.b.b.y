import type {
  MessageRef,
  OperatorChannel,
  OperatorChannelConnection,
  OperatorInboundEvent,
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

/** `action_id` prefix of a reply button — the only interaction mapped to an inbound event. */
const REPLY_ACTION = "reply-";

/** Reconnect backoff after an unexpected socket close: 1 s doubling up to 30 s. */
const RECONNECT_MIN_MS = 1000;
const RECONNECT_MAX_MS = 30_000;

/**
 * Block Kit for one notification: headline (omitted when empty — chat replies),
 * context lines, link buttons, then reply buttons (`value` = the operator turn).
 */
export function toSlackBlocks(n: OperatorNotification): unknown[] {
  const blocks: unknown[] = [];
  if (n.headline) {
    blocks.push({ type: "section", text: { type: "mrkdwn", text: `*${n.headline}*` } });
  }
  if (n.lines.length > 0) {
    blocks.push({ type: "section", text: { type: "mrkdwn", text: n.lines.join("\n") } });
  }
  const buttons = [
    ...n.links.map((l, i) => ({
      type: "button",
      action_id: `link-${i}`,
      text: { type: "plain_text", text: l.label },
      url: l.url,
    })),
    ...(n.replies ?? []).map((r, i) => ({
      type: "button",
      action_id: `${REPLY_ACTION}${i}`,
      text: { type: "plain_text", text: r.label },
      value: r.text,
    })),
  ];
  if (buttons.length > 0) blocks.push({ type: "actions", elements: buttons });
  return blocks;
}

const str = (v: unknown): string | undefined => (typeof v === "string" ? v : undefined);
const obj = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" ? (v as Record<string, unknown>) : {};

/**
 * One Socket Mode envelope → the raw inbound event, or `null` for anything that
 * isn't a DM `message` event or a reply-button click (link-button clicks also
 * arrive as `block_actions`; they are acked and ignored). No authentication here —
 * sender/channel/bot/subtype are passed through for `OperatorInboundService`.
 */
export function toInboundEvent(envelope: unknown): OperatorInboundEvent | null {
  const env = obj(envelope);
  const payload = obj(env.payload);
  if (env.type === "events_api") {
    const event = obj(payload.event);
    const eventId = str(event.client_msg_id) ?? str(payload.event_id);
    const userId = str(event.user);
    const channelId = str(event.channel);
    const ts = str(event.ts);
    if (event.type !== "message" || !eventId || !channelId || !ts) return null;
    const threadTs = str(event.thread_ts);
    const botId = str(event.bot_id);
    const subtype = str(event.subtype);
    return {
      kind: "message",
      eventId,
      userId: userId ?? "",
      channelId,
      channelType: str(event.channel_type) ?? "",
      text: str(event.text) ?? "",
      ts,
      ...(threadTs ? { threadTs } : {}),
      ...(botId ? { botId } : {}),
      ...(subtype ? { subtype } : {}),
    };
  }
  if (env.type === "interactive" && payload.type === "block_actions") {
    const action = obj(Array.isArray(payload.actions) ? payload.actions[0] : undefined);
    const container = obj(payload.container);
    const messageTs = str(container.message_ts);
    const channelId = str(container.channel_id) ?? str(obj(payload.channel).id);
    const userId = str(obj(payload.user).id);
    const text = str(action.value);
    const threadTs = str(container.thread_ts);
    if (!str(action.action_id)?.startsWith(REPLY_ACTION) || !messageTs || !channelId || !text) {
      return null;
    }
    return {
      kind: "action",
      eventId: `action:${messageTs}`,
      userId: userId ?? "",
      channelId,
      messageTs,
      messageText: str(obj(payload.message).text) ?? "",
      text,
      ...(threadTs ? { threadTs } : {}),
    };
  }
  return null;
}

/** The slice of the WHATWG `WebSocket` Socket Mode uses (Node's global one; tests fake it). */
export interface SocketLike {
  onmessage: ((event: { data: unknown }) => void) | null;
  onclose: (() => void) | null;
  onerror: (() => void) | null;
  send(data: string): void;
  close(): void;
}

/** The plain `text` fallback (notifications, screen readers, old clients). */
export function toSlackText(n: OperatorNotification): string {
  return [n.headline, ...n.lines, ...n.links.map((l) => `${l.label}: ${l.url}`)].join("\n");
}

/**
 * Slack transport for the operator channel: the bot token (`xoxb-…`) drives the Web
 * API over plain `fetch` (the `slack.adapter.ts` precedent — no SDK dependency for
 * four JSON calls). The app token (`xapp-…`) opens Socket Mode in {@link start}:
 * `apps.connections.open` → Node's global `WebSocket` (no `@slack/socket-mode`, which
 * would pull in `ws`, `@slack/web-api` and an event emitter for one socket). Every
 * envelope is acked immediately and handled asynchronously; `disconnect` (Slack's
 * refresh) and an unexpected close reconnect with a fresh URL (backoff 1 s → 30 s).
 *
 * Tokens travel only in the `authorization` header — no error message, log line or
 * return value ever contains one. A 429 surfaces as {@link RateLimitedError} so the
 * notifier's queue can back off on `Retry-After`; this class never sleeps.
 */
export class SlackOperatorChannel implements OperatorChannel {
  readonly capabilities = { threads: true, buttons: true, edit: true };
  private dmChannelId: string | null = null;
  private handler: OperatorInboundHandler | null = null;
  private socket: SocketLike | null = null;
  private reconnectMs = RECONNECT_MIN_MS;
  private reconnectTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly botToken: string,
    private readonly appToken: string | null,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly openSocket: (url: string) => SocketLike = (url) =>
      new WebSocket(url) as unknown as SocketLike,
    /** Where a failed inbound handler / reconnect is reported (never with a token). */
    private readonly onError: (message: string) => void = () => undefined,
  ) {}

  private async call<T extends SlackResponse>(
    method: string,
    body: Record<string, unknown>,
    token: string = this.botToken,
  ): Promise<T> {
    const res = await this.fetchImpl(`${SLACK_API}/${method}`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
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
        ...(notification.threadTs ? { thread_ts: notification.threadTs } : {}),
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

  /** Open Socket Mode with the app token; resolves once the first socket is opening. */
  async start(handler: OperatorInboundHandler): Promise<void> {
    if (!this.appToken) throw new Error("no slack app token stored");
    this.handler = handler;
    await this.open();
  }

  stop(): Promise<void> {
    this.handler = null;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    const socket = this.socket;
    this.socket = null;
    socket?.close();
    return Promise.resolve();
  }

  /** Whether an inbound handler is registered and a socket is open (or reopening). */
  get listening(): boolean {
    return this.handler !== null;
  }

  private async open(): Promise<void> {
    const res = await this.call<SlackResponse & { url?: string }>(
      "apps.connections.open",
      {},
      this.appToken ?? "",
    );
    if (!res.url) throw new Error("apps.connections.open: no url");
    if (!this.handler) return; // stopped while opening
    const socket = this.openSocket(res.url);
    this.socket = socket;
    socket.onmessage = (event) => this.onEnvelope(socket, event.data);
    socket.onerror = () => undefined; // a close always follows
    socket.onclose = () => {
      if (this.socket !== socket) return; // replaced (disconnect) or stopped
      this.socket = null;
      this.scheduleReconnect();
    };
  }

  private scheduleReconnect(): void {
    if (!this.handler || this.reconnectTimer) return;
    const wait = this.reconnectMs;
    this.reconnectMs = Math.min(this.reconnectMs * 2, RECONNECT_MAX_MS);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.open().catch((error: unknown) => {
        this.onError(`socket mode reconnect failed: ${errText(error)}`);
        this.scheduleReconnect();
      });
    }, wait);
    this.reconnectTimer.unref?.();
  }

  /** Ack first (Slack redelivers an unacked envelope), then hand off asynchronously. */
  private onEnvelope(socket: SocketLike, data: unknown): void {
    let envelope: unknown;
    try {
      envelope = JSON.parse(String(data));
    } catch {
      return;
    }
    const env = obj(envelope);
    const envelopeId = str(env.envelope_id);
    if (envelopeId) socket.send(JSON.stringify({ envelope_id: envelopeId }));
    if (env.type === "hello") {
      this.reconnectMs = RECONNECT_MIN_MS;
      return;
    }
    if (env.type === "disconnect") {
      // Slack is rotating the connection: open the next one, then drop this one.
      this.socket = null;
      void this.open()
        .catch((error: unknown) => {
          this.onError(`socket mode refresh failed: ${errText(error)}`);
          this.scheduleReconnect();
        })
        .finally(() => socket.close());
      return;
    }
    const event = toInboundEvent(envelope);
    const handler = this.handler;
    if (!event || !handler) return;
    void handler(event).catch((error: unknown) =>
      this.onError(`inbound handler failed: ${errText(error)}`),
    );
  }
}

const errText = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);
