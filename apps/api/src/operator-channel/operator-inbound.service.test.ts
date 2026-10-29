import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SendChatMessageBody } from "@zibby/contracts";
import { ChatEventsService } from "../chat/chat-events.service";
import type { ChatSessionService } from "../chat/chat-session.service";
import type { CredentialsStore } from "../integrations/credentials.store";
import type { LoggerService } from "../shared/logging/logger.service";
import type { OperatorInboundMessage } from "./operator-channel.port";
import { OperatorChannelService } from "./operator-channel.service";
import { OperatorChannelStore } from "./operator-channel.store";
import {
  OperatorInboundService,
  operatorConversationId,
  rejectReason,
  splitAnswer,
} from "./operator-inbound.service";

const OPERATOR = "U0OPERATOR";
const DM = `D-FAKE-${OPERATOR}`;
const logger = {
  child: () => ({ debug: () => undefined, info: () => undefined, warn: () => undefined }),
} as unknown as LoggerService;

/** Stands in for ChatSessionService.sendMessage: records the call, then plays a reply. */
class FakeSession {
  readonly calls: SendChatMessageBody[] = [];
  reply: (text: string) => string = (text) => `Re: ${text}`;
  /** While set, replies wait for it (holds a turn in flight). */
  hold: Promise<void> | null = null;
  private seq = 0;
  constructor(private readonly events: ChatEventsService) {}

  sendMessage(body: SendChatMessageBody): Promise<{ conversationId: string; turnId: string }> {
    this.calls.push(body);
    const conversationId = body.conversationId ?? "conv-x";
    const turnId = `turn-${++this.seq}`;
    void (this.hold ?? Promise.resolve()).then(() => {
      this.events.emit({
        conversationId,
        turnId,
        type: "tool",
        tool: { name: "get_status", status: "ok" },
      });
      this.events.emit({ conversationId, turnId, type: "done", text: this.reply(body.text) });
    });
    return Promise.resolve({ conversationId, turnId });
  }
}

const msg = (over: Partial<OperatorInboundMessage> = {}): OperatorInboundMessage => ({
  kind: "message",
  eventId: `ev-${Math.random()}`,
  userId: OPERATOR,
  channelId: DM,
  channelType: "im",
  text: "co je nového?",
  ts: "1700000001.000100",
  ...over,
});

