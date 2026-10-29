import type { OperatorEventKind } from "@zibby/contracts";

/**
 * One message to the operator, already localized — the transport only renders it.
 * Slack renders Block Kit (headline, context lines, link buttons) plus a plain-text
 * fallback; a later SMS/Telegram adapter would render the same fields its own way.
 */
export interface OperatorNotification {
  kind: OperatorEventKind | "test";
  tier: 2 | 3;
  headline: string;
  /** 0–5 short context lines (mrkdwn-safe: the builder escapes them). */
  lines: string[];
  /** Link buttons only — the channel never carries an action that decides anything. */
  links: { label: string; url: string }[];
}

/** Where a sent message lives, so it can be updated (and, from Phase 3, threaded). */
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
 * Phase 2 inbound shape (declared now so the port is stable): a message the
 * transport received in the bot DM. Authentication (allowlisted user id) happens
 * in the inbound handler, never in the transport.
 */
export interface OperatorInboundMessage {
  eventId: string;
  userId: string;
  channelId: string;
  text: string;
  ts: string;
  threadTs?: string;
}

export type OperatorInboundHandler = (message: OperatorInboundMessage) => Promise<void>;

/**
 * The channel-agnostic operator channel. `connect` resolves the destination (Slack:
 * `conversations.open` with the operator's user id); `send`/`update` post to it;
 * `start`/`stop` own the inbound connection (Socket Mode — Phase 2).
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
