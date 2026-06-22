import { createHash } from "node:crypto";
import { ImapFlow } from "imapflow";
import { createTransport } from "nodemailer";
import type { ChannelItem, CredentialsInput, Integration, TestResult } from "@zibby/contracts";
import type { ChannelAdapter, InboundMessage, PollResult } from "./adapter";

/** The minimal IMAP surface the adapter uses — kept narrow so tests can mock it. */
export interface ImapClientLike {
  connect(): Promise<void>;
  getMailboxLock(mailbox: string): Promise<{ release(): void }>;
  fetch(
    range: string | object,
    query: object,
  ): AsyncIterable<{ uid: number; envelope?: ImapEnvelope; source?: Buffer }>;
  messageFlagsAdd(range: string | object, flags: string[], opts?: object): Promise<boolean>;
  logout(): Promise<void>;
  /**
   * Force-destroy the socket, parser buffers and internal timers. Safe to call
   * repeatedly and after {@link logout}. Optional so a minimal test mock can omit
   * it — production's real `ImapFlow` always provides it, and it is the teardown
   * that makes a failed connect/lock non-leaking.
   */
  close?(): void;
}
interface ImapEnvelope {
  from?: Array<{ address?: string; name?: string }>;
  subject?: string;
  messageId?: string;
  date?: Date;
}

/** The minimal SMTP surface — `sendMail`. */
export interface TransportLike {
  sendMail(message: object): Promise<unknown>;
}

export type ImapFactory = (integration: Integration, creds: CredentialsInput) => ImapClientLike;
export type TransportFactory = (integration: Integration, creds: CredentialsInput) => TransportLike;

function passwordOf(creds: CredentialsInput): string | null {
  return "password" in creds ? creds.password : null;
}

/** A stable item id from the Message-ID (sha1), per decision 6; falls back to the UID. */
function emailItemId(messageId: string | undefined, uid: number): string {
  return messageId ? createHash("sha1").update(messageId).digest("hex") : `uid-${uid}`;
}

/**
 * Hard cap on messages ingested per poll. Every other adapter bounds its fetch
 * (Slack `limit: 50`, calendar `maxResults: 250` + a page cap); email's UID range
 * `${sinceUid + 1}:*` is otherwise UNBOUNDED, and with `source: true` each message
 * pulls its full raw body into memory. If the cursor ever stalls (e.g. a `* BYE
 * [OVERQUOTA]` aborts a poll before the watcher advances it), an unbounded poll
 * re-loads the entire inbox's bodies every tick — a multi-GB heap/RSS spike. The
 * cap turns a backlog into a bounded drain: each poll takes the next `BATCH` newest
 * UIDs and advances the cursor, so progress stays monotonic across ticks (UIDs only
 * increase) with at most `BATCH` full bodies resident at once.
 */
const MAX_MESSAGES_PER_POLL = 50;

/** Extract a plain-text body from the raw source (everything after the first blank line). */
function bodyText(source: Buffer | undefined): string {
  if (!source) return "";
  const raw = source.toString("utf8");
  const split = raw.indexOf("\r\n\r\n");
  return (split === -1 ? raw : raw.slice(split + 4)).trim();
}

/**
 * Email adapter over `imapflow` (IMAP poll) + `nodemailer` (SMTP send) — the
 * phase's only new dependencies, confined to the API. Polls UID-newer-than-cursor
 * messages (the Slack cursor model, crash-safe like every other adapter: the
 * watcher persists items then advances the UID cursor), normalizing from/subject/
 * text. `\Seen` is set only for messages at or below the persisted cursor — i.e.
 * AFTER they were persisted in a prior tick — so a crash never marks a message read
 * before it is stored. The factories are injected in tests; production uses the
 * real clients (never the network in CI).
 *
 * Outbound: an email reply is structurally approval-gated — the triage flow
 * evaluates BOTH `channel-reply` and the `send_email` ask-floor and takes the
 * stricter decision, which `validateHardenOnly` forbids softening. So this `send`
 * only ever runs after an explicit human approval (Law 3 applied to outbound mail).
 */
export class EmailChannelAdapter implements ChannelAdapter {
  readonly kind = "email" as const;

  constructor(
    private readonly imapFactory: ImapFactory = defaultImap,
    private readonly transportFactory: TransportFactory = defaultTransport,
  ) {}

  async test(integration: Integration, creds: CredentialsInput): Promise<TestResult> {
    if (!passwordOf(creds)) return { ok: false, detail: "no email password configured" };
    const client = this.imapFactory(integration, creds);
    try {
      await client.connect();
      await client.logout();
      return { ok: true, detail: "IMAP login ok" };
    } catch (err) {
      return { ok: false, detail: (err as Error).message };
    }
  }

