import { describe, expect, it, vi } from "vitest";
import { RateLimitedError } from "./operator-channel.port";
import type { OperatorNotification } from "./operator-channel.port";
import type { OperatorInboundEvent } from "./operator-channel.port";
import {
  SlackOperatorChannel,
  type SocketLike,
  toInboundEvent,
  toSlackBlocks,
} from "./slack-operator-channel";

const TOKEN = "xoxb-test-token";

const json = (body: unknown, status = 200, headers: Record<string, string> = {}): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });

/** Fake Slack Web API routed by method; records each call's parsed JSON body. */
function fakeSlack(override?: (method: string) => Response | undefined) {
  const calls: { method: string; body: Record<string, unknown> }[] = [];
  const fetchImpl = vi.fn(async (input: string | URL, init?: RequestInit) => {
    const method = String(input).split("/").pop() ?? "";
    calls.push({ method, body: JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown> });
    const custom = override?.(method);
    if (custom) return custom;
    switch (method) {
      case "auth.test":
        return json({ ok: true, team: "Zibby's" });
      case "conversations.open":
        return json({ ok: true, channel: { id: "DBOT1" } });
      case "chat.postMessage":
        return json({ ok: true, channel: "DBOT1", ts: "1700000000.000100" });
      case "apps.connections.open":
        return json({ ok: true, url: `wss://slack.test/${calls.length}` });
      default:
        return json({ ok: true });
    }
  }) as unknown as typeof fetch;
  return { channel: new SlackOperatorChannel(TOKEN, null, fetchImpl), calls };
}

const note: OperatorNotification = {
  kind: "pr-opened",
  tier: 2,
  headline: "PR opened: Fix login",
  lines: ["3 stages green"],
  links: [{ label: "Open PR", url: "https://github.com/acme/app/pull/7" }],
};

describe("SlackOperatorChannel", () => {
  it("connect() resolves the operator DM with conversations.open", async () => {
    const { channel, calls } = fakeSlack();
    expect(await channel.connect("U123")).toEqual({ workspace: "Zibby's", dmChannelId: "DBOT1" });
    expect(calls.find((c) => c.method === "conversations.open")?.body).toEqual({ users: "U123" });
  });

  it("send() posts a threaded notification as a reply (thread_ts), top-level otherwise", async () => {
    const { channel, calls } = fakeSlack();
    await channel.connect("U123");
    await channel.send(note);
    await channel.send({ ...note, threadTs: "1700000000.000001" });
    const posts = calls.filter((c) => c.method === "chat.postMessage").map((c) => c.body);
    expect(posts[0]).not.toHaveProperty("thread_ts");
    expect(posts[1]?.thread_ts).toBe("1700000000.000001");
  });

  it("send() posts Block Kit with link buttons plus a plain text fallback to the DM", async () => {
    const { channel, calls } = fakeSlack();
    await channel.connect("U123");
    expect(await channel.send(note)).toEqual({ channel: "DBOT1", ts: "1700000000.000100" });
    const post = calls.find((c) => c.method === "chat.postMessage")!.body;
    expect(post.channel).toBe("DBOT1");
    expect(post.text).toBe(
      "PR opened: Fix login\n3 stages green\nOpen PR: https://github.com/acme/app/pull/7",
    );
    expect(post.blocks).toContainEqual({
      type: "actions",
      elements: [
        {
          type: "button",
          action_id: "link-0",
          text: { type: "plain_text", text: "Open PR" },
          url: "https://github.com/acme/app/pull/7",
        },
      ],
    });
  });

  it("send() before connect() refuses", async () => {
    await expect(fakeSlack().channel.send(note)).rejects.toThrow(/connect first/);
  });

  it("a 429 surfaces as RateLimitedError carrying Retry-After", async () => {
    const { channel } = fakeSlack((m) =>
      m === "chat.postMessage" ? json({ ok: false }, 429, { "retry-after": "3" }) : undefined,
    );
    await channel.connect("U123");
    const error = await channel.send(note).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(RateLimitedError);
    expect((error as RateLimitedError).retryAfterMs).toBe(3000);
  });

  it("a Slack error names the method and error, never the token", async () => {
    const { channel } = fakeSlack((m) =>
      m === "auth.test" ? json({ ok: false, error: "invalid_auth" }) : undefined,
    );
    const error = (await channel.connect("U123").catch((e: unknown) => e)) as Error;
    expect(error.message).toBe("auth.test: invalid_auth");
    expect(error.message).not.toContain(TOKEN);
  });
});

/** A scripted Socket Mode socket: `deliver` plays an envelope, `acks` records what was sent back. */
class FakeSocket implements SocketLike {
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  readonly acks: unknown[] = [];
  closed = false;
  constructor(readonly url: string) {}
  send(data: string): void {
    this.acks.push(JSON.parse(data));
  }
  close(): void {
    this.closed = true;
  }
  deliver(envelope: unknown): void {
    this.onmessage?.({ data: JSON.stringify(envelope) });
  }
}

const dmEnvelope = (event: Record<string, unknown>, id = "env-1") => ({
  type: "events_api",
  envelope_id: id,
  payload: { event_id: "Ev1", event: { type: "message", channel: "DBOT1", ts: "1.1", ...event } },
});

