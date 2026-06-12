import { createHash } from "node:crypto"
import { ImapFlow } from "imapflow"
import { createTransport } from "nodemailer"
import type { ChannelItem, CredentialsInput, Integration, TestResult } from "@zibby/contracts"
import type { ChannelAdapter, InboundMessage, PollResult } from "./adapter"

/** The minimal IMAP surface the adapter uses — kept narrow so tests can mock it. */
export interface ImapClientLike {
  connect(): Promise<void>
  getMailboxLock(mailbox: string): Promise<{ release(): void }>
  fetch(
    range: string | object,
    query: object,
  ): AsyncIterable<{ uid: number; envelope?: ImapEnvelope; source?: Buffer }>
  messageFlagsAdd(range: string | object, flags: string[], opts?: object): Promise<boolean>
  logout(): Promise<void>
}
interface ImapEnvelope {
  from?: Array<{ address?: string; name?: string }>
  subject?: string
  messageId?: string
  date?: Date
}

/** The minimal SMTP surface — `sendMail`. */
export interface TransportLike {
  sendMail(message: object): Promise<unknown>
}

export type ImapFactory = (integration: Integration, creds: CredentialsInput) => ImapClientLike
export type TransportFactory = (integration: Integration, creds: CredentialsInput) => TransportLike

function passwordOf(creds: CredentialsInput): string | null {
  return "password" in creds ? creds.password : null
}

/** A stable item id from the Message-ID (sha1), per decision 6; falls back to the UID. */
function emailItemId(messageId: string | undefined, uid: number): string {
  return messageId
    ? createHash("sha1").update(messageId).digest("hex")
    : `uid-${uid}`
}

/** Extract a plain-text body from the raw source (everything after the first blank line). */
function bodyText(source: Buffer | undefined): string {
  if (!source) return ""
  const raw = source.toString("utf8")
  const split = raw.indexOf("\r\n\r\n")
  return (split === -1 ? raw : raw.slice(split + 4)).trim()
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
  readonly kind = "email" as const

  constructor(
    private readonly imapFactory: ImapFactory = defaultImap,
    private readonly transportFactory: TransportFactory = defaultTransport,
  ) {}

  async test(integration: Integration, creds: CredentialsInput): Promise<TestResult> {
    if (!passwordOf(creds)) return { ok: false, detail: "no email password configured" }
    const client = this.imapFactory(integration, creds)
    try {
      await client.connect()
      await client.logout()
      return { ok: true, detail: "IMAP login ok" }
    } catch (err) {
      return { ok: false, detail: (err as Error).message }
    }
  }

  async poll(
    integration: Integration,
    creds: CredentialsInput,
    cursor: string | undefined,
  ): Promise<PollResult> {
    if (!passwordOf(creds)) throw new Error("no email password configured")
    if (integration.config.kind !== "email") throw new Error("not an email integration")
    const mailbox = integration.config.mailbox ?? "INBOX"
    const sinceUid = cursor ? Number(cursor) : 0

    const client = this.imapFactory(integration, creds)
    await client.connect()
    const lock = await client.getMailboxLock(mailbox)
    const items: InboundMessage[] = []
    let maxUid = sinceUid
    try {
      // Mark \Seen everything already persisted (uid <= cursor) — seen only AFTER
      // persist, since the cursor advanced only after the prior tick stored them.
      if (sinceUid > 0) {
        await client.messageFlagsAdd({ uid: `1:${sinceUid}` }, ["\\Seen"], { uid: true }).catch(() => {})
      }
      const range = `${sinceUid + 1}:*`
      for await (const msg of client.fetch({ uid: range }, { uid: true, envelope: true, source: true })) {
        if (msg.uid <= sinceUid) continue
        const env = msg.envelope ?? {}
        const from = env.from?.[0]?.address
        const subject = env.subject ?? "(no subject)"
        items.push({
          id: emailItemId(env.messageId, msg.uid),
          externalRef: { messageId: env.messageId, channel: mailbox },
          from,
          receivedAt: (env.date ?? new Date(0)).toISOString(),
          text: `${subject}\n\n${bodyText(msg.source)}`.trim(),
          raw: { uid: msg.uid, subject, from },
        })
        if (msg.uid > maxUid) maxUid = msg.uid
      }
    } finally {
      lock.release()
      await client.logout()
    }
    return { items, cursor: maxUid > 0 ? String(maxUid) : cursor }
  }

  async send(
    integration: Integration,
    creds: CredentialsInput,
    item: ChannelItem,
    text: string,
  ): Promise<void> {
    if (integration.config.kind !== "email") throw new Error("not an email integration")
    if (!item.from) throw new Error("cannot reply to an email without a sender address")
    const transport = this.transportFactory(integration, creds)
    await transport.sendMail({
      from: integration.config.user,
      to: item.from,
      subject: "Re: your message",
      text,
      ...(item.externalRef.messageId ? { inReplyTo: item.externalRef.messageId } : {}),
    })
  }
}

/** Real IMAP client from the integration's host/port + the stored password. */
function defaultImap(integration: Integration, creds: CredentialsInput): ImapClientLike {
  if (integration.config.kind !== "email") throw new Error("not an email integration")
  const password = passwordOf(creds) ?? ""
  return new ImapFlow({
    host: integration.config.imapHost,
    port: integration.config.imapPort,
    secure: integration.config.imapPort === 993,
    auth: { user: integration.config.user, pass: password },
    logger: false,
  }) as unknown as ImapClientLike
}

/** Real SMTP transport from the integration's host/port + the stored password. */
function defaultTransport(integration: Integration, creds: CredentialsInput): TransportLike {
  if (integration.config.kind !== "email") throw new Error("not an email integration")
  const password = passwordOf(creds) ?? ""
  return createTransport({
    host: integration.config.smtpHost,
    port: integration.config.smtpPort,
    secure: integration.config.smtpPort === 465,
    auth: { user: integration.config.user, pass: password },
  }) as unknown as TransportLike
}
