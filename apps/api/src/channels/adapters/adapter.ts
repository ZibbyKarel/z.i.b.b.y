import type {
  ChannelItem,
  CredentialsInput,
  ExternalRef,
  Integration,
  TestResult,
} from "@zibby/contracts";

/**
 * A normalized inbound message as an adapter yields it, BEFORE it becomes a
 * persisted `ChannelItem`. The adapter derives the deterministic `id` per kind
 * (slack `<channel>-<ts>`, email sha1 of Message-ID) so the watcher stays
 * kind-agnostic and dedup is a pure id-collision check.
 */
export interface InboundMessage {
  /** Deterministic dedupe id — a re-poll of the same message yields the same id. */
  id: string;
  externalRef: ExternalRef;
  from?: string;
  receivedAt: string;
  /** Raw, un-sanitized body text; the watcher sanitizes before persisting. */
  text: string;
  /** The original provider payload, kept verbatim for the record. */
  raw: unknown;
}

/** What one poll round returns: the new messages plus the advanced cursor. */
export interface PollResult {
  items: InboundMessage[];
  /** Opaque per-integration cursor to persist; passed back on the next poll. */
  cursor: string | undefined;
}

/**
 * The channel seam — one implementation per kind (Slack now, email in 5.4), plus a
 * kind-agnostic fake for the e2e suite. In production selection is always by
 * `integration.kind`; the FakeChannelAdapter is substituted for every kind ONLY in the
 * test harness, gated on the `CHANNEL_FAKE_DIR` env (never operator-facing config). No
 * method may throw out of a heartbeat tick — a transient failure is surfaced as a
 * stamped `lastError`, never an exception that stops the other integrations.
 */
export interface ChannelAdapter {
  readonly kind: Integration["kind"] | "fake";
  /** True when the adapter has no outbound reply surface (e.g. calendar). */
  readonly readOnly?: true;
  /** Probe credentials (Slack `auth.test`, IMAP login). Pure check, no side effects. */
  test(integration: Integration, creds: CredentialsInput): Promise<TestResult>;
  /** Fetch messages newer than `cursor`; return them + the advanced cursor. */
  poll(
    integration: Integration,
    creds: CredentialsInput,
    cursor: string | undefined,
  ): Promise<PollResult>;
  /**
   * Send a reply to an item. Takes the whole item (not just its `externalRef`) so
   * an adapter can address the reply however its channel needs — Slack threads on
   * `externalRef`, email replies to the item's `from` with the original Message-ID.
   */
  send(
    integration: Integration,
    creds: CredentialsInput,
    item: ChannelItem,
    text: string,
  ): Promise<void>;
}
