import type { ChannelItem, Integration } from "@zibby/contracts"
import { describe, expect, it, vi } from "vitest"
import {
  EmailChannelAdapter,
  type ImapClientLike,
  type TransportLike,
} from "./email.adapter"

const email: Integration = {
  id: "support",
  kind: "email",
  projectId: "acme-app",
  enabled: true,
  config: {
    kind: "email",
    imapHost: "imap.example.com",
    imapPort: 993,
    smtpHost: "smtp.example.com",
    smtpPort: 465,
    user: "bot@example.com",
  },
  status: "disconnected",
  hasCredentials: true,
}

interface FakeMsg {
  uid: number
  envelope?: { from?: Array<{ address?: string }>; subject?: string; messageId?: string; date?: Date }
  source?: Buffer
}

/** A mock IMAP client yielding the given messages from fetch(). */
function fakeImap(messages: FakeMsg[]) {
  const flagsAdd = vi.fn(async () => true)
  const logout = vi.fn(async () => undefined)
  const client: ImapClientLike = {
    connect: vi.fn(async () => undefined),
    getMailboxLock: vi.fn(async () => ({ release: vi.fn() })),
     
    async *fetch() {
      for (const m of messages) yield m
    },
    messageFlagsAdd: flagsAdd,
    logout,
  }
  return { client, flagsAdd, logout }
}

const msg = (uid: number, over: Partial<FakeMsg> = {}): FakeMsg => ({
  uid,
  envelope: {
    from: [{ address: "alice@example.com" }],
    subject: `Subject ${uid}`,
    messageId: `<msg-${uid}@example.com>`,
    date: new Date(0),
  },
  source: Buffer.from(`Header: x\r\n\r\nBody text ${uid}`),
  ...over,
})

describe("EmailChannelAdapter", () => {
  it("polls UID-newer-than-cursor messages, normalizes, and advances the cursor", async () => {
    const { client } = fakeImap([msg(10), msg(11)])
    const adapter = new EmailChannelAdapter(() => client)
    const { items, cursor } = await adapter.poll(email, { password: "pw" }, undefined)

    expect(items).toHaveLength(2)
    expect(items[0]!.from).toBe("alice@example.com")
    expect(items[0]!.text).toContain("Subject 10")
    expect(items[0]!.text).toContain("Body text 10")
    // Deterministic id = sha1(Message-ID), not the volatile UID.
    expect(items[0]!.id).toMatch(/^[0-9a-f]{40}$/)
    expect(cursor).toBe("11")
  })

  it("marks \\Seen only for UIDs at/below the persisted cursor (seen-after-persist)", async () => {
    const { client, flagsAdd } = fakeImap([])
    const adapter = new EmailChannelAdapter(() => client)
    await adapter.poll(email, { password: "pw" }, "11")
    expect(flagsAdd).toHaveBeenCalledWith({ uid: "1:11" }, ["\\Seen"], { uid: true })
  })

  it("does not mark anything seen on the first poll (no cursor)", async () => {
    const { client, flagsAdd } = fakeImap([msg(1)])
    const adapter = new EmailChannelAdapter(() => client)
    await adapter.poll(email, { password: "pw" }, undefined)
    expect(flagsAdd).not.toHaveBeenCalled()
  })

  it("send invokes the SMTP transport with the draft, recipient, and in-reply-to", async () => {
    const sendMail = vi.fn(async () => ({}))
    const transport: TransportLike = { sendMail }
    const adapter = new EmailChannelAdapter(undefined, () => transport)
    const item: ChannelItem = {
      id: "abc",
      integrationId: "support",
      kind: "email",
      externalRef: { messageId: "<msg-10@example.com>", channel: "INBOX" },
      from: "alice@example.com",
      receivedAt: "2026-06-12T00:00:00.000Z",
      text: "hi",
      raw: {},
      state: "triaged",
    }
    await adapter.send(email, { password: "pw" }, item, "thanks, on it")
    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "alice@example.com",
        from: "bot@example.com",
        text: "thanks, on it",
        inReplyTo: "<msg-10@example.com>",
      }),
    )
  })

  it("test() reports ok on a successful IMAP login and false on failure", async () => {
    const { client } = fakeImap([])
    const ok = new EmailChannelAdapter(() => client)
    expect(await ok.test(email, { password: "pw" })).toEqual({ ok: true, detail: "IMAP login ok" })

    const failing: ImapClientLike = {
      connect: vi.fn(async () => {
        throw new Error("auth failed")
      }),
      getMailboxLock: vi.fn(),
       
      async *fetch() {},
      messageFlagsAdd: vi.fn(),
      logout: vi.fn(async () => undefined),
    }
    const bad = new EmailChannelAdapter(() => failing)
    expect(await bad.test(email, { password: "pw" })).toEqual({ ok: false, detail: "auth failed" })
  })
})
