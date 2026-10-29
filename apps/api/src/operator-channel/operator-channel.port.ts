import type { OperatorEventKind } from "@zibby/contracts";

/**
 * One message to the operator, already localized — the transport only renders it.
 * Slack renders Block Kit (headline, context lines, link buttons) plus a plain-text
 * fallback; a later SMS/Telegram adapter would render the same fields its own way.
 */
export interface OperatorNotification {
  /** `chat` — a chat reply to an inbound operator message (Phase 2): no headline, body in `lines`. */
  kind: OperatorEventKind | "test" | "chat";
  tier: 2 | 3;
  headline: string;
  /** 0–5 short context lines (mrkdwn-safe: the builder escapes them). */
  lines: string[];
  /** Link buttons only — the channel never carries an action that decides anything. */
  links: { label: string; url: string }[];
  /**
   * Reply buttons (Phase 2, chat replies only): a click sends `text` back into the
   * conversation as the operator's next turn. Never an approval, never an action.
   */
  replies?: { label: string; text: string }[];
  /** Phase 3 — post as a reply in this thread (the parent message's `ts`), not top-level. */
  threadTs?: string;
}

/** Where a sent message lives, so it can be updated and replied to in its thread. */
export interface MessageRef {
  channel: string;
  ts: string;
}

/** What {@link OperatorChannel.connect} resolved. */
export interface OperatorChannelConnection {
  workspace?: string;
  /** The operator's 1:1 DM with the bot. */
  dmChannelId: string;
}

/**
 * A message the transport received (Slack: a `message` event over Socket Mode). The
 * transport forwards it RAW — sender, channel type, bot/subtype markers included —
 * and never authenticates: the inbound handler checks the allowlisted user id, the
 * bot DM and the markers (`OperatorInboundService`), so a transport can't widen trust.
 */
export interface OperatorInboundMessage {
  kind: "message";
  /** Dedupe key: Slack's `client_msg_id`, else the envelope's `event_id` (stable across redelivery). */
  eventId: string;
  userId: string;
  channelId: string;
  /** Slack `channel_type` — only `"im"` is accepted. */
  channelType: string;
  text: string;
  ts: string;
  threadTs?: string;
  /** Set on bot-authored messages (including ZIBBY's own) — always dropped. */
  botId?: string;
  /** Set on edits/deletes/joins/… — always dropped; only plain new messages count. */
  subtype?: string;
}

/**
 * A reply-button click (Slack `block_actions`). It carries the button's `text`, which
 * the handler feeds into the chat as the operator's next turn — it never decides an
 * approval or runs anything by itself. Authenticated exactly like a message.
 */
export interface OperatorInboundAction {
  kind: "action";
  /** Dedupe key: one answer per prompt message (`action:<message ts>`), so a double tap runs once. */
  eventId: string;
  userId: string;
  channelId: string;
  /** The prompt message the buttons were on (updated to drop them once answered). */
  messageTs: string;
  /** The prompt's own text, as Slack stored it (already mrkdwn-escaped). */
  messageText: string;
  /** The operator turn this button stands for. */
  text: string;
  /** Set when the prompt sits in a thread (Slack `container.thread_ts`). */
  threadTs?: string;
}

export type OperatorInboundEvent = OperatorInboundMessage | OperatorInboundAction;

export type OperatorInboundHandler = (event: OperatorInboundEvent) => Promise<void>;

/**
 * The channel-agnostic operator channel. `connect` resolves the destination (Slack:
 * `conversations.open` with the operator's user id); `send`/`update` post to it;
 * `start`/`stop` own the inbound connection (Slack: Socket Mode).
 */
export interface OperatorChannel {
  readonly capabilities: { threads: boolean; buttons: boolean; edit: boolean };
  connect(operatorUserId: string): Promise<OperatorChannelConnection>;
  send(notification: OperatorNotification): Promise<MessageRef>;
  update(ref: MessageRef, notification: OperatorNotification): Promise<void>;
  start(handler: OperatorInboundHandler): Promise<void>;
  stop(): Promise<void>;
}

/** The transport was rate limited; retry after `retryAfterMs` (Slack's `Retry-After`). */
export class RateLimitedError extends Error {
  constructor(readonly retryAfterMs: number) {
    super(`rate limited (retry after ${retryAfterMs} ms)`);
    this.name = "RateLimitedError";
  }
}