describe("OperatorInboundService", () => {
  let dir: string;
  let store: OperatorChannelStore;
  let channel: OperatorChannelService;
  let session: FakeSession;
  let inbound: OperatorInboundService;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "operator-inbound-"));
    store = new OperatorChannelStore(dir);
    await store.writeSettings({
      ...(await store.readSettings()),
      enabled: true,
      operatorUserIds: [OPERATOR],
    });
    channel = new OperatorChannelService(store, {
      read: () => Promise.resolve(null),
      has: () => Promise.resolve(false),
    } as unknown as CredentialsStore);
    const events = new ChatEventsService();
    session = new FakeSession(events);
    inbound = new OperatorInboundService(
      channel,
      store,
      session as unknown as ChatSessionService,
      events,
      logger,
    );
    inbound.updateIntervalMs = 0;
    await channel.listen((e) => inbound.handle(e));
  });

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  const texts = () => channel.fake.sent.map((s) => s.notification.lines.join("\n"));

  it("listen() connects, resolves the DM and registers the handler", async () => {
    expect((await store.readSettings()).dmChannelId).toBe(DM);
    expect(channel.fake.handler).not.toBeNull();
    expect((await channel.status()).listening).toBe(true);
  });

  it("an operator DM runs one chat turn in the stable conversation and the answer replaces the placeholder", async () => {
    await channel.fake.receive(msg());
    expect(session.calls).toEqual([
      { conversationId: operatorConversationId(DM), text: "co je nového?" },
    ]);
    expect(channel.fake.sent).toHaveLength(1);
    expect(channel.fake.sent[0]?.notification).toMatchObject({
      kind: "chat",
      headline: "",
      lines: ["Re: co je nového?"],
    });
  });

  it.each([
    ["a non-allowlisted user in the same DM", { userId: "U0STRANGER" }],
    ["an mpim", { channelType: "mpim", channelId: "G123" }],
    ["another channel", { channelId: "D-OTHER" }],
    ["a bot message", { botId: "B1" }],
    ["an edit", { subtype: "message_changed" }],
    ["an empty message", { text: "  " }],
  ])("%s never reaches the chat session and gets no reply", async (_label, over) => {
    await channel.fake.receive(msg(over));
    expect(session.calls).toHaveLength(0);
    expect(channel.fake.sent).toHaveLength(0);
  });

  it("a redelivered event is processed once, also after a restart (persisted dedupe)", async () => {
    await channel.fake.receive(msg({ eventId: "client-1" }));
    await channel.fake.receive(msg({ eventId: "client-1" }));
    expect(session.calls).toHaveLength(1);
    expect(await new OperatorChannelStore(dir).markInboundSeen("client-1")).toBe(false);
  });

  it("past the per-minute limit the turn is refused with a notice", async () => {
    inbound.maxPerMinute = 2;
    for (let i = 0; i < 3; i++) await channel.fake.receive(msg());
    expect(session.calls).toHaveLength(2);
    expect(texts().at(-1)).toMatch(/za minutu/);
  });

  it("one turn in flight per conversation: the rest queue in order, overflow gets a busy notice", async () => {
    inbound.maxQueued = 1;
    let release: () => void = () => undefined;
    session.hold = new Promise((r) => {
      release = r;
    });
    const all = Promise.all(["a", "b", "c"].map((text) => channel.fake.receive(msg({ text }))));
    await vi.waitFor(() => expect(texts().some((t) => t.startsWith("Ještě"))).toBe(true));
    release();
    await all;
    expect(session.calls.map((c) => c.text)).toEqual(["a", "b"]);
    expect(texts()).toContain(
      "Ještě zpracovávám předchozí zprávy — tuhle jsem nepřijal, pošli ji za chvíli.",
    );
  });

  it("caps the text handed to the model and says so", async () => {
    inbound.maxTextChars = 10;
    await channel.fake.receive(msg({ text: "x".repeat(50) }));
    expect(session.calls[0]?.text).toBe("x".repeat(10));
    expect(texts()[0]).toMatch(/zkrácena na 10/);
  });

  it("an answer ending in a question gets Yes/No reply buttons; a tap is the operator's next turn", async () => {
    session.reply = () => "Mám spustit opravu loginu?";
    await channel.fake.receive(msg({ text: "oprav login" }));
    const prompt = channel.fake.sent[0];
    expect(prompt?.notification.replies).toEqual([
      { label: "Ano", text: "Ano." },
      { label: "Ne", text: "Ne." },
    ]);

    session.reply = () => "Spouštím.";
    const tap = {
      kind: "action" as const,
      eventId: `action:${prompt?.ref.ts}`,
      userId: OPERATOR,
      channelId: DM,
      messageTs: prompt?.ref.ts ?? "",
      messageText: "Mám spustit opravu loginu?",
      text: "Ano.",
    };
    await channel.fake.receive(tap);
    await channel.fake.receive(tap); // a double tap runs once
    expect(session.calls.map((c) => c.text)).toEqual(["oprav login", "Ano."]);
    // The prompt lost its buttons and shows the answer.
    expect(prompt?.notification.replies).toBeUndefined();
    expect(prompt?.notification.lines).toEqual(["Mám spustit opravu loginu?", "→ Ano."]);
  });

  it("a tap from a non-operator is dropped like a message", async () => {
    await channel.fake.receive({
      kind: "action",
      eventId: "action:1",
      userId: "U0STRANGER",
      channelId: DM,
      messageTs: "1",
      messageText: "?",
      text: "Ano.",
    });
    expect(session.calls).toHaveLength(0);
  });

  it("a dispatched task's run link rides on the answer", async () => {
    await store.writeSettings({
      ...(await store.readSettings()),
      publicBaseUrl: "https://zibby.tail.ts.net",
    });
    session.sendMessage = function (this: FakeSession, body) {
      this.calls.push(body);
      const conversationId = body.conversationId ?? "";
      setImmediate(() => {
        events.emit({
          conversationId,
          turnId: "t1",
          type: "tool",
          tool: {
            name: "create_task",
            status: "ok",
            callId: "c1",
            href: "/activity/runs/run-1",
            runRef: "run-1",
            taskId: "task-1",
          },
        });
        events.emit({ conversationId, turnId: "t1", type: "done", text: "Spustil jsem úkol." });
      });
      return Promise.resolve({ conversationId, turnId: "t1" });
    };
    const events = (inbound as unknown as { events: ChatEventsService }).events;
    await channel.fake.receive(msg({ text: "spusť úlohu X" }));
    expect(channel.fake.sent[0]?.notification).toMatchObject({
      lines: ["Spustil jsem úkol.", "Úkol task-1 · běh run-1"],
      links: [{ label: "Otevřít běh", url: "https://zibby.tail.ts.net/activity/runs/run-1" }],
    });
  });
});

describe("rejectReason", () => {
  it("refuses everything while the channel is disabled", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "operator-inbound-r-"));
    const settings = await new OperatorChannelStore(dir).readSettings();
    expect(rejectReason(msg(), settings)).toBe("disabled");
    expect(
      rejectReason(msg(), {
        ...settings,
        enabled: true,
        operatorUserIds: [OPERATOR],
        dmChannelId: DM,
      }),
    ).toBeNull();
    await fs.rm(dir, { recursive: true, force: true });
  });
});

describe("splitAnswer", () => {
  it("keeps short answers whole and splits long ones at a line break under the limit", () => {
    expect(splitAnswer("short", 10)).toEqual(["short"]);
    expect(splitAnswer("aaaaaaa\nbbbbbbb", 10)).toEqual(["aaaaaaa", "bbbbbbb"]);
    expect(splitAnswer("x".repeat(25), 10)).toEqual([
      "x".repeat(10),
      "x".repeat(10),
      "x".repeat(5),
    ]);
  });
});