describe("SlackOperatorChannel Socket Mode", () => {
  function socketSlack() {
    const sockets: FakeSocket[] = [];
    const { calls } = fakeSlack();
    const fetchImpl = vi.fn(async (input: string | URL, init?: RequestInit) => {
      const method = String(input).split("/").pop() ?? "";
      const auth = new Headers(init?.headers).get("authorization");
      calls.push({ method, body: { auth } });
      return method === "apps.connections.open"
        ? json({ ok: true, url: `wss://slack.test/${sockets.length}` })
        : json({ ok: true });
    }) as unknown as typeof fetch;
    const channel = new SlackOperatorChannel(TOKEN, "xapp-test-app", fetchImpl, (url) => {
      const socket = new FakeSocket(url);
      sockets.push(socket);
      return socket;
    });
    return { channel, sockets, calls };
  }

  it("start() without an app token refuses", async () => {
    await expect(fakeSlack().channel.start(async () => undefined)).rejects.toThrow(/app token/);
  });

  it("opens the socket with the APP token, acks every envelope before handling it", async () => {
    const { channel, sockets, calls } = socketSlack();
    const seen: OperatorInboundEvent[] = [];
    let ackedBeforeHandler = false;
    await channel.start(async (event) => {
      ackedBeforeHandler = (sockets[0]?.acks.length ?? 0) > 0;
      seen.push(event);
    });
    expect(calls.find((c) => c.method === "apps.connections.open")?.body.auth).toBe(
      "Bearer xapp-test-app",
    );
    sockets[0]?.deliver({ type: "hello" });
    sockets[0]?.deliver(
      dmEnvelope({ user: "U1", channel_type: "im", text: "ahoj", client_msg_id: "cm-1" }),
    );
    await Promise.resolve();
    expect(sockets[0]?.acks).toEqual([{ envelope_id: "env-1" }]);
    expect(ackedBeforeHandler).toBe(true);
    expect(seen).toEqual([
      {
        kind: "message",
        eventId: "cm-1",
        userId: "U1",
        channelId: "DBOT1",
        channelType: "im",
        text: "ahoj",
        ts: "1.1",
      },
    ]);
  });

  it("a disconnect envelope opens a fresh connection and closes the old one", async () => {
    const { channel, sockets } = socketSlack();
    await channel.start(async () => undefined);
    sockets[0]?.deliver({ type: "disconnect", reason: "refresh_requested" });
    await vi.waitFor(() => expect(sockets).toHaveLength(2));
    await vi.waitFor(() => expect(sockets[0]?.closed).toBe(true));
    sockets[0]?.onclose?.(); // the old socket's close must not trigger another reconnect
    await new Promise((r) => setTimeout(r, 20));
    expect(sockets).toHaveLength(2);
    await channel.stop();
    expect(sockets[1]?.closed).toBe(true);
  });

  it("an unexpected close reconnects after the backoff", async () => {
    vi.useFakeTimers();
    try {
      const { channel, sockets } = socketSlack();
      await channel.start(async () => undefined);
      sockets[0]?.onclose?.();
      await vi.advanceTimersByTimeAsync(1000);
      expect(sockets).toHaveLength(2);
      await channel.stop();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("toInboundEvent", () => {
  it("passes sender, channel type and bot/subtype markers through unauthenticated", () => {
    expect(
      toInboundEvent(
        dmEnvelope({ user: "U2", channel_type: "mpim", bot_id: "B1", subtype: "bot_message" }),
      ),
    ).toMatchObject({ kind: "message", eventId: "Ev1", channelType: "mpim", botId: "B1" });
  });

  it("maps a reply-button click and ignores link-button clicks and other envelopes", () => {
    const click = (actionId: string, value?: string) => ({
      type: "interactive",
      envelope_id: "e",
      payload: {
        type: "block_actions",
        user: { id: "U1" },
        container: { message_ts: "9.9", channel_id: "DBOT1" },
        message: { text: "Mám?" },
        actions: [{ action_id: actionId, ...(value ? { value } : {}) }],
      },
    });
    expect(toInboundEvent(click("reply-0", "Ano."))).toEqual({
      kind: "action",
      eventId: "action:9.9",
      userId: "U1",
      channelId: "DBOT1",
      messageTs: "9.9",
      messageText: "Mám?",
      text: "Ano.",
    });
    const inThread = click("reply-0", "Ano.");
    Object.assign(inThread.payload.container, { thread_ts: "1.1" });
    expect(toInboundEvent(inThread)).toMatchObject({ kind: "action", threadTs: "1.1" });
    expect(toInboundEvent(click("link-0"))).toBeNull();
    expect(toInboundEvent({ type: "slash_commands", payload: {} })).toBeNull();
  });
});

describe("toSlackBlocks", () => {
  it("renders a chat reply without a headline, with reply buttons after the links", () => {
    const blocks = toSlackBlocks({
      kind: "chat",
      tier: 2,
      headline: "",
      lines: ["Mám?"],
      links: [{ label: "Open run", url: "https://z/r" }],
      replies: [{ label: "Ano", text: "Ano." }],
    });
    expect(blocks).toEqual([
      { type: "section", text: { type: "mrkdwn", text: "Mám?" } },
      {
        type: "actions",
        elements: [
          {
            type: "button",
            action_id: "link-0",
            text: { type: "plain_text", text: "Open run" },
            url: "https://z/r",
          },
          {
            type: "button",
            action_id: "reply-0",
            text: { type: "plain_text", text: "Ano" },
            value: "Ano.",
          },
        ],
      },
    ]);
  });
});