  async poll(
    integration: Integration,
    creds: CredentialsInput,
    cursor: string | undefined,
  ): Promise<PollResult> {
    if (!passwordOf(creds)) throw new Error("no email password configured");
    if (integration.config.kind !== "email") throw new Error("not an email integration");
    const mailbox = integration.config.mailbox ?? "INBOX";
    // First enable (no persisted cursor): seed the high-water mark to the newest
    // existing UID and ingest NOTHING, so we only ever process mail that arrives AFTER
    // connecting — "initial sync = now". Without this, an empty cursor means range
    // `1:*` and the watcher drains the entire historical mailbox (capped at BATCH/tick)
    // through triage — exactly the runaway this guard prevents. A persisted cursor of
    // "0" (e.g. a mailbox that was empty at first enable) is NOT a first run.
    const firstRun = cursor === undefined;
    const sinceUid = cursor ? Number(cursor) : 0;

    const client = this.imapFactory(integration, creds);
    const items: InboundMessage[] = [];
    let maxUid = sinceUid;
    // connect() and getMailboxLock() are INSIDE the try so a failure there can never
    // abandon the ImapFlow instance. An abandoned client keeps its socket, parser
    // buffers and internal timers reachable (a live timer pins the object, so GC
    // never reclaims it) — and Gmail's `* BYE [OVERQUOTA]` drops the socket right
    // after auth, so connect()/lock reject on every tick. The watcher polls each
    // enabled integration on a 30s heartbeat (× withRetry), so that per-tick
    // abandonment is a steady heap/RSS leak that survives compaction. The outer
    // finally force-closes on EVERY exit path; graceful logout() stays best-effort.
    try {
      await client.connect();
      const lock = await client.getMailboxLock(mailbox);
      try {
        if (firstRun) {
          // Seed-only pass: find the newest existing UID (`*` is the last message) and
          // make it the cursor without ingesting any body. Nothing is fetched with
          // `source: true`, so this is O(1) memory even on a huge mailbox. Returning here
          // exits through the inner `finally` (releases the lock) and the outer `finally`
          // (closes the client) — no double-release, no leaked socket.
          for await (const msg of client.fetch("*", { uid: true })) {
            if (msg.uid > maxUid) maxUid = msg.uid;
          }
          return { items, cursor: String(maxUid) };
        }
        // Mark \Seen everything already persisted (uid <= cursor) — seen only AFTER
        // persist, since the cursor advanced only after the prior tick stored them.
        if (sinceUid > 0) {
          await client
            .messageFlagsAdd({ uid: `1:${sinceUid}` }, ["\\Seen"], { uid: true })
            .catch(() => {});
        }
        const range = `${sinceUid + 1}:*`;
        for await (const msg of client.fetch(
          { uid: range },
          { uid: true, envelope: true, source: true },
        )) {
          if (msg.uid <= sinceUid) continue;
          const env = msg.envelope ?? {};
          const from = env.from?.[0]?.address;
          const subject = env.subject ?? "(no subject)";
          items.push({
            id: emailItemId(env.messageId, msg.uid),
            externalRef: { messageId: env.messageId, channel: mailbox },
            from,
            receivedAt: (env.date ?? new Date(0)).toISOString(),
            text: `${subject}\n\n${bodyText(msg.source)}`.trim(),
            raw: { uid: msg.uid, subject, from },
          });
          if (msg.uid > maxUid) maxUid = msg.uid;
          // Stop after BATCH so a stalled cursor can't re-load the whole inbox into
          // memory; the advanced cursor resumes the drain on the next tick.
          if (items.length >= MAX_MESSAGES_PER_POLL) break;
        }
      } finally {
        lock.release();
      }
      // Graceful logout on the happy path; best-effort so a socket that died at the
      // very end doesn't throw away an otherwise-complete poll (close() below still
      // tears the instance down regardless).
      await client.logout().catch(() => {});
    } finally {
      client.close?.();
    }
    return { items, cursor: maxUid > 0 ? String(maxUid) : cursor };
  }

  async send(
    integration: Integration,
    creds: CredentialsInput,
    item: ChannelItem,
    text: string,
  ): Promise<void> {
    if (integration.config.kind !== "email") throw new Error("not an email integration");
    if (!item.from) throw new Error("cannot reply to an email without a sender address");
    const transport = this.transportFactory(integration, creds);
    await transport.sendMail({
      from: integration.config.user,
      to: item.from,
      subject: "Re: your message",
      text,
      ...(item.externalRef.messageId ? { inReplyTo: item.externalRef.messageId } : {}),
    });
  }
}

/** Real IMAP client from the integration's host/port + the stored password. */
function defaultImap(integration: Integration, creds: CredentialsInput): ImapClientLike {
  if (integration.config.kind !== "email") throw new Error("not an email integration");
  const password = passwordOf(creds) ?? "";
  const client = new ImapFlow({
    host: integration.config.imapHost,
    port: integration.config.imapPort,
    secure: integration.config.imapPort === 993,
    auth: { user: integration.config.user, pass: password },
    logger: false,
  });
  // ImapFlow is an EventEmitter. When the session dies AFTER `connect()` has already
  // settled — e.g. Gmail sends `* BYE [OVERQUOTA] …` and drops the socket post-auth —
  // imapflow emits a late `'error'` on the instance. With no listener, Node promotes an
  // unlistened `'error'` event to an uncaught exception, which crashes (and respawns) the
  // long-running watcher → it re-polls on boot → the throttle never clears. The real error
  // is already delivered to the caller via the `connect()`/`poll()` rejection (the watcher
  // stamps `lastError`), so this listener only needs to absorb the duplicate and keep the
  // process alive.
  client.on("error", () => {});
  return client as unknown as ImapClientLike;
}

/** Real SMTP transport from the integration's host/port + the stored password. */
function defaultTransport(integration: Integration, creds: CredentialsInput): TransportLike {
  if (integration.config.kind !== "email") throw new Error("not an email integration");
  const password = passwordOf(creds) ?? "";
  return createTransport({
    host: integration.config.smtpHost,
    port: integration.config.smtpPort,
    secure: integration.config.smtpPort === 465,
    auth: { user: integration.config.user, pass: password },
  }) as unknown as TransportLike;
}
